"use client";

import { useEffect, useState } from "react";
import { Camera, Check, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { apiFetch } from "@/lib/api";
import { getStoredSession, storeSession } from "@/lib/session";

type Profile = { id: string; fullName: string; email: string; phone: string | null; role: string; profilePictureUrl: string | null };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [picture, setPicture] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void apiFetch<{ item: Profile }>("/settings/profile").then(({ item }) => { setProfile(item); setName(item.fullName); setPhone(item.phone ?? ""); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load your profile."));
  }, []);

  useEffect(() => () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function choosePicture(file: File | null) {
    setPicture(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await apiFetch<{ item: Profile }>("/settings/profile", { method: "PATCH", body: JSON.stringify({ fullName: name, phone }) });
      let next = result.item;
      if (picture) {
        const form = new FormData(); form.append("file", picture);
        const upload = await apiFetch<{ profilePictureUrl: string }>("/settings/profile/picture", { method: "POST", body: form });
        next = { ...next, profilePictureUrl: upload.profilePictureUrl };
        setPreviewUrl(upload.profilePictureUrl);
      }
      setProfile(next); setPicture(null); setMessage("Profile updated successfully.");
      const session = getStoredSession();
      if (session) storeSession({ ...session, name: next.fullName, profilePictureUrl: next.profilePictureUrl });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update your profile."); }
    finally { setSaving(false); }
  }

  return <AppShell title="My Profile" description="Update your personal details and profile picture.">
    <section className="mx-auto max-w-3xl space-y-5">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Account</p><h1 className="mt-2 text-3xl font-semibold text-ink">My profile</h1><p className="mt-2 text-sm text-slate-500">Only your own profile details can be edited here.</p></div>
      {error ? <p className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700"><Check className="h-4 w-4" />{message}</p> : null}
      <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-soft text-2xl font-semibold text-brand-600">
            {previewUrl || profile?.profilePictureUrl ? <img src={previewUrl || profile?.profilePictureUrl || ""} alt="Profile preview" className="h-full w-full object-cover" /> : profile?.fullName?.split(" ").map((part) => part[0]).join("").slice(0, 2) || <UserRound className="h-8 w-8" />}
          </div>
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft"><Camera className="h-4 w-4 text-brand-500" />Choose profile picture<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => choosePicture(event.target.files?.[0] ?? null)} /></label>
          {picture ? <span className="truncate text-xs text-slate-500">{picture.name}</span> : null}
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-slate-600">Full name<input value={name} onChange={(event) => setName(event.target.value)} className="rounded-2xl border border-line px-4 py-3 font-normal text-ink outline-none focus:border-brand-400" /></label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-600">Phone number<input value={phone} onChange={(event) => setPhone(event.target.value)} className="rounded-2xl border border-line px-4 py-3 font-normal text-ink outline-none focus:border-brand-400" placeholder="Optional" /></label>
          <div className="rounded-2xl bg-soft/60 p-4"><p className="text-xs text-slate-500">Login email</p><p className="mt-1 font-semibold text-ink">{profile?.email || "Loading..."}</p></div>
          <div className="rounded-2xl bg-soft/60 p-4"><p className="text-xs text-slate-500">Role</p><p className="mt-1 font-semibold text-ink">{profile?.role || "Loading..."}</p></div>
        </div>
        <div className="mt-6 flex justify-end"><button type="button" onClick={() => void save()} disabled={saving || !profile} className="rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : "Save changes"}</button></div>
      </div>
    </section>
  </AppShell>;
}
