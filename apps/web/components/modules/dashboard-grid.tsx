"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { type ModuleCard } from "@/lib/data";
import { filterModuleCards } from "@/lib/modules";
import { getStoredSession } from "@/lib/session";

export function DashboardGrid() {
  const [activeModule, setActiveModule] = useState<ModuleCard | null>(null);
  const [availableModules, setAvailableModules] = useState<ModuleCard[]>([]);

  useEffect(() => {
    const session = getStoredSession();
    setAvailableModules(
      filterModuleCards(session?.enabledModules ?? ["crm", "accounting", "hr", "forms", "automation", "settings"]),
    );
  }, []);

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
      <section className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        {availableModules.map((card) => {
          const Icon = card.icon;
          return (
            <button key={card.title} onClick={() => setActiveModule(card)} className="text-left">
              <Card className="group h-full min-h-[116px] w-full p-3 transition duration-200 hover:-translate-y-1 hover:border-brand-100 hover:bg-[#fbfcff] hover:shadow-[0_12px_24px_rgba(46,90,232,0.10)]">
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
                    key={submodule.href}
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
