import { AppShell } from "@/components/layout/app-shell";
import { LiveDashboard } from "@/components/modules/live-dashboard";

export default function DashboardPage() {
  return (
    <AppShell
      title="Business OS Dashboard"
      description="A modular control center for customer management, finance, HR, automation, and industry-specific operations."
    >
      <LiveDashboard />
    </AppShell>
  );
}
