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
};

type Activity = {
  id: string;
  title: string;
  type: string;
  occurredAt: string;
  contactId?: string | null;
  contact?: { fullName: string } | null;
};

const emptyActivity = {
  id: "",
  title: "",
  type: "CALL",
  occurredAt: "2026-08-04T12:00",
  contactId: "",
};

export function LiveActivities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activityForm, setActivityForm] = useState(emptyActivity);
  const [activitySearch, setActivitySearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [pendingDeleteActivityId, setPendingDeleteActivityId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function notify(type: "success" | "error", message: string) {
    setToast({ type, message });
  }

  async function load() {
    try {
      const [activitiesData, contactsData] = await Promise.all([
        apiFetch<{ items: Activity[] }>("/crm/activities"),
        apiFetch<{ items: Contact[] }>("/crm/contacts"),
      ]);
      setActivities(activitiesData.items);
      setContacts(contactsData.items);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to load activities.");
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
        notify("success", "Activity created successfully.");
      }
      setActivityForm(emptyActivity);
      setShowActivityForm(false);
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save activity.");
    }
  }

  async function deleteActivity(activityId: string) {
    try {
      await apiFetch(`/crm/activities/${activityId}`, { method: "DELETE" });
      setPendingDeleteActivityId(null);
      if (activityForm.id === activityId) {
        setActivityForm(emptyActivity);
        setShowActivityForm(false);
      }
      notify("success", "Activity deleted successfully.");
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete activity.");
    }
  }

  const filteredActivities = useMemo(() => {
    const term = activitySearch.trim().toLowerCase();
    return activities.filter((activity) => {
      const matchesSearch =
        term.length === 0 ||
        activity.title.toLowerCase().includes(term) ||
        activity.type.toLowerCase().includes(term) ||
        (activity.contact?.fullName ?? "").toLowerCase().includes(term);

      const matchesFilter = typeFilter === "ALL" || activity.type === typeFilter;
      return matchesSearch && matchesFilter;
    });
  }, [activities, activitySearch, typeFilter]);

  const activeContact = useMemo(
    () => contacts.find((contact) => contact.id === activeContactId) ?? null,
    [activeContactId, contacts],
  );

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Activities</p>
              <h2 className="mt-1 text-lg font-semibold text-ink md:text-xl">Calls, emails, meetings, and tasks</h2>
              <p className="mt-1 text-xs text-slate-500">Search, filter, edit, and create live CRM activities from Neon.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                {filteredActivities.length} shown
              </span>
              <button
                onClick={() => {
                  setActivityForm({
                    id: "",
                    title: "",
                    type: "CALL",
                    occurredAt: new Date().toISOString().slice(0, 16),
                    contactId: "",
                  });
                  setShowActivityForm(true);
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-soft"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add activity</span>
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={activitySearch}
                onChange={(event) => setActivitySearch(event.target.value)}
                placeholder="Search activity, type, contact"
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
              />
            </label>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-2xl border border-line bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500"
            >
              <option value="ALL">All activity types</option>
              {["CALL", "EMAIL", "MEETING", "TASK"].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Activity</th>
                <th className="px-4 py-2.5 font-semibold">Contact</th>
                <th className="px-4 py-2.5 font-semibold">Type</th>
                <th className="px-4 py-2.5 font-semibold">When</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredActivities.map((activity) => (
                <tr key={activity.id} className="border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3 text-sm font-semibold text-ink">{activity.title}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">
                    {activity.contact?.fullName && activity.contactId ? (
                      <button
                        onClick={() => setActiveContactId(activity.contactId ?? null)}
                        className="font-medium text-slate-700 transition hover:text-brand-500"
                      >
                        {activity.contact.fullName}
                      </button>
                    ) : (
                      "Unlinked"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-soft px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                      {activity.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{new Date(activity.occurredAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setActivityForm({
                            id: activity.id,
                            title: activity.title,
                            type: activity.type,
                            occurredAt: new Date(activity.occurredAt).toISOString().slice(0, 16),
                            contactId: activity.contactId ?? "",
                          });
                          setShowActivityForm(true);
                        }}
                        className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setPendingDeleteActivityId(activity.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredActivities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    No activities match the current search or filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {activeContact ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Contact</p>
                <h3 className="mt-1 text-2xl font-semibold text-ink">{activeContact.fullName}</h3>
              </div>
              <button
                onClick={() => setActiveContactId(null)}
                className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft"
              >
                Close
              </button>
            </div>
            <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
              <div className="rounded-[24px] border border-line p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Email</p>
                <p className="mt-2 text-sm font-semibold text-ink">{activeContact.email || "No email"}</p>
              </div>
              <div className="rounded-[24px] border border-line p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Phone</p>
                <p className="mt-2 text-sm font-semibold text-ink">{activeContact.phone || "No phone"}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showActivityForm ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {activityForm.id ? "Edit Activity" : "Add Activity"}
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-ink">
                  {activityForm.id ? "Update activity details" : "Create a new activity"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">Save the activity directly into your live CRM workspace.</p>
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
            <div className="grid gap-3 px-6 py-5 md:grid-cols-2">
              <input value={activityForm.title} onChange={(event) => setActivityForm((current) => ({ ...current, title: event.target.value }))} placeholder="Activity title" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2" />
              <select value={activityForm.type} onChange={(event) => setActivityForm((current) => ({ ...current, type: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
                {["CALL", "EMAIL", "MEETING", "TASK"].map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <input type="datetime-local" value={activityForm.occurredAt} onChange={(event) => setActivityForm((current) => ({ ...current, occurredAt: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
              <select value={activityForm.contactId} onChange={(event) => setActivityForm((current) => ({ ...current, contactId: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2">
                <option value="">Unlinked contact</option>
                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
              <button onClick={() => { setShowActivityForm(false); if (!activityForm.id) { setActivityForm(emptyActivity); } }} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">
                Cancel
              </button>
              <button onClick={() => void saveActivity()} className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">
                {activityForm.id ? "Update Activity" : "Save Activity"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteActivityId ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="border-b border-line px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Confirm Delete</p>
              <h3 className="mt-1 text-xl font-semibold text-ink">Remove this activity?</h3>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4">
              <button onClick={() => setPendingDeleteActivityId(null)} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">
                Cancel
              </button>
              <button onClick={() => void deleteActivity(pendingDeleteActivityId)} className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700">
                Delete Activity
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
