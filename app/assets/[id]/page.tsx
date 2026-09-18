"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Asset = {
  id: string;
  assetTag: string;
  name: string;
  category: string;
  status: string;
  condition: string;
  location?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  department?: string | null;
  supplier?: string | null;
  purchaseDate?: string | null;
  warrantyExpiry?: string | null;
  purchasePrice?: string | number | null;
  serialNumber?: string | null;
  notes?: string | null;
  assignments: { id: string; assignedAt: string; returnedAt?: string | null; employee?: { fullName: string } | null }[];
  maintenance: { id: string; issue: string; date: string; description?: string | null; provider?: string | null; cost?: string | number | null }[];
};

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [scanUrl, setScanUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [maintenanceForm, setMaintenanceForm] = useState({ issue: "", date: new Date().toISOString().slice(0, 10), provider: "", cost: "", description: "" });
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", category: "", status: "AVAILABLE", condition: "GOOD", location: "", department: "", notes: "" });

  const load = () => {
    if (!params.id) return;
    void apiFetch<{ item: Asset }>(`/assets/${params.id}`)
      .then((result) => setAsset(result.item))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load asset."));
  };

  useEffect(load, [params.id]);

  const generateQr = async () => {
    try {
      const result = await apiFetch<{ scanUrl: string; qrDataUrl: string }>(`/assets/${params.id}/qr`, { method: "POST" });
      setScanUrl(result.scanUrl);
      setQrDataUrl(result.qrDataUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to generate QR link.");
    }
  };

  const addMaintenance = async (event: FormEvent) => {
    event.preventDefault();
    setSavingMaintenance(true);
    setMaintenanceMessage("");
    try {
      await apiFetch(`/assets/${params.id}/maintenance`, { method: "POST", body: JSON.stringify({ ...maintenanceForm, cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : undefined }) });
      setMaintenanceForm({ issue: "", date: new Date().toISOString().slice(0, 10), provider: "", cost: "", description: "" });
      setMaintenanceMessage("Maintenance record added.");
      load();
    } catch (reason) {
      setMaintenanceMessage(reason instanceof Error ? reason.message : "Unable to add maintenance record.");
    } finally {
      setSavingMaintenance(false);
    }
  };

  const saveAsset = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch(`/assets/${params.id}`, { method: "PATCH", body: JSON.stringify(editForm) });
      setEditing(false);
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update asset.");
    }
  };

  if (!asset) return <AppShell title="Asset details" description="Loading asset information."><p className="text-sm text-slate-500">{error || "Loading…"}</p></AppShell>;

  return <AppShell title={asset.name} description={`Asset tag ${asset.assetTag}`}>
    <div className="space-y-5">
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-sm text-slate-500">{asset.category}</p><h1 className="mt-1 text-2xl font-semibold text-ink">{asset.name}</h1></div>
            <div className="flex items-center gap-2"><button onClick={() => { setEditForm({ name: asset.name, category: asset.category, status: asset.status, condition: asset.condition, location: asset.location || "", department: asset.department || "", notes: asset.notes || "" }); setEditing(true); }} className="rounded-xl border border-line px-3 py-2 text-sm font-semibold">Edit asset</button><span className="rounded-full bg-soft px-3 py-1 text-xs font-semibold">{asset.status}</span></div>
          </div>
          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Condition</dt><dd className="mt-1 font-medium">{asset.condition || "Not recorded"}</dd></div>
            <div><dt className="text-slate-500">Serial number</dt><dd className="mt-1 font-medium">{asset.serialNumber || "Not recorded"}</dd></div>
            <div><dt className="text-slate-500">Location</dt><dd className="mt-1 font-medium">{asset.location || "Not recorded"}</dd></div>
            <div><dt className="text-slate-500">Manufacturer / model</dt><dd className="mt-1 font-medium">{[asset.manufacturer, asset.model].filter(Boolean).join(" / ") || "Not recorded"}</dd></div>
            <div><dt className="text-slate-500">Department</dt><dd className="mt-1 font-medium">{asset.department || "Not recorded"}</dd></div>
            <div><dt className="text-slate-500">Supplier</dt><dd className="mt-1 font-medium">{asset.supplier || "Not recorded"}</dd></div>
            <div><dt className="text-slate-500">Purchase date</dt><dd className="mt-1 font-medium">{asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : "Not recorded"}</dd></div>
            <div><dt className="text-slate-500">Warranty expiry</dt><dd className="mt-1 font-medium">{asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toLocaleDateString() : "Not recorded"}</dd></div>
            <div><dt className="text-slate-500">Purchase value</dt><dd className="mt-1 font-medium">{asset.purchasePrice ? `R${Number(asset.purchasePrice).toLocaleString()}` : "Not recorded"}</dd></div>
            <div><dt className="text-slate-500">Current assignee</dt><dd className="mt-1 font-medium">{asset.assignments.find((item) => !item.returnedAt)?.employee?.fullName || "Unassigned"}</dd></div>
          </dl>
          {asset.notes && <p className="mt-6 rounded-xl bg-soft p-3 text-sm text-slate-600">{asset.notes}</p>}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">QR access</h2>
          <p className="mt-2 text-sm text-slate-500">Create a secure scan link for this asset record.</p>
          <button onClick={() => void generateQr()} className="mt-4 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Generate QR link</button>
          {qrDataUrl && <img src={qrDataUrl} alt="Asset QR code" className="mt-4 h-48 w-48 rounded-xl border border-line p-2" />}
          {scanUrl && <div className="mt-4 break-all rounded-xl border border-line p-3 text-xs text-slate-600"><p className="font-semibold text-ink">Scan URL</p><p className="mt-1">{scanUrl}</p></div>}
        </Card>
      </div>
      <Card className="p-5"><h2 className="font-semibold">Assignment history</h2><div className="mt-4 space-y-2 text-sm">{asset.assignments.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-2"><span>{item.employee?.fullName || "Unknown employee"}</span><span className="text-slate-500">{new Date(item.assignedAt).toLocaleDateString()} · {item.returnedAt ? "Returned" : "Current"}</span></div>)}{asset.assignments.length === 0 && <p className="text-slate-500">No assignment history.</p>}</div></Card>
      <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Maintenance history</h2><p className="mt-1 text-sm text-slate-500">Record repairs, servicing, providers, and costs against this asset.</p></div></div><form onSubmit={addMaintenance} className="mt-4 grid gap-3 rounded-2xl bg-soft p-4 sm:grid-cols-2"><input required value={maintenanceForm.issue} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, issue: event.target.value })} placeholder="Maintenance issue or service" className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm" /><input type="date" value={maintenanceForm.date} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, date: event.target.value })} className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm" /><input value={maintenanceForm.provider} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, provider: event.target.value })} placeholder="Service provider" className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm" /><input type="number" min="0" step="0.01" value={maintenanceForm.cost} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, cost: event.target.value })} placeholder="Cost" className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm" /><textarea value={maintenanceForm.description} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, description: event.target.value })} placeholder="Description or work completed" rows={2} className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm sm:col-span-2" /><div className="flex items-center justify-between gap-3 sm:col-span-2"><p className="text-xs text-slate-500">{maintenanceMessage}</p><button disabled={savingMaintenance} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingMaintenance ? "Saving…" : "Add maintenance"}</button></div></form><div className="mt-5 space-y-2 text-sm">{asset.maintenance.map((item) => <div key={item.id} className="border-b border-line py-2"><div className="flex justify-between gap-2"><span className="font-medium">{item.issue}</span><span className="text-slate-500">{new Date(item.date).toLocaleDateString()}</span></div><p className="mt-1 text-slate-500">{item.description || item.provider || "No additional details"}{item.cost ? ` · R${Number(item.cost).toLocaleString()}` : ""}</p></div>)}{asset.maintenance.length === 0 && <p className="text-slate-500">No maintenance records.</p>}</div></Card>
      {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm"><form onSubmit={saveAsset} className="w-full max-w-xl rounded-3xl border border-line bg-white p-5 shadow-2xl"><div className="flex items-center justify-between border-b border-line pb-4"><h2 className="text-xl font-semibold text-ink">Edit asset</h2><button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-line px-3 py-1.5 text-sm">Close</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><input required value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} placeholder="Asset name" className="rounded-xl border border-line px-3 py-2.5 text-sm" /><input required value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value })} placeholder="Category" className="rounded-xl border border-line px-3 py-2.5 text-sm" /><input value={editForm.location} onChange={(event) => setEditForm({ ...editForm, location: event.target.value })} placeholder="Location" className="rounded-xl border border-line px-3 py-2.5 text-sm" /><input value={editForm.department} onChange={(event) => setEditForm({ ...editForm, department: event.target.value })} placeholder="Department" className="rounded-xl border border-line px-3 py-2.5 text-sm" /><select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })} className="rounded-xl border border-line px-3 py-2.5 text-sm"><option>AVAILABLE</option><option>ASSIGNED</option><option>MAINTENANCE</option><option>RETIRED</option></select><select value={editForm.condition} onChange={(event) => setEditForm({ ...editForm, condition: event.target.value })} className="rounded-xl border border-line px-3 py-2.5 text-sm"><option>GOOD</option><option>FAIR</option><option>POOR</option></select><textarea value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} placeholder="Notes" rows={3} className="rounded-xl border border-line px-3 py-2.5 text-sm sm:col-span-2" /></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold">Cancel</button><button className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Save changes</button></div></form></div>}
    </div>
  </AppShell>;
}
