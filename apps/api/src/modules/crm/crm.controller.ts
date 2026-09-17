import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ModuleAccess } from "../../common/decorators/module-access.decorator";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../../common/guards/module-access.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequiresPermission } from "../../common/decorators/permission.decorator";
import { TenantService } from "../../common/services/tenant.service";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../common/services/storage.service";

@UseGuards(JwtAuthGuard, ModuleAccessGuard, PermissionGuard)
@ModuleAccess("crm")
@Controller("crm")
export class CrmController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly storage: StorageService,
  ) {}

  private pagination(page?: string, pageSize?: string) { const current = Math.max(1, Number.parseInt(page || "1", 10) || 1); const size = Math.min(100, Math.max(1, Number.parseInt(pageSize || "50", 10) || 50)); return { page: current, pageSize: size, skip: (current - 1) * size, take: size }; }

  private async nextCustomerNumber(tenantId: string) {
    const count = await this.prisma.company.count({ where: { tenantId } });
    return `CUS-${String(count + 1).padStart(6, "0")}`;
  }

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
    if (entityType === "activity") {
      const item = await this.prisma.activity.findFirst({ where: { tenantId, id: entityId } });
      if (!item) {
        throw new BadRequestException("Activity not found for attachment.");
      }
      return;
    }
    const tenantScopedEntities: Record<string, (tenantId: string, entityId: string) => Promise<unknown>> = {
      employee: (tenantId, entityId) => this.prisma.employee.findFirst({ where: { tenantId, id: entityId } }),
      asset: (tenantId, entityId) => this.prisma.asset.findFirst({ where: { tenantId, id: entityId } }),
      project: (tenantId, entityId) => this.prisma.project.findFirst({ where: { tenantId, id: entityId } }),
      invoice: (tenantId, entityId) => this.prisma.invoice.findFirst({ where: { tenantId, id: entityId } }),
      expense: (tenantId, entityId) => this.prisma.expense.findFirst({ where: { tenantId, id: entityId } }),
    };
    if (tenantScopedEntities[entityType]) {
      if (!(await tenantScopedEntities[entityType](tenantId, entityId))) throw new BadRequestException(`${entityType} not found for attachment.`);
      return;
    }
    throw new BadRequestException("Unsupported attachment entity type.");
  }

  @Get("overview")
  @RequiresPermission("crm.customers.view")
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
  @RequiresPermission("crm.customers.view")
  async contacts(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { tenantId: tenant.id };
    const [items, total] = await Promise.all([this.prisma.contact.findMany({ where, include: { company: true }, orderBy: { createdAt: "desc" }, skip: pagination.skip, take: pagination.take }), this.prisma.contact.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Get("companies")
  @RequiresPermission("crm.customers.view")
  async companies(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { tenantId: tenant.id };
    const [items, total] = await Promise.all([this.prisma.company.findMany({ where, orderBy: { createdAt: "desc" }, skip: pagination.skip, take: pagination.take }), this.prisma.company.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Get("deals")
  @RequiresPermission("crm.customers.view")
  async deals(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { tenantId: tenant.id };
    const [items, total] = await Promise.all([this.prisma.deal.findMany({ where, include: { company: true }, orderBy: { updatedAt: "desc" }, skip: pagination.skip, take: pagination.take }), this.prisma.deal.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Get("activities")
  @RequiresPermission("crm.customers.view")
  async activities(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { tenantId: tenant.id };
    const [items, total] = await Promise.all([this.prisma.activity.findMany({ where, include: { contact: true }, orderBy: { occurredAt: "desc" }, skip: pagination.skip, take: pagination.take }), this.prisma.activity.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Get("notes")
  @RequiresPermission("crm.customers.view")
  async notes(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { contact: { tenantId: tenant.id } };
    const [items, total] = await Promise.all([this.prisma.note.findMany({ where, include: { contact: true }, orderBy: { createdAt: "desc" }, skip: pagination.skip, take: pagination.take }), this.prisma.note.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Get("attachments/:entityType/:entityId")
  @RequiresPermission("crm.customers.view")
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
  @RequiresPermission("crm.customers.view")
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
  @RequiresPermission("crm.customers.create")
  async createContact(
    @Tenant() tenantId: string,
    @Body()
    body: {
      fullName?: string;
      email?: string;
      phone?: string;
      address?: string;
      companyId?: string;
      tags?: string[];
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    if (!body.fullName?.trim()) throw new BadRequestException("Contact name is required.");
    const contact = await this.prisma.contact.create({
      data: {
        tenantId: tenant.id,
        companyId: body.companyId,
        fullName: body.fullName.trim(),
        email: body.email ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
        tags: body.tags ?? [],
      },
    });
    return { status: "created", item: contact };
  }

  @Patch("contacts/:contactId")
  @RequiresPermission("crm.customers.edit")
  async updateContact(
    @Tenant() tenantId: string,
    @Param("contactId") contactId: string,
    @Body()
    body: {
      fullName?: string;
      email?: string;
      phone?: string;
      address?: string | null;
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
        address: body.address === "" ? null : body.address ?? undefined,
        companyId: body.companyId === "" ? null : body.companyId ?? undefined,
        tags: body.tags?.length ? body.tags : undefined,
      },
    });
    return { status: "updated", item };
  }

  @Delete("contacts/:contactId")
  @RequiresPermission("crm.customers.edit")
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
  @RequiresPermission("crm.customers.create")
  async createCompany(
    @Tenant() tenantId: string,
    @Body()
    body: {
      customerNumber?: string;
      name?: string;
      contactPerson?: string;
      email?: string;
      phone?: string;
      industry?: string;
      website?: string;
      address?: string;
      vatNumber?: string;
      registrationNumber?: string;
      status?: string;
      source?: string;
      assignedUserId?: string;
      notes?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    if (!body.name?.trim()) throw new BadRequestException("Company name is required.");
    const item = await this.prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: body.name.trim(),
        customerNumber: body.customerNumber || await this.nextCustomerNumber(tenant.id),
        contactPerson: body.contactPerson ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        industry: body.industry ?? null,
        website: body.website ?? null,
        address: body.address ?? null,
        vatNumber: body.vatNumber ?? null,
        registrationNumber: body.registrationNumber ?? null,
        status: body.status?.toUpperCase() ?? "ACTIVE",
        source: body.source ?? null,
        assignedUserId: body.assignedUserId ?? null,
        notes: body.notes ?? null,
      },
    });
    return { status: "created", item };
  }

  @Patch("companies/:companyId")
  @RequiresPermission("crm.customers.edit")
  async updateCompany(
    @Tenant() tenantId: string,
    @Param("companyId") companyId: string,
    @Body()
    body: {
      customerNumber?: string | null;
      name?: string;
      contactPerson?: string | null;
      email?: string | null;
      phone?: string | null;
      industry?: string | null;
      website?: string | null;
      address?: string | null;
      vatNumber?: string | null;
      registrationNumber?: string | null;
      status?: string | null;
      source?: string | null;
      assignedUserId?: string | null;
      notes?: string | null;
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
        customerNumber: body.customerNumber === "" ? null : body.customerNumber ?? undefined,
        contactPerson: body.contactPerson === "" ? null : body.contactPerson ?? undefined,
        email: body.email === "" ? null : body.email ?? undefined,
        phone: body.phone === "" ? null : body.phone ?? undefined,
        industry: body.industry === "" ? null : body.industry ?? undefined,
        website: body.website === "" ? null : body.website ?? undefined,
        address: body.address === "" ? null : body.address ?? undefined,
        vatNumber: body.vatNumber === "" ? null : body.vatNumber ?? undefined,
        registrationNumber: body.registrationNumber === "" ? null : body.registrationNumber ?? undefined,
        status: body.status === "" ? null : body.status?.toUpperCase() ?? undefined,
        source: body.source === "" ? null : body.source ?? undefined,
        assignedUserId: body.assignedUserId === "" ? null : body.assignedUserId ?? undefined,
        notes: body.notes === "" ? null : body.notes ?? undefined,
      },
    });
    return { status: "updated", item };
  }

  @Delete("companies/:companyId")
  @RequiresPermission("crm.customers.edit")
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
  @RequiresPermission("crm.customers.create")
  async createDeal(
    @Tenant() tenantId: string,
    @Body()
    body: {
      title?: string;
      amount?: number;
      currency?: string;
      stage?: string;
      companyId?: string;
      caseType?: string;
      caseNumber?: string;
      courtName?: string;
      nextHearingDate?: string;
      caseNotes?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    if (!body.title?.trim() || body.amount === undefined || body.amount < 0) throw new BadRequestException("Deal title and a non-negative amount are required.");
    const company =
      body.companyId
        ? await this.prisma.company.findFirst({ where: { tenantId: tenant.id, id: body.companyId } })
        : await this.prisma.company.findFirst({ where: { tenantId: tenant.id } });
    const deal = await this.prisma.deal.create({
      data: {
        tenantId: tenant.id,
        companyId: company?.id,
        title: body.title.trim(),
        amount: new Prisma.Decimal(body.amount),
        currency: body.currency ?? "ZAR",
        stage: this.normalizeStage(body.stage),
        caseType: body.caseType ?? "COURT",
        caseNumber: body.caseNumber || null,
        courtName: body.courtName || null,
        nextHearingDate: body.nextHearingDate ? new Date(body.nextHearingDate) : null,
        caseNotes: body.caseNotes || null,
      },
    });
    return { status: "created", item: deal };
  }

  @Patch("deals/:dealId")
  @RequiresPermission("crm.customers.edit")
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
      caseType?: string;
      caseNumber?: string | null;
      courtName?: string | null;
      nextHearingDate?: string | null;
      caseNotes?: string | null;
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
        caseType: body.caseType ?? undefined,
        caseNumber: body.caseNumber === "" ? null : body.caseNumber ?? undefined,
        courtName: body.courtName === "" ? null : body.courtName ?? undefined,
        nextHearingDate: body.nextHearingDate === "" ? null : body.nextHearingDate ? new Date(body.nextHearingDate) : undefined,
        caseNotes: body.caseNotes === "" ? null : body.caseNotes ?? undefined,
      },
    });
    return { status: "updated", item };
  }

  @Delete("deals/:dealId")
  @RequiresPermission("crm.customers.edit")
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
  @RequiresPermission("crm.customers.edit")
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
    if (!body.title?.trim()) throw new BadRequestException("Activity title is required.");
    const contact =
      body.contactId
        ? await this.prisma.contact.findFirst({ where: { tenantId: tenant.id, id: body.contactId } })
        : await this.prisma.contact.findFirst({ where: { tenantId: tenant.id } });
    const activity = await this.prisma.activity.create({
      data: {
        tenantId: tenant.id,
        contactId: contact?.id,
        type: body.type ?? "CALL",
        title: body.title.trim(),
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
      },
    });
    return { status: "logged", item: activity };
  }

  @Patch("activities/:activityId")
  @RequiresPermission("crm.customers.edit")
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
  @RequiresPermission("crm.customers.edit")
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
  @RequiresPermission("crm.customers.edit")
  async createNote(
    @Tenant() tenantId: string,
    @Body()
    body: {
      contactId?: string;
      body?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    if (!body.body?.trim()) throw new BadRequestException("Note body is required.");
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
        body: body.body.trim(),
      },
      include: { contact: true },
    });
    return { status: "created", item };
  }

  @Patch("notes/:noteId")
  @RequiresPermission("crm.customers.edit")
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
  @RequiresPermission("crm.customers.edit")
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
  @RequiresPermission("crm.customers.edit")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req: unknown, file: { mimetype?: string }, callback: (error: Error | null, acceptFile: boolean) => void) => {
        const allowed = ["application/pdf", "image/png", "image/jpeg", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
        callback(null, allowed.includes(file.mimetype ?? ""));
      },
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
        fileKey: await this.storage.put({ buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype ?? "application/octet-stream" }),
        fileName: file.originalname,
        mimeType: file.mimetype ?? "application/octet-stream",
        sizeBytes: Number(file.size ?? 0),
      },
    });
    return { status: "created", item };
  }

  @Delete("attachments/:attachmentId")
  @RequiresPermission("crm.customers.edit")
  async deleteAttachment(@Tenant() tenantId: string, @Param("attachmentId") attachmentId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.fileAttachment.findFirst({
      where: { tenantId: tenant.id, id: attachmentId },
    });
    if (!existing) {
      return { status: "missing", attachmentId };
    }
    await this.storage.remove(existing.fileKey);
    await this.prisma.fileAttachment.delete({
      where: { id: attachmentId },
    });
    return { status: "deleted", attachmentId };
  }

  @Get("attachments/:attachmentId/download")
  @RequiresPermission("crm.customers.view")
  async downloadAttachment(
    @Tenant() tenantId: string,
    @Param("attachmentId") attachmentId: string,
    @Res() response: { setHeader: (name: string, value: string) => void; end: (body: Buffer) => void },
  ) {
    await this.tenantService.ensureTenant(tenantId);
    const attachment = await this.prisma.fileAttachment.findFirst({ where: { id: attachmentId, tenantId } });
    if (!attachment) throw new BadRequestException("Attachment not found.");
    const content = await this.storage.read(attachment.fileKey);
    response.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    response.setHeader("Content-Disposition", `attachment; filename="${attachment.fileName.replace(/[^a-zA-Z0-9._-]/g, "-")}"`);
    response.end(content);
  }
}
