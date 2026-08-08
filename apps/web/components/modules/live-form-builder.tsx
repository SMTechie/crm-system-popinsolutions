"use client";

import type {
  Dispatch,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  SetStateAction,
  TextareaHTMLAttributes,
} from "react";
import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, GripVertical, Plus, Search, Settings2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { formPalette } from "@/lib/data";

type Field = {
  key: string;
  type: string;
  label: string;
  required: boolean;
  width?: "full" | "half";
};

type FormTemplate = {
  id: string;
  name: string;
  slug: string;
  moduleKey: string;
  published: boolean;
  schemaJson: {
    fields?: Field[];
    settings?: {
      submitLabel?: string;
      successMessage?: string;
      layout?: string;
      webhookUrl?: string;
      crmTarget?: string;
    };
  };
  updatedAt?: string;
  _count?: { responses: number };
  responses?: FormResponse[];
};

type FormResponse = {
  id: string;
  submittedAt: string;
  payloadJson: Record<string, unknown>;
  formTemplate?: {
    id: string;
    name: string;
    slug: string;
    moduleKey: string;
  };
};

type PublicLink = {
  id: string;
  name: string;
  slug: string;
  moduleKey: string;
  published: boolean;
  updatedAt: string;
  _count?: { responses: number };
};

type ToastState = { type: "success" | "error"; message: string } | null;

const emptyTemplateForm = {
  id: "",
  name: "",
  slug: "",
  moduleKey: "crm",
  published: false,
  submitLabel: "Submit",
  successMessage: "Thanks, your response has been received.",
  layout: "two-column",
  webhookUrl: "",
  crmTarget: "lead",
};

const defaultField = (): Field => ({
  key: `field_${crypto.randomUUID().slice(0, 6)}`,
  type: "text",
  label: "New field",
  required: false,
  width: "half",
});

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-ZA");
}

function shortPayload(payload: Record<string, unknown>) {
  const entries = Object.entries(payload).slice(0, 3);
  return entries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`).join(" | ");
}

function BuilderToast({ toast }: { toast: ToastState }) {
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[70] max-w-sm">
      <div
        className={`rounded-[22px] border px-4 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.16)] ${
          toast.type === "success" ? "border-emerald-200 bg-white text-emerald-700" : "border-rose-200 bg-white text-rose-600"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em]">{toast.type === "success" ? "Success" : "Error"}</p>
        <p className="mt-1 text-sm font-medium text-slate-700">{toast.message}</p>
      </div>
    </div>
  );
}

