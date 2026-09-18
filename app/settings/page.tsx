import { AppShell } from "@/components/layout/app-shell";
import { LiveSettings } from "@/components/modules/live-settings";

export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      description="Manage workspace identity, support settings, security posture, and team access from one live control panel."
    >
      <LiveSettings />
    </AppShell>
  );
}
