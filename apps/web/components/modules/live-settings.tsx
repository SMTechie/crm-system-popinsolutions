"use client";

import type { Dispatch, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, CreditCard, HardDrive, Plus, Search, Shield, UserCog, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getStoredSession, storeSession } from "@/lib/session";

type TeamMember = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

type PermissionMember = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  scope: {
    crm: string;
    accounting: string;
    hr: string;
    forms: string;
    automation: string;
    settings: string;
  };
};

type SettingsPayload = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    enabledModules: string[];
    planCode: string;
    subscriptionStatus: string;
    onboardingCompleted: boolean;
    billingEmail?: string | null;
    customDomain?: string | null;
    emailFromName?: string | null;
    emailFromAddress?: string | null;
    replyToEmail?: string | null;
    trialEndsAt?: string | null;
    subscriptionRenewsAt?: string | null;
    maxUsers: number;
    maxStorageGb: number;
    supportEmail?: string | null;
    supportPhone?: string | null;
    website?: string | null;
    addressLine1?: string | null;
    city?: string | null;
    country?: string | null;
    logoUrl?: string | null;
    timezone: string;
    currency: string;
    defaultLanguage: string;
    invoicePrefix: string;
    themeMode: string;
    requireMfa: boolean;
    allowLocalAuth: boolean;
    sessionTimeoutMinutes: number;
  };
  subscription: {
    planCode: string;
    subscriptionStatus: string;
    trialEndsAt?: string | null;
    subscriptionRenewsAt?: string | null;
    billingEmail?: string | null;
    moduleCount: number;
  };
  usage: {
    users: { used: number; limit: number };
    storage: { usedBytes: number; limitBytes: number };
    crmContacts: number;
    crmCompanies: number;
    forms: number;
    workflows: number;
    invoices: number;
    expenses: number;
  };
  security: {
    sessionMode: string;
    oauthProviders: string[];
    passwordPolicy: string;
    requireMfa: boolean;
    allowLocalAuth: boolean;
    sessionTimeoutMinutes: number;
  };
  team: TeamMember[];
  permissions: PermissionMember[];
};

type ToastState = { type: "success" | "error"; message: string } | null;

type StripeBillingConfig = {
  configured: boolean;
  publishableKey: string | null;
  plans: Array<{ code: string; priceId: string | null }>;
};

const emptyMember = { id: "", email: "", fullName: "", role: "EMPLOYEE", password: "" };

const saasModules = [
  { key: "crm", label: "CRM", description: "Contacts, companies, deals, activities, tasks, notes, pipeline" },
  { key: "accounting", label: "Accounting", description: "Quotes, invoices, expenses, payments, reports, vendors" },
  { key: "hr", label: "HR", description: "Employees, leave, payroll, attendance, reviews, documents" },
  { key: "forms", label: "Form Builder", description: "Templates, responses, public links, embedded forms" },
  { key: "automation", label: "Automation", description: "Triggers, actions, workflows, logs" },
  { key: "settings", label: "Settings", description: "Tenant admin and workspace controls" },
] as const;

const planOptions = [
  { value: "starter", label: "Starter" },
  { value: "growth", label: "Growth" },
  { value: "enterprise", label: "Enterprise" },
];

const subscriptionStatuses = ["trialing", "active", "past_due", "canceled"];

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 MB";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function updateStoredTenant(data: SettingsPayload["tenant"]) {
  const session = getStoredSession();
  if (!session) return;
  storeSession({
    ...session,
    tenantName: data.name,
    enabledModules: data.enabledModules,
  });
}

function SettingsToast({ toast }: { toast: ToastState }) {
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
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-soft"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{addLabel}</span>
            </button>
          ) : null}
        </div>
      </div>
      <div className={`mt-4 grid gap-2 ${filterOptions ? "md:grid-cols-[minmax(0,1fr)_220px]" : ""}`}>
        <label className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
          />
        </label>
        {filterOptions && filter !== undefined && setFilter ? (
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded-2xl border border-line bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500"
          >
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  );
}

