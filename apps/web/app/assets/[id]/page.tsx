"use client";

import { useEffect, useState } from "react";
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

  if (!asset) return <AppShell title="Asset details" description="Loading asset information."><p className="text-sm text-slate-500">{error || "Loading…"}</p></AppShell>;

  return <AppShell title={asset.name} description={`Asset tag ${asset.assetTag}`}>
    <div className="space-y-5">
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-sm text-slate-500">{asset.category}</p><h1 className="mt-1 text-2xl font-semibold text-ink">{asset.name}</h1></div>
            <span className="rounded-full bg-soft px-3 py-1 text-xs font-semibold">{asset.status}</span>
          </div>
          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Condition</dt><dd className="mt-1 font-medium">{asset.condition || "Not recorded"}</dd></div>
            <div><dt className="text-slate-500">Serial number</dt><dd className="mt-1 font-medium">{asset.serialNumber || "Not recorded"}</dd></div>
            <div><dt className="text-slate-500">Location</dt><dd className="mt-1 font-medium">{asset.location || "Not recorded"}</dd></div>
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
      <Card className="p-5"><h2 className="font-semibold">Maintenance history</h2><div className="mt-4 space-y-2 text-sm">{asset.maintenance.map((item) => <div key={item.id} className="border-b border-line py-2"><div className="flex justify-between gap-2"><span className="font-medium">{item.issue}</span><span className="text-slate-500">{new Date(item.date).toLocaleDateString()}</span></div><p className="mt-1 text-slate-500">{item.description || item.provider || "No additional details"}</p></div>)}{asset.maintenance.length === 0 && <p className="text-slate-500">No maintenance records.</p>}</div></Card>
    </div>
  </AppShell>;
}
