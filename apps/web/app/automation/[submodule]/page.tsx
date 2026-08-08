import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  LiveAutomationActionsPage,
  LiveAutomationLogsPage,
  LiveAutomationTriggersPage,
  LiveAutomationWorkflowsPage,
} from "@/components/modules/live-automation";

const automationSubmodules: Record<string, { title: string; description: string }> = {
  workflows: {
    title: "Automation Workflows",
    description: "Create and manage workflow definitions, logic paths, and business automation flows.",
  },
  triggers: {
    title: "Automation Triggers",
    description: "Monitor the events that start workflow runs across CRM, forms, and finance.",
  },
  actions: {
    title: "Automation Actions",
    description: "Review the downstream actions performed by workflow rules and automation steps.",
  },
  logs: {
    title: "Automation Logs",
    description: "Inspect run history, execution outcomes, and operational workflow status.",
  },
};

export default async function AutomationSubmodulePage({ params }: { params: Promise<{ submodule: string }> }) {
  const { submodule } = await params;
  const content = automationSubmodules[submodule];

  if (!content) {
    notFound();
  }

  const pageContent = {
    workflows: <LiveAutomationWorkflowsPage />,
    triggers: <LiveAutomationTriggersPage />,
    actions: <LiveAutomationActionsPage />,
    logs: <LiveAutomationLogsPage />,
  }[submodule];

  return (
    <AppShell title={content.title} description={content.description}>
      {pageContent}
    </AppShell>
  );
}
