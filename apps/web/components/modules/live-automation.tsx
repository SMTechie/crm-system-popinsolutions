"use client";

import type { Dispatch, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, SetStateAction, TextareaHTMLAttributes } from "react";
import { useEffect, useMemo, useState } from "react";
import { Play, Plus, Search, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Workflow = {
  id: string;
  name: string;
  triggerKey: string;
  active: boolean;
  definitionJson?: {
    conditions?: Array<{ field?: string; operator?: string; value?: string }>;
    actions?: Array<{ type?: string; target?: string; label?: string }>;
  };
  updatedAt?: string;
};

type TriggerRecord = {
  key: string;
  workflowCount: number;
  activeCount: number;
  latestWorkflowName?: string;
  latestUpdatedAt?: string;
};

type ActionRecord = {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowActive: boolean;
  type: string;
  target: string;
  label: string;
  status: string;
  updatedAt?: string;
};

type LogRecord = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadataJson?: Record<string, unknown> | null;
  createdAt: string;
};

type ToastState = { type: "success" | "error"; message: string } | null;

const emptyWorkflow = {
  id: "",
  name: "",
  triggerKey: "crm.lead.created",
  active: true,
  conditionField: "status",
  conditionOperator: "equals",
  conditionValue: "NEW",
  actionType: "send-email",
  actionTarget: "sales@popinsolutions.co.za",
  actionLabel: "Notify team",
};

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString("en-ZA");
}

