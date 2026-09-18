"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Archive, ClipboardCheck, MapPin, PackagePlus, QrCode, RotateCcw, Search, ShieldCheck, Wrench, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";

type Asset = {
  id: string;
  assetTag: string;
  name: string;
  category: string;
  serialNumber?: string | null;
  status: string;
  condition: string;
  location?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  department?: string | null;
  supplier?: string | null;
  purchaseDate?: string | null;
  warrantyExpiry?: string | null;
  notes?: string | null;
  purchasePrice?: string | number | null;
  assignments?: { employee?: { fullName: string } | null }[];
};

type Employee = { id: string; fullName: string; employeeNumber?: string | null };

const emptyForm = { assetTag: "", name: "", category: "", serialNumber: "", manufacturer: "", model: "", location: "", department: "", supplier: "", purchaseDate: "", warrantyExpiry: "", purchasePrice: "", condition: "GOOD", status: "AVAILABLE", notes: "" };

export function AssetRegister() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const reload = async () => {
    try {
      const result = await apiFetch<{ items: Asset[] }>("/assets?pageSize=200");
      setAssets(result.items);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the asset register.");
    }
  };

  useEffect(() => {
    void reload();
    void apiFetch<{ items: Employee[] }>("/hr/employees").then((result) => setEmployees(result.items)).catch(() => undefined);
  }, []);

  const filtered = useMemo(() => assets.filter((asset) => {
    const haystack = `${asset.assetTag} ${asset.name} ${asset.category} ${asset.serialNumber ?? ""} ${asset.location ?? ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (statusFilter === "ALL" || asset.status === statusFilter);
  }), [assets, query, statusFilter]);

  const counts = useMemo(() => ({
    total: assets.length,
    available: assets.filter((asset) => asset.status === "AVAILABLE").length,
    assigned: assets.filter((asset) => asset.status === "ASSIGNED").length,
    maintenance: assets.filter((asset) => asset.status === "MAINTENANCE").length,
  }), [assets]);

  async function createAsset(event: FormEvent) {
    event.preventDefault();
    try {
      await apiFetch("/assets", { method: "POST", body: JSON.stringify({ ...form, purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined }) });
      setForm(emptyForm);
      setShowCreate(false);
      setMessage("Asset added to the register.");
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the asset.");
    }
  }

  async function generateQr(asset: Asset) {
    try {
      const result = await apiFetch<{ qrDataUrl: string }>(`/assets/${asset.id}/qr`, { method: "POST" });
      const link = document.createElement("a");
      link.href = result.qrDataUrl;
      link.download = `${asset.assetTag}-qr.png`;
      link.click();
      setMessage(`QR code downloaded for ${asset.assetTag}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to generate the asset QR code.");
    }
  }

  return <section className="space-y-5">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">IT asset management</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-ink">Asset register</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Track company equipment, ownership, condition, location, maintenance, and QR identification from one controlled inventory.</p></div>
      <button onClick={() => setShowCreate(true)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm"><PackagePlus className="h-4 w-4" />Add asset</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Summary label="Total assets" value={counts.total} icon={Archive} tone="bg-indigo-50 text-indigo-600" /><Summary label="Available" value={counts.available} icon={ClipboardCheck} tone="bg-emerald-50 text-emerald-600" /><Summary label="Assigned" value={counts.assigned} icon={ShieldCheck} tone="bg-sky-50 text-sky-600" /><Summary label="Maintenance" value={counts.maintenance} icon={Wrench} tone="bg-amber-50 text-amber-600" /></div>
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between"><div><h2 className="font-semibold text-ink">Inventory</h2><p className="mt-1 text-xs text-slate-500">Select a row to view ownership, lifecycle history, and actions.</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm text-slate-400"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assets" className="w-full bg-transparent text-ink outline-none sm:w-48" /></label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-line px-3 py-2 text-sm text-ink"><option value="ALL">All statuses</option><option value="AVAILABLE">Available</option><option value="ASSIGNED">Assigned</option><option value="MAINTENANCE">Maintenance</option></select></div></div>
      {error && <p className="px-4 pt-4 text-sm text-rose-600">{error}</p>}{message && <p className="px-4 pt-4 text-sm text-emerald-600">{message}</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-soft text-[11px] uppercase tracking-[0.14em] text-slate-500"><tr><th className="p-4">Asset</th><th className="p-4">Category</th><th className="p-4">Location</th><th className="p-4">Assigned to</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr></thead><tbody>{filtered.map((asset) => <tr key={asset.id} onClick={() => setSelected(asset)} className="cursor-pointer border-t border-line transition hover:bg-soft/60"><td className="p-4"><p className="font-semibold text-ink">{asset.name}</p><p className="mt-1 text-xs text-slate-500">{asset.assetTag}{asset.serialNumber ? ` · ${asset.serialNumber}` : ""}</p></td><td className="p-4 text-slate-600">{asset.category}</td><td className="p-4 text-slate-600"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{asset.location || "Not recorded"}</span></td><td className="p-4 text-slate-600">{asset.assignments?.[0]?.employee?.fullName || "Unassigned"}</td><td className="p-4"><Status value={asset.status} /></td><td className="p-4 text-right"><button onClick={(event) => { event.stopPropagation(); void generateQr(asset); }} className="rounded-xl border border-line p-2 text-slate-600 hover:border-brand-200 hover:text-brand-600" title="Download QR code"><QrCode className="h-4 w-4" /></button></td></tr>)}{filtered.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-500">No assets match the current filters.</td></tr>}</tbody></table></div>
    </Card>
    {showCreate && <Modal title="Add an asset" onClose={() => setShowCreate(false)}><form onSubmit={createAsset} className="max-h-[75vh] overflow-y-auto pr-1"><div className="grid gap-4 sm:grid-cols-2"><Field label="Asset tag" value={form.assetTag} onChange={(value) => setForm({ ...form, assetTag: value })} required /><Field label="Asset name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required /><Field label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} required /><Field label="Serial number" value={form.serialNumber} onChange={(value) => setForm({ ...form, serialNumber: value })} /><Field label="Manufacturer" value={form.manufacturer} onChange={(value) => setForm({ ...form, manufacturer: value })} /><Field label="Model" value={form.model} onChange={(value) => setForm({ ...form, model: value })} /><Field label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} /><Field label="Department" value={form.department} onChange={(value) => setForm({ ...form, department: value })} /><Field label="Supplier" value={form.supplier} onChange={(value) => setForm({ ...form, supplier: value })} /><Field label="Purchase price" type="number" value={form.purchasePrice} onChange={(value) => setForm({ ...form, purchasePrice: value })} /><Field label="Purchase date" type="date" value={form.purchaseDate} onChange={(value) => setForm({ ...form, purchaseDate: value })} /><Field label="Warranty expiry" type="date" value={form.warrantyExpiry} onChange={(value) => setForm({ ...form, warrantyExpiry: value })} /><label className="grid gap-1.5 text-sm text-slate-600"><span>Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="rounded-xl border border-line px-3 py-2.5 text-ink"><option>AVAILABLE</option><option>ASSIGNED</option><option>MAINTENANCE</option><option>RETIRED</option></select></label><label className="grid gap-1.5 text-sm text-slate-600"><span>Condition</span><select value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })} className="rounded-xl border border-line px-3 py-2.5 text-ink"><option>GOOD</option><option>FAIR</option><option>POOR</option></select></label><label className="grid gap-1.5 text-sm text-slate-600 sm:col-span-2"><span>Notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} placeholder="Warranty, configuration, or other asset notes" className="rounded-xl border border-line px-3 py-2.5 text-ink outline-none focus:border-brand-500" /></label><div className="flex items-end justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold">Cancel</button><button className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Save asset</button></div></div></form></Modal>}
    {selected && <AssetModal asset={selected} employees={employees} onClose={() => setSelected(null)} onRefresh={reload} onQr={() => void generateQr(selected)} />}
  </section>;
}

function AssetModal({ asset, employees, onClose, onRefresh, onQr }: { asset: Asset; employees: Employee[]; onClose: () => void; onRefresh: () => Promise<void>; onQr: () => void }) {
  const [employeeId, setEmployeeId] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function assign() { if (!employeeId) return; setBusy(true); try { await apiFetch(`/assets/${asset.id}/assign`, { method: "POST", body: JSON.stringify({ employeeId }) }); await onRefresh(); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to assign asset."); } finally { setBusy(false); } }
  async function returnAsset() { setBusy(true); try { await apiFetch(`/assets/${asset.id}/return`, { method: "POST", body: JSON.stringify({ condition: asset.condition }) }); await onRefresh(); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to return asset."); } finally { setBusy(false); } }
  return <Modal title={asset.name} onClose={onClose}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-slate-500">{asset.category} · {asset.assetTag}</p><p className="mt-1 text-sm text-slate-600">{asset.serialNumber || "Serial number not recorded"}</p></div><Status value={asset.status} /></div><dl className="mt-5 grid gap-4 rounded-2xl bg-soft p-4 text-sm sm:grid-cols-2"><Info label="Condition" value={asset.condition} /><Info label="Location" value={asset.location || "Not recorded"} /><Info label="Assigned to" value={asset.assignments?.[0]?.employee?.fullName || "Unassigned"} /><Info label="Purchase value" value={asset.purchasePrice ? `R${Number(asset.purchasePrice).toLocaleString()}` : "Not recorded"} /></dl>{error && <p className="mt-3 text-sm text-rose-600">{error}</p>}<div className="mt-5 flex flex-wrap gap-2"><Link href={`/assets/${asset.id}`} className="rounded-xl border border-line px-3 py-2 text-sm font-semibold">Open details</Link><button onClick={onQr} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold"><QrCode className="h-4 w-4" />Download QR</button>{asset.status === "ASSIGNED" ? <button disabled={busy} onClick={() => void returnAsset()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"><RotateCcw className="h-4 w-4" />Return asset</button> : <div className="flex w-full gap-2 sm:w-auto"><select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="rounded-xl border border-line px-3 py-2 text-sm"><option value="">Assign to employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}{employee.employeeNumber ? ` · ${employee.employeeNumber}` : ""}</option>)}</select><button disabled={busy || !employeeId} onClick={() => void assign()} className="rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Assign</button></div>}</div></Modal>;
}

function Summary({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Archive; tone: string }) { return <Card className="p-4"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><span className={`grid h-8 w-8 place-items-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span></div><p className="mt-3 text-2xl font-semibold text-ink">{value}</p></Card>; }
function Status({ value }: { value: string }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${value === "AVAILABLE" ? "bg-emerald-50 text-emerald-700" : value === "ASSIGNED" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"}`}>{value}</span>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-ink">{value}</dd></div>; }
function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="grid gap-1.5 text-sm text-slate-600"><span>{label}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-line px-3 py-2.5 text-ink outline-none focus:border-brand-500" /></label>; }
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm" onClick={onClose}><div className="w-full max-w-2xl rounded-[24px] border border-line bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between gap-4 border-b border-line pb-4"><h2 className="text-xl font-semibold text-ink">{title}</h2><button onClick={onClose} className="rounded-xl border border-line p-2 text-slate-500 hover:bg-soft" aria-label="Close"><X className="h-4 w-4" /></button></div><div className="pt-5">{children}</div></div></div>; }
