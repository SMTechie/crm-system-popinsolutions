import { AppShell } from "@/components/layout/app-shell";
import { LiveAttendance } from "@/components/modules/live-operations";

export default function ClockInPage() {
  return <AppShell title="Employee clock-in" description="Secure employee attendance clock-in and clock-out."><LiveAttendance /></AppShell>;
}