function DeleteModal({
  title,
  onCancel,
  onConfirm,
  confirmLabel,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="border-b border-line px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Confirm Delete</p>
          <h3 className="mt-1 text-xl font-semibold text-ink">{title}</h3>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4">
          <button onClick={onCancel} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">
            Cancel
          </button>
          <button onClick={onConfirm} className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700">
            {confirmLabel}
          </button>
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
      <div className="mx-auto w-full max-w-4xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">{title}</h3>
          </div>
          <button onClick={onClose} className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft">
            Close
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4">
          <button onClick={onClose} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">
            Cancel
          </button>
          <button onClick={onSave} className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">
            {saveLabel}
          </button>
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

function useSettingsData() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  function notify(type: "success" | "error", message: string) {
    setToast({ type, message });
  }

  async function reload() {
    try {
      const result = await apiFetch<SettingsPayload>("/settings");
      setData(result);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to load settings.");
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

  return { data, setData, toast, notify, reload };
}

function TeamModal({
  form,
  setForm,
  onClose,
  onSave,
}: {
  form: typeof emptyMember;
  setForm: Dispatch<SetStateAction<typeof emptyMember>>;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <BaseModal label={form.id ? "Edit User" : "Add User"} title="Manage team member" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Team Member" : "Create Team Member"}>
      <div className="grid gap-3 md:grid-cols-2">
        <Input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Full name" />
        <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email address" />
        <Select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}>
          {["OWNER", "ADMIN", "SALES_MANAGER", "ACCOUNTANT", "HR_MANAGER", "AGENT", "EMPLOYEE"].map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </Select>
        <Input value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder={form.id ? "New password (optional)" : "Password (optional)"} type="password" />
      </div>
    </BaseModal>
  );
}

export function LiveSettings() {
  const { data, toast } = useSettingsData();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Workspace", data?.tenant.name ?? "Loading"],
          ["Plan", data?.subscription.planCode ?? "Loading"],
          ["Modules", String(data?.tenant.enabledModules.length ?? 0)],
          ["Status", data?.subscription.subscriptionStatus ?? "Loading"],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold text-ink">{value}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-line p-4">
            <h2 className="text-lg font-semibold text-ink">Workspace profile</h2>
            <p className="mt-1 text-xs text-slate-500">Live tenant identity, branding, SaaS plan, and operating defaults.</p>
          </div>
          <div className="space-y-2 p-4 text-sm text-slate-600">
            <p>{data ? `${data.tenant.name} • ${data.tenant.currency} • ${data.tenant.timezone}` : "Loading workspace settings..."}</p>
            <p>{data ? `${data.subscription.planCode.toUpperCase()} plan • ${data.subscription.moduleCount} enabled modules` : ""}</p>
            <p>{data ? `Trial ends: ${formatDate(data.subscription.trialEndsAt)}` : ""}</p>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-line p-4">
            <h2 className="text-lg font-semibold text-ink">Usage snapshot</h2>
            <p className="mt-1 text-xs text-slate-500">Capacity and subscription readiness across your tenant.</p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="rounded-[22px] border border-line p-3">
              <div className="flex items-center gap-2 text-slate-700">
                <Users className="h-4 w-4 text-brand-500" />
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">Users</span>
              </div>
              <p className="mt-2 text-lg font-semibold text-ink">{data ? `${data.usage.users.used} / ${data.usage.users.limit}` : "Loading"}</p>
            </div>
            <div className="rounded-[22px] border border-line p-3">
              <div className="flex items-center gap-2 text-slate-700">
                <HardDrive className="h-4 w-4 text-brand-500" />
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">Storage</span>
              </div>
              <p className="mt-2 text-lg font-semibold text-ink">
                {data ? `${formatBytes(data.usage.storage.usedBytes)} / ${formatBytes(data.usage.storage.limitBytes)}` : "Loading"}
              </p>
            </div>
            <div className="rounded-[22px] border border-line p-3">
              <div className="flex items-center gap-2 text-slate-700">
                <Boxes className="h-4 w-4 text-brand-500" />
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">CRM</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-ink">{data ? `${data.usage.crmContacts} contacts • ${data.usage.crmCompanies} companies` : "Loading"}</p>
            </div>
            <div className="rounded-[22px] border border-line p-3">
              <div className="flex items-center gap-2 text-slate-700">
                <CreditCard className="h-4 w-4 text-brand-500" />
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">Billing</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-ink">{data ? `${data.usage.invoices} invoices • ${data.usage.expenses} expenses` : "Loading"}</p>
            </div>
          </div>
        </Card>
      </div>
      <SettingsToast toast={toast} />
    </div>
  );
}

export function LiveWorkspaceSettingsPage() {
  const router = useRouter();
  const { data, setData, toast, notify } = useSettingsData();
  const [form, setForm] = useState({
    name: "",
    supportEmail: "",
    supportPhone: "",
    website: "",
    addressLine1: "",
    city: "",
    country: "",
    logoUrl: "",
    timezone: "Africa/Johannesburg",
    currency: "ZAR",
    defaultLanguage: "en",
    invoicePrefix: "INV",
    themeMode: "light",
    billingEmail: "",
    customDomain: "",
    emailFromName: "",
    emailFromAddress: "",
    replyToEmail: "",
    requireMfa: false,
    allowLocalAuth: true,
    sessionTimeoutMinutes: "480",
  });
  const [enabledModules, setEnabledModules] = useState<string[]>(["crm", "accounting", "hr", "attendance", "assets", "projects", "users", "forms", "automation", "settings"]);

  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.tenant.name,
      supportEmail: data.tenant.supportEmail ?? "",
      supportPhone: data.tenant.supportPhone ?? "",
      website: data.tenant.website ?? "",
      addressLine1: data.tenant.addressLine1 ?? "",
      city: data.tenant.city ?? "",
      country: data.tenant.country ?? "",
      logoUrl: data.tenant.logoUrl ?? "",
      timezone: data.tenant.timezone,
      currency: data.tenant.currency,
      defaultLanguage: data.tenant.defaultLanguage,
      invoicePrefix: data.tenant.invoicePrefix,
      themeMode: data.tenant.themeMode,
      billingEmail: data.tenant.billingEmail ?? "",
      customDomain: data.tenant.customDomain ?? "",
      emailFromName: data.tenant.emailFromName ?? "",
      emailFromAddress: data.tenant.emailFromAddress ?? "",
      replyToEmail: data.tenant.replyToEmail ?? "",
      requireMfa: data.tenant.requireMfa,
      allowLocalAuth: data.tenant.allowLocalAuth,
      sessionTimeoutMinutes: String(data.tenant.sessionTimeoutMinutes),
    });
    setEnabledModules(data.tenant.enabledModules);
  }, [data]);

  function toggleModule(moduleKey: string) {
    setEnabledModules((current) => {
      if (moduleKey === "settings") {
        return current.includes("settings") ? current : [...current, "settings"];
      }
      return current.includes(moduleKey) ? current.filter((item) => item !== moduleKey) : [...current, moduleKey];
    });
  }

  async function saveWorkspace() {
    try {
      const nextEnabledModules = Array.from(new Set([...enabledModules, "settings"]));
      const result = await apiFetch<{ tenant: SettingsPayload["tenant"] }>("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          enabledModules: nextEnabledModules,
          currency: form.currency.toUpperCase(),
          invoicePrefix: form.invoicePrefix.toUpperCase(),
          sessionTimeoutMinutes: Number(form.sessionTimeoutMinutes) || 480,
        }),
      });
      setData((current) =>
        current
          ? {
              ...current,
              tenant: result.tenant,
              subscription: {
                ...current.subscription,
                planCode: result.tenant.planCode,
                subscriptionStatus: result.tenant.subscriptionStatus,
                trialEndsAt: result.tenant.trialEndsAt,
                subscriptionRenewsAt: result.tenant.subscriptionRenewsAt,
                billingEmail: result.tenant.billingEmail,
                moduleCount: result.tenant.enabledModules.length,
              },
              security: {
                ...current.security,
                requireMfa: result.tenant.requireMfa,
                allowLocalAuth: result.tenant.allowLocalAuth,
                sessionTimeoutMinutes: result.tenant.sessionTimeoutMinutes,
                sessionMode: result.tenant.allowLocalAuth ? "Local auth + bearer token" : "OAuth-first bearer token",
              },
            }
          : current,
      );
      updateStoredTenant(result.tenant);
      notify("success", "Workspace settings saved successfully.");
      router.refresh();
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save workspace settings.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="grid gap-3 md:grid-cols-2">
          <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Workspace name" />
          <Input value={form.supportEmail} onChange={(event) => setForm((current) => ({ ...current, supportEmail: event.target.value }))} placeholder="Support email" />
          <Input value={form.supportPhone} onChange={(event) => setForm((current) => ({ ...current, supportPhone: event.target.value }))} placeholder="Support phone" />
          <Input value={form.website} onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))} placeholder="Website" />
          <Input value={form.billingEmail} onChange={(event) => setForm((current) => ({ ...current, billingEmail: event.target.value }))} placeholder="Billing email" />
          <Input value={form.customDomain} onChange={(event) => setForm((current) => ({ ...current, customDomain: event.target.value }))} placeholder="Custom domain" />
          <Input value={form.emailFromName} onChange={(event) => setForm((current) => ({ ...current, emailFromName: event.target.value }))} placeholder="Email from name" />
          <Input value={form.emailFromAddress} onChange={(event) => setForm((current) => ({ ...current, emailFromAddress: event.target.value }))} placeholder="Email from address" />
          <Input value={form.replyToEmail} onChange={(event) => setForm((current) => ({ ...current, replyToEmail: event.target.value }))} placeholder="Reply-to email" />
          <Input value={form.logoUrl} onChange={(event) => setForm((current) => ({ ...current, logoUrl: event.target.value }))} placeholder="Logo URL" />
          <Input value={form.addressLine1} onChange={(event) => setForm((current) => ({ ...current, addressLine1: event.target.value }))} placeholder="Address line" className="md:col-span-2" />
          <Input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} placeholder="City" />
          <Input value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} placeholder="Country" />
          <Input value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} placeholder="Timezone" />
          <Input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} placeholder="Currency" />
          <Input value={form.defaultLanguage} onChange={(event) => setForm((current) => ({ ...current, defaultLanguage: event.target.value }))} placeholder="Language" />
          <Input value={form.invoicePrefix} onChange={(event) => setForm((current) => ({ ...current, invoicePrefix: event.target.value.toUpperCase() }))} placeholder="Invoice prefix" />
          <Select value={form.themeMode} onChange={(event) => setForm((current) => ({ ...current, themeMode: event.target.value }))}>
            <option value="light">Light</option>
            <option value="system">System</option>
            <option value="dark">Dark</option>
          </Select>
          <Input value={form.sessionTimeoutMinutes} onChange={(event) => setForm((current) => ({ ...current, sessionTimeoutMinutes: event.target.value }))} placeholder="Session timeout minutes" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm text-slate-700">
            Require MFA
            <input type="checkbox" checked={form.requireMfa} onChange={(event) => setForm((current) => ({ ...current, requireMfa: event.target.checked }))} className="h-4 w-4 accent-[#365CF5]" />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm text-slate-700">
            Allow local auth
            <input type="checkbox" checked={form.allowLocalAuth} onChange={(event) => setForm((current) => ({ ...current, allowLocalAuth: event.target.checked }))} className="h-4 w-4 accent-[#365CF5]" />
          </label>
        </div>
        <div className="mt-4">
          <div className="mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Module subscriptions</p>
            <p className="mt-1 text-xs text-slate-500">Choose which modules this tenant can access. Settings stays enabled so the workspace always remains manageable.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {saasModules.map((moduleItem) => {
              const checked = enabledModules.includes(moduleItem.key);
              const locked = moduleItem.key === "settings";
              return (
                <label key={moduleItem.key} className={`rounded-[22px] border px-4 py-3 transition ${checked ? "border-brand-200 bg-brand-50/40" : "border-line bg-white"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{moduleItem.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{moduleItem.description}</p>
                    </div>
                    <input type="checkbox" checked={checked} disabled={locked} onChange={() => toggleModule(moduleItem.key)} className="mt-1 h-4 w-4 accent-[#365CF5]" />
                  </div>
                </label>
              );
            })}
          </div>
        </div>
        <button onClick={() => void saveWorkspace()} className="mt-5 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white">
          Save Workspace
        </button>
      </Card>
      <SettingsToast toast={toast} />
    </div>
  );
}

export function LiveBillingSettingsPage() {
  const { data, setData, toast, notify } = useSettingsData();
  const [stripeConfig, setStripeConfig] = useState<StripeBillingConfig | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [form, setForm] = useState({
    planCode: "enterprise",
    subscriptionStatus: "active",
    billingEmail: "",
    trialEndsAt: "",
    subscriptionRenewsAt: "",
    maxUsers: "250",
    maxStorageGb: "250",
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      planCode: data.tenant.planCode,
      subscriptionStatus: data.tenant.subscriptionStatus,
      billingEmail: data.tenant.billingEmail ?? "",
      trialEndsAt: data.tenant.trialEndsAt ? data.tenant.trialEndsAt.slice(0, 10) : "",
      subscriptionRenewsAt: data.tenant.subscriptionRenewsAt ? data.tenant.subscriptionRenewsAt.slice(0, 10) : "",
      maxUsers: String(data.tenant.maxUsers),
      maxStorageGb: String(data.tenant.maxStorageGb),
    });
  }, [data]);

  useEffect(() => {
    async function loadStripeConfig() {
      try {
        const result = await apiFetch<StripeBillingConfig>("/billing/stripe/config");
        setStripeConfig(result);
      } catch {
        setStripeConfig({
          configured: false,
          publishableKey: null,
          plans: [],
        });
      }
    }

    void loadStripeConfig();
  }, []);

  async function openStripeCheckout() {
    try {
      setStripeLoading(true);
      const result = await apiFetch<{ url?: string | null }>("/billing/stripe/checkout-session", {
        method: "POST",
        body: JSON.stringify({ planCode: form.planCode }),
      });
      if (!result.url) {
        throw new Error("Stripe checkout URL was not returned.");
      }
      window.location.href = result.url;
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to start Stripe checkout.");
    } finally {
      setStripeLoading(false);
    }
  }

  async function openBillingPortal() {
    try {
      setStripeLoading(true);
      const result = await apiFetch<{ url?: string | null }>("/billing/stripe/portal-session", {
        method: "POST",
      });
      if (!result.url) {
        throw new Error("Stripe billing portal URL was not returned.");
      }
      window.location.href = result.url;
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to open the Stripe billing portal.");
    } finally {
      setStripeLoading(false);
    }
  }

  async function syncStripe() {
    try {
      setStripeLoading(true);
      const result = await apiFetch<{ status: string; tenant: SettingsPayload["tenant"] }>("/billing/stripe/sync", {
        method: "POST",
      });
      const syncedTenant = result.tenant;
      setData((current) =>
        current
          ? {
              ...current,
              tenant: syncedTenant,
              subscription: {
                ...current.subscription,
                planCode: syncedTenant.planCode,
                subscriptionStatus: syncedTenant.subscriptionStatus,
                trialEndsAt: syncedTenant.trialEndsAt,
                subscriptionRenewsAt: syncedTenant.subscriptionRenewsAt,
                billingEmail: syncedTenant.billingEmail,
                moduleCount: syncedTenant.enabledModules.length,
              },
              usage: {
                ...current.usage,
                users: { ...current.usage.users, limit: syncedTenant.maxUsers },
                storage: { ...current.usage.storage, limitBytes: syncedTenant.maxStorageGb * 1024 * 1024 * 1024 },
              },
            }
          : current,
      );
      updateStoredTenant(syncedTenant);
      notify("success", "Stripe subscription state synced successfully.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to sync Stripe subscription data.");
    } finally {
      setStripeLoading(false);
    }
  }

  async function saveBilling() {
    try {
      const result = await apiFetch<{ tenant: SettingsPayload["tenant"] }>("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          planCode: form.planCode,
          subscriptionStatus: form.subscriptionStatus,
          billingEmail: form.billingEmail,
          trialEndsAt: form.trialEndsAt || null,
          subscriptionRenewsAt: form.subscriptionRenewsAt || null,
          maxUsers: Number(form.maxUsers) || 1,
          maxStorageGb: Number(form.maxStorageGb) || 1,
        }),
      });
      setData((current) =>
        current
          ? {
              ...current,
              tenant: result.tenant,
              subscription: {
                ...current.subscription,
                planCode: result.tenant.planCode,
                subscriptionStatus: result.tenant.subscriptionStatus,
                trialEndsAt: result.tenant.trialEndsAt,
                subscriptionRenewsAt: result.tenant.subscriptionRenewsAt,
                billingEmail: result.tenant.billingEmail,
                moduleCount: result.tenant.enabledModules.length,
              },
              usage: {
                ...current.usage,
                users: { ...current.usage.users, limit: result.tenant.maxUsers },
                storage: { ...current.usage.storage, limitBytes: result.tenant.maxStorageGb * 1024 * 1024 * 1024 },
              },
            }
          : current,
      );
      updateStoredTenant(result.tenant);
      notify("success", "Subscription settings saved successfully.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save subscription settings.");
    }
  }

  const storagePercent = data ? Math.min(100, (data.usage.storage.usedBytes / Math.max(data.usage.storage.limitBytes, 1)) * 100) : 0;
  const userPercent = data ? Math.min(100, (data.usage.users.used / Math.max(data.usage.users.limit, 1)) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <div className={`rounded-[24px] border p-4 ${stripeConfig?.configured ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Stripe commerce</p>
              <p className="mt-2 text-sm font-semibold text-ink">{stripeConfig?.configured ? "Stripe is connected for hosted checkout and portal billing." : "Stripe is not configured yet in the API environment."}</p>
              <p className="mt-1 text-xs text-slate-500">
                {stripeConfig?.configured
                  ? "Tenant admins can move from trial to paid plans using Stripe-hosted billing flows."
                  : "Set STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, and all monthly price IDs to activate billing."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => void openStripeCheckout()}
                  disabled={!stripeConfig?.configured || stripeLoading}
                  className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {stripeLoading ? "Working..." : "Upgrade With Stripe"}
                </button>
                <button
                  onClick={() => void openBillingPortal()}
                  disabled={!stripeConfig?.configured || stripeLoading}
                  className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Open Billing Portal
                </button>
                <button
                  onClick={() => void syncStripe()}
                  disabled={!stripeConfig?.configured || stripeLoading}
                  className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Sync Stripe Status
                </button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Select value={form.planCode} onChange={(event) => setForm((current) => ({ ...current, planCode: event.target.value }))}>
                {planOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Select value={form.subscriptionStatus} onChange={(event) => setForm((current) => ({ ...current, subscriptionStatus: event.target.value }))}>
                {subscriptionStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
              <Input value={form.billingEmail} onChange={(event) => setForm((current) => ({ ...current, billingEmail: event.target.value }))} placeholder="Billing email" />
              <Input type="date" value={form.trialEndsAt} onChange={(event) => setForm((current) => ({ ...current, trialEndsAt: event.target.value }))} />
              <Input type="date" value={form.subscriptionRenewsAt} onChange={(event) => setForm((current) => ({ ...current, subscriptionRenewsAt: event.target.value }))} />
              <Input value={form.maxUsers} onChange={(event) => setForm((current) => ({ ...current, maxUsers: event.target.value }))} placeholder="Max users" />
              <Input value={form.maxStorageGb} onChange={(event) => setForm((current) => ({ ...current, maxStorageGb: event.target.value }))} placeholder="Max storage GB" />
            </div>
            <button onClick={() => void saveBilling()} className="rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white">
              Save Subscription
            </button>
          </div>
          <div className="space-y-3">
            <div className="rounded-[24px] border border-line p-4">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-brand-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">Seat usage</p>
                  <p className="mt-1 text-xs text-slate-500">{data ? `${data.usage.users.used} of ${data.usage.users.limit} users` : "Loading..."}</p>
                </div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-brand-500" style={{ width: `${userPercent}%` }} />
              </div>
            </div>
            <div className="rounded-[24px] border border-line p-4">
              <div className="flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-brand-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">Storage usage</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {data ? `${formatBytes(data.usage.storage.usedBytes)} of ${formatBytes(data.usage.storage.limitBytes)}` : "Loading..."}
                  </p>
                </div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${storagePercent}%` }} />
              </div>
            </div>
            <div className="rounded-[24px] border border-line p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Operational usage</p>
              <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <p>{data ? `${data.usage.crmContacts} CRM contacts` : "Loading..."}</p>
                <p>{data ? `${data.usage.crmCompanies} CRM companies` : "Loading..."}</p>
                <p>{data ? `${data.usage.forms} forms` : "Loading..."}</p>
                <p>{data ? `${data.usage.workflows} workflows` : "Loading..."}</p>
                <p>{data ? `${data.usage.invoices} invoices` : "Loading..."}</p>
                <p>{data ? `${data.usage.expenses} expenses` : "Loading..."}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>
      <SettingsToast toast={toast} />
    </div>
  );
}

export function LiveTeamSettingsPage() {
  const { data, setData, toast, notify } = useSettingsData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [memberForm, setMemberForm] = useState(emptyMember);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.team ?? []).filter((member) => {
      const matchesSearch =
        term.length === 0 ||
        member.fullName.toLowerCase().includes(term) ||
        member.email.toLowerCase().includes(term) ||
        member.role.toLowerCase().includes(term);
      const matchesFilter = filter === "ALL" || member.role === filter;
      return matchesSearch && matchesFilter;
    });
  }, [data?.team, filter, search]);

  async function saveMember() {
    try {
      if (memberForm.id) {
        const result = await apiFetch<{ item: TeamMember }>(`/settings/team/${memberForm.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            email: memberForm.email || undefined,
            fullName: memberForm.fullName || undefined,
            role: memberForm.role,
            password: memberForm.password || undefined,
          }),
        });
        setData((current) => (current ? { ...current, team: current.team.map((member) => (member.id === result.item.id ? result.item : member)) } : current));
        notify("success", "Team member updated successfully.");
      } else {
        const result = await apiFetch<{ item: TeamMember; generatedPassword?: string | null }>("/settings/team", {
          method: "POST",
          body: JSON.stringify({
            email: memberForm.email || undefined,
            fullName: memberForm.fullName || undefined,
            role: memberForm.role,
            password: memberForm.password || undefined,
          }),
        });
        setData((current) => (current ? { ...current, team: [...current.team, result.item] } : current));
        notify("success", result.generatedPassword ? `Team member created. Generated password: ${result.generatedPassword}` : "Team member created successfully.");
      }
      setShowForm(false);
      setMemberForm(emptyMember);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save team member.");
    }
  }

  async function deleteMember(userId: string) {
    try {
      await apiFetch(`/settings/team/${userId}`, { method: "DELETE" });
      setData((current) =>
        current
          ? {
              ...current,
              team: current.team.filter((member) => member.id !== userId),
              permissions: current.permissions.filter((member) => member.id !== userId),
            }
          : current,
      );
      setPendingDelete(null);
      notify("success", "Team member deleted successfully.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete team member.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader
          label="Team Access"
          title="Users and roles"
          description="Create, edit, filter, and remove live team accounts from the tenant workspace."
          count={filtered.length}
          addLabel="Add user"
          onAdd={() => {
            setMemberForm(emptyMember);
            setShowForm(true);
          }}
          search={search}
          setSearch={setSearch}
          searchPlaceholder="Search name, email, role"
          filter={filter}
          setFilter={setFilter}
          filterOptions={[{ value: "ALL", label: "All roles" }, ...Array.from(new Set((data?.team ?? []).map((member) => member.role))).map((role) => ({ value: role, label: role }))]}
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">User</th>
                <th className="px-4 py-2.5 font-semibold">Role</th>
                <th className="px-4 py-2.5 font-semibold">Created</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => (
                <tr key={member.id} className="border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{member.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{member.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{member.role}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{new Date(member.createdAt).toLocaleDateString("en-ZA")}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setMemberForm({ id: member.id, email: member.email, fullName: member.fullName, role: member.role, password: "" });
                          setShowForm(true);
                        }}
                        className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft"
                      >
                        Edit
                      </button>
                      <button onClick={() => setPendingDelete(member.id)} className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    No users match the current search or filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <TeamModal form={memberForm} setForm={setMemberForm} onClose={() => setShowForm(false)} onSave={() => void saveMember()} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this team member?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteMember(pendingDelete)} confirmLabel="Delete User" /> : null}
      <SettingsToast toast={toast} />
    </div>
  );
}

