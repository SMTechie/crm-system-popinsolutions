"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { getStoredSession } from "@/lib/session";
import { Card } from "@/components/ui/card";

const PDF_WORKER_URL = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type PdfVersion = { id: string; fileName: string; sizeBytes: number; createdAt: string };
type PdfDocumentItem = { id: string; fileName: string; sizeBytes: number; createdAt: string; versions: PdfVersion[] };
type TextEdit = { id: string; page: string; text: string; x: string; y: string; size: string };
type DetectedField = { name: string; label?: string; type: "text" | "checkbox" | "choice"; value: string; checked: boolean; options: string[]; source: "native" | "visual"; page?: number; x?: number; y?: number; width?: number; height?: number };

function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }

async function pdfRequest(path: string) {
  const session = getStoredSession();
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: { ...(session?.token ? { Authorization: `Bearer ${session.token}`, "X-Tenant-Id": session.tenantId } : {}) } });
  if (!response.ok) throw new Error((await response.text()) || "Unable to load PDF.");
  return response.blob();
}

function detectFormFields(pdf: PDFDocument): DetectedField[] {
  return pdf.getForm().getFields().flatMap((field): DetectedField[] => {
    const name = field.getName();
    const fieldType = field.constructor.name;
    const candidate = field as unknown as { getText?: () => string; isChecked?: () => boolean; getOptions?: () => string[]; getSelected?: () => string[] | string | undefined };
    if (fieldType === "PDFTextField" && candidate.getText) return [{ name, type: "text", value: candidate.getText(), checked: false, options: [], source: "native" }];
    if (fieldType === "PDFCheckBox" && candidate.isChecked) return [{ name, type: "checkbox", value: "", checked: candidate.isChecked(), options: [], source: "native" }];
    if ((fieldType === "PDFDropdown" || fieldType === "PDFOptionList" || fieldType === "PDFRadioGroup") && candidate.getOptions && candidate.getSelected) {
      const selected = candidate.getSelected();
      return [{ name, type: "choice", value: Array.isArray(selected) ? selected[0] || "" : selected || "", checked: false, options: candidate.getOptions(), source: "native" }];
    }
    return [];
  });
}

type DarkRun = { x: number; end: number; y: number };
type PdfTextItem = { str?: string; transform?: number[]; width?: number; height?: number };

function nearbyFieldLabel(items: PdfTextItem[], pageHeight: number, x: number, y: number, width: number, fallback: string) {
  const candidates = items.map((item) => {
    const text = item.str?.replace(/\s+/g, " ").trim();
    const transform = item.transform;
    if (!text || !transform || transform.length < 6) return null;
    const itemX = transform[4] || 0;
    const itemHeight = Math.max(8, item.height || Math.abs(transform[3] || 0) || 10);
    const itemY = Math.max(0, pageHeight - (transform[5] || 0) - itemHeight);
    const itemWidth = Math.max(1, item.width || text.length * itemHeight * 0.45);
    const sameRow = itemY < y + 10 && itemY + itemHeight > y - itemHeight - 10;
    const aboveField = itemY + itemHeight <= y + 8 && y - (itemY + itemHeight) < 42;
    const leftOfField = itemX + itemWidth <= x + 8;
    if ((!sameRow && !aboveField) || (!leftOfField && itemX > x + width)) return null;
    const distance = aboveField ? y - (itemY + itemHeight) + Math.abs(x - itemX) * 0.15 : Math.abs(y - itemY) + Math.max(0, x - itemX) * 0.05;
    return { text, distance };
  }).filter((candidate): candidate is { text: string; distance: number } => Boolean(candidate));
  return candidates.sort((a, b) => a.distance - b.distance)[0]?.text || fallback;
}

