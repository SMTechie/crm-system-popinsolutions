import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ModuleAccess } from "../../common/decorators/module-access.decorator";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../../common/guards/module-access.guard";
import { TenantService } from "../../common/services/tenant.service";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("forms")
export class FormsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private asJson(value: Record<string, unknown> | Array<unknown>) {
    return value as Prisma.InputJsonValue;
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  private async writeAuditLog(tenantId: string, action: string, entityType: string, entityId: string, metadataJson?: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        action,
        entityType,
        entityId,
        metadataJson: metadataJson ? this.asJson(metadataJson) : undefined,
      },
    });
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess("forms")
  @Get()
  async list(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.formTemplate.findMany({
      where: { tenantId: tenant.id },
      include: {
        responses: {
          orderBy: { submittedAt: "desc" },
          take: 3,
        },
        _count: {
          select: {
            responses: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess("forms")
  @Get("responses")
  async responses(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.formResponse.findMany({
      where: {
        formTemplate: { tenantId: tenant.id },
      },
      include: {
        formTemplate: {
          select: {
            id: true,
            name: true,
            slug: true,
            moduleKey: true,
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess("forms")
  @Get("public-links")
  async publicLinks(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.formTemplate.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        name: true,
        slug: true,
        moduleKey: true,
        published: true,
        updatedAt: true,
        _count: { select: { responses: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess("forms")
  @Post()
  async create(
    @Tenant() tenantId: string,
    @Body()
    body: {
      name?: string;
      slug?: string;
      moduleKey?: string;
      published?: boolean;
      schemaJson?: Record<string, unknown>;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const name = body.name ?? `Untitled Form ${new Date().toISOString().slice(0, 10)}`;
    const slugBase = this.slugify(body.slug || name || `form-${Date.now()}`) || `form-${Date.now()}`;
    const item = await this.prisma.formTemplate.create({
      data: {
        tenantId: tenant.id,
        name,
        slug: `${slugBase}-${Date.now().toString().slice(-6)}`,
        moduleKey: body.moduleKey ?? "crm",
        published: body.published ?? false,
        schemaJson: this.asJson(
          body.schemaJson ?? {
            fields: [{ key: "fullName", type: "text", label: "Full Name", required: true, width: "half" }],
            settings: {
              submitLabel: "Submit",
              successMessage: "Thanks, your response has been received.",
              layout: "two-column",
              webhookUrl: "",
              crmTarget: "lead",
            },
          },
        ),
      },
    });
    await this.writeAuditLog(tenant.id, "FORM_CREATED", "FormTemplate", item.id, { name: item.name });
    return { status: "created", item };
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess("forms")
  @Patch(":formId")
  async update(
    @Tenant() tenantId: string,
    @Param("formId") formId: string,
    @Body()
    body: {
      name?: string;
      slug?: string;
      moduleKey?: string;
      published?: boolean;
      schemaJson?: Record<string, unknown>;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.formTemplate.findFirst({
      where: { id: formId, tenantId: tenant.id },
    });
    if (!existing) {
      return { status: "missing", formId };
    }

    const item = await this.prisma.formTemplate.update({
      where: { id: formId },
      data: {
        name: body.name ?? undefined,
        slug: body.slug ? this.slugify(body.slug) : undefined,
        moduleKey: body.moduleKey ?? undefined,
        published: body.published ?? undefined,
        schemaJson: body.schemaJson ? this.asJson(body.schemaJson) : undefined,
      },
    });
    await this.writeAuditLog(tenant.id, "FORM_UPDATED", "FormTemplate", item.id, { name: item.name });
    return { status: "updated", item };
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess("forms")
  @Delete(":formId")
  async delete(@Tenant() tenantId: string, @Param("formId") formId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.formTemplate.findFirst({
      where: { id: formId, tenantId: tenant.id },
    });
    if (!existing) {
      return { status: "missing", formId };
    }
    await this.prisma.formTemplate.delete({ where: { id: formId } });
    await this.writeAuditLog(tenant.id, "FORM_DELETED", "FormTemplate", formId, { name: existing.name });
    return { status: "deleted", formId };
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess("forms")
  @Post(":formId/publish")
  async publish(@Tenant() tenantId: string, @Param("formId") formId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const item = await this.prisma.formTemplate.update({
      where: { id: formId },
      data: { published: true },
    });
    await this.writeAuditLog(tenant.id, "FORM_PUBLISHED", "FormTemplate", item.id, { slug: item.slug });
    return { formId, status: "published", item };
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess("forms")
  @Post(":formId/unpublish")
  async unpublish(@Tenant() tenantId: string, @Param("formId") formId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const item = await this.prisma.formTemplate.update({
      where: { id: formId },
      data: { published: false },
    });
    await this.writeAuditLog(tenant.id, "FORM_UNPUBLISHED", "FormTemplate", item.id, { slug: item.slug });
    return { formId, status: "unpublished", item };
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess("forms")
  @Post(":formId/responses")
  async createInternalResponse(
    @Tenant() tenantId: string,
    @Param("formId") formId: string,
    @Body() body?: Record<string, unknown>,
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const formTemplate = await this.prisma.formTemplate.findFirst({
      where: { id: formId, tenantId: tenant.id },
    });
    if (!formTemplate) {
      return { formId, status: "missing" };
    }
    const payload =
      body && Object.keys(body).length
        ? body
        : {
            fullName: "Internal Test Submitter",
            email: `test+${Date.now()}@example.com`,
            source: "internal-preview",
          };
    const item = await this.prisma.formResponse.create({
      data: {
        formTemplateId: formTemplate.id,
        payloadJson: this.asJson(payload),
      },
      include: {
        formTemplate: {
          select: { id: true, name: true, slug: true, moduleKey: true },
        },
      },
    });
    await this.writeAuditLog(tenant.id, "FORM_RESPONSE_CREATED", "FormResponse", item.id, {
      formTemplateId: formTemplate.id,
      formName: formTemplate.name,
    });
    return { formId, status: "received", item };
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess("forms")
  @Delete("responses/:responseId")
  async deleteResponse(@Tenant() tenantId: string, @Param("responseId") responseId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.formResponse.findFirst({
      where: {
        id: responseId,
        formTemplate: { tenantId: tenant.id },
      },
    });
    if (!existing) {
      return { status: "missing", responseId };
    }
    await this.prisma.formResponse.delete({ where: { id: responseId } });
    await this.writeAuditLog(tenant.id, "FORM_RESPONSE_DELETED", "FormResponse", responseId);
    return { status: "deleted", responseId };
  }

  @Get("public/:slug")
  async publicSchema(@Param("slug") slug: string) {
    const item = await this.prisma.formTemplate.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        moduleKey: true,
        schemaJson: true,
        published: true,
      },
    });
    return item;
  }

  @Post("public/:slug/responses")
  async submit(@Param("slug") slug: string, @Body() body?: Record<string, unknown>) {
    const formTemplate = await this.prisma.formTemplate.findUnique({
      where: { slug },
      include: {
        tenant: true,
      },
    });
    if (!formTemplate) {
      return { slug, status: "missing" };
    }
    const payload =
      body && Object.keys(body).length
        ? body
        : {
            fullName: "Website Visitor",
            workEmail: `visitor+${Date.now()}@example.com`,
            services: ["Managed IT", "CRM"],
          };
    const item = await this.prisma.formResponse.create({
      data: {
        formTemplateId: formTemplate.id,
        payloadJson: this.asJson(payload),
      },
    });
    await this.writeAuditLog(formTemplate.tenantId, "FORM_RESPONSE_CREATED", "FormResponse", item.id, {
      source: "public",
      slug,
      formTemplateId: formTemplate.id,
    });
    return { slug, status: "received", trigger: "crm.lead.created", item };
  }
}