function TableHeader({
  label,
  title,
  description,
  count,
  addLabel,
  onAdd,
  search,
  setSearch,
  searchPlaceholder,
  filter,
  setFilter,
  filterOptions,
}: {
  label: string;
  title: string;
  description: string;
  count: number;
  addLabel?: string;
  onAdd?: () => void;
  search: string;
  setSearch: (value: string) => void;
  searchPlaceholder: string;
  filter?: string;
  setFilter?: (value: string) => void;
  filterOptions?: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="border-b border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <h2 className="mt-1 text-lg font-semibold text-ink md:text-xl">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">{count} shown</span>
          {onAdd && addLabel ? (
            <button onClick={onAdd} className="inline-flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-soft">
              <Plus className="h-3.5 w-3.5" />
              <span>{addLabel}</span>
            </button>
          ) : null}
        </div>
      </div>
      <div className={`mt-4 grid gap-2 ${filterOptions ? "md:grid-cols-[minmax(0,1fr)_220px]" : ""}`}>
        <label className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400" />
        </label>
        {filterOptions && filter !== undefined && setFilter ? (
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-2xl border border-line bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500">
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  );
}

function DeleteModal({ title, onCancel, onConfirm, confirmLabel }: { title: string; onCancel: () => void; onConfirm: () => void; confirmLabel: string }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="border-b border-line px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Confirm Delete</p>
          <h3 className="mt-1 text-xl font-semibold text-ink">{title}</h3>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4">
          <button onClick={onCancel} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">Cancel</button>
          <button onClick={onConfirm} className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function BaseModal({
  label,
  title,
  children,
  onClose,
  onSave,
  saveLabel,
}: {
  label: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-slate-950/30 px-4 py-6 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-6xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">{title}</h3>
          </div>
          <button onClick={onClose} className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft">Close</button>
        </div>
        <div className="px-6 py-5">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4">
          <button onClick={onClose} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">Cancel</button>
          <button onClick={onSave} className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`rounded-2xl border border-line px-4 py-3 text-sm text-ink outline-none transition focus:border-brand-500 ${props.className ?? ""}`} />;
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand-500 ${props.className ?? ""}`} />;
}

function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`rounded-2xl border border-line px-4 py-3 text-sm text-ink outline-none transition focus:border-brand-500 ${props.className ?? ""}`} />;
}

function useFormBuilderData() {
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [links, setLinks] = useState<PublicLink[]>([]);
  const [toast, setToast] = useState<ToastState>(null);

  function notify(type: "success" | "error", message: string) {
    setToast({ type, message });
  }

  async function reload() {
    try {
      const [formsData, responsesData, linksData] = await Promise.all([
        apiFetch<{ items: FormTemplate[] }>("/forms"),
        apiFetch<{ items: FormResponse[] }>("/forms/responses"),
        apiFetch<{ items: PublicLink[] }>("/forms/public-links"),
      ]);
      setForms(formsData.items);
      setResponses(responsesData.items);
      setLinks(linksData.items);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to load form builder.");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return { forms, responses, links, toast, notify, reload };
}

function FormTemplateModal({
  form,
  setForm,
  fields,
  setFields,
  selectedFieldKey,
  setSelectedFieldKey,
  onClose,
  onSave,
}: {
  form: typeof emptyTemplateForm;
  setForm: Dispatch<SetStateAction<typeof emptyTemplateForm>>;
  fields: Field[];
  setFields: Dispatch<SetStateAction<Field[]>>;
  selectedFieldKey: string;
  setSelectedFieldKey: Dispatch<SetStateAction<string>>;
  onClose: () => void;
  onSave: () => void;
}) {
  const selectedField = fields.find((field) => field.key === selectedFieldKey) ?? null;

  function addField(type: string, label: string) {
    const nextField = { ...defaultField(), type, label };
    setFields((current) => [...current, nextField]);
    setSelectedFieldKey(nextField.key);
  }

  function updateSelectedField(next: Partial<Field>) {
    if (!selectedField) return;
    setFields((current) => current.map((field) => (field.key === selectedField.key ? { ...field, ...next } : field)));
  }

  return (
    <BaseModal label={form.id ? "Edit Template" : "New Template"} title="Design form template" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Template" : "Create Template"}>
      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <div className="space-y-3 rounded-[24px] border border-line p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Field Palette</p>
            <h4 className="mt-1 text-lg font-semibold text-ink">Available fields</h4>
          </div>
          {formPalette.map((item) => (
            <button key={item.type} onClick={() => addField(item.type, item.label)} className="flex w-full items-center justify-between rounded-2xl border border-line bg-soft/70 px-4 py-3 text-left transition hover:border-brand-100 hover:bg-brand-50">
              <span>
                <span className="block text-sm font-semibold text-ink">{item.label}</span>
                <span className="text-xs text-slate-500">{item.type}</span>
              </span>
              <Plus className="h-4 w-4 text-brand-500" />
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Form name" className="md:col-span-2" />
            <Input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} placeholder="Public slug" />
            <Select value={form.moduleKey} onChange={(event) => setForm((current) => ({ ...current, moduleKey: event.target.value }))}>
              {["crm", "accounting", "hr", "automation", "general"].map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
            </Select>
            <Select value={form.layout} onChange={(event) => setForm((current) => ({ ...current, layout: event.target.value }))}>
              <option value="two-column">Two column</option>
              <option value="single-column">Single column</option>
            </Select>
            <Select value={form.crmTarget} onChange={(event) => setForm((current) => ({ ...current, crmTarget: event.target.value }))}>
              <option value="lead">CRM Lead</option>
              <option value="contact">CRM Contact</option>
              <option value="company">CRM Company</option>
              <option value="case">CRM Case</option>
            </Select>
            <Input value={form.submitLabel} onChange={(event) => setForm((current) => ({ ...current, submitLabel: event.target.value }))} placeholder="Submit button label" className="md:col-span-2" />
            <Input value={form.webhookUrl} onChange={(event) => setForm((current) => ({ ...current, webhookUrl: event.target.value }))} placeholder="Webhook URL" className="md:col-span-2" />
            <Textarea value={form.successMessage} onChange={(event) => setForm((current) => ({ ...current, successMessage: event.target.value }))} rows={3} className="md:col-span-2" placeholder="Success message" />
          </div>

          <div className="rounded-[24px] border border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Canvas</p>
                <h4 className="mt-1 text-lg font-semibold text-ink">Form layout</h4>
              </div>
              <span className="rounded-full bg-soft px-2.5 py-1 text-xs font-semibold text-slate-700">{fields.length} fields</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {fields.map((field) => (
                <button key={field.key} onClick={() => setSelectedFieldKey(field.key)} className={`rounded-[22px] border p-4 text-left transition ${selectedFieldKey === field.key ? "border-brand-500 bg-brand-50/70" : "border-line bg-white hover:bg-soft"} ${field.width === "full" ? "md:col-span-2" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <GripVertical className="mt-1 h-4 w-4 text-slate-400" />
                      <div>
                        <p className="text-sm font-semibold text-ink">{field.label}</p>
                        <p className="text-xs text-slate-500">{field.type}</p>
                      </div>
                    </div>
                    {field.required ? <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-500">Required</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-[24px] border border-line p-4">
          <div className="flex items-center gap-3">
            <Settings2 className="h-5 w-5 text-brand-500" />
            <div>
              <h4 className="text-lg font-semibold text-ink">Field settings</h4>
              <p className="text-xs text-slate-500">Validation and layout controls.</p>
            </div>
          </div>
          {selectedField ? (
            <>
              <Input value={selectedField.label} onChange={(event) => updateSelectedField({ label: event.target.value })} placeholder="Field label" />
              <Select value={selectedField.type} onChange={(event) => updateSelectedField({ type: event.target.value })}>
                {formPalette.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
              </Select>
              <Select value={selectedField.width ?? "half"} onChange={(event) => updateSelectedField({ width: event.target.value as "full" | "half" })}>
                <option value="half">Half width</option>
                <option value="full">Full width</option>
              </Select>
              <label className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm text-slate-700">
                Required field
                <input type="checkbox" checked={selectedField.required} onChange={(event) => updateSelectedField({ required: event.target.checked })} className="h-4 w-4 accent-[#365CF5]" />
              </label>
              <button onClick={() => { setFields((current) => current.filter((field) => field.key !== selectedField.key)); setSelectedFieldKey(""); }} className="w-full rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50">
                <Trash2 className="mr-2 inline h-4 w-4" />
                Remove field
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-500">Select a field to edit it.</p>
          )}
        </div>
      </div>
    </BaseModal>
  );
}

function ResponseModal({ response, onClose }: { response: FormResponse; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-slate-950/30 px-4 py-6 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Form Response</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">{response.formTemplate?.name || "Submitted response"}</h3>
            <p className="mt-1 text-sm text-slate-500">Submitted on {formatDate(response.submittedAt)}</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft">Close</button>
        </div>
        <div className="space-y-3 px-6 py-5">
          {Object.entries(response.payloadJson).map(([key, value]) => (
            <div key={key} className="rounded-2xl border border-line p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{key}</p>
              <p className="mt-2 text-sm text-ink">{Array.isArray(value) ? value.join(", ") : JSON.stringify(value)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LiveFormBuilder() {
  const { forms, responses, links, toast } = useFormBuilderData();
  const publishedCount = useMemo(() => forms.filter((form) => form.published).length, [forms]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Templates", String(forms.length)],
          ["Published", String(publishedCount)],
          ["Responses", String(responses.length)],
          ["Public Links", String(links.filter((item) => item.published).length)],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-line p-4">
            <h2 className="text-lg font-semibold text-ink">Published templates</h2>
            <p className="mt-1 text-xs text-slate-500">Reusable forms that save live schemas to Neon and expose public intake links.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="border-b border-line bg-slate-50/70">
                <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Template</th>
                  <th className="px-4 py-2.5 font-semibold">Module</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Responses</th>
                </tr>
              </thead>
              <tbody>
                {forms.slice(0, 6).map((form) => (
                  <tr key={form.id} className="border-b border-line">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-ink">{form.name}</p>
                      <p className="mt-1 text-xs text-slate-500">/{form.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{form.moduleKey.toUpperCase()}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{form.published ? "Published" : "Draft"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{form._count?.responses ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-line p-4">
            <h2 className="text-lg font-semibold text-ink">Recent submissions</h2>
            <p className="mt-1 text-xs text-slate-500">Incoming responses mapped to CRM and automation workflows.</p>
          </div>
          <div className="divide-y divide-line">
            {responses.slice(0, 5).map((response) => (
              <div key={response.id} className="px-4 py-3">
                <p className="text-sm font-semibold text-ink">{response.formTemplate?.name || "Submission"}</p>
                <p className="mt-1 text-xs text-slate-500">{shortPayload(response.payloadJson)}</p>
              </div>
            ))}
            {responses.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No responses captured yet.</p> : null}
          </div>
        </Card>
      </div>
      <BuilderToast toast={toast} />
    </div>
  );
}

export function LiveFormTemplatesPage() {
  const { forms, toast, notify, reload } = useFormBuilderData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedFieldKey, setSelectedFieldKey] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return forms.filter((item) => {
      const matchesSearch = term.length === 0 || item.name.toLowerCase().includes(term) || item.slug.toLowerCase().includes(term) || item.moduleKey.toLowerCase().includes(term);
      const matchesFilter = filter === "ALL" || (filter === "PUBLISHED" ? item.published : !item.published);
      return matchesSearch && matchesFilter;
    });
  }, [filter, forms, search]);

  function openNewTemplate() {
    const starterField = defaultField();
    setTemplateForm(emptyTemplateForm);
    setFields([starterField]);
    setSelectedFieldKey(starterField.key);
    setShowForm(true);
  }

  function openExistingTemplate(form: FormTemplate) {
    const templateFields = (form.schemaJson?.fields ?? []).map((field) => ({ ...field, width: field.width ?? "half" }));
    const initialField = templateFields[0] ?? defaultField();
    setTemplateForm({
      id: form.id,
      name: form.name,
      slug: form.slug,
      moduleKey: form.moduleKey,
      published: form.published,
      submitLabel: form.schemaJson?.settings?.submitLabel ?? "Submit",
      successMessage: form.schemaJson?.settings?.successMessage ?? "Thanks, your response has been received.",
      layout: form.schemaJson?.settings?.layout ?? "two-column",
      webhookUrl: form.schemaJson?.settings?.webhookUrl ?? "",
      crmTarget: form.schemaJson?.settings?.crmTarget ?? "lead",
    });
    setFields(templateFields.length ? templateFields : [initialField]);
    setSelectedFieldKey(initialField.key);
    setShowForm(true);
  }

  async function saveTemplate() {
    try {
      const payload = {
        name: templateForm.name || undefined,
        slug: templateForm.slug || undefined,
        moduleKey: templateForm.moduleKey || undefined,
        published: templateForm.published,
        schemaJson: {
          fields: fields.map((field) => ({
            key: field.key,
            type: field.type,
            label: field.label,
            required: field.required,
            width: field.width ?? "half",
          })),
          settings: {
            submitLabel: templateForm.submitLabel,
            successMessage: templateForm.successMessage,
            layout: templateForm.layout,
            webhookUrl: templateForm.webhookUrl,
            crmTarget: templateForm.crmTarget,
          },
        },
      };

      if (templateForm.id) {
        await apiFetch(`/forms/${templateForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Template updated successfully.");
      } else {
        await apiFetch("/forms", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Template created successfully.");
      }
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save template.");
    }
  }

  async function deleteTemplate(formId: string) {
    try {
      await apiFetch(`/forms/${formId}`, { method: "DELETE" });
      notify("success", "Template deleted successfully.");
      setPendingDelete(null);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete template.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Templates" title="Reusable form templates" description="Create, edit, publish, and manage dynamic form templates saved directly to Neon." count={filtered.length} addLabel="Add template" onAdd={openNewTemplate} search={search} setSearch={setSearch} searchPlaceholder="Search template, slug, module" filter={filter} setFilter={setFilter} filterOptions={[{ value: "ALL", label: "All templates" }, { value: "PUBLISHED", label: "Published" }, { value: "DRAFT", label: "Draft" }]} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Template</th>
                <th className="px-4 py-2.5 font-semibold">Module</th>
                <th className="px-4 py-2.5 font-semibold">Fields</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Responses</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3">
                    <button onClick={() => openExistingTemplate(item)} className="text-left">
                      <p className="text-sm font-semibold text-ink transition hover:text-brand-500">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">/{item.slug}</p>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.moduleKey.toUpperCase()}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.schemaJson?.fields?.length ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.published ? "Published" : "Draft"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item._count?.responses ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openExistingTemplate(item)} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button>
                      <button onClick={() => setPendingDelete(item.id)} className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No templates match the current search or filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <FormTemplateModal form={templateForm} setForm={setTemplateForm} fields={fields} setFields={setFields} selectedFieldKey={selectedFieldKey} setSelectedFieldKey={setSelectedFieldKey} onClose={() => setShowForm(false)} onSave={() => void saveTemplate()} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this form template?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteTemplate(pendingDelete)} confirmLabel="Delete Template" /> : null}
      <BuilderToast toast={toast} />
    </div>
  );
}

export function LiveFormResponsesPage() {
  const { responses, toast, notify, reload } = useFormBuilderData();
  const [search, setSearch] = useState("");
  const [selectedResponse, setSelectedResponse] = useState<FormResponse | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return responses.filter((item) => {
      const payloadText = JSON.stringify(item.payloadJson).toLowerCase();
      return term.length === 0 || (item.formTemplate?.name ?? "").toLowerCase().includes(term) || payloadText.includes(term) || (item.formTemplate?.moduleKey ?? "").toLowerCase().includes(term);
    });
  }, [responses, search]);

  async function deleteResponse(responseId: string) {
    try {
      await apiFetch(`/forms/responses/${responseId}`, { method: "DELETE" });
      notify("success", "Response deleted successfully.");
      setPendingDelete(null);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete response.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Responses" title="Form submissions" description="Review live submissions flowing into CRM, intake, and automation processes." count={filtered.length} search={search} setSearch={setSearch} searchPlaceholder="Search form, module, response payload" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Form</th>
                <th className="px-4 py-2.5 font-semibold">Module</th>
                <th className="px-4 py-2.5 font-semibold">Submitted</th>
                <th className="px-4 py-2.5 font-semibold">Preview</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3 text-sm font-semibold text-ink">{item.formTemplate?.name || "Form response"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.formTemplate?.moduleKey?.toUpperCase() || "GENERAL"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{formatDate(item.submittedAt)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{shortPayload(item.payloadJson)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setSelectedResponse(item)} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">View</button>
                      <button onClick={() => setPendingDelete(item.id)} className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No responses match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {selectedResponse ? <ResponseModal response={selectedResponse} onClose={() => setSelectedResponse(null)} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this submitted response?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteResponse(pendingDelete)} confirmLabel="Delete Response" /> : null}
      <BuilderToast toast={toast} />
    </div>
  );
}

export function LiveFormPublicLinksPage() {
  const { links, toast, notify, reload } = useFormBuilderData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return links.filter((item) => {
      const matchesSearch = term.length === 0 || item.name.toLowerCase().includes(term) || item.slug.toLowerCase().includes(term) || item.moduleKey.toLowerCase().includes(term);
      const matchesFilter = filter === "ALL" || (filter === "PUBLISHED" ? item.published : !item.published);
      return matchesSearch && matchesFilter;
    });
  }, [filter, links, search]);

  async function togglePublish(item: PublicLink) {
    try {
      await apiFetch(`/forms/${item.id}/${item.published ? "unpublish" : "publish"}`, { method: "POST" });
      notify("success", item.published ? "Form unpublished successfully." : "Form published successfully.");
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to update publishing status.");
    }
  }

  async function submitTest(item: PublicLink) {
    try {
      await apiFetch(`/forms/${item.id}/responses`, { method: "POST", body: JSON.stringify({ fullName: "Public Link Test", email: `public-link-test-${Date.now()}@example.com`, module: item.moduleKey, source: "link-test" }) });
      notify("success", "Test response submitted successfully.");
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to submit test response.");
    }
  }

  async function copyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(`${API_BASE_URL}/forms/public/${slug}`);
      notify("success", "Public link copied to clipboard.");
    } catch {
      notify("error", "Failed to copy public link.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Public Links" title="Embeds and share links" description="Publish templates externally, copy links, and send test submissions into the live response pipeline." count={filtered.length} search={search} setSearch={setSearch} searchPlaceholder="Search link, slug, module" filter={filter} setFilter={setFilter} filterOptions={[{ value: "ALL", label: "All links" }, { value: "PUBLISHED", label: "Published" }, { value: "DRAFT", label: "Draft" }]} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Template</th>
                <th className="px-4 py-2.5 font-semibold">Public URL</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Responses</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{item.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.moduleKey.toUpperCase()}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">/api/v1/forms/public/{item.slug}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.published ? "Published" : "Draft"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item._count?.responses ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => void copyLink(item.slug)} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft"><Copy className="mr-1 inline h-3.5 w-3.5" />Copy</button>
                      <button onClick={() => void submitTest(item)} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Test Submit</button>
                      <button onClick={() => void togglePublish(item)} className="rounded-xl border border-brand-100 px-2.5 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50">{item.published ? "Unpublish" : "Publish"}</button>
                      <a href={`${API_BASE_URL}/forms/public/${item.slug}`} target="_blank" rel="noreferrer" className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft"><ExternalLink className="mr-1 inline h-3.5 w-3.5" />Open</a>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No public links match the current search or filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      <BuilderToast toast={toast} />
    </div>
  );
}
