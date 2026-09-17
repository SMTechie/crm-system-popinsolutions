import { Body, Controller, Get, Headers, Post, Req, UseGuards } from "@nestjs/common";
import { ModuleAccess } from "../../common/decorators/module-access.decorator";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../../common/guards/module-access.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequiresPermission } from "../../common/decorators/permission.decorator";
import { BillingService } from "./billing.service";

@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(JwtAuthGuard, ModuleAccessGuard, PermissionGuard)
  @ModuleAccess("settings")
  @RequiresPermission("settings.manage")
  @Get("stripe/config")
  config() {
    return this.billingService.getBillingConfig();
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard, PermissionGuard)
  @ModuleAccess("settings")
  @RequiresPermission("settings.manage")
  @Post("stripe/checkout-session")
  createCheckoutSession(@Tenant() tenantId: string, @Body() body: { planCode?: string }) {
    return this.billingService.createCheckoutSession(tenantId, body.planCode ?? "enterprise");
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard, PermissionGuard)
  @ModuleAccess("settings")
  @RequiresPermission("settings.manage")
  @Post("stripe/portal-session")
  createPortalSession(@Tenant() tenantId: string) {
    return this.billingService.createPortalSession(tenantId);
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard, PermissionGuard)
  @ModuleAccess("settings")
  @RequiresPermission("settings.manage")
  @Post("stripe/sync")
  sync(@Tenant() tenantId: string) {
    return this.billingService.syncTenantSubscription(tenantId);
  }

  @Post("stripe/webhook")
  webhook(
    @Headers("stripe-signature") signature: string | undefined,
    @Req() request: { rawBody?: Buffer; body?: unknown },
  ) {
    return this.billingService.handleWebhook(signature, request.rawBody ?? JSON.stringify(request.body ?? {}));
  }
}
