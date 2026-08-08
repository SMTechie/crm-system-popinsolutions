import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { MODULE_ACCESS_KEY } from "../decorators/module-access.decorator";
import { TenantService } from "../services/tenant.service";

@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantService: TenantService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const moduleKey = this.reflector.getAllAndOverride<string>(MODULE_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!moduleKey || moduleKey === "settings") {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantSlug = request.user?.tenantId;

    if (!tenantSlug) {
      throw new ForbiddenException("Tenant context missing.");
    }

    const tenant = await this.tenantService.ensureTenant(tenantSlug);
    if (!tenant.enabledModules.includes(moduleKey)) {
      throw new ForbiddenException(`Module '${moduleKey}' is not enabled for this workspace.`);
    }

    return true;
  }
}
