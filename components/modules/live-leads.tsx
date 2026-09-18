"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Contact = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  companyId?: string | null;
  company?: { name: string } | null;
  tags: string[];
};

type Company = {
  id: string;
  name: string;
};

const emptyLead = {
  id: "",
  fullName: "",
  email: "",
  phone: "",
  companyId: "",
  tags: "lead,new",
};

export function LiveLeads() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [leadForm, setLeadForm] = useState(emptyLead);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadFilter, setLeadFilter] = useState("ALL");
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [pendingDeleteLeadId, setPendingDeleteLeadId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function notify(type: "success" | "error", message: string) {
    setToast({ type, message });
  }

  async function load() {
    try {
      const [contactsData, companiesData] = await Promise.all([
        apiFetch<{ items: Contact[] }>("/crm/contacts"),
        apiFetch<{ items: Company[] }>("/crm/companies"),
      ]);
      setContacts(contactsData.items);
      setCompanies(companiesData.items);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to load leads.");
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

  async function saveLead() {
    try {
      const payload = {
        fullName: leadForm.fullName || undefined,
        email: leadForm.email || undefined,
        phone: leadForm.phone || undefined,
        companyId: leadForm.companyId || "",
        tags: leadForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      };
      if (leadForm.id) {
        await apiFetch(`/crm/contacts/${leadForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Lead updated successfully.");
      } else {
        await apiFetch("/crm/contacts", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Lead created successfully.");
      }
      setLeadForm(emptyLead);
      setShowLeadForm(false);
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save lead.");
    }
  }

  async function deleteLead(contactId: string) {
    try {
      await apiFetch(`/crm/contacts/${contactId}`, { method: "DELETE" });
      setPendingDeleteLeadId(null);
      if (leadForm.id === contactId) {
        setLeadForm(emptyLead);
        setShowLeadForm(false);
      }
      notify("success", "Lead deleted successfully.");
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete lead.");
    }
  }

  const leads = useMemo(
    () => contacts.filter((contact) => contact.tags.some((tag) => ["lead", "prospect", "new"].includes(tag.toLowerCase()))),
    [contacts],
  );

  const filteredLeads = useMemo(() => {
    const term = leadSearch.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch =
        term.length === 0 ||
        lead.fullName.toLowerCase().includes(term) ||
        (lead.email ?? "").toLowerCase().includes(term) ||
        (lead.company?.name ?? "").toLowerCase().includes(term) ||
        lead.tags.some((tag) => tag.toLowerCase().includes(term));
      const matchesFilter =
        leadFilter === "ALL" ||
        lead.tags.some((tag) => tag.toLowerCase() === leadFilter.toLowerCase());
      return matchesSearch && matchesFilter;
    });
  }, [leadFilter, leadSearch, leads]);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Leads</p>
              <h2 className="mt-1 text-lg font-semibold text-ink md:text-xl">Prospect and intake records</h2>
              <p className="mt-1 text-xs text-slate-500">Manage early-stage leads before they mature into full customer work.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">{filteredLeads.length} shown</span>
              <button onClick={() => { setLeadForm(emptyLead); setShowLeadForm(true); }} className="inline-flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-soft">
                <Plus className="h-3.5 w-3.5" />
                <span>Add lead</span>
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Search lead, email, company, tags" className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400" />
            </label>
            <select value={leadFilter} onChange={(event) => setLeadFilter(event.target.value)} className="rounded-2xl border border-line bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500">
              <option value="ALL">All lead tags</option>
              <option value="new">New</option>
              <option value="lead">Lead</option>
              <option value="prospect">Prospect</option>
              <option value="qualified">Qualified</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Lead</th>
                <th className="px-4 py-2.5 font-semibold">Email</th>
                <th className="px-4 py-2.5 font-semibold">Company</th>
                <th className="px-4 py-2.5 font-semibold">Tags</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3 text-sm font-semibold text-ink">{lead.fullName}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{lead.email ?? "No email"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{lead.company?.name ?? "Unlinked"}</td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1.5">{lead.tags.map((tag) => <span key={tag} className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-semibold text-brand-500">{tag}</span>)}</div></td>
                  <td className="px-4 py-3"><div className="flex items-center justify-end gap-2">
                    <button onClick={() => { setLeadForm({ id: lead.id, fullName: lead.fullName, email: lead.email ?? "", phone: lead.phone ?? "", companyId: lead.companyId ?? "", tags: lead.tags.join(", ") }); setShowLeadForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button>
                    <button onClick={() => setPendingDeleteLeadId(lead.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /><span>Delete</span></button>
                  </div></td>
                </tr>
              ))}
              {filteredLeads.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No leads match the current search or filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>

      {showLeadForm ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{leadForm.id ? "Edit Lead" : "Add Lead"}</p>
                <h3 className="mt-1 text-2xl font-semibold text-ink">{leadForm.id ? "Update lead details" : "Create a new lead"}</h3>
              </div>
              <button onClick={() => { setShowLeadForm(false); if (!leadForm.id) setLeadForm(emptyLead); }} className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft">Close</button>
            </div>
            <div className="grid gap-3 px-6 py-5 md:grid-cols-2">
              <input value={leadForm.fullName} onChange={(event) => setLeadForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Lead name" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
              <input value={leadForm.email} onChange={(event) => setLeadForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
              <input value={leadForm.phone} onChange={(event) => setLeadForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
              <select value={leadForm.companyId} onChange={(event) => setLeadForm((current) => ({ ...current, companyId: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
                <option value="">Unlinked company</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
              <input value={leadForm.tags} onChange={(event) => setLeadForm((current) => ({ ...current, tags: event.target.value }))} placeholder="Tags separated by commas" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2" />
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
              <button onClick={() => { setShowLeadForm(false); if (!leadForm.id) setLeadForm(emptyLead); }} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">Cancel</button>
              <button onClick={() => void saveLead()} className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">{leadForm.id ? "Update Lead" : "Save Lead"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteLeadId ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="border-b border-line px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Confirm Delete</p>
              <h3 className="mt-1 text-xl font-semibold text-ink">Remove this lead?</h3>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4">
              <button onClick={() => setPendingDeleteLeadId(null)} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">Cancel</button>
              <button onClick={() => void deleteLead(pendingDeleteLeadId)} className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700">Delete Lead</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="pointer-events-none fixed bottom-6 right-6 z-[70] max-w-sm"><div className={`rounded-[22px] border px-4 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.16)] ${toast.type === "success" ? "border-emerald-200 bg-white text-emerald-700" : "border-rose-200 bg-white text-rose-600"}`}><p className="text-xs font-semibold uppercase tracking-[0.14em]">{toast.type === "success" ? "Success" : "Error"}</p><p className="mt-1 text-sm font-medium text-slate-700">{toast.message}</p></div></div> : null}
    </div>
  );
}
