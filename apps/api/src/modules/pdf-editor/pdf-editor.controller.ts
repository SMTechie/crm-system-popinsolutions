import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { randomUUID } from "node:crypto";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../common/services/storage.service";
import { TenantService } from "../../common/services/tenant.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("pdf-editor")
export class PdfEditorController {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly tenants: TenantService) {}

  @Get("documents")
  async list(@Tenant() tenantId: string) {
    const tenant = await this.tenants.ensureTenant(tenantId);
    const documents = await this.prisma.fileAttachment.findMany({ where: { tenantId: tenant.id, entityType: "PDF_DOCUMENT" }, orderBy: { createdAt: "desc" } });
    const versions = await this.prisma.fileAttachment.findMany({ where: { tenantId: tenant.id, entityType: "PDF_VERSION" }, orderBy: { createdAt: "desc" } });
    return { items: documents.map((document) => ({ id: document.id, fileName: document.fileName, sizeBytes: document.sizeBytes, createdAt: document.createdAt, versions: versions.filter((version) => version.entityId === document.id).map((version) => ({ id: version.id, fileName: version.fileName, sizeBytes: version.sizeBytes, createdAt: version.createdAt })) })) };
  }

  @Post("documents/upload")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) }))
  async upload(@Tenant() tenantId: string, @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype?: string; size?: number }) {
    if (!file) throw new BadRequestException("Please choose a PDF file.");
    const tenant = await this.tenants.ensureTenant(tenantId);
    const documentId = randomUUID();
    const fileKey = await this.storage.put({ buffer: file.buffer, originalName: file.originalname, mimeType: "application/pdf" });
    const document = await this.prisma.fileAttachment.create({ data: { id: documentId, tenantId: tenant.id, entityType: "PDF_DOCUMENT", entityId: documentId, fileKey, fileName: file.originalname, mimeType: "application/pdf", sizeBytes: Number(file.size ?? file.buffer.length) } });
    return { status: "created", item: { id: document.id, fileName: document.fileName, sizeBytes: document.sizeBytes, createdAt: document.createdAt, versions: [] } };
  }

  @Post("documents/:id/save")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) }))
  async save(@Tenant() tenantId: string, @Param("id") id: string, @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype?: string; size?: number }, @Body() body?: { fileName?: string }) {
    if (!file) throw new BadRequestException("Edited PDF file is required.");
    const tenant = await this.tenants.ensureTenant(tenantId);
    const document = await this.prisma.fileAttachment.findFirst({ where: { id, tenantId: tenant.id, entityType: "PDF_DOCUMENT" } });
    if (!document) throw new BadRequestException("PDF document not found.");
    const fileKey = await this.storage.put({ buffer: file.buffer, originalName: body?.fileName?.trim() || `edited-${document.fileName}`, mimeType: "application/pdf" });
    const version = await this.prisma.fileAttachment.create({ data: { tenantId: tenant.id, entityType: "PDF_VERSION", entityId: document.id, fileKey, fileName: body?.fileName?.trim() || `edited-${document.fileName}`, mimeType: "application/pdf", sizeBytes: Number(file.size ?? file.buffer.length) } });
    return { status: "saved", item: { id: version.id, fileName: version.fileName, sizeBytes: version.sizeBytes, createdAt: version.createdAt } };
  }

  @Get("documents/:id/content")
  async content(@Tenant() tenantId: string, @Param("id") id: string, @Query("version") versionId: string | undefined, @Res() response: { setHeader: (name: string, value: string) => void; end: (body: Buffer) => void }) {
    const tenant = await this.tenants.ensureTenant(tenantId);
    const attachment = await this.prisma.fileAttachment.findFirst({ where: versionId ? { id: versionId, tenantId: tenant.id, entityType: "PDF_VERSION", entityId: id } : { id, tenantId: tenant.id, entityType: "PDF_DOCUMENT" } });
    if (!attachment) throw new BadRequestException("PDF file not found.");
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${attachment.fileName.replace(/[^a-zA-Z0-9._-]/g, "-")}"`);
    response.end(await this.storage.read(attachment.fileKey));
  }

  @Delete("documents/:id")
  async remove(@Tenant() tenantId: string, @Param("id") id: string) {
    const tenant = await this.tenants.ensureTenant(tenantId);
    const document = await this.prisma.fileAttachment.findFirst({ where: { id, tenantId: tenant.id, entityType: "PDF_DOCUMENT" } });
    if (!document) return { status: "missing", id };
    const versions = await this.prisma.fileAttachment.findMany({ where: { tenantId: tenant.id, entityType: "PDF_VERSION", entityId: document.id } });
    await this.storage.remove(document.fileKey);
    for (const version of versions) await this.storage.remove(version.fileKey);
    await this.prisma.fileAttachment.deleteMany({ where: { tenantId: tenant.id, OR: [{ id: document.id }, { entityType: "PDF_VERSION", entityId: document.id }] } });
    return { status: "deleted", id };
  }
}
