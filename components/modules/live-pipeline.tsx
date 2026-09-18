"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Deal = {
  id: string;
  title: string;
  amount: string;
  stage: string;
  currency: string;
  companyId?: string | null;
  company?: { name: string } | null;
};

const stages = ["NEW", "DISCOVERY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
const emptyDeal = { id: "", title: "", amount: "", stage: "NEW", currency: "ZAR", companyId: "" };

export function LivePipeline() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealForm, setDealForm] = useState(emptyDeal);
  const [showDealForm, setShowDealForm] = useState(false);
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function notify(type: "success" | "error", message: string) { setToast({ type, message }); }
  async function load() {
    try {
      const dealsData = await apiFetch<{ items: Deal[] }>("/crm/deals");
      setDeals(dealsData.items);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to load pipeline.");
    }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(null), 3200); return () => window.clearTimeout(timeout); }, [toast]);

  async function saveDeal() {
    try {
      const payload = { title: dealForm.title || undefined, amount: dealForm.amount ? Number(dealForm.amount) : undefined, stage: dealForm.stage, currency: dealForm.currency || undefined, companyId: dealForm.companyId || "" };
      await apiFetch(`/crm/deals/${dealForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      notify("success", "Pipeline deal updated successfully.");
      setShowDealForm(false);
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to update pipeline deal.");
    }
  }

  async function moveDealToStage(dealId: string, stage: (typeof stages)[number]) {
    const deal = deals.find((item) => item.id === dealId);
    if (!deal || deal.stage === stage) {
      return;
    }
    try {
      await apiFetch(`/crm/deals/${deal.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: deal.title,
          amount: Number(deal.amount),
          currency: deal.currency,
          stage,
          companyId: deal.companyId || "",
        }),
      });
      notify("success", `Deal moved to ${stage}.`);
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to move deal.");
    } finally {
      setDraggingDealId(null);
    }
  }

  const columns = useMemo(() => stages.map((stage) => ({ stage, deals: deals.filter((deal) => deal.stage === stage) })), [deals]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-6">
        {columns.map((column) => (
          <Card key={column.stage} className="p-4">
            <div
              onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
              onDrop={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                const droppedDealId = event.dataTransfer.getData("text/plain") || draggingDealId;
                if (droppedDealId) {
                  void moveDealToStage(droppedDealId, column.stage);
                }
              }}
            >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{column.stage}</p>
                <p className="mt-1 text-lg font-semibold text-ink">{column.deals.length} deals</p>
              </div>
              <span className="rounded-full bg-soft px-2.5 py-1 text-[10px] font-semibold text-brand-500">
                {column.deals.reduce((sum, deal) => sum + Number(deal.amount), 0).toLocaleString()}
              </span>
            </div>
            <div className="mt-4 space-y-2.5">
              {column.deals.map((deal) => (
                <button
                  key={deal.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", deal.id);
                    setDraggingDealId(deal.id);
                  }}
                  onDragEnd={() => setDraggingDealId(null)}
                  onClick={() => { setDealForm({ id: deal.id, title: deal.title, amount: String(Number(deal.amount)), stage: deal.stage, currency: deal.currency, companyId: deal.companyId ?? "" }); setShowDealForm(true); }}
                  className="w-full rounded-[20px] border border-line bg-soft/50 p-3 text-left transition hover:bg-soft"
                >
                  <p className="text-sm font-semibold text-ink">{deal.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{deal.company?.name ?? "Unlinked company"}</p>
                  <p className="mt-3 text-xs font-semibold text-brand-500">{deal.currency} {Number(deal.amount).toLocaleString()}</p>
                </button>
              ))}
              {column.deals.length === 0 ? <div className="rounded-[20px] border border-dashed border-line px-3 py-4 text-center text-xs text-slate-400">No deals</div> : null}
            </div>
            </div>
          </Card>
        ))}
      </div>

      {showDealForm ? <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm"><div className="w-full max-w-3xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]"><div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Edit Deal</p><h3 className="mt-1 text-2xl font-semibold text-ink">Update pipeline record</h3></div><button onClick={() => setShowDealForm(false)} className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft">Close</button></div><div className="grid gap-3 px-6 py-5 md:grid-cols-2"><input value={dealForm.title} onChange={(event) => setDealForm((current) => ({ ...current, title: event.target.value }))} placeholder="Deal title" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2" /><input value={dealForm.amount} onChange={(event) => setDealForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" /><input value={dealForm.currency} onChange={(event) => setDealForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="Currency" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" /><select value={dealForm.stage} onChange={(event) => setDealForm((current) => ({ ...current, stage: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2">{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></div><div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4"><button onClick={() => setShowDealForm(false)} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">Cancel</button><button onClick={() => void saveDeal()} className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">Update Deal</button></div></div></div> : null}
      {toast ? <div className="pointer-events-none fixed bottom-6 right-6 z-[70] max-w-sm"><div className={`rounded-[22px] border px-4 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.16)] ${toast.type === "success" ? "border-emerald-200 bg-white text-emerald-700" : "border-rose-200 bg-white text-rose-600"}`}><p className="text-xs font-semibold uppercase tracking-[0.14em]">{toast.type === "success" ? "Success" : "Error"}</p><p className="mt-1 text-sm font-medium text-slate-700">{toast.message}</p></div></div> : null}
    </div>
  );
}
