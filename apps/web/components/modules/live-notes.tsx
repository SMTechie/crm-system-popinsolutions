"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Note = { id: string; body: string; createdAt: string; contactId: string; contact: { fullName: string } };
type Contact = { id: string; fullName: string };

const emptyNote = { id: "", body: "", contactId: "" };

export function LiveNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [noteForm, setNoteForm] = useState(emptyNote);
  const [noteSearch, setNoteSearch] = useState("");
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function notify(type: "success" | "error", message: string) { setToast({ type, message }); }
  async function load() {
    try {
      const [notesData, contactsData] = await Promise.all([
        apiFetch<{ items: Note[] }>("/crm/notes"),
        apiFetch<{ items: Contact[] }>("/crm/contacts"),
      ]);
      setNotes(notesData.items); setContacts(contactsData.items);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to load notes.");
    }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(null), 3200); return () => window.clearTimeout(timeout); }, [toast]);

  async function saveNote() {
    try {
      const payload = { body: noteForm.body || undefined, contactId: noteForm.contactId || "" };
      if (noteForm.id) {
        await apiFetch(`/crm/notes/${noteForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Note updated successfully.");
      } else {
        await apiFetch("/crm/notes", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Note created successfully.");
      }
      setNoteForm(emptyNote); setShowNoteForm(false); await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save note.");
    }
  }
  async function deleteNote(noteId: string) {
    try {
      await apiFetch(`/crm/notes/${noteId}`, { method: "DELETE" });
      setPendingDeleteNoteId(null); notify("success", "Note deleted successfully."); await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete note.");
    }
  }
  const filteredNotes = useMemo(() => {
    const term = noteSearch.trim().toLowerCase();
    return notes.filter((note) => term.length === 0 || note.body.toLowerCase().includes(term) || note.contact.fullName.toLowerCase().includes(term));
  }, [noteSearch, notes]);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Notes</p>
              <h2 className="mt-1 text-lg font-semibold text-ink md:text-xl">Customer notes and context</h2>
              <p className="mt-1 text-xs text-slate-500">Capture important CRM context against customer records.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">{filteredNotes.length} shown</span>
              <button onClick={() => { setNoteForm(emptyNote); setShowNoteForm(true); }} className="inline-flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-soft"><Plus className="h-3.5 w-3.5" /><span>Add note</span></button>
            </div>
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={noteSearch} onChange={(event) => setNoteSearch(event.target.value)} placeholder="Search note or contact" className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400" />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70"><tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500"><th className="px-4 py-2.5 font-semibold">Contact</th><th className="px-4 py-2.5 font-semibold">Note</th><th className="px-4 py-2.5 font-semibold">Created</th><th className="px-4 py-2.5 text-right font-semibold">Actions</th></tr></thead>
            <tbody>
              {filteredNotes.map((note) => <tr key={note.id} className="border-b border-line transition hover:bg-soft/40"><td className="px-4 py-3 text-sm font-semibold text-ink">{note.contact.fullName}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{note.body}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{new Date(note.createdAt).toLocaleString()}</td><td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><button onClick={() => { setNoteForm({ id: note.id, body: note.body, contactId: note.contactId }); setShowNoteForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button><button onClick={() => setPendingDeleteNoteId(note.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /><span>Delete</span></button></div></td></tr>)}
              {filteredNotes.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No notes match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showNoteForm ? <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm"><div className="w-full max-w-3xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]"><div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{noteForm.id ? "Edit Note" : "Add Note"}</p><h3 className="mt-1 text-2xl font-semibold text-ink">{noteForm.id ? "Update note details" : "Create a new note"}</h3></div><button onClick={() => { setShowNoteForm(false); if (!noteForm.id) setNoteForm(emptyNote); }} className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft">Close</button></div><div className="grid gap-3 px-6 py-5"><select value={noteForm.contactId} onChange={(event) => setNoteForm((current) => ({ ...current, contactId: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500"><option value="">Unlinked contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName}</option>)}</select><textarea value={noteForm.body} onChange={(event) => setNoteForm((current) => ({ ...current, body: event.target.value }))} placeholder="Write note" rows={6} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" /></div><div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4"><button onClick={() => { setShowNoteForm(false); if (!noteForm.id) setNoteForm(emptyNote); }} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">Cancel</button><button onClick={() => void saveNote()} className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">{noteForm.id ? "Update Note" : "Save Note"}</button></div></div></div> : null}
      {pendingDeleteNoteId ? <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm"><div className="w-full max-w-md rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]"><div className="border-b border-line px-6 py-5"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Confirm Delete</p><h3 className="mt-1 text-xl font-semibold text-ink">Remove this note?</h3></div><div className="flex items-center justify-end gap-3 px-6 py-4"><button onClick={() => setPendingDeleteNoteId(null)} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">Cancel</button><button onClick={() => void deleteNote(pendingDeleteNoteId)} className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700">Delete Note</button></div></div></div> : null}
      {toast ? <div className="pointer-events-none fixed bottom-6 right-6 z-[70] max-w-sm"><div className={`rounded-[22px] border px-4 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.16)] ${toast.type === "success" ? "border-emerald-200 bg-white text-emerald-700" : "border-rose-200 bg-white text-rose-600"}`}><p className="text-xs font-semibold uppercase tracking-[0.14em]">{toast.type === "success" ? "Success" : "Error"}</p><p className="mt-1 text-sm font-medium text-slate-700">{toast.message}</p></div></div> : null}
    </div>
  );
}
