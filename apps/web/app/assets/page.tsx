import { AppShell } from "@/components/layout/app-shell";
import { LiveAssets } from "@/components/modules/live-operations";
export default function AssetsPage() { return <AppShell title="Assets" description="Manage equipment, assignments, maintenance, and lifecycle history."><LiveAssets /></AppShell>; }
