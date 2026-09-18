"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Clock3, Download, MapPin, PackageCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { type ModuleCard } from "@/lib/data";
import { filterModuleCards, getAccessibleModules } from "@/lib/modules";
import { getStoredSession } from "@/lib/session";
import { API_BASE_URL, apiFetch } from "@/lib/api";

type AttendanceToday = { id: string; date: string; status: string; checkInAt?: string | null; checkOutAt?: string | null; location?: string | null };
type AssignedAsset = { id: string; assignedAt: string; notes?: string | null; asset: { id: string; assetTag: string; name: string; category: string; manufacturer?: string | null; model?: string | null; serialNumber?: string | null; status: string; condition: string; location?: string | null; warrantyExpiry?: string | null } };
type OwnLeaveRequest = { id: string; startDate: string; endDate: string; type: string; status: string; reason?: string | null };
type OwnPayslip = { id: string; periodLabel: string; payDate: string; grossAmount: string | number; deductions: string | number; netAmount: string | number; status: string };

export function DashboardGrid() {
  const router = useRouter();
  const [activeModule, setActiveModule] = useState<ModuleCard | null>(null);
  const [availableModules, setAvailableModules] = useState<ModuleCard[]>([]);
  const [userName, setUserName] = useState("there");
  const [todayAttendance, setTodayAttendance] = useState<AttendanceToday | null>(null);
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [assignedAssets, setAssignedAssets] = useState<AssignedAsset[]>([]);
  const [showAssets, setShowAssets] = useState(false);
  const [hasEmployeeSelfService, setHasEmployeeSelfService] = useState<boolean | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<OwnLeaveRequest[]>([]);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveMessage, setLeaveMessage] = useState("");
  const [leaveForm, setLeaveForm] = useState({ startDate: "", endDate: "", type: "PTO", reason: "" });
  const [payslips, setPayslips] = useState<OwnPayslip[]>([]);

  useEffect(() => {
    const session = getStoredSession();
    setUserName(session?.name?.split(" ")[0] || "there");
    setAvailableModules(filterModuleCards(getAccessibleModules(session?.role, session?.enabledModules ?? ["crm", "accounting", "hr", "attendance", "assets", "users", "settings"])));
    void apiFetch<{ items: OwnLeaveRequest[] }>("/attendance/leave-requests").then((result) => { setHasEmployeeSelfService(true); setLeaveRequests(result.items); }).catch(() => { setHasEmployeeSelfService(false); setLeaveRequests([]); });
    void apiFetch<{ items: AttendanceToday[] }>("/attendance/history").then((result) => {
      const today = new Date().toDateString();
      setTodayAttendance(result.items.find((item) => new Date(item.date).toDateString() === today) ?? null);
    }).catch(() => setTodayAttendance(null));
    void apiFetch<{ items: AssignedAsset[] }>("/assets/mine").then((result) => setAssignedAssets(result.items)).catch(() => setAssignedAssets([]));
    void apiFetch<{ items: OwnPayslip[] }>("/hr/payroll-runs").then((result) => setPayslips(result.items)).catch(() => setPayslips([]));
  }, []);

  async function downloadPayslip(payslip: OwnPayslip) {
    try {
      const session = getStoredSession();
      const response = await fetch(`${API_BASE_URL}/hr/payroll-runs/${payslip.id}/payslip`, { headers: { Authorization: `Bearer ${session?.token ?? ""}`, "X-Tenant-Id": session?.tenantId ?? "" } });
      if (!response.ok) throw new Error("Unable to generate payslip.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `payslip-${payslip.periodLabel}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setLeaveMessage(error instanceof Error ? error.message : "Unable to generate payslip.");
    }
  }

  async function submitLeaveRequest() {
    setLeaveBusy(true);
    setLeaveMessage("");
    try {
      const result = await apiFetch<{ item: OwnLeaveRequest }>("/attendance/leave-requests", { method: "POST", body: JSON.stringify(leaveForm) });
      setLeaveRequests((current) => [result.item, ...current]);
      setLeaveForm({ startDate: "", endDate: "", type: "PTO", reason: "" });
      setShowLeaveForm(false);
      setLeaveMessage("Leave request submitted and is waiting for approval.");
    } catch (error) {
      setLeaveMessage(error instanceof Error ? error.message : "Unable to submit leave request.");
    } finally {
      setLeaveBusy(false);
    }
  }

  async function getLocation() {
    if (!navigator.geolocation) throw new Error("Location permission is required to record attendance.");
    return new Promise<string>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`),
        () => reject(new Error("Please enable location permission before clocking in or out.")),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
      );
    });
  }

  async function attendanceAction(action: "in" | "out") {
    setAttendanceBusy(true);
    setAttendanceMessage("");
    try {
      const location = await getLocation();
          const result = await apiFetch<{ item: AttendanceToday }>(`/attendance/clock-${action === "in" ? "in" : "out"}`, { method: "POST", body: JSON.stringify({ method: "WEB", location }) });
      setTodayAttendance(result.item);
      setAttendanceMessage(action === "in" ? "Clocked in successfully." : "Clocked out successfully.");
    } catch (error) {
      setAttendanceMessage(error instanceof Error ? error.message : "Attendance action failed.");
    } finally {
      setAttendanceBusy(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveModule(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {hasEmployeeSelfService ? <div className="mb-5 grid gap-5 md:grid-cols-2">
      <Card className="h-full border-brand-100 bg-gradient-to-r from-brand-50/70 via-white to-white p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-500 text-white"><Clock3 className="h-5 w-5" /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">Employee attendance</p><h2 className="mt-1 text-lg font-semibold text-ink">{todayAttendance?.checkInAt && !todayAttendance.checkOutAt ? `You’re clocked in, ${userName}. Ready to clock out?` : `Good day, ${userName}. Ready to clock in?`}</h2><p className="mt-1 text-xs text-slate-500">Time is captured automatically. Location is requested from your device.</p>{attendanceMessage ? <p className="mt-2 text-xs font-semibold text-brand-600">{attendanceMessage}</p> : null}</div></div>
          <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{todayAttendance?.location || "Location will be captured"}</span>{todayAttendance?.checkInAt && !todayAttendance.checkOutAt ? <button disabled={attendanceBusy} onClick={() => void attendanceAction("out")} className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{attendanceBusy ? "Saving…" : "Clock out"}</button> : <button disabled={attendanceBusy} onClick={() => void attendanceAction("in")} className="rounded-2xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{attendanceBusy ? "Saving…" : "Clock in"}</button>}</div>
        </div>
      </Card>
      <button type="button" onClick={() => setShowAssets(true)} className="block h-full w-full text-left">
        <Card className="group h-full border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-white p-4 transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(46,90,232,0.10)]">
          <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-500 text-white"><PackageCheck className="h-5 w-5" /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600">My assets</p><h2 className="mt-1 text-lg font-semibold text-ink">Assets assigned to me</h2><p className="mt-1 text-xs text-slate-500">View your equipment, serial numbers, condition, and assignment details.</p></div></div><div className="flex items-center gap-2"><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700">{assignedAssets.length}</span><ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-500" /></div></div>
        </Card>
      </button>
      </div> : null}
      {hasEmployeeSelfService ? <div className="mb-5 grid gap-5 md:grid-cols-2"><Card className="border-rose-100 bg-gradient-to-r from-rose-50/80 via-white to-white p-4"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-rose-500 text-white"><CalendarDays className="h-5 w-5" /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-600">Leave requests</p><h2 className="mt-1 text-lg font-semibold text-ink">Apply for leave</h2><p className="mt-1 text-xs text-slate-500">Submit time off for HR or your manager to review and approve.</p>{leaveMessage ? <p className="mt-2 text-xs font-semibold text-rose-600">{leaveMessage}</p> : null}</div></div><button type="button" onClick={() => setShowLeaveForm(true)} className="rounded-2xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white">Request leave</button></div>{leaveRequests.length ? <div className="mt-4 max-h-44 space-y-2 overflow-y-auto">{leaveRequests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs"><span className="font-semibold text-slate-700">{request.type} · {new Date(request.startDate).toLocaleDateString()} – {new Date(request.endDate).toLocaleDateString()}</span><span className="font-semibold text-rose-600">{request.status}</span></div>)}</div> : <p className="mt-4 text-sm text-slate-500">No leave history yet.</p>}</Card><Card className="border-emerald-100 bg-white p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">My payslips</p><h2 className="mt-1 text-lg font-semibold text-ink">Pay history</h2><p className="mt-1 text-xs text-slate-500">View your payroll history and download generated payslips.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">{payslips.length}</span></div><div className="mt-4 max-h-44 space-y-2 overflow-y-auto">{payslips.length ? payslips.map((payslip) => <div key={payslip.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3"><div><p className="text-sm font-semibold text-ink">{payslip.periodLabel}</p><p className="mt-1 text-xs text-slate-500">Pay date: {new Date(payslip.payDate).toLocaleDateString()} · Net pay: ZAR {Number(payslip.netAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></div><button type="button" onClick={() => void downloadPayslip(payslip)} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white"><Download className="h-3.5 w-3.5" /> Generate payslip</button></div>) : <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-slate-500">No payslips have been issued yet.</p>}</div></Card></div> : null}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {availableModules.map((card) => {
          const Icon = card.icon;
          return (
            <button key={card.title} onClick={() => card.submodules.length === 1 ? router.push(card.submodules[0].href) : setActiveModule(card)} className="text-left">
              <Card className={`group h-full min-h-[116px] w-full border-transparent p-3 transition duration-200 hover:-translate-y-1 hover:border-brand-100 hover:bg-[#fbfcff] hover:shadow-[0_12px_24px_rgba(46,90,232,0.10)] ${moduleCardTone(card.title)}`}>
                <div className={`grid h-8 w-8 place-items-center rounded-[14px] transition duration-200 group-hover:scale-[1.04] ${card.tint}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="mt-2.5 flex items-end justify-between gap-2.5">
                  <div className="min-w-0">
                    <h3 className="text-[1rem] font-semibold tracking-[-0.03em] leading-none text-ink md:text-[1.45rem]">
                      {card.title}
                    </h3>
                    <p className="mt-1.5 text-[11px] leading-4 text-slate-500 md:text-[13px]">{card.subtitle}</p>
                  </div>
                  <ArrowRight className="mb-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 transition duration-200 group-hover:translate-x-1 group-hover:text-brand-500 md:h-4 md:w-4" />
                </div>
              </Card>
            </button>
          );
        })}
      </section>

      {activeModule ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-[rgba(15,23,42,0.24)] px-4 backdrop-blur-sm"
          onClick={() => setActiveModule(null)}
        >
          <div
            className="w-full max-w-[760px] rounded-[24px] border border-line bg-white p-5 shadow-[0_24px_60px_rgba(25,46,97,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{activeModule.title}</p>
                <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.03em] text-ink">Choose where you want to go.</h2>
                <p className="mt-1.5 text-xs text-slate-500">{activeModule.subtitle}</p>
              </div>
              <button
                onClick={() => setActiveModule(null)}
                className="rounded-2xl border border-line p-2 text-slate-600 transition hover:bg-soft"
                aria-label="Close module menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-2.5 md:grid-cols-2">
              {activeModule.submodules.map((submodule, index) => {
                const Icon = submodule.icon;
                return (
                  <Link
                    key={`${activeModule.title}-${submodule.title}`}
                    href={submodule.href}
                    onClick={() => setActiveModule(null)}
                    className={`group rounded-[20px] border border-line px-3.5 py-3.5 transition hover:-translate-y-0.5 hover:border-brand-100 ${moduleSubmoduleTone(activeModule.title, index)}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-[16px] bg-soft text-slate-700 transition group-hover:bg-brand-50 group-hover:text-brand-500">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="text-lg font-semibold tracking-[-0.02em] text-ink">{submodule.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{submodule.subtitle}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-500" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {showAssets ? <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm" onClick={() => setShowAssets(false)}><div className="my-auto max-h-[calc(100vh-4rem)] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-line bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.2)]" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600">My assets</p><h2 className="mt-1 text-2xl font-semibold text-ink">Assigned equipment</h2><p className="mt-1 text-sm text-slate-500">Only assets currently assigned to your employee profile are shown.</p></div><button type="button" onClick={() => setShowAssets(false)} className="rounded-2xl border border-line p-2 text-slate-600 transition hover:bg-soft" aria-label="Close my assets"><X className="h-4 w-4" /></button></div><div className="mt-5 space-y-3">{assignedAssets.length ? assignedAssets.map((assignment) => <div key={assignment.id} className="rounded-2xl border border-line bg-slate-50/60 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-base font-semibold text-ink">{assignment.asset.name}</p><p className="mt-1 text-xs text-slate-500">{assignment.asset.category} · {assignment.asset.assetTag}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">{assignment.asset.condition}</span></div><div className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs text-slate-500">Manufacturer / model</p><p className="mt-1 font-medium text-ink">{[assignment.asset.manufacturer, assignment.asset.model].filter(Boolean).join(" ") || "Not provided"}</p></div><div><p className="text-xs text-slate-500">Serial number</p><p className="mt-1 font-medium text-ink">{assignment.asset.serialNumber || "Not provided"}</p></div><div><p className="text-xs text-slate-500">Location</p><p className="mt-1 font-medium text-ink">{assignment.asset.location || "Not provided"}</p></div><div><p className="text-xs text-slate-500">Assigned date</p><p className="mt-1 font-medium text-ink">{new Date(assignment.assignedAt).toLocaleDateString()}</p></div></div>{assignment.notes ? <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-slate-600">{assignment.notes}</p> : null}</div>) : <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-slate-500">No assets are currently assigned to you.</div>}</div></div></div> : null}
      {showLeaveForm ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-8 backdrop-blur-sm" onClick={() => setShowLeaveForm(false)}><div className="w-full max-w-lg rounded-[28px] border border-line bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.2)]" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-600">Leave request</p><h2 className="mt-1 text-2xl font-semibold text-ink">Apply for leave</h2><p className="mt-1 text-sm text-slate-500">Your request will remain pending until approved.</p></div><button type="button" onClick={() => setShowLeaveForm(false)} className="rounded-2xl border border-line p-2 text-slate-600" aria-label="Close leave request"><X className="h-4 w-4" /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-500">Start date<input type="date" value={leaveForm.startDate} onChange={(event) => setLeaveForm((current) => ({ ...current, startDate: event.target.value }))} className="mt-1 w-full rounded-2xl border border-line px-4 py-3 text-sm text-ink outline-none" /></label><label className="text-xs font-semibold text-slate-500">End date<input type="date" min={leaveForm.startDate} value={leaveForm.endDate} onChange={(event) => setLeaveForm((current) => ({ ...current, endDate: event.target.value }))} className="mt-1 w-full rounded-2xl border border-line px-4 py-3 text-sm text-ink outline-none" /></label><label className="text-xs font-semibold text-slate-500 sm:col-span-2">Leave type<select value={leaveForm.type} onChange={(event) => setLeaveForm((current) => ({ ...current, type: event.target.value }))} className="mt-1 w-full rounded-2xl border border-line px-4 py-3 text-sm text-ink outline-none"><option value="PTO">Paid time off</option><option value="SICK">Sick leave</option><option value="UNPAID">Unpaid leave</option><option value="PARENTAL">Parental leave</option><option value="BEREAVEMENT">Bereavement leave</option><option value="OTHER">Other</option></select></label><label className="text-xs font-semibold text-slate-500 sm:col-span-2">Reason (optional)<textarea rows={4} value={leaveForm.reason} onChange={(event) => setLeaveForm((current) => ({ ...current, reason: event.target.value }))} className="mt-1 w-full rounded-2xl border border-line px-4 py-3 text-sm text-ink outline-none" placeholder="Add a reason or supporting context" /></label></div><div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setShowLeaveForm(false)} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button type="button" disabled={leaveBusy || !leaveForm.startDate || !leaveForm.endDate} onClick={() => void submitLeaveRequest()} className="rounded-2xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{leaveBusy ? "Submitting…" : "Submit request"}</button></div></div></div> : null}
    </>
  );
}

