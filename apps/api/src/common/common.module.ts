import { Global, Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ModuleAccessGuard } from "./guards/module-access.guard";
import { TenantService } from "./services/tenant.service";

@Global()
@Module({
  providers: [TenantService, ModuleAccessGuard, Reflector],
  exports: [TenantService, ModuleAccessGuard, Reflector],
})
export class CommonModule {}