function editableBounds(dark: (x: number, y: number) => boolean, items: PdfTextItem[], pageHeight: number, left: number, right: number, top: number, bottom: number) {
  const verticalSpan = Math.max(4, bottom - top);
  const separators: number[] = [];
  for (let x = left + 2; x < right - 2; x += 1) {
    const coverage = Array.from({ length: verticalSpan }, (_value, offset) => dark(x, top + offset)).filter(Boolean).length / verticalSpan;
    if (coverage > 0.55) separators.push(x);
  }
  const groups: number[][] = [];
  for (const x of separators) {
    const group = groups[groups.length - 1];
    if (group && x - group[group.length - 1] <= 2) group.push(x);
    else groups.push([x]);
  }
  const textRight = items.map((item) => {
    const text = item.str?.trim();
    const transform = item.transform;
    if (!text || !transform || transform.length < 6) return null;
    const height = Math.max(8, item.height || Math.abs(transform[3] || 0) || 10);
    const itemY = Math.max(0, pageHeight - (transform[5] || 0) - height);
    const itemX = transform[4] || 0;
    return itemY < bottom && itemY + height > top && itemX >= left && itemX <= right ? itemX + Math.max(1, item.width || text.length * height * 0.45) : null;
  }).filter((value): value is number => value !== null).sort((a, b) => b - a)[0];
  const divider = textRight === undefined ? undefined : groups.map((group) => group[Math.floor(group.length / 2)]).find((x) => x > textRight + 2);
  const fieldLeft = divider ?? (textRight !== undefined ? textRight + 4 : left);
  return { x: fieldLeft + 4, width: Math.max(40, right - fieldLeft - 8) };
}

async function detectVisualFields(bytes: Uint8Array): Promise<DetectedField[]> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  const loaded = await getDocument({ data: bytes.slice() }).promise;
  const fields: DetectedField[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= loaded.numPages && fields.length < 60; pageNumber += 1) {
      const page = await loaded.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const textItems = textContent.items as unknown as PdfTextItem[];
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) continue;
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const dark = (x: number, y: number) => { const index = (y * canvas.width + x) * 4; return pixels[index] < 185 && pixels[index + 1] < 185 && pixels[index + 2] < 185; };
      const runs: DarkRun[] = [];
      for (let y = 0; y < canvas.height; y += 1) {
        let start = -1;
        for (let x = 0; x <= canvas.width; x += 1) {
          const isDark = x < canvas.width && dark(x, y);
          if (isDark && start < 0) start = x;
          if ((!isDark || x === canvas.width) && start >= 0) {
            if (x - start >= 80) runs.push({ x: start, end: x - 1, y });
            start = -1;
          }
        }
      }
      const lines = runs.filter((run, index) => index === 0 || run.y - runs[index - 1].y > 3 || Math.abs(run.x - runs[index - 1].x) > 12 || Math.abs(run.end - runs[index - 1].end) > 12);
      const used = new Set<number>();
      for (let index = 0; index < lines.length && fields.length < 60; index += 1) {
        const top = lines[index];
        const bottomIndex = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.y - top.y >= 18 && candidate.y - top.y <= 130 && Math.abs(candidate.x - top.x) <= 12 && Math.abs(candidate.end - top.end) <= 12);
        if (bottomIndex >= 0) {
          const bottom = lines[bottomIndex];
          const left = Math.max(0, Math.min(canvas.width - 1, Math.round(top.x)));
          const right = Math.max(left + 1, Math.min(canvas.width - 1, Math.round(top.end)));
          const verticalSpan = Math.max(4, bottom.y - top.y);
          const leftCoverage = Array.from({ length: verticalSpan }, (_value, offset) => dark(left, top.y + offset)).filter(Boolean).length / verticalSpan;
          const rightCoverage = Array.from({ length: verticalSpan }, (_value, offset) => dark(right, top.y + offset)).filter(Boolean).length / verticalSpan;
          if (leftCoverage > 0.35 && rightCoverage > 0.35) {
            const fieldName = `Editable field ${fields.length + 1}`;
            const bounds = editableBounds(dark, textItems, viewport.height, left, right, top.y, bottom.y);
            fields.push({ name: fieldName, label: nearbyFieldLabel(textItems, viewport.height, top.x, top.y, top.end - top.x, fieldName), type: "text", value: "", checked: false, options: [], source: "visual", page: pageNumber, x: bounds.x, y: top.y + 4, width: bounds.width, height: Math.max(18, bottom.y - top.y - 8) });
            used.add(index); used.add(bottomIndex);
            continue;
          }
        }
        if (!used.has(index)) {
          const fieldName = `Editable field ${fields.length + 1}`;
          fields.push({ name: fieldName, label: nearbyFieldLabel(textItems, viewport.height, top.x, Math.max(4, top.y - 18), top.end - top.x, fieldName), type: "text", value: "", checked: false, options: [], source: "visual", page: pageNumber, x: top.x + 4, y: Math.max(4, top.y - 18), width: Math.max(40, top.end - top.x - 8), height: 18 });
        }
      }
    }
  } finally {
    await loaded.cleanup();
  }
  return fields;
}

