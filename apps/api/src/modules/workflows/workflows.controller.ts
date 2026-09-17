import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ModuleAccess } from "../../common/decorators/module-access.decorator";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../../common/guards/module-access.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequiresPermission } from "../../common/decorators/permission.decorator";
import { TenantService } from "../../common/services/tenant.service";
import { PrismaService } from "../../prisma/prisma.service";

@UseGuards(JwtAuthGuard, ModuleAccessGuard, PermissionGuard)
@ModuleAccess("automation")
@RequiresPermission("automation.manage")
@Controller("workflows")
export class WorkflowsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private asJson(value: Record<string, unknown> | Array<unknown>) {
    return value as Prisma.InputJsonValue;
  }

  private asDefinition(definitionJson: unknown) {
    return typeof definitionJson === "object" && definitionJson !== null ? (definitionJson as Record<string, unknown>) : {};
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

  @Get()
  async list(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.workflow.findMany({
      where: { tenantId: tenant.id },
      orderBy: { updatedAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("triggers")
  async triggers(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const workflows = await this.prisma.workflow.findMany({
      where: { tenantId: tenant.id },
      orderBy: { updatedAt: "desc" },
    });

    const items = workflows.reduce<Array<Record<string, unknown>>>((accumulator, workflow) => {
      const existing = accumulator.find((item) => item.key === workflow.triggerKey);
      if (existing) {
        existing.workflowCount = Number(existing.workflowCount ?? 0) + 1;
        existing.activeCount = Number(existing.activeCount ?? 0) + (workflow.active ? 1 : 0);
        return accumulator;
      }
      accumulator.push({
        key: workflow.triggerKey,
        workflowCount: 1,
        activeCount: workflow.active ? 1 : 0,
        latestWorkflowName: workflow.name,
        latestUpdatedAt: workflow.updatedAt,
      });
      return accumulator;
    }, []);

    return { tenantId: tenant.slug, items };
  }

  @Get("actions")
  async actions(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const workflows = await this.prisma.workflow.findMany({
      where: { tenantId: tenant.id },
      orderBy: { updatedAt: "desc" },
    });

    const items = workflows.flatMap((workflow) => {
      const definition = this.asDefinition(workflow.definitionJson);
      const actions = Array.isArray(definition.actions) ? definition.actions : [];
      return actions.map((action, index) => {
        const current = typeof action === "object" && action !== null ? (action as Record<string, unknown>) : {};
        return {
          id: `${workflow.id}-${index}`,
          workflowId: workflow.id,
          workflowName: workflow.name,
          workflowActive: workflow.active,
          type: String(current.type ?? "update"),
          target: String(current.target ?? current.module ?? "record"),
          label: String(current.label ?? current.type ?? `Action ${index + 1}`),
          status: workflow.active ? "READY" : "PAUSED",
          updatedAt: workflow.updatedAt,
        };
      });
    });

    return { tenantId: tenant.slug, items };
  }

  @Get("logs")
  async logs(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { entityType: "Workflow" },
          { action: { startsWith: "WORKFLOW_" } },
          { action: { startsWith: "FORM_" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { tenantId: tenant.slug, items };
  }

  @Post()
  async create(
    @Tenant() tenantId: string,
    @Body()
    body: {
      name?: string;
      triggerKey?: string;
      active?: boolean;
      definitionJson?: Record<string, unknown>;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const item = await this.prisma.workflow.create({
      data: {
        tenantId: tenant.id,
        name: body.name ?? `Workflow ${new Date().toISOString().slice(0, 10)}`,
        triggerKey: body.triggerKey ?? "crm.deal.created",
        active: body.active ?? true,
        definitionJson: this.asJson(
          body.definitionJson ?? {
            conditions: [{ field: "status", operator: "equals", value: "NEW" }],
            actions: [{ type: "send-email", target: "sales@popinsolutions.co.za", label: "Notify team" }],
          },
        ),
      },
    });
    await this.writeAuditLog(tenant.id, "WORKFLOW_CREATED", "Workflow", item.id, { name: item.name, triggerKey: item.triggerKey });
    return { status: "created", item };
  }

  @Patch(":workflowId")
  async update(
    @Tenant() tenantId: string,
    @Param("workflowId") workflowId: string,
    @Body()
    body: {
      name?: string;
      triggerKey?: string;
      active?: boolean;
      definitionJson?: Record<string, unknown>;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.workflow.findFirst({
      where: { tenantId: tenant.id, id: workflowId },
    });
    if (!existing) {
      return { status: "missing", workflowId };
    }
    const item = await this.prisma.workflow.update({
      where: { id: workflowId },
      data: {
        name: body.name ?? undefined,
        triggerKey: body.triggerKey ?? undefined,
        active: body.active ?? undefined,
        definitionJson: body.definitionJson ? this.asJson(body.definitionJson) : undefined,
      },
    });
    await this.writeAuditLog(tenant.id, "WORKFLOW_UPDATED", "Workflow", item.id, { name: item.name, triggerKey: item.triggerKey, active: item.active });
    return { status: "updated", item };
  }

  @Delete(":workflowId")
  async delete(@Tenant() tenantId: string, @Param("workflowId") workflowId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.workflow.findFirst({
      where: { tenantId: tenant.id, id: workflowId },
    });
    if (!existing) {
      return { status: "missing", workflowId };
    }
    await this.prisma.workflow.delete({ where: { id: workflowId } });
    await this.writeAuditLog(tenant.id, "WORKFLOW_DELETED", "Workflow", workflowId, { name: existing.name });
    return { status: "deleted", workflowId };
  }

  @Post(":workflowId/test")
  async test(@Tenant() tenantId: string, @Param("workflowId") workflowId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.workflow.findFirst({
      where: { tenantId: tenant.id, id: workflowId },
    });
    if (!existing) {
      return { status: "missing", workflowId };
    }
    await this.writeAuditLog(tenant.id, "WORKFLOW_TEST_QUEUED", "Workflow", workflowId, {
      name: existing.name,
      triggerKey: existing.triggerKey,
      queuedAt: "2026-08-04T12:00:00.000Z",
    });
    return { workflowId, status: "queued" };
  }
}
