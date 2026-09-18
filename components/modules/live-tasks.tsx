"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Contact = { id: string; fullName: string };
type Activity = { id: string; title: string; type: string; occurredAt: string; contactId?: string | null; contact?: { fullName: string } | null };

const emptyTask = { id: "", title: "", type: "TASK", occurredAt: "2026-08-04T12:00", contactId: "" };

export function LiveTasks() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [taskSearch, setTaskSearch] = useState("");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function notify(type: "success" | "error", message: string) { setToast({ type, message }); }

  async function load() {
    try {
      const [activitiesData, contactsData] = await Promise.all([
        apiFetch<{ items: Activity[] }>("/crm/activities"),
        apiFetch<{ items: Contact[] }>("/crm/contacts"),
      ]);
      setActivities(activitiesData.items);
      setContacts(contactsData.items);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to load tasks.");
    }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(null), 3200); return () => window.clearTimeout(timeout); }, [toast]);

  async function saveTask() {
    try {
      const payload = { title: taskForm.title || undefined, type: "TASK", occurredAt: taskForm.occurredAt ? new Date(taskForm.occurredAt).toISOString() : undefined, contactId: taskForm.contactId || "" };
      if (taskForm.id) {
        await apiFetch(`/crm/activities/${taskForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Task updated successfully.");
      } else {
        await apiFetch("/crm/activities", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Task created successfully.");
      }
      setTaskForm(emptyTask); setShowTaskForm(false); await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save task.");
    }
  }

  async function deleteTask(activityId: string) {
    try {
      await apiFetch(`/crm/activities/${activityId}`, { method: "DELETE" });
      setPendingDeleteTaskId(null); notify("success", "Task deleted successfully."); await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete task.");
    }
  }

  const tasks = useMemo(() => activities.filter((activity) => activity.type === "TASK"), [activities]);
  const filteredTasks = useMemo(() => {
    const term = taskSearch.trim().toLowerCase();
    return tasks.filter((task) => term.length === 0 || task.title.toLowerCase().includes(term) || (task.contact?.fullName ?? "").toLowerCase().includes(term));
  }, [taskSearch, tasks]);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Tasks</p>
              <h2 className="mt-1 text-lg font-semibold text-ink md:text-xl">Follow-ups and work items</h2>
              <p className="mt-1 text-xs text-slate-500">Manage CRM follow-up tasks linked to client work.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">{filteredTasks.length} shown</span>
              <button onClick={() => { setTaskForm({ ...emptyTask, occurredAt: new Date().toISOString().slice(0, 16) }); setShowTaskForm(true); }} className="inline-flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-soft"><Plus className="h-3.5 w-3.5" /><span>Add task</span></button>
            </div>
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} placeholder="Search task or contact" className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400" />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70"><tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500"><th className="px-4 py-2.5 font-semibold">Task</th><th className="px-4 py-2.5 font-semibold">Contact</th><th className="px-4 py-2.5 font-semibold">Due / Logged</th><th className="px-4 py-2.5 text-right font-semibold">Actions</th></tr></thead>
            <tbody>
              {filteredTasks.map((task) => <tr key={task.id} className="border-b border-line transition hover:bg-soft/40"><td className="px-4 py-3 text-sm font-semibold text-ink">{task.title}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{task.contact?.fullName ?? "Unlinked"}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{new Date(task.occurredAt).toLocaleString()}</td><td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><button onClick={() => { setTaskForm({ id: task.id, title: task.title, type: "TASK", occurredAt: new Date(task.occurredAt).toISOString().slice(0, 16), contactId: task.contactId ?? "" }); setShowTaskForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button><button onClick={() => setPendingDeleteTaskId(task.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /><span>Delete</span></button></div></td></tr>)}
              {filteredTasks.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No tasks match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showTaskForm ? <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm"><div className="w-full max-w-3xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]"><div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{taskForm.id ? "Edit Task" : "Add Task"}</p><h3 className="mt-1 text-2xl font-semibold text-ink">{taskForm.id ? "Update task details" : "Create a new task"}</h3></div><button onClick={() => { setShowTaskForm(false); if (!taskForm.id) setTaskForm(emptyTask); }} className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft">Close</button></div><div className="grid gap-3 px-6 py-5 md:grid-cols-2"><input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} placeholder="Task title" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2" /><input type="datetime-local" value={taskForm.occurredAt} onChange={(event) => setTaskForm((current) => ({ ...current, occurredAt: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" /><select value={taskForm.contactId} onChange={(event) => setTaskForm((current) => ({ ...current, contactId: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500"><option value="">Unlinked contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName}</option>)}</select></div><div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4"><button onClick={() => { setShowTaskForm(false); if (!taskForm.id) setTaskForm(emptyTask); }} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">Cancel</button><button onClick={() => void saveTask()} className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">{taskForm.id ? "Update Task" : "Save Task"}</button></div></div></div> : null}
      {pendingDeleteTaskId ? <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm"><div className="w-full max-w-md rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]"><div className="border-b border-line px-6 py-5"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Confirm Delete</p><h3 className="mt-1 text-xl font-semibold text-ink">Remove this task?</h3></div><div className="flex items-center justify-end gap-3 px-6 py-4"><button onClick={() => setPendingDeleteTaskId(null)} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">Cancel</button><button onClick={() => void deleteTask(pendingDeleteTaskId)} className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700">Delete Task</button></div></div></div> : null}
      {toast ? <div className="pointer-events-none fixed bottom-6 right-6 z-[70] max-w-sm"><div className={`rounded-[22px] border px-4 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.16)] ${toast.type === "success" ? "border-emerald-200 bg-white text-emerald-700" : "border-rose-200 bg-white text-rose-600"}`}><p className="text-xs font-semibold uppercase tracking-[0.14em]">{toast.type === "success" ? "Success" : "Error"}</p><p className="mt-1 text-sm font-medium text-slate-700">{toast.message}</p></div></div> : null}
    </div>
  );
}
