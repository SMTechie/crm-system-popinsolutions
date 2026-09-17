import { Global, Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ModuleAccessGuard } from "./guards/module-access.guard";
import { PermissionGuard } from "./guards/permission.guard";
import { TenantService } from "./services/tenant.service";
import { StorageService } from "./services/storage.service";
import { AuditService } from "./services/audit.service";
import { EmailService } from "./services/email.service";

@Global()
@Module({
  providers: [TenantService, StorageService, AuditService, EmailService, ModuleAccessGuard, PermissionGuard, Reflector],
  exports: [TenantService, StorageService, AuditService, EmailService, ModuleAccessGuard, PermissionGuard, Reflector],
})
export class CommonModule {}
