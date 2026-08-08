import { AppShell } from "@/components/layout/app-shell";
import { LiveAutomation } from "@/components/modules/live-automation";

export default function AutomationPage() {
  return (
    <AppShell
      title="Workflow Automation"
      description="Build business logic across leads, invoices, forms, and internal approvals with a clean visual workflow layer."
    >
      <LiveAutomation />
    </AppShell>
  );
}
