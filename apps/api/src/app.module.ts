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
import { OperationsModule } from "./modules/operations/operations.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { PdfEditorModule } from "./modules/pdf-editor/pdf-editor.module";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController],
  imports: [PrismaModule, CommonModule, AuthModule, CrmModule, AccountingModule, HrModule, FormsModule, WorkflowsModule, SettingsModule, BillingModule, OperationsModule, IntegrationsModule, PdfEditorModule],
})
export class AppModule {}
