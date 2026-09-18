import { AppShell } from "@/components/layout/app-shell";
import { PdfEditor } from "@/components/modules/pdf-editor";

export default function PdfEditorPage() {
  return <AppShell title="PDF Editor" description="Upload, edit, save, and manage PDF documents in your workspace."><PdfEditor /></AppShell>;
}
