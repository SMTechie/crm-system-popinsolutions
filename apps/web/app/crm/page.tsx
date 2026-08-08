import { AppShell } from "@/components/layout/app-shell";
import { LiveCrm } from "@/components/modules/live-crm";

export default function CrmPage() {
  return (
    <AppShell
      title="CRM Pipeline"
      description="Manage contacts, companies, deals, activities, forecasting, segmentation, and lead-capture flows."
    >
      <LiveCrm />
    </AppShell>
  );
}
