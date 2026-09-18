"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
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

type Company = {
  id: string;
  name: string;
  industry?: string | null;
  website?: string | null;
};

const emptyDeal = { id: "", title: "", amount: "", stage: "NEW", currency: "ZAR", companyId: "" };

export function LiveDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [dealForm, setDealForm] = useState(emptyDeal);
  const [dealSearch, setDealSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [showDealForm, setShowDealForm] = useState(false);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [pendingDeleteDealId, setPendingDeleteDealId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function notify(type: "success" | "error", message: string) {
    setToast({ type, message });
  }

  async function load() {
    try {
      const [dealsData, companiesData] = await Promise.all([
        apiFetch<{ items: Deal[] }>("/crm/deals"),
        apiFetch<{ items: Company[] }>("/crm/companies"),
      ]);
      setDeals(dealsData.items);
      setCompanies(companiesData.items);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to load deals.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function saveDeal() {
    try {
      const payload = {
        title: dealForm.title || undefined,
        amount: dealForm.amount ? Number(dealForm.amount) : undefined,
        stage: dealForm.stage,
        currency: dealForm.currency || undefined,
        companyId: dealForm.companyId || "",
      };
      if (dealForm.id) {
        await apiFetch(`/crm/deals/${dealForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Deal updated successfully.");
      } else {
        await apiFetch("/crm/deals", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Deal created successfully.");
      }
      setDealForm(emptyDeal);
      setShowDealForm(false);
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save deal.");
    }
  }

  async function deleteDeal(dealId: string) {
    try {
      await apiFetch(`/crm/deals/${dealId}`, { method: "DELETE" });
      setPendingDeleteDealId(null);
      if (dealForm.id === dealId) {
        setDealForm(emptyDeal);
        setShowDealForm(false);
      }
      notify("success", "Deal deleted successfully.");
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete deal.");
    }
  }

  const filteredDeals = useMemo(() => {
    const term = dealSearch.trim().toLowerCase();
    return deals.filter((deal) => {
      const matchesSearch =
        term.length === 0 ||
        deal.title.toLowerCase().includes(term) ||
        deal.stage.toLowerCase().includes(term) ||
        deal.currency.toLowerCase().includes(term) ||
        (deal.company?.name ?? "").toLowerCase().includes(term);

      const matchesFilter = stageFilter === "ALL" || deal.stage === stageFilter;
      return matchesSearch && matchesFilter;
    });
  }, [dealSearch, deals, stageFilter]);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeCompanyId) ?? null,
    [activeCompanyId, companies],
  );

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Deals</p>
              <h2 className="mt-1 text-lg font-semibold text-ink md:text-xl">Pipeline and opportunity records</h2>
              <p className="mt-1 text-xs text-slate-500">Search, filter, edit, and create live deals from Neon.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                {filteredDeals.length} shown
              </span>
              <button
                onClick={() => {
                  setDealForm(emptyDeal);
                  setShowDealForm(true);
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-soft"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add deal</span>
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={dealSearch}
                onChange={(event) => setDealSearch(event.target.value)}
                placeholder="Search deal, company, stage, currency"
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
              />
            </label>
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              className="rounded-2xl border border-line bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500"
            >
              <option value="ALL">All stages</option>
              {["NEW", "DISCOVERY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"].map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Deal</th>
                <th className="px-4 py-2.5 font-semibold">Company</th>
                <th className="px-4 py-2.5 font-semibold">Stage</th>
                <th className="px-4 py-2.5 font-semibold">Value</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map((deal) => (
                <tr key={deal.id} className="border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3 text-sm font-semibold text-ink">{deal.title}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">
                    {deal.company?.name && deal.companyId ? (
                      <button
                        onClick={() => setActiveCompanyId(deal.companyId ?? null)}
                        className="font-medium text-slate-700 transition hover:text-brand-500"
                      >
                        {deal.company.name}
                      </button>
                    ) : (
                      "Unlinked"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-soft px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                      {deal.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-brand-500 md:text-sm">
                    {deal.currency} {Number(deal.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setDealForm({
                            id: deal.id,
                            title: deal.title,
                            amount: String(Number(deal.amount)),
                            stage: deal.stage,
                            currency: deal.currency,
                            companyId: deal.companyId ?? "",
                          });
                          setShowDealForm(true);
                        }}
                        className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setPendingDeleteDealId(deal.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredDeals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    No deals match the current search or filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {activeCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Company</p>
                <h3 className="mt-1 text-2xl font-semibold text-ink">{activeCompany.name}</h3>
              </div>
              <button
                onClick={() => setActiveCompanyId(null)}
                className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft"
              >
                Close
              </button>
            </div>
            <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
              <div className="rounded-[24px] border border-line p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Industry</p>
                <p className="mt-2 text-sm font-semibold text-ink">{activeCompany.industry || "General"}</p>
              </div>
              <div className="rounded-[24px] border border-line p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Website</p>
                <p className="mt-2 text-sm font-semibold text-ink">{activeCompany.website || "Not provided"}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showDealForm ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {dealForm.id ? "Edit Deal" : "Add Deal"}
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-ink">
                  {dealForm.id ? "Update deal details" : "Create a new deal"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">Save the deal directly into your live CRM workspace.</p>
              </div>
              <button
                onClick={() => {
                  setShowDealForm(false);
                  if (!dealForm.id) {
                    setDealForm(emptyDeal);
                  }
                }}
                className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft"
              >
                Close
              </button>
            </div>
            <div className="grid gap-3 px-6 py-5 md:grid-cols-2">
              <input value={dealForm.title} onChange={(event) => setDealForm((current) => ({ ...current, title: event.target.value }))} placeholder="Deal title" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2" />
              <input value={dealForm.amount} onChange={(event) => setDealForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
              <input value={dealForm.currency} onChange={(event) => setDealForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="Currency" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
              <select value={dealForm.stage} onChange={(event) => setDealForm((current) => ({ ...current, stage: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
                {["NEW", "DISCOVERY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"].map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
              <select value={dealForm.companyId} onChange={(event) => setDealForm((current) => ({ ...current, companyId: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
                <option value="">Unlinked company</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
              <button onClick={() => { setShowDealForm(false); if (!dealForm.id) { setDealForm(emptyDeal); } }} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">
                Cancel
              </button>
              <button onClick={() => void saveDeal()} className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">
                {dealForm.id ? "Update Deal" : "Save Deal"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteDealId ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="border-b border-line px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Confirm Delete</p>
              <h3 className="mt-1 text-xl font-semibold text-ink">Remove this deal?</h3>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4">
              <button onClick={() => setPendingDeleteDealId(null)} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">
                Cancel
              </button>
              <button onClick={() => void deleteDeal(pendingDeleteDealId)} className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700">
                Delete Deal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[70] max-w-sm">
          <div className={`rounded-[22px] border px-4 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.16)] ${toast.type === "success" ? "border-emerald-200 bg-white text-emerald-700" : "border-rose-200 bg-white text-rose-600"}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">{toast.type === "success" ? "Success" : "Error"}</p>
            <p className="mt-1 text-sm font-medium text-slate-700">{toast.message}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
