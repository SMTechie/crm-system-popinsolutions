"use client";

import { useState } from "react";
import { GripVertical, Plus, Rocket, Settings2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formPalette } from "@/lib/data";

type Field = {
  id: string;
  type: string;
  label: string;
  required: boolean;
  width: "full" | "half";
};

const initialFields: Field[] = [
  { id: "full-name", type: "text", label: "Full Name", required: true, width: "half" },
  { id: "company", type: "text", label: "Company", required: false, width: "half" },
  { id: "email", type: "email", label: "Work Email", required: true, width: "half" },
  { id: "services", type: "multi-select", label: "Services Interested In", required: true, width: "full" },
];

export function FormBuilderStudio() {
  const [fields, setFields] = useState<Field[]>(initialFields);
  const [selectedId, setSelectedId] = useState<string>(initialFields[0].id);

  function addField(type: string, label: string) {
    const id = `${type}-${crypto.randomUUID().slice(0, 6)}`;
    const field = {
      id,
      type,
      label: `${label} Field`,
      required: false,
      width: "half" as const,
    };
    setFields((current) => [...current, field]);
    setSelectedId(id);
  }

  function removeField(id: string) {
    setFields((current) => current.filter((field) => field.id !== id));
    setSelectedId((current) => (current === id ? fields[0]?.id ?? "" : current));
  }

  function updateSelected(patch: Partial<Field>) {
    setFields((current) =>
      current.map((field) => (field.id === selectedId ? { ...field, ...patch } : field)),
    );
  }

  const selectedField = fields.find((field) => field.id === selectedId) ?? fields[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-ink">Field Palette</h3>
            <p className="mt-1 text-sm text-slate-500">Drag-and-drop ready field definitions.</p>
          </div>
          <Plus className="h-5 w-5 text-brand-500" />
        </div>
        <div className="mt-5 grid gap-3">
          {formPalette.map((item) => (
            <button
              key={item.type}
              onClick={() => addField(item.type, item.label)}
              className="flex items-center justify-between rounded-2xl border border-line bg-soft/70 px-4 py-3 text-left transition hover:border-brand-100 hover:bg-brand-50"
            >
              <span>
                <span className="block font-semibold text-ink">{item.label}</span>
                <span className="text-sm text-slate-500">{item.type}</span>
              </span>
              <Plus className="h-4 w-4 text-brand-500" />
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
          <div>
            <h3 className="text-2xl font-semibold text-ink">Lead Capture Form</h3>
            <p className="mt-1 text-slate-500">Public form with CRM mapping, validation, and conditional logic.</p>
          </div>
          <div className="flex gap-3">
            <button className="rounded-2xl border border-line px-4 py-3 text-sm font-semibold text-slate-700">
              Save Template
            </button>
            <button className="rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white">
              Publish Form
            </button>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {fields.map((field) => (
            <button
              key={field.id}
              onClick={() => setSelectedId(field.id)}
              className={`rounded-[22px] border p-4 text-left transition ${
                selectedId === field.id ? "border-brand-500 bg-brand-50/70" : "border-line bg-white hover:bg-soft"
              } ${field.width === "full" ? "md:col-span-2" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <GripVertical className="mt-1 h-4 w-4 text-slate-400" />
                  <div>
                    <p className="font-semibold text-ink">{field.label}</p>
                    <p className="text-sm text-slate-500">{field.type}</p>
                  </div>
                </div>
                {field.required ? (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-500">Required</span>
                ) : null}
              </div>
              <div className="mt-4 rounded-2xl border border-dashed border-line bg-white px-4 py-3 text-sm text-slate-400">
                {field.type === "multi-select" ? "Select one or more options..." : `Input for ${field.label}`}
              </div>
            </button>
          ))}
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-line bg-soft/70 p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Conditional Logic</p>
            <p className="mt-2 font-semibold text-ink">If Services contains "Managed IT" show Budget field.</p>
          </div>
          <div className="rounded-2xl border border-line bg-soft/70 p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">CRM Mapping</p>
            <p className="mt-2 font-semibold text-ink">Create lead, attach company, trigger onboarding workflow.</p>
          </div>
          <div className="rounded-2xl border border-line bg-soft/70 p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Webhook</p>
            <p className="mt-2 font-semibold text-ink">POST response payload to external automation endpoint.</p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Settings2 className="h-5 w-5 text-brand-500" />
          <div>
            <h3 className="text-xl font-semibold text-ink">Field Settings</h3>
            <p className="mt-1 text-sm text-slate-500">Validation, layout, and data mapping.</p>
          </div>
        </div>
        {selectedField ? (
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-600">Label</span>
              <input
                value={selectedField.label}
                onChange={(event) => updateSelected({ label: event.target.value })}
                className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-brand-500"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-600">Width</span>
              <select
                value={selectedField.width}
                onChange={(event) => updateSelected({ width: event.target.value as Field["width"] })}
                className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-brand-500"
              >
                <option value="half">Half width</option>
                <option value="full">Full width</option>
              </select>
            </label>
            <label className="flex items-center justify-between rounded-2xl border border-line px-4 py-3">
              <span>
                <span className="block font-semibold text-ink">Required field</span>
                <span className="text-sm text-slate-500">Enforce validation before submit.</span>
              </span>
              <input
                type="checkbox"
                checked={selectedField.required}
                onChange={(event) => updateSelected({ required: event.target.checked })}
                className="h-5 w-5 rounded border-line"
              />
            </label>
            <div className="rounded-2xl border border-line bg-soft/70 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Validation Rules</p>
              <p className="mt-2 text-sm text-slate-600">Required, regex, min/max, and tenant-specific compliance rules.</p>
            </div>
            <div className="rounded-2xl border border-line bg-soft/70 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Publishing</p>
              <p className="mt-2 text-sm text-slate-600">Public links, iframe embeds, API triggers, and webhook signing.</p>
            </div>
            <div className="flex gap-3">
              <button className="flex-1 rounded-2xl border border-line px-4 py-3 text-sm font-semibold text-slate-700">
                <Rocket className="mr-2 inline h-4 w-4" />
                Test Flow
              </button>
              <button
                onClick={() => removeField(selectedField.id)}
                className="rounded-2xl border border-red-100 px-4 py-3 text-sm font-semibold text-red-500"
              >
                <Trash2 className="mr-2 inline h-4 w-4" />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-slate-500">Select a field to edit its configuration.</p>
        )}
      </Card>
    </div>
  );
}