function AutomationToast({ toast }: { toast: ToastState }) {
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
      <div className="mx-auto w-full max-w-5xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
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

function useAutomationData() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [triggers, setTriggers] = useState<TriggerRecord[]>([]);
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [toast, setToast] = useState<ToastState>(null);

  function notify(type: "success" | "error", message: string) {
    setToast({ type, message });
  }

  async function reload() {
    try {
      const [workflowData, triggerData, actionData, logData] = await Promise.all([
        apiFetch<{ items: Workflow[] }>("/workflows"),
        apiFetch<{ items: TriggerRecord[] }>("/workflows/triggers"),
        apiFetch<{ items: ActionRecord[] }>("/workflows/actions"),
        apiFetch<{ items: LogRecord[] }>("/workflows/logs"),
      ]);
      setWorkflows(workflowData.items);
      setTriggers(triggerData.items);
      setActions(actionData.items);
      setLogs(logData.items);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to load automation.");
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

  return { workflows, triggers, actions, logs, toast, notify, reload };
}

function WorkflowModal({
  form,
  setForm,
  onClose,
  onSave,
}: {
  form: typeof emptyWorkflow;
  setForm: Dispatch<SetStateAction<typeof emptyWorkflow>>;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <BaseModal label={form.id ? "Edit Workflow" : "New Workflow"} title="Configure automation workflow" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Workflow" : "Create Workflow"}>
      <div className="grid gap-3 md:grid-cols-2">
        <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Workflow name" className="md:col-span-2" />
        <Select value={form.triggerKey} onChange={(event) => setForm((current) => ({ ...current, triggerKey: event.target.value }))}>
          {["crm.lead.created", "crm.deal.created", "crm.activity.logged", "forms.response.created", "accounting.payment.received", "hr.leave.created"].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
        <label className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm text-slate-700">
          Workflow active
          <input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 accent-[#365CF5]" />
        </label>
        <Input value={form.conditionField} onChange={(event) => setForm((current) => ({ ...current, conditionField: event.target.value }))} placeholder="Condition field" />
        <Select value={form.conditionOperator} onChange={(event) => setForm((current) => ({ ...current, conditionOperator: event.target.value }))}>
          {["equals", "contains", "greater-than", "less-than", "exists"].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
        <Input value={form.conditionValue} onChange={(event) => setForm((current) => ({ ...current, conditionValue: event.target.value }))} placeholder="Condition value" className="md:col-span-2" />
        <Select value={form.actionType} onChange={(event) => setForm((current) => ({ ...current, actionType: event.target.value }))}>
          {["send-email", "assign-task", "update-status", "create-record", "post-webhook"].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
        <Input value={form.actionTarget} onChange={(event) => setForm((current) => ({ ...current, actionTarget: event.target.value }))} placeholder="Action target" />
        <Textarea value={form.actionLabel} onChange={(event) => setForm((current) => ({ ...current, actionLabel: event.target.value }))} rows={3} className="md:col-span-2" placeholder="Action label or description" />
      </div>
    </BaseModal>
  );
}

export function LiveAutomation() {
  const { workflows, triggers, actions, logs, toast } = useAutomationData();
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Workflows", String(workflows.length)],
          ["Triggers", String(triggers.length)],
          ["Actions", String(actions.length)],
          ["Logs", String(logs.length)],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-line p-4">
            <h2 className="text-lg font-semibold text-ink">Active automations</h2>
            <p className="mt-1 text-xs text-slate-500">Live workflow definitions controlling CRM, forms, finance, and HR triggers.</p>
          </div>
          <div className="divide-y divide-line">
            {workflows.slice(0, 5).map((workflow) => (
              <div key={workflow.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{workflow.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{workflow.triggerKey}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${workflow.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{workflow.active ? "Active" : "Paused"}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-line p-4">
            <h2 className="text-lg font-semibold text-ink">Execution log</h2>
            <p className="mt-1 text-xs text-slate-500">Recent workflow tests, form publishes, and automation mutations recorded live.</p>
          </div>
          <div className="divide-y divide-line">
            {logs.slice(0, 5).map((log) => (
              <div key={log.id} className="px-4 py-3">
                <p className="text-sm font-semibold text-ink">{log.action}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(log.createdAt)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <AutomationToast toast={toast} />
    </div>
  );
}

export function LiveAutomationWorkflowsPage() {
  const { workflows, toast, notify, reload } = useAutomationData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyWorkflow);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return workflows.filter((item) => {
      const matchesSearch = term.length === 0 || item.name.toLowerCase().includes(term) || item.triggerKey.toLowerCase().includes(term);
      const matchesFilter = filter === "ALL" || (filter === "ACTIVE" ? item.active : !item.active);
      return matchesSearch && matchesFilter;
    });
  }, [filter, search, workflows]);

  function openWorkflow(item?: Workflow) {
    if (!item) {
      setForm(emptyWorkflow);
      setShowForm(true);
      return;
    }
    const definition = item.definitionJson ?? {};
    const condition = definition.conditions?.[0] ?? {};
    const action = definition.actions?.[0] ?? {};
    setForm({
      id: item.id,
      name: item.name,
      triggerKey: item.triggerKey,
      active: item.active,
      conditionField: condition.field ?? "status",
      conditionOperator: condition.operator ?? "equals",
      conditionValue: condition.value ?? "NEW",
      actionType: action.type ?? "send-email",
      actionTarget: action.target ?? "sales@popinsolutions.co.za",
      actionLabel: action.label ?? "Notify team",
    });
    setShowForm(true);
  }

  async function saveWorkflow() {
    try {
      const payload = {
        name: form.name || undefined,
        triggerKey: form.triggerKey || undefined,
        active: form.active,
        definitionJson: {
          conditions: [{ field: form.conditionField, operator: form.conditionOperator, value: form.conditionValue }],
          actions: [{ type: form.actionType, target: form.actionTarget, label: form.actionLabel }],
        },
      };
      if (form.id) {
        await apiFetch(`/workflows/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Workflow updated successfully.");
      } else {
        await apiFetch("/workflows", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Workflow created successfully.");
      }
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save workflow.");
    }
  }

  async function runTest(workflowId: string) {
    try {
      await apiFetch(`/workflows/${workflowId}/test`, { method: "POST" });
      notify("success", "Workflow test queued successfully.");
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to queue workflow test.");
    }
  }

  async function deleteWorkflow(workflowId: string) {
    try {
      await apiFetch(`/workflows/${workflowId}`, { method: "DELETE" });
      notify("success", "Workflow deleted successfully.");
      setPendingDelete(null);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete workflow.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Workflows" title="Automation workflows" description="Build workflow logic with triggers, conditions, and actions running on live records." count={filtered.length} addLabel="Add workflow" onAdd={() => openWorkflow()} search={search} setSearch={setSearch} searchPlaceholder="Search workflow or trigger" filter={filter} setFilter={setFilter} filterOptions={[{ value: "ALL", label: "All workflows" }, { value: "ACTIVE", label: "Active" }, { value: "PAUSED", label: "Paused" }]} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Workflow</th>
                <th className="px-4 py-2.5 font-semibold">Trigger</th>
                <th className="px-4 py-2.5 font-semibold">Condition</th>
                <th className="px-4 py-2.5 font-semibold">Action</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const condition = item.definitionJson?.conditions?.[0];
                const action = item.definitionJson?.actions?.[0];
                return (
                  <tr key={item.id} className="border-b border-line transition hover:bg-soft/40">
                    <td className="px-4 py-3 text-sm font-semibold text-ink">{item.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.triggerKey}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{condition ? `${condition.field} ${condition.operator} ${condition.value}` : "No condition"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{action ? `${action.type} -> ${action.target}` : "No action"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.active ? "Active" : "Paused"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => void runTest(item.id)} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft"><Play className="mr-1 inline h-3.5 w-3.5" />Test</button>
                        <button onClick={() => openWorkflow(item)} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button>
                        <button onClick={() => setPendingDelete(item.id)} className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No workflows match the current search or filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <WorkflowModal form={form} setForm={setForm} onClose={() => setShowForm(false)} onSave={() => void saveWorkflow()} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this workflow?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteWorkflow(pendingDelete)} confirmLabel="Delete Workflow" /> : null}
      <AutomationToast toast={toast} />
    </div>
  );
}

export function LiveAutomationTriggersPage() {
  const { triggers, toast } = useAutomationData();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return triggers.filter((item) => term.length === 0 || item.key.toLowerCase().includes(term) || (item.latestWorkflowName ?? "").toLowerCase().includes(term));
  }, [search, triggers]);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Triggers" title="Event sources" description="See which live business events are feeding your automation workflows." count={filtered.length} search={search} setSearch={setSearch} searchPlaceholder="Search trigger or workflow" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Trigger Key</th>
                <th className="px-4 py-2.5 font-semibold">Workflows</th>
                <th className="px-4 py-2.5 font-semibold">Active</th>
                <th className="px-4 py-2.5 font-semibold">Latest Workflow</th>
                <th className="px-4 py-2.5 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.key} className="border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3 text-sm font-semibold text-ink">{item.key}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.workflowCount}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.activeCount}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.latestWorkflowName || "Not set"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{formatDate(item.latestUpdatedAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No triggers match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      <AutomationToast toast={toast} />
    </div>
  );
}

export function LiveAutomationActionsPage() {
  const { actions, toast } = useAutomationData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return actions.filter((item) => {
      const matchesSearch = term.length === 0 || item.workflowName.toLowerCase().includes(term) || item.type.toLowerCase().includes(term) || item.target.toLowerCase().includes(term);
      const matchesFilter = filter === "ALL" || (filter === "READY" ? item.status === "READY" : item.status === filter);
      return matchesSearch && matchesFilter;
    });
  }, [actions, filter, search]);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Actions" title="Workflow actions" description="Review the downstream steps each workflow will perform when its trigger conditions are met." count={filtered.length} search={search} setSearch={setSearch} searchPlaceholder="Search workflow, action, target" filter={filter} setFilter={setFilter} filterOptions={[{ value: "ALL", label: "All actions" }, { value: "READY", label: "Ready" }, { value: "PAUSED", label: "Paused" }]} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Workflow</th>
                <th className="px-4 py-2.5 font-semibold">Action</th>
                <th className="px-4 py-2.5 font-semibold">Target</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3 text-sm font-semibold text-ink">{item.workflowName}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.label}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.target}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.status}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{formatDate(item.updatedAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No actions match the current search or filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      <AutomationToast toast={toast} />
    </div>
  );
}

export function LiveAutomationLogsPage() {
  const { logs, toast } = useAutomationData();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((item) => term.length === 0 || item.action.toLowerCase().includes(term) || item.entityType.toLowerCase().includes(term) || JSON.stringify(item.metadataJson ?? {}).toLowerCase().includes(term));
  }, [logs, search]);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Logs" title="Automation activity log" description="Inspect the real write history for workflow tests, updates, and form-triggered automation events." count={filtered.length} search={search} setSearch={setSearch} searchPlaceholder="Search action, entity type, metadata" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Action</th>
                <th className="px-4 py-2.5 font-semibold">Entity</th>
                <th className="px-4 py-2.5 font-semibold">Reference</th>
                <th className="px-4 py-2.5 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3 text-sm font-semibold text-ink">{item.action}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.entityType}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.entityId || "N/A"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{formatDate(item.createdAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No automation logs match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      <AutomationToast toast={toast} />
    </div>
  );
}
