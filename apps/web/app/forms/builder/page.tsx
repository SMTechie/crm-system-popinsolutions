import { AppShell } from "@/components/layout/app-shell";
import { LiveFormBuilder } from "@/components/modules/live-form-builder";

export default function FormBuilderPage() {
  return (
    <AppShell
      title="Custom Form Builder"
      description="Design dynamic forms, publish external links, map responses into CRM records, and trigger automation workflows."
    >
      <LiveFormBuilder />
    </AppShell>
  );
}