export function LiveSecuritySettingsPage() {
  const { data, setData, toast, notify } = useSettingsData();
  const [requireMfa, setRequireMfa] = useState(false);
  const [allowLocalAuth, setAllowLocalAuth] = useState(true);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState("480");
  const [themeMode, setThemeMode] = useState("light");

  useEffect(() => {
    if (!data) return;
    setRequireMfa(data.security.requireMfa);
    setAllowLocalAuth(data.security.allowLocalAuth);
    setSessionTimeoutMinutes(String(data.security.sessionTimeoutMinutes));
    setThemeMode(data.tenant.themeMode);
  }, [data]);

  async function saveSecurity() {
    try {
      const result = await apiFetch<{ tenant: SettingsPayload["tenant"] }>("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          requireMfa,
          allowLocalAuth,
          sessionTimeoutMinutes: Number(sessionTimeoutMinutes) || 480,
          themeMode,
        }),
      });
      setData((current) =>
        current
          ? {
              ...current,
              tenant: result.tenant,
              security: {
                ...current.security,
                requireMfa: result.tenant.requireMfa,
                allowLocalAuth: result.tenant.allowLocalAuth,
                sessionTimeoutMinutes: result.tenant.sessionTimeoutMinutes,
                sessionMode: result.tenant.allowLocalAuth ? "Local auth + bearer token" : "OAuth-first bearer token",
              },
            }
          : current,
      );
      updateStoredTenant(result.tenant);
      notify("success", "Security settings saved successfully.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save security settings.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-line p-4">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-brand-500" />
              <div>
                <p className="text-sm font-semibold text-ink">Session Mode</p>
                <p className="text-xs text-slate-500">{data?.security.sessionMode ?? "Loading..."}</p>
              </div>
            </div>
          </div>
          <div className="rounded-[24px] border border-line p-4">
            <div className="flex items-center gap-3">
              <UserCog className="h-5 w-5 text-brand-500" />
              <div>
                <p className="text-sm font-semibold text-ink">OAuth Providers</p>
                <p className="text-xs text-slate-500">{data?.security.oauthProviders.join(", ") ?? "Loading..."}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          <label className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm text-slate-700">
            Require multi-factor authentication
            <input type="checkbox" checked={requireMfa} onChange={(event) => setRequireMfa(event.target.checked)} className="h-4 w-4 accent-[#365CF5]" />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm text-slate-700">
            Allow local email/password auth
            <input type="checkbox" checked={allowLocalAuth} onChange={(event) => setAllowLocalAuth(event.target.checked)} className="h-4 w-4 accent-[#365CF5]" />
          </label>
          <Input value={sessionTimeoutMinutes} onChange={(event) => setSessionTimeoutMinutes(event.target.value)} placeholder="Session timeout minutes" />
          <Select value={themeMode} onChange={(event) => setThemeMode(event.target.value)}>
            <option value="light">Light</option>
            <option value="system">System</option>
            <option value="dark">Dark</option>
          </Select>
        </div>
        <div className="mt-4 rounded-[24px] border border-line bg-soft/50 p-4">
          <p className="text-sm font-semibold text-ink">Password Policy</p>
          <p className="mt-1 text-xs text-slate-500">{data?.security.passwordPolicy ?? "Loading..."}</p>
        </div>
        <button onClick={() => void saveSecurity()} className="mt-5 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white">
          Save Security
        </button>
      </Card>
      <SettingsToast toast={toast} />
    </div>
  );
}

