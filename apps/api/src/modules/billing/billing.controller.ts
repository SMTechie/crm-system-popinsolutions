import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
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
  @Get("config")
  config() {
    return this.billingService.getBillingConfig();
  }

  @UseGuards(JwtAuthGuard, ModuleAccessGuard, PermissionGuard)
  @ModuleAccess("settings")
  @RequiresPermission("settings.manage")
  @Post(":provider/checkout")
  createCheckoutSession(@Tenant() tenantId: string, @Param("provider") provider: "yoco" | "ikhokha", @Body() body: { planCode?: string }) {
    return this.billingService.createCheckoutSession(provider, tenantId, body.planCode ?? "enterprise");
  }
}
