import { AppShell } from "@/components/layout/app-shell";
import { LiveCompanies } from "@/components/modules/live-companies";

export default function CompaniesPage() {
  return (
    <AppShell
      title="Companies"
      description="Track accounts, sites, commercial relationships, and linked contacts across the full customer lifecycle."
    >
      <LiveCompanies />
    </AppShell>
  );
}
