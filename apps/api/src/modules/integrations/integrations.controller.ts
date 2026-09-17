import { Body, Controller, Get, Headers, Param, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { IntegrationsService } from "./integrations.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequiresPermission } from "../../common/decorators/permission.decorator";

@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequiresPermission("settings.manage")
  @Get()
  list(@Tenant() tenant: string) { return this.integrations.list(tenant); }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequiresPermission("settings.manage")
  @Post(":provider/configure")
  configure(@Tenant() tenant: string, @Param("provider") provider: string, @Body() body: { baseUrl?: string; config?: Record<string, string>; enabled?: boolean }) { return this.integrations.configure(tenant, provider, body); }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequiresPermission("settings.manage")
  @Post(":provider/test")
  test(@Tenant() tenant: string, @Param("provider") provider: string) { return this.integrations.test(tenant, provider); }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequiresPermission("settings.manage")
  @Post(":provider/sync")
  sync(@Tenant() tenant: string, @Param("provider") provider: string) { return this.integrations.sync(tenant, provider); }

  @Post("website/webhook")
  webhook(@Headers("x-webhook-signature") signature: string | undefined, @Headers("x-tenant-id") tenant: string | undefined, @Req() request: { rawBody?: Buffer }) {
    const raw = request.rawBody?.toString("utf8") ?? "";
    const secret = process.env.WEBSITE_WEBHOOK_SECRET;
    if (!secret || !this.integrations.verifyWebhook(raw, signature, secret)) throw new UnauthorizedException("Invalid webhook signature.");
    return this.integrations.receiveWebhook(tenant, raw);
  }
}