async function applyPdfEdits(pdf: PDFDocument, detectedFields: DetectedField[], edits: TextEdit[]) {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const form = pdf.getForm();
  for (const fieldState of detectedFields.filter((field) => field.source === "native")) {
    const field = form.getField(fieldState.name) as unknown as { setText?: (value: string) => void; check?: () => void; uncheck?: () => void; select?: (value: string) => void };
    if (fieldState.type === "text" && field.setText) field.setText(fieldState.value);
    if (fieldState.type === "checkbox" && fieldState.checked && field.check) field.check();
    if (fieldState.type === "checkbox" && !fieldState.checked && field.uncheck) field.uncheck();
    if (fieldState.type === "choice" && fieldState.value && field.select) field.select(fieldState.value);
  }
  form.updateFieldAppearances(font);
  for (const fieldState of detectedFields.filter((field) => field.source === "visual" && field.value.trim() && field.page && field.x !== undefined && field.y !== undefined)) {
    const page = pdf.getPage((fieldState.page || 1) - 1);
    const pageSize = page.getSize();
    const fontSize = Math.max(8, Math.min(16, (fieldState.height || 18) * 0.7));
    page.drawText(fieldState.value, { x: fieldState.x, y: pageSize.height - (fieldState.y || 0) - fontSize, size: fontSize, font, color: rgb(0.08, 0.1, 0.16), maxWidth: Math.max(40, (fieldState.width || 120) - 8), lineHeight: fontSize * 1.2 });
  }
  for (const edit of edits) {
    const page = pdf.getPage(Number(edit.page) - 1); const size = page.getSize(); const fontSize = Number(edit.size);
    page.drawText(edit.text, { x: Number(edit.x), y: size.height - Number(edit.y) - fontSize, size: fontSize, font, color: rgb(0.08, 0.1, 0.16), maxWidth: Math.max(40, size.width - Number(edit.x) - 20), lineHeight: fontSize * 1.25 });
  }
}

