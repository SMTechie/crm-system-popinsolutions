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

type Contact = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  companyId?: string | null;
  company?: { name: string } | null;
  tags: string[];
};

type Activity = {
  id: string;
  title: string;
  type: string;
  occurredAt: string;
  contactId?: string | null;
  contact?: { fullName: string } | null;
};

type PipelineGroup = {
  id: string;
  name: string;
  count: number;
  total: number;
};

type Company = {
  id: string;
  name: string;
  industry?: string | null;
  website?: string | null;
};

const emptyDeal = { id: "", title: "", amount: "", stage: "NEW", currency: "ZAR", companyId: "" };
const emptyContact = { id: "", fullName: "", email: "", phone: "", companyId: "", tags: "website,automation" };
const emptyActivity = {
  id: "",
  title: "",
  type: "CALL",
  occurredAt: "2026-08-04T12:00",
  contactId: "",
};

export function LiveCrm() {
  const [overview, setOverview] = useState<{ forecast: number; topStages: string[] } | null>(null);
  const [groups, setGroups] = useState<PipelineGroup[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [dealForm, setDealForm] = useState(emptyDeal);
  const [contactForm, setContactForm] = useState(emptyContact);
  const [activityForm, setActivityForm] = useState(emptyActivity);
  const [showDealForm, setShowDealForm] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactFilter, setContactFilter] = useState("ALL");
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [pendingDeleteContactId, setPendingDeleteContactId] = useState<string | null>(null);

  function notify(type: "success" | "error", message: string) {
    setToast({ type, message });
  }

  async function load() {
    try {
      const [overviewData, groupData, dealsData, contactsData, activitiesData, companiesData] = await Promise.all([
        apiFetch<{ forecast: number; topStages: string[] }>("/crm/overview"),
        apiFetch<{ items: PipelineGroup[] }>("/crm/pipelines"),
        apiFetch<{ items: Deal[] }>("/crm/deals"),
        apiFetch<{ items: Contact[] }>("/crm/contacts"),
        apiFetch<{ items: Activity[] }>("/crm/activities"),
        apiFetch<{ items: Company[] }>("/crm/companies"),
      ]);
      setOverview(overviewData);
      setGroups(groupData.items);
      setDeals(dealsData.items);
      setContacts(contactsData.items);
      setActivities(activitiesData.items);
      setCompanies(companiesData.items);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to load CRM.");
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

  async function saveContact() {
    try {
      const payload = {
        fullName: contactForm.fullName || undefined,
        email: contactForm.email || undefined,
        phone: contactForm.phone || undefined,
        companyId: contactForm.companyId || "",
        tags: contactForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      };
      if (contactForm.id) {
        await apiFetch(`/crm/contacts/${contactForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Client updated successfully.");
      } else {
        await apiFetch("/crm/contacts", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Client created successfully.");
      }
      setContactForm(emptyContact);
      setShowContactForm(false);
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save client.");
    }
  }

  async function saveActivity() {
    try {
      const payload = {
        title: activityForm.title || undefined,
        type: activityForm.type || undefined,
        occurredAt: activityForm.occurredAt ? new Date(activityForm.occurredAt).toISOString() : undefined,
        contactId: activityForm.contactId || "",
      };
      if (activityForm.id) {
        await apiFetch(`/crm/activities/${activityForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Activity updated successfully.");
      } else {
        await apiFetch("/crm/activities", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Activity logged successfully.");
      }
      setActivityForm(emptyActivity);
      setShowActivityForm(false);
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save activity.");
    }
  }

  async function deleteContact(contactId: string) {
    try {
      await apiFetch(`/crm/contacts/${contactId}`, { method: "DELETE" });
      if (contactForm.id === contactId) {
        setContactForm(emptyContact);
        setShowContactForm(false);
      }
      setPendingDeleteContactId(null);
      notify("success", "Client deleted successfully.");
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete client.");
    }
  }

  const pipelineSummary = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        value: deals.filter((deal) => deal.stage === group.name).length,
      })),
    [groups, deals],
  );

  const filteredContacts = useMemo(() => {
    const term = contactSearch.trim().toLowerCase();
    return contacts.filter((contact) => {
      const matchesSearch =
        term.length === 0 ||
        contact.fullName.toLowerCase().includes(term) ||
        (contact.email ?? "").toLowerCase().includes(term) ||
        (contact.phone ?? "").toLowerCase().includes(term) ||
        (contact.company?.name ?? "").toLowerCase().includes(term) ||
        contact.tags.some((tag) => tag.toLowerCase().includes(term));

      const matchesFilter =
        contactFilter === "ALL" ||
        (contactFilter === "LINKED" && Boolean(contact.company?.name)) ||
        (contactFilter === "UNLINKED" && !contact.company?.name) ||
        (contactFilter === "TAGGED" && contact.tags.length > 0);

      return matchesSearch && matchesFilter;
    });
  }, [contactFilter, contactSearch, contacts]);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeCompanyId) ?? null,
    [activeCompanyId, companies],
  );

  const activeCompanyContacts = useMemo(
    () => contacts.filter((contact) => contact.companyId === activeCompanyId),
    [activeCompanyId, contacts],
  );

  const activeCompanyDeals = useMemo(
    () => deals.filter((deal) => deal.companyId === activeCompanyId),
    [activeCompanyId, deals],
  );

  const selectedContactActivities = useMemo(
    () => (contactForm.id ? activities.filter((activity) => activity.contactId === contactForm.id) : []),
    [activities, contactForm.id],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Card className="overflow-hidden">
          <div className="border-b border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Contacts</p>
                <h2 className="mt-1 text-lg font-semibold text-ink md:text-xl">Customer and lead records</h2>
                <p className="mt-1 text-xs text-slate-500">Search, filter, edit, create, and remove live contacts from Neon.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                  {filteredContacts.length} shown
                </span>
                <button
                  onClick={() => {
                    setContactForm(emptyContact);
                    setShowContactForm(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-soft"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add contact</span>
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px]">
              <label className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={contactSearch}
                  onChange={(event) => setContactSearch(event.target.value)}
                  placeholder="Search contacts, email, company, tags"
                  className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
                />
              </label>
              <select
                value={contactFilter}
                onChange={(event) => setContactFilter(event.target.value)}
                className="rounded-2xl border border-line bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500"
              >
                <option value="ALL">All contacts</option>
                <option value="LINKED">Linked company</option>
                <option value="UNLINKED">Unlinked</option>
                <option value="TAGGED">Tagged</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="border-b border-line bg-slate-50/70">
                <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Email</th>
                  <th className="px-4 py-2.5 font-semibold">Phone</th>
                  <th className="px-4 py-2.5 font-semibold">Company</th>
                  <th className="px-4 py-2.5 font-semibold">Tags</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-line transition hover:bg-soft/40">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          setContactForm({
                            id: contact.id,
                            fullName: contact.fullName,
                            email: contact.email ?? "",
                            phone: contact.phone ?? "",
                            companyId: contact.companyId ?? "",
                            tags: contact.tags.join(", "),
                          });
                          setShowContactForm(true);
                        }}
                        className="text-sm font-semibold text-ink transition hover:text-brand-500"
                      >
                        {contact.fullName}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{contact.email ?? "No email"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{contact.phone ?? "No phone"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">
                      {contact.company?.name && contact.companyId ? (
                        <button
                          onClick={() => setActiveCompanyId(contact.companyId ?? null)}
                          className="font-medium text-slate-700 transition hover:text-brand-500"
                        >
                          {contact.company.name}
                        </button>
                      ) : (
                        "Unlinked"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {contact.tags.length ? contact.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-semibold text-brand-500">
                            {tag}
                          </span>
                        )) : <span className="text-xs text-slate-400">No tags</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setContactForm({
                              id: contact.id,
                              fullName: contact.fullName,
                              email: contact.email ?? "",
                              phone: contact.phone ?? "",
                              companyId: contact.companyId ?? "",
                              tags: contact.tags.join(", "),
                            });
                            setShowContactForm(true);
                          }}
                          className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setPendingDeleteContactId(contact.id)}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                      No contacts match the current search or filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

      </div>

      {activeCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Company</p>
                <h3 className="mt-1 text-2xl font-semibold text-ink">{activeCompany.name}</h3>
                <p className="mt-1 text-sm text-slate-500">Organization profile from the live CRM workspace.</p>
              </div>
              <button
                onClick={() => setActiveCompanyId(null)}
                className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 px-6 py-5 md:grid-cols-3">
              <div className="rounded-3xl border border-line bg-slate-50/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Industry</p>
                <p className="mt-2 text-sm font-semibold text-ink">{activeCompany.industry || "General"}</p>
              </div>
              <div className="rounded-3xl border border-line bg-slate-50/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Linked Contacts</p>
                <p className="mt-2 text-sm font-semibold text-ink">{activeCompanyContacts.length}</p>
              </div>
              <div className="rounded-3xl border border-line bg-slate-50/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Open Deals</p>
                <p className="mt-2 text-sm font-semibold text-ink">{activeCompanyDeals.length}</p>
              </div>
            </div>

            <div className="grid gap-4 px-6 pb-6 md:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[24px] border border-line p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Company Details</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Name</p>
                    <p className="mt-1 font-medium text-ink">{activeCompany.name}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Website</p>
                    {activeCompany.website ? (
                      <a
                        href={activeCompany.website}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block font-medium text-brand-500 hover:underline"
                      >
                        {activeCompany.website}
                      </a>
                    ) : (
                      <p className="mt-1">Not provided</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Industry</p>
                    <p className="mt-1">{activeCompany.industry || "General"}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-line p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Contacts</p>
                  <div className="mt-3 space-y-3">
                    {activeCompanyContacts.length ? activeCompanyContacts.map((contact) => (
                      <div key={contact.id} className="rounded-2xl border border-line px-3 py-2.5">
                        <p className="text-sm font-semibold text-ink">{contact.fullName}</p>
                        <p className="mt-1 text-xs text-slate-500">{contact.email || "No email"}</p>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-500">No contacts linked yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-line p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Deals</p>
                  <div className="mt-3 space-y-3">
                    {activeCompanyDeals.length ? activeCompanyDeals.map((deal) => (
                      <div key={deal.id} className="rounded-2xl border border-line px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-ink">{deal.title}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {deal.currency} {Number(deal.amount).toLocaleString()}
                            </p>
                          </div>
                          <span className="rounded-full bg-soft px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                            {deal.stage}
                          </span>
                        </div>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-500">No deals linked yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showContactForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-5xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {contactForm.id ? "Edit Client" : "Add Client"}
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-ink">
                  {contactForm.id ? "Update client details" : "Create a new client"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Save the client directly into your live CRM workspace.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowContactForm(false);
                  if (!contactForm.id) {
                    setContactForm(emptyContact);
                  }
                }}
                className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 px-6 py-5">
              <input
                value={contactForm.fullName}
                onChange={(event) => setContactForm((current) => ({ ...current, fullName: event.target.value }))}
                placeholder="Full name"
                className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500"
              />
              <input
                value={contactForm.email}
                onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email"
                className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500"
              />
              <input
                value={contactForm.phone}
                onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="Phone"
                className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500"
              />
              <select
                value={contactForm.companyId}
                onChange={(event) => setContactForm((current) => ({ ...current, companyId: event.target.value }))}
                className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500"
              >
                <option value="">Unlinked company</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
              <input
                value={contactForm.tags}
                onChange={(event) => setContactForm((current) => ({ ...current, tags: event.target.value }))}
                placeholder="Tags separated by commas"
                className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500"
              />
            </div>

            {contactForm.id ? (
              <div className="border-t border-line px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">History</p>
                    <p className="mt-1 text-sm text-slate-500">Recent client activity and case work linked to this record.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        setDealForm({
                          id: "",
                          title: `Case for ${contactForm.fullName || "Client"}`,
                          amount: "",
                          stage: "NEW",
                          currency: "ZAR",
                          companyId: contactForm.companyId || "",
                        });
                        setShowContactForm(false);
                        setShowDealForm(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-soft"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Case</span>
                    </button>
                    <button
                      onClick={() => {
                        setActivityForm({
                          id: "",
                          title: "",
                          type: "CALL",
                          occurredAt: new Date().toISOString().slice(0, 16),
                          contactId: contactForm.id,
                        });
                        setShowContactForm(false);
                        setShowActivityForm(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Log Activity</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {selectedContactActivities.length ? (
                    selectedContactActivities.map((activity) => (
                      <button
                        key={activity.id}
                        onClick={() => {
                          setActivityForm({
                            id: activity.id,
                            title: activity.title,
                            type: activity.type,
                            occurredAt: new Date(activity.occurredAt).toISOString().slice(0, 16),
                            contactId: activity.contactId ?? contactForm.id,
                          });
                          setShowContactForm(false);
                          setShowActivityForm(true);
                        }}
                        className="flex w-full items-start justify-between gap-3 rounded-[22px] border border-line px-4 py-3 text-left transition hover:bg-soft/50"
                      >
                        <div>
                          <p className="text-sm font-semibold text-ink">{activity.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {new Date(activity.occurredAt).toLocaleString()}
                          </p>
                        </div>
                        <span className="rounded-full bg-soft px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                          {activity.type}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-line px-4 py-5 text-sm text-slate-500">
                      No activity history yet for this client.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
              <button
                onClick={() => {
                  setShowContactForm(false);
                  if (!contactForm.id) {
                    setContactForm(emptyContact);
                  }
                }}
                className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveContact()}
                className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white"
              >
                {contactForm.id ? "Update Client" : "Save Client"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDealForm ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {dealForm.id ? "Edit Case" : "New Case"}
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-ink">
                  {dealForm.id ? "Update case details" : "Create a new case"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Cases are tracked as live CRM opportunities linked to the client company.
                </p>
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

            <div className="space-y-3 px-6 py-5">
              <input value={dealForm.title} onChange={(event) => setDealForm((current) => ({ ...current, title: event.target.value }))} placeholder="Case title" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
              <input value={dealForm.amount} onChange={(event) => setDealForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
              <div className="grid gap-3 md:grid-cols-2">
                <select value={dealForm.stage} onChange={(event) => setDealForm((current) => ({ ...current, stage: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
                  {["NEW", "DISCOVERY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"].map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                </select>
                <input value={dealForm.currency} onChange={(event) => setDealForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="Currency" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
              </div>
              <select value={dealForm.companyId} onChange={(event) => setDealForm((current) => ({ ...current, companyId: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
                <option value="">Unlinked company</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
              <button
                onClick={() => {
                  setShowDealForm(false);
                  if (!dealForm.id) {
                    setDealForm(emptyDeal);
                  }
                }}
                className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveDeal()}
                className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white"
              >
                {dealForm.id ? "Update Case" : "Save Case"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showActivityForm ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {activityForm.id ? "Edit Activity" : "Log Activity"}
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-ink">
                  {activityForm.id ? "Update activity details" : "Create a new activity"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Track calls, emails, meetings, and tasks against a live client record.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowActivityForm(false);
                  if (!activityForm.id) {
                    setActivityForm(emptyActivity);
                  }
                }}
                className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 px-6 py-5">
              <input value={activityForm.title} onChange={(event) => setActivityForm((current) => ({ ...current, title: event.target.value }))} placeholder="Activity title" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
              <div className="grid gap-3 md:grid-cols-2">
                <select value={activityForm.type} onChange={(event) => setActivityForm((current) => ({ ...current, type: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
                  {["CALL", "EMAIL", "MEETING", "TASK"].map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <input type="datetime-local" value={activityForm.occurredAt} onChange={(event) => setActivityForm((current) => ({ ...current, occurredAt: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
              </div>
              <select value={activityForm.contactId} onChange={(event) => setActivityForm((current) => ({ ...current, contactId: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
                <option value="">Unlinked contact</option>
                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName}</option>)}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
              <button
                onClick={() => {
                  setShowActivityForm(false);
                  if (!activityForm.id) {
                    setActivityForm(emptyActivity);
                  }
                }}
                className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveActivity()}
                className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white"
              >
                {activityForm.id ? "Update Activity" : "Save Activity"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteContactId ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="border-b border-line px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Confirm Delete</p>
              <h3 className="mt-1 text-xl font-semibold text-ink">Remove this client?</h3>
              <p className="mt-2 text-sm text-slate-500">
                This will delete the contact from the CRM and unlink any activities attached to it.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4">
              <button
                onClick={() => setPendingDeleteContactId(null)}
                className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft"
              >
                Cancel
              </button>
              <button
                onClick={() => void deleteContact(pendingDeleteContactId)}
                className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Delete Client
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[70] max-w-sm">
          <div
            className={`rounded-[22px] border px-4 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.16)] ${
              toast.type === "success"
                ? "border-emerald-200 bg-white text-emerald-700"
                : "border-rose-200 bg-white text-rose-600"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">
              {toast.type === "success" ? "Success" : "Error"}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-700">{toast.message}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
