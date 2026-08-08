import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LiveCrm } from "@/components/modules/live-crm";
import { LiveActivities } from "@/components/modules/live-activities";
import { LiveCompanies } from "@/components/modules/live-companies";
import { LiveDeals } from "@/components/modules/live-deals";
import { LiveLeads } from "@/components/modules/live-leads";
import { LiveNotes } from "@/components/modules/live-notes";
import { LivePipeline } from "@/components/modules/live-pipeline";
import { LiveTasks } from "@/components/modules/live-tasks";

const crmSubmodules: Record<string, { title: string; description: string }> = {
  contacts: {
    title: "CRM Contacts",
    description: "Manage people records, segmentation, and linked customer communication details.",
  },
  companies: {
    title: "CRM Companies",
    description: "Review account records, organization details, and relationship history inside CRM.",
  },
  deals: {
    title: "CRM Deals",
    description: "Track opportunity stages, forecast value, and move live deals through the pipeline.",
  },
  activities: {
    title: "CRM Activities",
    description: "Log and update meetings, calls, emails, and follow-up actions tied to CRM records.",
  },
  leads: {
    title: "CRM Leads",
    description: "Capture and qualify prospects before converting them into active customer work.",
  },
  tasks: {
    title: "CRM Tasks",
    description: "Track follow-ups, action items, and internal work attached to CRM records.",
  },
  notes: {
    title: "CRM Notes",
    description: "Store customer context, meeting insights, and account notes in one place.",
  },
  pipeline: {
    title: "CRM Pipeline",
    description: "Review live deal stages in a board-style view across the active sales cycle.",
  },
};

export default async function CrmSubmodulePage({ params }: { params: Promise<{ submodule: string }> }) {
  const { submodule } = await params;
  const content = crmSubmodules[submodule];

  if (!content) {
    notFound();
  }

  return (
    <AppShell title={content.title} description={content.description}>
      {submodule === "contacts" ? <LiveCrm /> : null}
      {submodule === "companies" ? <LiveCompanies /> : null}
      {submodule === "deals" ? <LiveDeals /> : null}
      {submodule === "activities" ? <LiveActivities /> : null}
      {submodule === "leads" ? <LiveLeads /> : null}
      {submodule === "tasks" ? <LiveTasks /> : null}
      {submodule === "notes" ? <LiveNotes /> : null}
      {submodule === "pipeline" ? <LivePipeline /> : null}
    </AppShell>
  );
}
