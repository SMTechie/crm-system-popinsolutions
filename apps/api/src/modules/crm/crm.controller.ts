import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, resolve } from "node:path";
import { ModuleAccess } from "../../common/decorators/module-access.decorator";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../../common/guards/module-access.guard";
import { TenantService } from "../../common/services/tenant.service";
import { PrismaService } from "../../prisma/prisma.service";

@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess("crm")
@Controller("crm")
export class CrmController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private normalizeStage(stage?: string): "NEW" | "DISCOVERY" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST" {
    const normalized = stage?.toUpperCase();
    if (
      normalized === "NEW" ||
      normalized === "DISCOVERY" ||
      normalized === "PROPOSAL" ||
      normalized === "NEGOTIATION" ||
      normalized === "WON" ||
      normalized === "LOST"
    ) {
      return normalized;
    }
    return "NEW";
  }

  private async ensureAttachmentEntity(tenantId: string, entityType: string, entityId: string) {
    if (entityType === "contact") {
      const item = await this.prisma.contact.findFirst({ where: { tenantId, id: entityId } });
      if (!item) {
        throw new BadRequestException("Contact not found for attachment.");
      }
      return;
    }
    if (entityType === "company") {
      const item = await this.prisma.company.findFirst({ where: { tenantId, id: entityId } });
      if (!item) {
        throw new BadRequestException("Company not found for attachment.");
      }
      return;
    }
    if (entityType === "deal") {
      const item = await this.prisma.deal.findFirst({ where: { tenantId, id: entityId } });
      if (!item) {
        throw new BadRequestException("Deal not found for attachment.");
      }
      return;
    }
    if (entityType === "lead") {
      const item = await this.prisma.contact.findFirst({ where: { tenantId, id: entityId } });
      if (!item) {
        throw new BadRequestException("Lead not found for attachment.");
      }
      return;
    }
    throw new BadRequestException("Unsupported attachment entity type.");
  }

  @Get("overview")
  async overview(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const deals = await this.prisma.deal.findMany({
      where: { tenantId: tenant.id },
      select: { amount: true, stage: true },
    });
    const forecast = deals.reduce((sum, deal) => sum + Number(deal.amount), 0);
    const topStages = Array.from(new Set(deals.map((deal) => deal.stage))).slice(0, 4);
    return {
      tenantId: tenant.slug,
      forecast,
      activePipelines: topStages.length,
      topStages,
    };
  }

  @Get("contacts")
  async contacts(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.contact.findMany({
      where: { tenantId: tenant.id },
      include: { company: true },
      orderBy: { createdAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("companies")
  async companies(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.company.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("deals")
  async deals(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.deal.findMany({
      where: { tenantId: tenant.id },
      include: { company: true },
      orderBy: { updatedAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("activities")
  async activities(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.activity.findMany({
      where: { tenantId: tenant.id },
      include: { contact: true },
      orderBy: { occurredAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("notes")
  async notes(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.note.findMany({
      where: { contact: { tenantId: tenant.id } },
      include: { contact: true },
      orderBy: { createdAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("attachments/:entityType/:entityId")
  async attachments(
    @Tenant() tenantId: string,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    await this.ensureAttachmentEntity(tenant.id, entityType, entityId);
    const items = await this.prisma.fileAttachment.findMany({
      where: { tenantId: tenant.id, entityType, entityId },
      orderBy: { createdAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("pipelines")
  async pipelines(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const deals = await this.prisma.deal.groupBy({
      by: ["stage"],
      where: { tenantId: tenant.id },
      _count: { stage: true },
      _sum: { amount: true },
    });
    return {
      tenantId: tenant.slug,
      items: deals.map((deal) => ({
        id: deal.stage.toLowerCase(),
        name: deal.stage,
        count: deal._count.stage,
        total: Number(deal._sum.amount ?? new Prisma.Decimal(0)),
      })),
    };
  }

  @Post("contacts")
  async createContact(
    @Tenant() tenantId: string,
    @Body()
    body: {
      fullName?: string;
      email?: string;
      phone?: string;
      companyId?: string;
      tags?: string[];
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const contact = await this.prisma.contact.create({
      data: {
        tenantId: tenant.id,
        companyId: body.companyId,
        fullName: body.fullName ?? "New Website Lead",
        email: body.email ?? `lead+${Date.now()}@popinsolutions.co.za`,
        phone: body.phone ?? "+27 10 555 0000",
        tags: body.tags?.length ? body.tags : ["website", "automation"],
      },
    });
    return { status: "created", item: contact };
  }

  @Patch("contacts/:contactId")
  async updateContact(
    @Tenant() tenantId: string,
    @Param("contactId") contactId: string,
    @Body()
    body: {
      fullName?: string;
      email?: string;
      phone?: string;
      companyId?: string | null;
      tags?: string[];
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.contact.findFirst({
      where: { tenantId: tenant.id, id: contactId },
    });
    if (!existing) {
      return { status: "missing", contactId };
    }
    const item = await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        fullName: body.fullName ?? undefined,
        email: body.email ?? undefined,
        phone: body.phone ?? undefined,
        companyId: body.companyId === "" ? null : body.companyId ?? undefined,
        tags: body.tags?.length ? body.tags : undefined,
      },
    });
    return { status: "updated", item };
  }

  @Delete("contacts/:contactId")
  async deleteContact(@Tenant() tenantId: string, @Param("contactId") contactId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.contact.findFirst({
      where: { tenantId: tenant.id, id: contactId },
    });
    if (!existing) {
      return { status: "missing", contactId };
    }
    await this.prisma.activity.updateMany({
      where: { tenantId: tenant.id, contactId },
      data: { contactId: null },
    });
    await this.prisma.contact.delete({
      where: { id: contactId },
    });
    return { status: "deleted", contactId };
  }

  @Post("companies")
  async createCompany(
    @Tenant() tenantId: string,
    @Body()
    body: {
      name?: string;
      industry?: string;
      website?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const item = await this.prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: body.name ?? `Company ${Date.now()}`,
        industry: body.industry ?? "General",
        website: body.website ?? null,
      },
    });
    return { status: "created", item };
  }

  @Patch("companies/:companyId")
  async updateCompany(
    @Tenant() tenantId: string,
    @Param("companyId") companyId: string,
    @Body()
    body: {
      name?: string;
      industry?: string | null;
      website?: string | null;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.company.findFirst({
      where: { tenantId: tenant.id, id: companyId },
    });
    if (!existing) {
      return { status: "missing", companyId };
    }
    const item = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        name: body.name ?? undefined,
        industry: body.industry === "" ? null : body.industry ?? undefined,
        website: body.website === "" ? null : body.website ?? undefined,
      },
    });
    return { status: "updated", item };
  }

  @Delete("companies/:companyId")
  async deleteCompany(@Tenant() tenantId: string, @Param("companyId") companyId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.company.findFirst({
      where: { tenantId: tenant.id, id: companyId },
    });
    if (!existing) {
      return { status: "missing", companyId };
    }
    await this.prisma.contact.updateMany({
      where: { tenantId: tenant.id, companyId },
      data: { companyId: null },
    });
    await this.prisma.deal.updateMany({
      where: { tenantId: tenant.id, companyId },
      data: { companyId: null },
    });
    await this.prisma.company.delete({
      where: { id: companyId },
    });
    return { status: "deleted", companyId };
  }

  @Post("deals")
  async createDeal(
    @Tenant() tenantId: string,
    @Body()
    body: {
      title?: string;
      amount?: number;
      currency?: string;
      stage?: string;
      companyId?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const company =
      body.companyId
        ? await this.prisma.company.findFirst({ where: { tenantId: tenant.id, id: body.companyId } })
        : await this.prisma.company.findFirst({ where: { tenantId: tenant.id } });
    const deal = await this.prisma.deal.create({
      data: {
        tenantId: tenant.id,
        companyId: company?.id,
        title: body.title ?? `New Opportunity ${new Date().toISOString().slice(0, 10)}`,
        amount: new Prisma.Decimal(body.amount ?? 18500),
        currency: body.currency ?? "ZAR",
        stage: this.normalizeStage(body.stage),
      },
    });
    return { status: "created", item: deal };
  }

  @Patch("deals/:dealId")
  async updateDeal(
    @Tenant() tenantId: string,
    @Param("dealId") dealId: string,
    @Body()
    body: {
      title?: string;
      amount?: number;
      currency?: string;
      stage?: string;
      companyId?: string | null;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.deal.findFirst({
      where: { tenantId: tenant.id, id: dealId },
    });
    if (!existing) {
      return { status: "missing", dealId };
    }
    const item = await this.prisma.deal.update({
      where: { id: dealId },
      data: {
        title: body.title ?? undefined,
        amount: body.amount === undefined ? undefined : new Prisma.Decimal(body.amount),
        currency: body.currency ?? undefined,
        stage: body.stage ? this.normalizeStage(body.stage) : undefined,
        companyId: body.companyId === "" ? null : body.companyId ?? undefined,
      },
    });
    return { status: "updated", item };
  }

  @Delete("deals/:dealId")
  async deleteDeal(@Tenant() tenantId: string, @Param("dealId") dealId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.deal.findFirst({
      where: { tenantId: tenant.id, id: dealId },
    });
    if (!existing) {
      return { status: "missing", dealId };
    }
    await this.prisma.deal.delete({
      where: { id: dealId },
    });
    return { status: "deleted", dealId };
  }

  @Post("activities")
  async createActivity(
    @Tenant() tenantId: string,
    @Body()
    body: {
      contactId?: string;
      type?: string;
      title?: string;
      occurredAt?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const contact =
      body.contactId
        ? await this.prisma.contact.findFirst({ where: { tenantId: tenant.id, id: body.contactId } })
        : await this.prisma.contact.findFirst({ where: { tenantId: tenant.id } });
    const activity = await this.prisma.activity.create({
      data: {
        tenantId: tenant.id,
        contactId: contact?.id,
        type: body.type ?? "CALL",
        title: body.title ?? "Discovery call logged from API",
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
      },
    });
    return { status: "logged", item: activity };
  }

  @Patch("activities/:activityId")
  async updateActivity(
    @Tenant() tenantId: string,
    @Param("activityId") activityId: string,
    @Body()
    body: {
      contactId?: string | null;
      type?: string;
      title?: string;
      occurredAt?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.activity.findFirst({
      where: { tenantId: tenant.id, id: activityId },
    });
    if (!existing) {
      return { status: "missing", activityId };
    }
    let contact: { id: string } | null | undefined;
    if (body.contactId === undefined) {
      contact = undefined;
    } else if (body.contactId === "") {
      contact = null;
    } else {
      const contactId = body.contactId as string;
      contact = await this.prisma.contact.findFirst({ where: { tenantId: tenant.id, id: contactId } });
    }
    const item = await this.prisma.activity.update({
      where: { id: activityId },
      data: {
        contactId: body.contactId === undefined ? undefined : contact?.id ?? null,
        type: body.type ?? undefined,
        title: body.title ?? undefined,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      },
    });
    return { status: "updated", item };
  }

  @Delete("activities/:activityId")
  async deleteActivity(@Tenant() tenantId: string, @Param("activityId") activityId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.activity.findFirst({
      where: { tenantId: tenant.id, id: activityId },
    });
    if (!existing) {
      return { status: "missing", activityId };
    }
    await this.prisma.activity.delete({
      where: { id: activityId },
    });
    return { status: "deleted", activityId };
  }

  @Post("notes")
  async createNote(
    @Tenant() tenantId: string,
    @Body()
    body: {
      contactId?: string;
      body?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const contact =
      body.contactId
        ? await this.prisma.contact.findFirst({ where: { tenantId: tenant.id, id: body.contactId } })
        : await this.prisma.contact.findFirst({ where: { tenantId: tenant.id } });
    if (!contact) {
      return { status: "missing-contact" };
    }
    const item = await this.prisma.note.create({
      data: {
        contactId: contact.id,
        body: body.body ?? "Follow-up note added from CRM",
      },
      include: { contact: true },
    });
    return { status: "created", item };
  }

  @Patch("notes/:noteId")
  async updateNote(
    @Tenant() tenantId: string,
    @Param("noteId") noteId: string,
    @Body()
    body: {
      contactId?: string | null;
      body?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.note.findFirst({
      where: { id: noteId, contact: { tenantId: tenant.id } },
      include: { contact: true },
    });
    if (!existing) {
      return { status: "missing", noteId };
    }
    let contactId: string | undefined;
    if (body.contactId === undefined) {
      contactId = undefined;
    } else if (body.contactId === "") {
      contactId = existing.contactId;
    } else if (body.contactId === null) {
      contactId = existing.contactId;
    } else {
      const contact = await this.prisma.contact.findFirst({
        where: { tenantId: tenant.id, id: body.contactId },
      });
      contactId = contact?.id ?? existing.contactId;
    }
    const item = await this.prisma.note.update({
      where: { id: noteId },
      data: {
        contactId,
        body: body.body ?? undefined,
      },
      include: { contact: true },
    });
    return { status: "updated", item };
  }

  @Delete("notes/:noteId")
  async deleteNote(@Tenant() tenantId: string, @Param("noteId") noteId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.note.findFirst({
      where: { id: noteId, contact: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", noteId };
    }
    await this.prisma.note.delete({
      where: { id: noteId },
    });
    return { status: "deleted", noteId };
  }

  @Post("attachments/:entityType/:entityId")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: resolve(process.cwd(), "uploads"),
        filename: (_req: any, file: any, callback: any) => {
          const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "-");
          callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(safeName) || ""}`);
        },
      }),
    }),
  )
  async uploadAttachment(
    @Tenant() tenantId: string,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @UploadedFile() file?: any,
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    await this.ensureAttachmentEntity(tenant.id, entityType, entityId);
    if (!file) {
      throw new BadRequestException("Attachment file is required.");
    }
    const item = await this.prisma.fileAttachment.create({
      data: {
        tenantId: tenant.id,
        entityType,
        entityId,
        fileKey: `/uploads/${file.filename}`,
        fileName: file.originalname,
        mimeType: file.mimetype ?? "application/octet-stream",
        sizeBytes: Number(file.size ?? 0),
      },
    });
    return { status: "created", item };
  }

  @Delete("attachments/:attachmentId")
  async deleteAttachment(@Tenant() tenantId: string, @Param("attachmentId") attachmentId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.fileAttachment.findFirst({
      where: { tenantId: tenant.id, id: attachmentId },
    });
    if (!existing) {
      return { status: "missing", attachmentId };
    }
    await this.prisma.fileAttachment.delete({
      where: { id: attachmentId },
    });
    return { status: "deleted", attachmentId };
  }
}