export function LivePermissionsSettingsPage() {
  const { data, toast } = useSettingsData();
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.permissions ?? []).filter(
      (member) =>
        term.length === 0 ||
        member.fullName.toLowerCase().includes(term) ||
        member.email.toLowerCase().includes(term) ||
        member.role.toLowerCase().includes(term),
    );
  }, [data?.permissions, search]);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader
          label="Permissions"
          title="Role access matrix"
          description="Review module-level access implied by each team member role across CRM, accounting, HR, forms, automation, and settings."
          count={filtered.length}
          search={search}
          setSearch={setSearch}
          searchPlaceholder="Search name, email, role"
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">User</th>
                <th className="px-4 py-2.5 font-semibold">Role</th>
                <th className="px-4 py-2.5 font-semibold">CRM</th>
                <th className="px-4 py-2.5 font-semibold">Accounting</th>
                <th className="px-4 py-2.5 font-semibold">HR</th>
                <th className="px-4 py-2.5 font-semibold">Forms</th>
                <th className="px-4 py-2.5 font-semibold">Automation</th>
                <th className="px-4 py-2.5 font-semibold">Settings</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => (
                <tr key={member.id} className="border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{member.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{member.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{member.role}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{member.scope.crm}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{member.scope.accounting}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{member.scope.hr}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{member.scope.forms}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{member.scope.automation}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{member.scope.settings}</td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                    No permission rows match the current search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      <SettingsToast toast={toast} />
    </div>
  );
}