function moduleCardTone(title: string) {
  const tones: Record<string, string> = {
    CRM: "!bg-gradient-to-br from-cyan-100/90 via-cyan-50/70 to-sky-50/60",
    Accounting: "!bg-gradient-to-br from-emerald-100/90 via-emerald-50/70 to-teal-50/60",
    HR: "!bg-gradient-to-br from-rose-100/90 via-rose-50/70 to-pink-50/60",
    Attendance: "!bg-gradient-to-br from-amber-100/90 via-amber-50/70 to-orange-50/60",
    Assets: "!bg-gradient-to-br from-indigo-100/90 via-indigo-50/70 to-blue-50/60",
    Projects: "!bg-gradient-to-br from-violet-100/90 via-violet-50/70 to-purple-50/60",
    Users: "!bg-gradient-to-br from-sky-100/90 via-sky-50/70 to-blue-50/60",
    Settings: "!bg-gradient-to-br from-slate-100/90 via-slate-50/70 to-gray-50/60",
  };
  return tones[title] ?? "bg-white";
}

function moduleSubmoduleTone(title: string, index: number) {
  const tones: Record<string, string[]> = {
    CRM: ["!bg-cyan-50", "!bg-sky-50", "!bg-teal-50", "!bg-blue-50"],
    Accounting: ["!bg-emerald-50", "!bg-teal-50", "!bg-lime-50", "!bg-green-50"],
    HR: ["!bg-rose-50", "!bg-pink-50", "!bg-red-50", "!bg-orange-50"],
    Assets: ["!bg-indigo-50", "!bg-blue-50", "!bg-violet-50", "!bg-sky-50"],
    Attendance: ["!bg-amber-50", "!bg-orange-50", "!bg-yellow-50", "!bg-lime-50"],
    Settings: ["!bg-slate-50", "!bg-gray-50", "!bg-zinc-50", "!bg-blue-50"],
  };
  return tones[title]?.[index % (tones[title]?.length || 1)] ?? "!bg-brand-50";
}
