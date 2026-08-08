import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  LiveFormPublicLinksPage,
  LiveFormResponsesPage,
  LiveFormTemplatesPage,
} from "@/components/modules/live-form-builder";

const formSubmodules: Record<string, { title: string; description: string }> = {
  templates: {
    title: "Form Templates",
    description: "Manage reusable templates, saved schemas, and published form structures.",
  },
  responses: {
    title: "Form Responses",
    description: "Review submitted records, captured lead data, and response activity tied to forms.",
  },
  "public-links": {
    title: "Form Public Links",
    description: "Manage public publishing, external embedding, and form access points.",
  },
};

export default async function FormSubmodulePage({ params }: { params: Promise<{ submodule: string }> }) {
  const { submodule } = await params;
  const content = formSubmodules[submodule];

  if (!content) {
    notFound();
  }

  const pageContent = {
    templates: <LiveFormTemplatesPage />,
    responses: <LiveFormResponsesPage />,
    "public-links": <LiveFormPublicLinksPage />,
  }[submodule];

  return (
    <AppShell title={content.title} description={content.description}>
      {pageContent}
    </AppShell>
  );
}
