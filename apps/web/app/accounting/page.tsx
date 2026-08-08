import { AppShell } from "@/components/layout/app-shell";
import { LiveAccounting } from "@/components/modules/live-accounting";

export default function AccountingPage() {
  return (
    <AppShell
      title="Accounting"
      description="Invoices, quotes, expenses, payments, reconciliation, tax support, and finance reporting in one workspace."
    >
      <LiveAccounting />
    </AppShell>
  );
}
