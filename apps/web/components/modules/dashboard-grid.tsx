"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, MapPin, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { type ModuleCard } from "@/lib/data";
import { filterModuleCards, getAccessibleModules } from "@/lib/modules";
import { getStoredSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";

type AttendanceToday = { id: string; date: string; status: string; checkInAt?: string | null; checkOutAt?: string | null; location?: string | null };

export function DashboardGrid() {
  const [activeModule, setActiveModule] = useState<ModuleCard | null>(null);
  const [availableModules, setAvailableModules] = useState<ModuleCard[]>([]);
  const [userName, setUserName] = useState("there");
  const [todayAttendance, setTodayAttendance] = useState<AttendanceToday | null>(null);
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [attendanceBusy, setAttendanceBusy] = useState(false);

  useEffect(() => {
    const session = getStoredSession();
    setUserName(session?.name?.split(" ")[0] || "there");
    setAvailableModules(filterModuleCards(getAccessibleModules(session?.role, session?.enabledModules ?? ["crm", "accounting", "hr", "attendance", "assets", "users", "settings"])));
    void apiFetch<{ items: AttendanceToday[] }>("/attendance/history").then((result) => {
      const today = new Date().toDateString();
      setTodayAttendance(result.items.find((item) => new Date(item.date).toDateString() === today) ?? null);
    }).catch(() => setTodayAttendance(null));
  }, []);

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
      <Card className="mb-5 border-brand-100 bg-gradient-to-r from-brand-50/70 via-white to-white p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-500 text-white"><Clock3 className="h-5 w-5" /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">Employee attendance</p><h2 className="mt-1 text-lg font-semibold text-ink">{todayAttendance?.checkInAt && !todayAttendance.checkOutAt ? `You’re clocked in, ${userName}. Ready to clock out?` : `Good day, ${userName}. Ready to clock in?`}</h2><p className="mt-1 text-xs text-slate-500">Time is captured automatically. Location is requested from your device.</p>{attendanceMessage ? <p className="mt-2 text-xs font-semibold text-brand-600">{attendanceMessage}</p> : null}</div></div>
          <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{todayAttendance?.location || "Location will be captured"}</span>{todayAttendance?.checkInAt && !todayAttendance.checkOutAt ? <button disabled={attendanceBusy} onClick={() => void attendanceAction("out")} className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{attendanceBusy ? "Saving…" : "Clock out"}</button> : <button disabled={attendanceBusy} onClick={() => void attendanceAction("in")} className="rounded-2xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{attendanceBusy ? "Saving…" : "Clock in"}</button>}</div>
        </div>
      </Card>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {availableModules.map((card) => {
          const Icon = card.icon;
          return (
            <button key={card.title} onClick={() => setActiveModule(card)} className="text-left">
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
              {activeModule.submodules.map((submodule) => {
                const Icon = submodule.icon;
                return (
                  <Link
                    key={`${activeModule.title}-${submodule.title}`}
                    href={submodule.href}
                    onClick={() => setActiveModule(null)}
                    className="group rounded-[20px] border border-line bg-white px-3.5 py-3.5 transition hover:-translate-y-0.5 hover:border-brand-100 hover:bg-soft"
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
    </>
  );
}

function moduleCardTone(title: string) {
  const tones: Record<string, string> = {
    CRM: "bg-gradient-to-br from-cyan-100/90 via-cyan-50/70 to-sky-50/60",
    Accounting: "bg-gradient-to-br from-emerald-100/90 via-emerald-50/70 to-teal-50/60",
    HR: "bg-gradient-to-br from-rose-100/90 via-rose-50/70 to-pink-50/60",
    Attendance: "bg-gradient-to-br from-amber-100/90 via-amber-50/70 to-orange-50/60",
    Assets: "bg-gradient-to-br from-indigo-100/90 via-indigo-50/70 to-blue-50/60",
    Projects: "bg-gradient-to-br from-violet-100/90 via-violet-50/70 to-purple-50/60",
    Users: "bg-gradient-to-br from-sky-100/90 via-sky-50/70 to-blue-50/60",
    Settings: "bg-gradient-to-br from-slate-100/90 via-slate-50/70 to-gray-50/60",
  };
  return tones[title] ?? "bg-white";
}
