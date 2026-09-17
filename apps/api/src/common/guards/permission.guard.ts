import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../prisma/prisma.service";
import { REQUIRED_PERMISSION_KEY } from "../decorators/permission.decorator";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  private roleFallbackPermissions(role?: string) {
    const permissions: Record<string, string[]> = {
      OWNER: [],
      ADMIN: [],
      SALES_MANAGER: ["crm.customers.view", "crm.customers.create", "crm.customers.edit", "accounting.invoices.view", "reports.view"],
      ACCOUNTANT: ["crm.customers.view", "accounting.invoices.view", "accounting.invoices.create", "accounting.invoices.approve", "hr.employees.view", "attendance.view", "reports.view"],
      HR_MANAGER: ["crm.customers.view", "accounting.invoices.view", "hr.employees.view", "hr.employees.edit", "attendance.view", "attendance.manage", "users.view", "reports.view"],
      PROJECT_MANAGER: ["crm.customers.view", "accounting.invoices.view", "hr.employees.view", "assets.view", "assets.create", "assets.assign", "assets.return", "projects.view", "projects.manage", "reports.view"],
      IT_MANAGER: ["crm.customers.view", "accounting.invoices.view", "hr.employees.view", "attendance.view", "assets.view", "assets.create", "assets.assign", "assets.return", "projects.view", "users.view", "users.manage", "settings.manage", "reports.view"],
      AGENT: ["crm.customers.view", "crm.customers.create", "crm.customers.edit", "attendance.view"],
      EMPLOYEE: ["attendance.view"],
      VIEWER: ["crm.customers.view", "accounting.invoices.view", "hr.employees.view", "attendance.view", "assets.view", "reports.view"],
    };
    return permissions[role ?? ""] ?? [];
  }

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const request = context.switchToHttp().getRequest<{ user?: { sub?: string; role?: string; tenantId?: string } }>();
    const user = request.user;
    if (!user?.sub || !user.tenantId) throw new ForbiddenException("Authenticated user context missing.");
    if (["OWNER", "ADMIN", "SUPER_ADMIN", "ORGANISATION_ADMIN"].includes(user.role ?? "")) return true;
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: user.tenantId }, select: { id: true } });
    if (!tenant) throw new ForbiddenException("Workspace context missing.");
    const assignment = await this.prisma.userRoleAssignment.findFirst({
      where: { userId: user.sub, role: { tenantId: tenant.id, rolePermissions: { some: { permission: { key: required } } } } },
    });
    if (!assignment && !this.roleFallbackPermissions(user.role).includes(required)) {
      throw new ForbiddenException(`Permission '${required}' is required.`);
    }
    return true;
  }
}
