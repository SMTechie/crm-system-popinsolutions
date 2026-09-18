import { AppShell } from "@/components/layout/app-shell";
import { LiveHr } from "@/components/modules/live-hr";

export default function HrPage() {
  return (
    <AppShell
      title="Human Resources"
      description="Employee profiles, payroll readiness, leave management, performance tracking, and document control."
    >
      <LiveHr />
    </AppShell>
  );
}