function DetectedFieldsPanel({ fields, scanned, onChange, onRename, onRemove }: { fields: DetectedField[]; scanned: boolean; onChange: (name: string, value: string, checked?: boolean) => void; onRename: (name: string, label: string) => void; onRemove: (name: string) => void }) {
  return <Card className="border-fuchsia-100 bg-fuchsia-50/40 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-600">Automatic field detection</p><h3 className="mt-1 text-base font-semibold text-ink">{fields.length} editable fields found</h3><p className="mt-1 text-xs text-slate-500">{fields.length ? fields.some((field) => field.source === "visual") ? "Visual fields were detected from lines and boxes. Rename or remove any fields before saving." : "Native form fields were detected. Rename or remove any fields before saving." : "No native fields or clear form lines/boxes were detected. You can still add text overlays below."}</p></div><FileText className="h-5 w-5 shrink-0 text-fuchsia-500" /></div>{fields.length ? <div className="mt-3 grid gap-2 md:grid-cols-2">{fields.map((field) => <div key={field.name} className="rounded-xl border border-fuchsia-100 bg-white p-3 text-xs font-semibold text-slate-600"><div className="flex items-center justify-between gap-2"><input value={field.label || field.name} onChange={(event) => onRename(field.name, event.target.value)} aria-label={"Name for " + field.name} className="min-w-0 flex-1 rounded-md border border-transparent px-1 py-0.5 text-xs font-semibold text-slate-700 focus:border-fuchsia-300 focus:outline-none" /><button type="button" onClick={() => onRemove(field.name)} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={"Remove " + (field.label || field.name)}><X className="h-3.5 w-3.5" /></button></div>{field.source === "visual" ? <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">visual · page {field.page}</span> : <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">native PDF field</span>}{field.type === "checkbox" ? <span className="mt-2 flex items-center gap-2"><input type="checkbox" checked={field.checked} onChange={(event) => onChange(field.name, event.target.checked ? "Yes" : "No", event.target.checked)} className="h-4 w-4 accent-brand-500" />{field.checked ? "Checked" : "Not checked"}</span> : field.options.length ? <select value={field.value} onChange={(event) => onChange(field.name, event.target.value)} className="mt-1 w-full rounded-lg border border-line px-2.5 py-2 text-sm font-normal text-ink"><option value="">Select an option</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input value={field.value} onChange={(event) => onChange(field.name, event.target.value)} placeholder="Enter value" className="mt-1 w-full rounded-lg border border-line px-2.5 py-2 text-sm font-normal text-ink" />}</div>)}</div> : null}</Card>;
  return <Card className="border-fuchsia-100 bg-fuchsia-50/40 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-600">Automatic field detection</p><h3 className="mt-1 text-base font-semibold text-ink">{fields.length ? `${fields.length} editable field${fields.length === 1 ? "" : "s"} found` : "No editable fields found"}</h3><p className="mt-1 text-xs text-slate-500">{fields.length ? fields.some((field) => field.source === "visual") ? "Visual fields were detected from lines and boxes. Update them below, then save a new PDF version." : "Native form fields were detected. Update them below, then save a new PDF version." : "No native fields or clear form lines/boxes were detected. You can still add text overlays below."}</p></div><FileText className="h-5 w-5 shrink-0 text-fuchsia-500" /></div>{fields.length ? <div className="mt-3 grid gap-2 md:grid-cols-2">{fields.map((field) => <label key={field.name} className="rounded-xl border border-fuchsia-100 bg-white p-3 text-xs font-semibold text-slate-600">{field.name}{field.source === "visual" ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">visual · page {field.page}</span> : null}{field.type === "checkbox" ? <span className="mt-2 flex items-center gap-2"><input type="checkbox" checked={field.checked} onChange={(event) => onChange(field.name, event.target.checked ? "Yes" : "No", event.target.checked)} className="h-4 w-4 accent-brand-500" />{field.checked ? "Checked" : "Not checked"}</span> : field.options.length ? <select value={field.value} onChange={(event) => onChange(field.name, event.target.value)} className="mt-1 w-full rounded-lg border border-line px-2.5 py-2 text-sm font-normal text-ink"><option value="">Select an option</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input value={field.value} onChange={(event) => onChange(field.name, event.target.value)} className="mt-1 w-full rounded-lg border border-line px-2.5 py-2 text-sm font-normal text-ink" />}</label>)}</div> : null}</Card>;
}

function DetectedFieldsSaveAction({ busy, dirty, onSave }: { busy: boolean; dirty: boolean; onSave: () => void }) {
  if (!dirty) return null;
  return <Card className="flex items-center justify-between gap-3 border-emerald-100 bg-emerald-50/60 p-4"><p className="text-sm text-emerald-800">Detected field values have changed.</p><button type="button" onClick={onSave} disabled={busy} className="shrink-0 rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save field values"}</button></Card>;
}

export function PdfEditor() {
  const [documents, setDocuments] = useState<PdfDocumentItem[]>([]);
  const [selected, setSelected] = useState<PdfDocumentItem | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [edits, setEdits] = useState<TextEdit[]>([]);
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([]);
  const [fieldsScanned, setFieldsScanned] = useState(false);
  const [fieldsDirty, setFieldsDirty] = useState(false);
  const [editForm, setEditForm] = useState<TextEdit>({ id: "", page: "1", text: "", x: "40", y: "40", size: "14" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadDocuments() {
    try { setDocuments((await apiFetch<{ items: PdfDocumentItem[] }>("/pdf-editor/documents")).items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load PDF documents."); }
  }

  useEffect(() => { void loadDocuments(); }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    let objectUrl: string | null = null;
    const path = `/pdf-editor/documents/${selected.id}/content${selectedVersion ? `?version=${encodeURIComponent(selectedVersion)}` : ""}`;
    void pdfRequest(path).then(async (blob) => {
      if (!active) return;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const pdf = await PDFDocument.load(bytes);
      setSourceBytes(bytes);
      setPageCount(pdf.getPageCount());
      const nativeFields = detectFormFields(pdf);
      const fields = nativeFields.length ? nativeFields : await detectVisualFields(bytes);
      if (!active) return;
      setDetectedFields(fields);
      setFieldsScanned(true);
      setFieldsDirty(false);
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
      setEditForm((current) => ({ ...current, page: "1" }));
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to open PDF."); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selected, selectedVersion]);

  useEffect(() => {
    if (!sourceBytes) return;
    let active = true;
    let objectUrl: string | null = null;
    void (async () => {
      const pdf = await PDFDocument.load(sourceBytes);
      await applyPdfEdits(pdf, detectedFields, edits);
      const bytes = await pdf.save();
      if (!active) return;
      const outputBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(outputBuffer).set(bytes);
      objectUrl = URL.createObjectURL(new Blob([outputBuffer], { type: "application/pdf" }));
      setPreviewUrl(objectUrl);
    })().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to update the PDF preview."); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [sourceBytes, detectedFields, edits]);

  function chooseDocument(document: PdfDocumentItem) { setSelected(document); setSelectedVersion(null); setEdits([]); setDetectedFields([]); setFieldsScanned(false); setFieldsDirty(false); setMessage(""); setError(""); }

  function updateDetectedField(name: string, value: string, checked = false) {
    setFieldsDirty(true);
    setDetectedFields((current) => current.map((field) => field.name === name ? { ...field, value, checked } : field));
  }

  function renameDetectedField(name: string, label: string) {
    setDetectedFields((current) => current.map((field) => field.name === name ? { ...field, label } : field));
  }

  function removeDetectedField(name: string) {
    setDetectedFields((current) => current.filter((field) => field.name !== name));
    setFieldsDirty(true);
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") { setError("Please select a PDF file."); return; }
    if (file.size > 25 * 1024 * 1024) { setError("PDF files must be smaller than 25 MB."); return; }
    try {
      setBusy(true); setError("");
      const body = new FormData(); body.append("file", file);
      const result = await apiFetch<{ item: PdfDocumentItem }>("/pdf-editor/documents/upload", { method: "POST", body });
      setDocuments((current) => [result.item, ...current]); chooseDocument(result.item); setMessage("PDF uploaded and ready to edit.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "PDF upload failed."); }
    finally { setBusy(false); }
  }

  function addEdit() {
    if (!editForm.text.trim()) { setError("Enter text before adding an edit."); return; }
    const page = Number(editForm.page); const x = Number(editForm.x); const y = Number(editForm.y); const size = Number(editForm.size);
    if (!Number.isInteger(page) || page < 1 || page > pageCount || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size < 6 || size > 96) { setError("Check the page, position, and font size values."); return; }
    setEdits((current) => [...current, { ...editForm, id: crypto.randomUUID() }]); setEditForm((current) => ({ ...current, text: "" })); setError("");
  }

  async function saveEditedPdf() {
    if (!selected || !sourceBytes) return;
    try {
      setBusy(true); setError("");
      const pdf = await PDFDocument.load(sourceBytes);
      await applyPdfEdits(pdf, detectedFields, edits);
      const bytes = await pdf.save();
      const outputBuffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(outputBuffer).set(bytes);
      const body = new FormData(); body.append("file", new File([outputBuffer], `edited-${selected.fileName}`, { type: "application/pdf" })); body.append("fileName", `edited-${selected.fileName}`);
      const result = await apiFetch<{ item: PdfVersion }>(`/pdf-editor/documents/${selected.id}/save`, { method: "POST", body });
      const outputBytes = new Uint8Array(outputBuffer);
      setSourceBytes(outputBytes);
      setEdits([]);
      setFieldsDirty(false);
      setDocuments((current) => current.map((item) => item.id === selected.id ? { ...item, versions: [result.item, ...item.versions] } : item));
      setSelected((current) => current ? { ...current, versions: [result.item, ...current.versions] } : current);
      setSelectedVersion(result.item.id);
      setMessage("Edited PDF saved as a new version.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save the edited PDF."); }
    finally { setBusy(false); }
  }

  async function download(documentId?: string, versionId?: string) {
    const versionShortcut = !versionId && documentId && selected?.versions.some((version) => version.id === documentId);
    const actualVersionId = versionId || (versionShortcut ? documentId : undefined);
    const actualDocumentId = versionShortcut ? selected?.id : documentId || selected?.id;
    if (!actualDocumentId) return;
    const item = documents.find((entry) => entry.id === actualDocumentId) || selected;
    if (!item) return;
    try { const blob = await pdfRequest(`/pdf-editor/documents/${item.id}/content${actualVersionId ? `?version=${encodeURIComponent(actualVersionId)}` : ""}`); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = actualVersionId ? `edited-${item.fileName}` : item.fileName; link.click(); URL.revokeObjectURL(url); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Download failed."); }
  }

  async function remove(document: PdfDocumentItem) {
    if (!window.confirm(`Delete ${document.fileName} and all edited versions?`)) return;
    try { await apiFetch(`/pdf-editor/documents/${document.id}`, { method: "DELETE" }); setDocuments((current) => current.filter((item) => item.id !== document.id)); if (selected?.id === document.id) { setSelected(null); setPreviewUrl(null); setSourceBytes(null); } setMessage("PDF and its versions deleted."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete PDF."); }
  }

  const selectedVersionName = useMemo(() => selectedVersion ? selected?.versions.find((version) => version.id === selectedVersion)?.fileName : selected?.fileName, [selected, selectedVersion]);

  return <div className="space-y-4">
    <Card className="p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-600">Document workspace</p><h2 className="mt-1 text-2xl font-semibold text-ink">PDF Editor</h2><p className="mt-1 text-sm text-slate-500">Upload a PDF, add text overlays, save versions, and download the finished document.</p></div><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"><Upload className="h-4 w-4" />{busy ? "Working..." : "Upload PDF"}<input type="file" accept="application/pdf,.pdf" onChange={(event) => void upload(event)} disabled={busy} className="hidden" /></label></div>{error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}{message ? <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p> : null}</Card>
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="p-4"><div className="flex items-center justify-between"><div><h3 className="font-semibold text-ink">My PDFs</h3><p className="mt-1 text-xs text-slate-500">{documents.length} document{documents.length === 1 ? "" : "s"}</p></div><FileText className="h-5 w-5 text-fuchsia-500" /></div><div className="mt-4 space-y-2">{documents.map((document) => <div key={document.id} className={`rounded-2xl border p-3 ${selected?.id === document.id ? "border-brand-400 bg-brand-50/50" : "border-line bg-white/60"}`}><button type="button" onClick={() => chooseDocument(document)} className="w-full text-left"><p className="truncate text-sm font-semibold text-ink">{document.fileName}</p><p className="mt-1 text-xs text-slate-500">{formatBytes(document.sizeBytes)} · {document.versions.length} saved version{document.versions.length === 1 ? "" : "s"}</p></button><div className="mt-2 flex items-center justify-between"><button type="button" onClick={() => void download()} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600"><Download className="h-3.5 w-3.5" />Original</button><button type="button" onClick={() => void remove(document)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${document.fileName}`}><Trash2 className="h-3.5 w-3.5" /></button></div></div>)}{!documents.length ? <div className="rounded-2xl border border-dashed border-line p-5 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-600">No PDFs yet</p><p className="mt-1 text-xs text-slate-500">Upload your first document to begin.</p></div> : null}</div></Card>
      <Card className="overflow-hidden"><div className="border-b border-line bg-soft/40 p-4"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><h3 className="font-semibold text-ink">{selectedVersionName || "Select a PDF to edit"}</h3>{selected ? <p className="mt-1 text-xs text-slate-500">{pageCount} page{pageCount === 1 ? "" : "s"} · Add text using page coordinates measured from the top-left corner.</p> : <p className="mt-1 text-xs text-slate-500">Your document preview will appear here.</p>}</div>{selected ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void saveEditedPdf()} disabled={busy || (!edits.length && !fieldsDirty)} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-3.5 w-3.5" />Save edited version</button><button type="button" onClick={() => void download(selectedVersion ?? undefined)} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"><Download className="h-3.5 w-3.5" />Download</button></div> : null}</div></div>{selected ? <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]"><div className="min-h-[620px] overflow-hidden rounded-2xl border border-line bg-slate-100"><iframe title={`Preview of ${selected.fileName}`} src={previewUrl || undefined} className="h-[720px] w-full bg-white" /></div><div className="space-y-3"><DetectedFieldsPanel fields={detectedFields} scanned={fieldsScanned} onChange={updateDetectedField} onRename={renameDetectedField} onRemove={removeDetectedField} />{fieldsDirty ? <DetectedFieldsSaveAction busy={busy} dirty={fieldsDirty} onSave={() => void saveEditedPdf()} /> : null}<div className="rounded-2xl border border-line bg-white p-3"><p className="text-sm font-semibold text-ink">Add text</p><p className="mt-1 text-xs text-slate-500">Coordinates use PDF points. X/Y start at the top-left of the page.</p><div className="mt-3 grid gap-2"><label className="text-xs font-semibold text-slate-500">Page<input type="number" min={1} max={pageCount} value={editForm.page} onChange={(event) => setEditForm((current) => ({ ...current, page: event.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink" /></label><label className="text-xs font-semibold text-slate-500">Text<textarea value={editForm.text} onChange={(event) => setEditForm((current) => ({ ...current, text: event.target.value }))} placeholder="Text to add" rows={3} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink" /></label><div className="grid grid-cols-3 gap-2"><label className="text-xs font-semibold text-slate-500">X<input type="number" value={editForm.x} onChange={(event) => setEditForm((current) => ({ ...current, x: event.target.value }))} className="mt-1 w-full rounded-xl border border-line px-2 py-2 text-sm text-ink" /></label><label className="text-xs font-semibold text-slate-500">Y<input type="number" value={editForm.y} onChange={(event) => setEditForm((current) => ({ ...current, y: event.target.value }))} className="mt-1 w-full rounded-xl border border-line px-2 py-2 text-sm text-ink" /></label><label className="text-xs font-semibold text-slate-500">Size<input type="number" min={6} max={96} value={editForm.size} onChange={(event) => setEditForm((current) => ({ ...current, size: event.target.value }))} className="mt-1 w-full rounded-xl border border-line px-2 py-2 text-sm text-ink" /></label></div><button type="button" onClick={addEdit} className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100"><Plus className="h-3.5 w-3.5" />Add text overlay</button></div></div>{edits.length ? <div className="rounded-2xl border border-line bg-white p-3"><p className="text-sm font-semibold text-ink">Pending edits ({edits.length})</p><div className="mt-2 space-y-2">{edits.map((edit) => <div key={edit.id} className="flex items-start justify-between gap-2 rounded-xl bg-soft/60 p-2"><p className="line-clamp-2 text-xs text-slate-600">Page {edit.page}: {edit.text}</p><button type="button" onClick={() => setEdits((current) => current.filter((item) => item.id !== edit.id))} className="text-xs font-semibold text-rose-600">Remove</button></div>)}</div></div> : null}{selected.versions.length ? <div className="rounded-2xl border border-line bg-white p-3"><p className="text-sm font-semibold text-ink">Saved versions</p><div className="mt-2 space-y-2">{selected.versions.map((version) => <button type="button" key={version.id} onClick={() => setSelectedVersion(version.id)} className={`block w-full rounded-xl border px-3 py-2 text-left ${selectedVersion === version.id ? "border-brand-300 bg-brand-50" : "border-line hover:bg-soft"}`}><p className="truncate text-xs font-semibold text-ink">{version.fileName}</p><p className="mt-1 text-[11px] text-slate-500">{formatBytes(version.sizeBytes)}</p></button>)}</div></div> : null}</div></div> : <div className="grid min-h-[620px] place-items-center p-6 text-center"><div><FileText className="mx-auto h-12 w-12 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">Upload or select a PDF</p><p className="mt-1 text-xs text-slate-500">The original document stays preserved when you save edits.</p></div></div>}</Card>
    </div>
  </div>;
}
