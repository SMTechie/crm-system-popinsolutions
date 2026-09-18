import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  LiveBillingSettingsPage,
  LivePermissionsSettingsPage,
  LiveSecuritySettingsPage,
  LiveTeamSettingsPage,
  LiveWorkspaceSettingsPage,
} from "@/components/modules/live-settings";

const settingsSubmodules: Record<string, { title: string; description: string }> = {
  workspace: {
    title: "Workspace Settings",
    description: "Manage workspace identity, support settings, and global tenant defaults.",
  },
  billing: {
    title: "Billing Settings",
    description: "Manage plan level, subscription status, tenant limits, and SaaS usage controls.",
  },
  team: {
    title: "Team Access Settings",
    description: "Manage users, roles, and live team access within the tenant workspace.",
  },
  security: {
    title: "Security Settings",
    description: "Review authentication behavior, password policies, and security posture details.",
  },
  permissions: {
    title: "Permissions Settings",
    description: "Manage tenant access, operational roles, and permission-oriented workspace controls.",
  },
};

export default async function SettingsSubmodulePage({ params }: { params: Promise<{ submodule: string }> }) {
  const { submodule } = await params;
  const content = settingsSubmodules[submodule];

  if (!content) {
    notFound();
  }

  const pageContent = {
    workspace: <LiveWorkspaceSettingsPage />,
    billing: <LiveBillingSettingsPage />,
    team: <LiveTeamSettingsPage />,
    security: <LiveSecuritySettingsPage />,
    permissions: <LivePermissionsSettingsPage />,
  }[submodule];

  return (
    <AppShell title={content.title} description={content.description}>
      {pageContent}
    </AppShell>
  );
}
