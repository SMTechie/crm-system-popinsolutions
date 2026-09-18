"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ShieldCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { filterModuleCards, getAccessibleModules } from "@/lib/modules";
import { type SessionUser } from "@/lib/session";

const COMPLETED_PREFIX = "popin-permission-walkthrough:";
export const SHOW_GUIDE_AFTER_LOGIN_KEY = "popin-show-workspace-guide";

type PermissionWalkthroughProps = { user: SessionUser };

export function PermissionWalkthrough({ user }: PermissionWalkthroughProps) {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const pathname = usePathname();
  const modules = useMemo(() => filterModuleCards(getAccessibleModules(user.role, user.enabledModules)), [user.enabledModules, user.role]);
  const steps = useMemo(() => [
    {
      title: `Welcome, ${user.name.split(" ")[0] || "there"}`,
      text: "This quick guide shows what your role can access and what you can do in the workspace.",
      content: <div className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-800">You can revisit the areas available to you from the dashboard at any time.</div>,
    },
    {
      title: "Your access level",
      text: "Your permissions are based on your assigned role. Access is limited to the areas shown below.",
      content: <div className="rounded-2xl border border-line bg-soft/40 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Role</p><p className="mt-1 text-2xl font-semibold text-ink">{user.role.replaceAll("_", " ")}</p><p className="mt-2 text-xs text-slate-500">If this role looks incorrect, contact your workspace administrator.</p></div>,
    },
    {
      title: "What you can do",
      text: modules.length ? "These are the work areas available to you. Select one from the dashboard to get started." : "No workspace modules are currently enabled for this account.",
      content: modules.length ? <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{modules.map((module) => <div key={module.title} className="rounded-2xl border border-line bg-white p-3"><p className="font-semibold text-ink">{module.title}</p><p className="mt-1 text-xs text-slate-500">{module.subtitle}</p><p className="mt-2 text-[11px] font-medium text-brand-600">You can use:</p><p className="mt-1 text-xs leading-5 text-slate-600">{module.submodules.map((submodule) => submodule.title).join(" · ")}</p></div>)}</div> : <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">Ask an administrator to enable the modules you need.</div>,
    },
    {
      title: "A few important notes",
      text: "Some actions may request extra information or approval.",
      content: <div className="space-y-2 text-sm text-slate-600"><div className="rounded-2xl border border-line p-3"><p className="font-semibold text-ink">Attendance</p><p className="mt-1 text-xs">Clock-in and clock-out may request your device location.</p></div><div className="rounded-2xl border border-line p-3"><p className="font-semibold text-ink">Sensitive data</p><p className="mt-1 text-xs">Only access customer, employee, finance, and company information needed for your work.</p></div><div className="rounded-2xl border border-line p-3"><p className="font-semibold text-ink">Need more access?</p><p className="mt-1 text-xs">Ask your administrator to update your role or permissions.</p></div></div>,
    },
  ], [modules, user.name, user.role]);

  useEffect(() => {
    if (pathname !== "/dashboard") return;
    const shouldShow = window.sessionStorage.getItem(SHOW_GUIDE_AFTER_LOGIN_KEY) === "true";
    window.sessionStorage.removeItem(SHOW_GUIDE_AFTER_LOGIN_KEY);
    if (shouldShow && !window.localStorage.getItem(`${COMPLETED_PREFIX}${user.id}`)) setOpen(true);
  }, [pathname, user.id]);

  function finish() {
    if (dontShowAgain) window.localStorage.setItem(`${COMPLETED_PREFIX}${user.id}`, "true");
    setOpen(false);
    setStep(0);
  }

  if (!open) return null;
  const current = steps[step];

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="permission-walkthrough-title"><Card className="w-full max-w-lg overflow-hidden border-line bg-white shadow-[0_24px_70px_rgba(15,23,42,0.2)]"><div className="flex items-start justify-between gap-4 border-b border-line p-5"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600"><ShieldCheck className="h-5 w-5" /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">Workspace guide · Step {step + 1} of {steps.length}</p><h2 id="permission-walkthrough-title" className="mt-1 text-xl font-semibold text-ink">{current.title}</h2></div></div><button type="button" onClick={finish} className="rounded-xl p-2 text-slate-400 hover:bg-soft hover:text-slate-700" aria-label="Close walkthrough"><X className="h-4 w-4" /></button></div><div className="p-5"><p className="text-sm leading-6 text-slate-600">{current.text}</p><div className="mt-4">{current.content}</div><div className="mt-5 flex flex-col gap-3"><label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={dontShowAgain} onChange={(event) => setDontShowAgain(event.target.checked)} className="h-4 w-4 rounded border-line accent-brand-500" />Don't show this walkthrough again</label><div className="flex items-center justify-between gap-3"><div className="flex gap-1.5" aria-label="Walkthrough progress">{steps.map((item, index) => <span key={item.title} className={`h-1.5 rounded-full transition-all ${index === step ? "w-6 bg-brand-500" : "w-1.5 bg-slate-200"}`} />)}</div><div className="flex items-center gap-2"><button type="button" onClick={finish} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-soft">Skip</button>{step > 0 ? <button type="button" onClick={() => setStep((currentStep) => currentStep - 1)} className="inline-flex items-center gap-1 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-soft"><ArrowLeft className="h-3.5 w-3.5" />Back</button> : null}{step < steps.length - 1 ? <button type="button" onClick={() => setStep((currentStep) => currentStep + 1)} className="inline-flex items-center gap-1 rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600">Next<ArrowRight className="h-3.5 w-3.5" /></button> : <button type="button" onClick={finish} className="inline-flex items-center gap-1 rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600">Finish<Check className="h-3.5 w-3.5" /></button>}</div></div></div></div></Card></div>;
}
