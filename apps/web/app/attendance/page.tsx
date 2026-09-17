import { AppShell } from "@/components/layout/app-shell";
import { LiveAttendance, LiveAttendanceReport } from "@/components/modules/live-operations";
export default function AttendancePage() { return <AppShell title="Attendance" description="Clock-in, clock-out, schedules, and attendance reporting."><div className="space-y-5"><LiveAttendance /><LiveAttendanceReport /></div></AppShell>; }
