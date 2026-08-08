import { Module } from "@nestjs/common";
import { BillingModule } from "./modules/billing/billing.module";
import { CommonModule } from "./common/common.module";
import { AccountingModule } from "./modules/accounting/accounting.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CrmModule } from "./modules/crm/crm.module";
import { FormsModule } from "./modules/forms/forms.module";
import { HrModule } from "./modules/hr/hr.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { PrismaModule } from "./prisma/prisma.module";
import { WorkflowsModule } from "./modules/workflows/workflows.module";

@Module({
  imports: [PrismaModule, CommonModule, AuthModule, CrmModule, AccountingModule, HrModule, FormsModule, WorkflowsModule, SettingsModule, BillingModule],
})
export class AppModule {}
