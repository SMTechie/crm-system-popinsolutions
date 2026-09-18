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
    attendance: string;
    assets: string;
    users: string;
    settings: string;
  };
};

type PermissionDefinition = { id: string; key: string; description?: string | null };
type PermissionRole = { id: string; name: string; description?: string | null; permissionKeys: string[] };
type OfficeLocation = { id: string; name: string; address?: string | null; latitude: number; longitude: number; radiusMeters: number; active: boolean };

const permissionModules = [
  { key: "crm", label: "CRM" },
  { key: "accounting", label: "Accounting" },
  { key: "hr", label: "HR" },
  { key: "attendance", label: "Attendance" },
  { key: "assets", label: "Assets" },
  { key: "users", label: "Users" },
  { key: "settings", label: "Settings" },
] as const;

type PermissionModuleKey = (typeof permissionModules)[number]["key"];

function permissionTone(level: string) {
  if (level === "Full") return "bg-emerald-50 text-emerald-700";
  if (level === "Edit") return "bg-blue-50 text-blue-700";
  if (level === "Read" || level === "Self") return "bg-slate-100 text-slate-700";
  return "bg-slate-50 text-slate-400";
}

function PermissionPill({ level }: { level: string }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${permissionTone(level)}`}>{level}</span>;
}

function PermissionDetailModal({ member, onClose }: { member: PermissionMember; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.2)]">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Permission profile</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">{member.fullName}</h3>
            <p className="mt-1 text-sm text-slate-500">{member.email} · {member.role}</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-soft">Close</button>
        </div>
        <div className="p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {permissionModules.map((module) => {
              const level = member.scope[module.key as PermissionModuleKey];
              return <div key={module.key} className="flex items-center justify-between rounded-2xl border border-line bg-slate-50/60 px-4 py-3"><span className="text-sm font-medium text-slate-700">{module.label}</span><PermissionPill level={level} /></div>;
            })}
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
            Full includes administration, Edit allows changes, Read is view-only, Self is limited to the user&apos;s own records, and None removes access.
          </div>
        </div>
      </div>
    </div>
  );
}

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
    oauthProviders: Array<{ name: string; key: string; configured: boolean }>;
    oauthRedirectUri: string;
    passwordPolicy: string;
    requireMfa: boolean;
    allowLocalAuth: boolean;
    sessionTimeoutMinutes: number;
  };
  team: TeamMember[];
  permissions: PermissionMember[];
  officeLocations: OfficeLocation[];
};

type ToastState = { type: "success" | "error"; message: string } | null;

type PaymentBillingConfig = {
  providers: Array<{ provider: "yoco" | "ikhokha"; name: string; configured: boolean }>;
  plans: Array<{ code: string; amountCents: number }>;
};

const emptyMember = { id: "", email: "", fullName: "", role: "EMPLOYEE", password: "" };

const saasModules = [
  { key: "crm", label: "CRM", description: "Contacts, companies, deals, activities, tasks, notes, pipeline" },
  { key: "accounting", label: "Accounting", description: "Quotes, invoices, expenses, payments, reports, vendors" },
  { key: "hr", label: "HR", description: "Employees, leave, payroll, attendance, reviews, documents" },
  { key: "attendance", label: "Attendance", description: "Clock-in, clock-out, location, QR access, and attendance reporting" },
  { key: "assets", label: "Assets", description: "IT equipment, inventory, assignments, maintenance, and QR identification" },
  { key: "users", label: "Users", description: "Team access, employee login linking, roles, and account management" },
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
          {["OWNER", "ADMIN", "SALES_MANAGER", "ACCOUNTANT", "HR_MANAGER", "PROJECT_MANAGER", "IT_MANAGER", "AGENT", "EMPLOYEE", "VIEWER"].map((role) => (
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
  const [enabledModules, setEnabledModules] = useState<string[]>(["crm", "accounting", "hr", "attendance", "assets", "users", "settings"]);
  const [logoUploading, setLogoUploading] = useState(false);
  const [officeForm, setOfficeForm] = useState({ name: "", address: "", latitude: "", longitude: "", radiusMeters: "150" });
  const [officeLocations, setOfficeLocations] = useState<OfficeLocation[]>([]);

  useEffect(() => {
    if (Array.isArray(data?.officeLocations)) setOfficeLocations(data.officeLocations);
  }, [data?.officeLocations]);

  useEffect(() => {
    void apiFetch<{ items: OfficeLocation[] }>("/settings/office-locations")
      .then((result) => {
        setOfficeLocations(result.items);
        setData((current) => current ? { ...current, officeLocations: result.items } : current);
      })
      .catch(() => undefined);
  }, []);

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

  async function uploadLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("error", "Please choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify("error", "Logo files must be smaller than 2 MB.");
      return;
    }

    try {
      setLogoUploading(true);
      const payload = new FormData();
      payload.append("logo", file);
      const result = await apiFetch<{ logoUrl: string }>("/settings/logo", { method: "POST", body: payload });
      setForm((current) => ({ ...current, logoUrl: result.logoUrl }));
      notify("success", "Logo uploaded successfully.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Logo upload failed.");
    } finally {
      setLogoUploading(false);
      event.target.value = "";
    }
  }

  async function addOfficeLocation() {
    try {
      if (!officeForm.name.trim() || !officeForm.latitude.trim() || !officeForm.longitude.trim()) {
        notify("error", "Office name, latitude, and longitude are required.");
        return;
      }
      if (!Number.isFinite(Number(officeForm.latitude)) || !Number.isFinite(Number(officeForm.longitude))) {
        notify("error", "Latitude and longitude must be valid numbers.");
        return;
      }
      const result = await apiFetch<{ item: OfficeLocation }>("/settings/office-locations", { method: "POST", body: JSON.stringify({ ...officeForm, latitude: Number(officeForm.latitude), longitude: Number(officeForm.longitude), radiusMeters: Number(officeForm.radiusMeters) }) });
      setOfficeLocations((current) => [...current, result.item].sort((a, b) => a.name.localeCompare(b.name)));
      setData((current) => current ? { ...current, officeLocations: [...(current.officeLocations ?? []), result.item].sort((a, b) => a.name.localeCompare(b.name)) } : current);
      setOfficeForm({ name: "", address: "", latitude: "", longitude: "", radiusMeters: "150" });
      notify("success", "Office location added.");
    } catch (error) { notify("error", error instanceof Error ? error.message : "Unable to add office location."); }
  }

  async function deactivateOffice(office: OfficeLocation) {
    try { await apiFetch(`/settings/office-locations/${office.id}`, { method: "DELETE" }); setOfficeLocations((current) => current.map((item) => item.id === office.id ? { ...item, active: false } : item)); setData((current) => current ? { ...current, officeLocations: (current.officeLocations ?? []).map((item) => item.id === office.id ? { ...item, active: false } : item) } : current); notify("success", `${office.name} was deactivated.`); }
    catch (error) { notify("error", error instanceof Error ? error.message : "Unable to deactivate office location."); }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-line bg-gradient-to-r from-slate-50 via-white to-brand-50/40 px-6 py-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Workspace configuration</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-ink">Workspace identity and defaults</h2>
              <p className="mt-1 text-sm text-slate-500">Manage the details your team sees across the platform.</p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-white text-sm font-semibold text-brand-600 shadow-sm">
              {form.logoUrl ? <img src={form.logoUrl} alt="Workspace logo preview" className="h-full w-full object-cover" /> : "POP"}
            </div>
          </div>
        </div>
        <div className="p-6">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">General information</h3>
          <p className="mt-1 text-xs text-slate-500">Set the workspace name, contact details, and public identity.</p>
        </div>
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
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-slate-50/50 px-3 py-2">
            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white text-[10px] font-semibold text-brand-600">
              {form.logoUrl ? <img src={form.logoUrl} alt="Current workspace logo" className="h-full w-full object-cover" /> : "LOGO"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink">Workspace logo</p>
              <p className="truncate text-[11px] text-slate-500">PNG, JPG, SVG or WEBP · max 2 MB</p>
            </div>
            <label className="cursor-pointer rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600">
              {logoUploading ? "Uploading..." : "Upload"}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={uploadLogo} disabled={logoUploading} className="sr-only" />
            </label>
          </div>
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
        <div className="mt-6 mb-3">
          <h3 className="text-sm font-semibold text-ink">Security and access</h3>
          <p className="mt-1 text-xs text-slate-500">Control authentication requirements and session behaviour.</p>
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
        <div className="mt-6 border-t border-line pt-6">
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
        <div className="mt-6 border-t border-line pt-6">
          <div className="mb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Office locations</p><p className="mt-1 text-xs text-slate-500">Employees can only clock in or out inside the radius of their assigned active office.</p></div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5"><label className="grid gap-1 text-xs font-semibold text-slate-600"><span>Office name</span><Input value={officeForm.name} onChange={(event) => setOfficeForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Johannesburg HQ" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600"><span>Address (optional)</span><Input value={officeForm.address} onChange={(event) => setOfficeForm((current) => ({ ...current, address: event.target.value }))} placeholder="Street or area" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600"><span>Latitude</span><Input type="number" step="any" value={officeForm.latitude} onChange={(event) => setOfficeForm((current) => ({ ...current, latitude: event.target.value }))} placeholder="e.g. -26.2041" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600"><span>Longitude</span><Input type="number" step="any" value={officeForm.longitude} onChange={(event) => setOfficeForm((current) => ({ ...current, longitude: event.target.value }))} placeholder="e.g. 28.0473" /></label><div className="flex items-end gap-2"><label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold text-slate-600"><span>Clock-in radius (metres)</span><Input type="number" min="25" max="5000" value={officeForm.radiusMeters} onChange={(event) => setOfficeForm((current) => ({ ...current, radiusMeters: event.target.value }))} /></label><button type="button" onClick={() => void addOfficeLocation()} className="mb-0.5 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white">Add</button></div></div>
          <div className="mt-3 space-y-2">{officeLocations.filter((office) => office.active).map((office) => <div key={office.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-slate-50/70 px-4 py-3 text-sm"><div><p className="font-semibold text-ink">{office.name} <span className="font-normal text-slate-500">· {office.radiusMeters}m radius</span></p><p className="text-xs text-slate-500">{office.address || `${office.latitude}, ${office.longitude}`}</p></div><button type="button" onClick={() => void deactivateOffice(office)} className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600">Deactivate</button></div>)}{officeLocations.filter((office) => office.active).length === 0 ? <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-xs text-slate-500">No office locations have been added yet.</p> : null}</div>
        </div>
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-5">
          <p className="hidden text-xs text-slate-500 sm:block">Changes apply across the workspace after saving.</p>
        <button onClick={() => void saveWorkspace()} className="rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(54,92,245,0.2)] transition hover:bg-brand-600">
          Save Workspace
        </button>
        </div>
        </div>
      </Card>
      <SettingsToast toast={toast} />
    </div>
  );
}

export function LiveBillingSettingsPage() {
  const { data, setData, toast, notify } = useSettingsData();
  const [paymentConfig, setPaymentConfig] = useState<PaymentBillingConfig | null>(null);
  const [paymentLoading, setPaymentLoading] = useState<"yoco" | "ikhokha" | null>(null);
  const [savingBilling, setSavingBilling] = useState(false);
  const [selectedPaymentProvider, setSelectedPaymentProvider] = useState<"yoco" | "ikhokha" | null>(null);
  const [savingPaymentProvider, setSavingPaymentProvider] = useState(false);
  const [paymentProviderForm, setPaymentProviderForm] = useState({ secretKey: "", publicKey: "", appId: "", appSecret: "", entityId: "", starterCents: "", growthCents: "", enterpriseCents: "" });
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
    async function loadPaymentConfig() {
      try {
        const result = await apiFetch<PaymentBillingConfig>("/billing/config");
        setPaymentConfig(result);
      } catch {
        setPaymentConfig({ providers: [], plans: [] });
      }
    }

    void loadPaymentConfig();
  }, []);

  async function openPaymentCheckout(provider: "yoco" | "ikhokha") {
    try {
      setPaymentLoading(provider);
      const result = await apiFetch<{ url?: string | null }>(`/billing/${provider}/checkout`, {
        method: "POST",
        body: JSON.stringify({ planCode: form.planCode }),
      });
      if (!result.url) {
        throw new Error(`${provider} checkout URL was not returned.`);
      }
      window.location.href = result.url;
    } catch (error) {
      notify("error", error instanceof Error ? error.message : `Failed to start ${provider} checkout.`);
    } finally {
      setPaymentLoading(null);
    }
  }

  async function savePaymentProvider() {
    if (!selectedPaymentProvider) return;
    try {
      setSavingPaymentProvider(true);
      await apiFetch(`/settings/payment/${selectedPaymentProvider}`, { method: "POST", body: JSON.stringify(paymentProviderForm) });
      const result = await apiFetch<PaymentBillingConfig>("/billing/config");
      setPaymentConfig(result);
      setPaymentProviderForm({ secretKey: "", publicKey: "", appId: "", appSecret: "", entityId: "", starterCents: "", growthCents: "", enterpriseCents: "" });
      notify("success", `${selectedPaymentProvider === "yoco" ? "Yoco" : "iKhokha"} is configured and ready to test.`);
    } catch (error) { notify("error", error instanceof Error ? error.message : "Failed to configure payment provider."); }
    finally { setSavingPaymentProvider(false); }
  }

  async function saveBilling() {
    const maxUsers = Number(form.maxUsers);
    const maxStorageGb = Number(form.maxStorageGb);
    if (!Number.isInteger(maxUsers) || maxUsers < 1 || maxUsers > 100000) {
      notify("error", "Maximum users must be a whole number between 1 and 100,000.");
      return;
    }
    if (!Number.isInteger(maxStorageGb) || maxStorageGb < 1 || maxStorageGb > 100000) {
      notify("error", "Storage limit must be a whole number between 1 and 100,000 GB.");
      return;
    }
    if (form.billingEmail && !/^\S+@\S+\.\S+$/.test(form.billingEmail.trim())) {
      notify("error", "Enter a valid billing email address.");
      return;
    }
    try {
      setSavingBilling(true);
      const result = await apiFetch<{ tenant: SettingsPayload["tenant"] }>("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          planCode: form.planCode,
          subscriptionStatus: form.subscriptionStatus,
          billingEmail: form.billingEmail,
          trialEndsAt: form.trialEndsAt || null,
          subscriptionRenewsAt: form.subscriptionRenewsAt || null,
          maxUsers,
          maxStorageGb,
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
    } finally {
      setSavingBilling(false);
    }
  }

  const storagePercent = data ? Math.min(100, (data.usage.storage.usedBytes / Math.max(data.usage.storage.limitBytes, 1)) * 100) : 0;
  const userPercent = data ? Math.min(100, (data.usage.users.used / Math.max(data.usage.users.limit, 1)) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <div className="rounded-[24px] border border-line bg-soft/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Payment gateways</p>
              <p className="mt-2 text-sm font-semibold text-ink">Choose a South African payment provider for hosted checkout.</p>
              <p className="mt-1 text-xs text-slate-500">Monthly plan amounts are configured in cents on the API server. The checkout button stays disabled until the provider and plan amounts are ready.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(["yoco", "ikhokha"] as const).map((provider) => {
                  const config = paymentConfig?.providers.find((item) => item.provider === provider);
                  const ready = Boolean(config?.configured && paymentConfig?.plans.every((plan) => plan.amountCents >= 100));
                  const name = provider === "yoco" ? "Yoco" : "iKhokha";
                  return (
                    <div key={provider} className={`rounded-2xl border p-3 ${selectedPaymentProvider === provider ? "border-brand-400 ring-2 ring-brand-100" : ""} ${ready ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}>
                      <button type="button" onClick={() => setSelectedPaymentProvider(provider)} className="w-full text-left"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-ink">{name}</span><span className={`text-[11px] font-semibold ${ready ? "text-emerald-700" : "text-amber-700"}`}>{ready ? "Ready" : "Setup required"}</span></div></button>
                      <p className="mt-1 text-xs text-slate-500">{provider === "yoco" ? "Hosted Yoco Checkout" : "iK Pay payment links"}</p>
                      <button onClick={() => void openPaymentCheckout(provider)} disabled={!ready || paymentLoading !== null} className="mt-3 w-full rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{paymentLoading === provider ? "Opening..." : `Pay with ${name}`}</button>
                    </div>
                  );
                })}
              </div>
              {selectedPaymentProvider ? <div className="mt-3 rounded-2xl border border-brand-100 bg-white p-4">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-ink">Set up {selectedPaymentProvider === "yoco" ? "Yoco" : "iKhokha"}</p><button type="button" onClick={() => setSelectedPaymentProvider(null)} className="text-xs font-semibold text-slate-500 hover:text-brand-500">Close</button></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {selectedPaymentProvider === "yoco" ? <><label className="grid gap-1 text-xs font-semibold text-slate-500">Yoco secret key<Input type="password" autoComplete="new-password" value={paymentProviderForm.secretKey} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, secretKey: event.target.value }))} placeholder="sk_live_..." /></label><label className="grid gap-1 text-xs font-semibold text-slate-500">Yoco public key (optional)<Input value={paymentProviderForm.publicKey} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, publicKey: event.target.value }))} placeholder="pk_live_..." /></label></> : <><label className="grid gap-1 text-xs font-semibold text-slate-500">iKhokha App ID<Input value={paymentProviderForm.appId} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, appId: event.target.value }))} /></label><label className="grid gap-1 text-xs font-semibold text-slate-500">iKhokha App Secret<Input type="password" autoComplete="new-password" value={paymentProviderForm.appSecret} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, appSecret: event.target.value }))} /></label><label className="grid gap-1 text-xs font-semibold text-slate-500">Entity ID (optional)<Input value={paymentProviderForm.entityId} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, entityId: event.target.value }))} /></label></>}
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">Starter monthly price (cents)<Input type="number" min={100} value={paymentProviderForm.starterCents} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, starterCents: event.target.value }))} placeholder="e.g. 9900" /></label><label className="grid gap-1 text-xs font-semibold text-slate-500">Growth monthly price (cents)<Input type="number" min={100} value={paymentProviderForm.growthCents} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, growthCents: event.target.value }))} placeholder="e.g. 19900" /></label><label className="grid gap-1 text-xs font-semibold text-slate-500">Enterprise monthly price (cents)<Input type="number" min={100} value={paymentProviderForm.enterpriseCents} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, enterpriseCents: event.target.value }))} placeholder="e.g. 39900" /></label>
                </div>
                <button type="button" onClick={() => void savePaymentProvider()} disabled={savingPaymentProvider} className="mt-3 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{savingPaymentProvider ? "Saving..." : `Save ${selectedPaymentProvider === "yoco" ? "Yoco" : "iKhokha"} configuration`}</button>
              </div> : null}
              <p className="mt-3 text-xs text-slate-500">Set <code>YOCO_SECRET_KEY</code> or <code>IKHOKHA_APP_ID</code> + <code>IKHOKHA_APP_SECRET</code>, plus the three <code>PAYMENT_PRICE_*_MONTHLY_CENTS</code> values, in <code>apps/api/.env</code>.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-500" htmlFor="billing-plan">Subscription plan<Select id="billing-plan" value={form.planCode} onChange={(event) => setForm((current) => ({ ...current, planCode: event.target.value }))}>{planOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500" htmlFor="billing-status">Subscription status<Select id="billing-status" value={form.subscriptionStatus} onChange={(event) => setForm((current) => ({ ...current, subscriptionStatus: event.target.value }))}>{subscriptionStatuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</Select></label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500" htmlFor="billing-email">Billing email<Input id="billing-email" type="email" value={form.billingEmail} onChange={(event) => setForm((current) => ({ ...current, billingEmail: event.target.value }))} placeholder="billing@example.com" /></label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500" htmlFor="trial-end">Trial end date<Input id="trial-end" type="date" value={form.trialEndsAt} onChange={(event) => setForm((current) => ({ ...current, trialEndsAt: event.target.value }))} /></label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500" htmlFor="renewal-date">Next renewal date<Input id="renewal-date" type="date" value={form.subscriptionRenewsAt} onChange={(event) => setForm((current) => ({ ...current, subscriptionRenewsAt: event.target.value }))} /></label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500" htmlFor="max-users">Maximum users<Input id="max-users" type="number" min={1} max={100000} step={1} value={form.maxUsers} onChange={(event) => setForm((current) => ({ ...current, maxUsers: event.target.value }))} /></label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500" htmlFor="max-storage">Storage limit (GB)<Input id="max-storage" type="number" min={1} max={100000} step={1} value={form.maxStorageGb} onChange={(event) => setForm((current) => ({ ...current, maxStorageGb: event.target.value }))} /></label>
            </div>
            <button disabled={!data || savingBilling} onClick={() => void saveBilling()} className="rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
              {savingBilling ? "Saving..." : "Save Subscription"}
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
  const { data, setData, toast, notify, reload } = useSettingsData();
  const [requireMfa, setRequireMfa] = useState(false);
  const [allowLocalAuth, setAllowLocalAuth] = useState(true);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState("480");
  const [themeMode, setThemeMode] = useState("light");
  const [sessionMode, setSessionMode] = useState<"password" | "oauth" | "hybrid">("password");
  const [saving, setSaving] = useState(false);
  const [providerForm, setProviderForm] = useState({ googleClientId: "", googleClientSecret: "", microsoftClientId: "", microsoftClientSecret: "" });
  const [savingProvider, setSavingProvider] = useState<"google" | "microsoft" | null>(null);

  useEffect(() => {
    if (!data) return;
    setRequireMfa(data.security.requireMfa);
    setAllowLocalAuth(data.security.allowLocalAuth);
    setSessionMode(data.security.allowLocalAuth ? "password" : "oauth");
    setSessionTimeoutMinutes(String(data.security.sessionTimeoutMinutes));
    setThemeMode(data.tenant.themeMode);
  }, [data]);

  async function saveSecurity() {
    const timeout = Number(sessionTimeoutMinutes);
    if (!Number.isInteger(timeout) || timeout < 5 || timeout > 10080) {
      notify("error", "Session timeout must be a whole number between 5 and 10,080 minutes.");
      return;
    }

    try {
      setSaving(true);
      const result = await apiFetch<{ tenant: SettingsPayload["tenant"] }>("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          requireMfa,
          allowLocalAuth: sessionMode !== "oauth",
          sessionTimeoutMinutes: timeout,
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
                sessionMode: result.tenant.allowLocalAuth ? "Password + OAuth bearer token" : "OAuth-only bearer token",
              },
            }
          : current,
      );
      updateStoredTenant(result.tenant);
      document.documentElement.dataset.theme = result.tenant.themeMode === "dark" ? "dark" : "light";
      window.localStorage.setItem("popin-theme", result.tenant.themeMode);
      notify("success", "Security settings saved successfully.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save security settings.");
    } finally {
      setSaving(false);
    }
  }

  async function saveOAuthProvider(provider: "google" | "microsoft") {
    const clientId = provider === "google" ? providerForm.googleClientId : providerForm.microsoftClientId;
    const clientSecret = provider === "google" ? providerForm.googleClientSecret : providerForm.microsoftClientSecret;
    if (!clientId.trim() || !clientSecret.trim()) { notify("error", `Enter the ${provider === "google" ? "Google" : "Microsoft"} client ID and client secret.`); return; }
    try {
      setSavingProvider(provider);
      await apiFetch(`/settings/oauth/${provider}`, { method: "POST", body: JSON.stringify({ clientId, clientSecret, enabled: true }) });
      setProviderForm((current) => provider === "google" ? { ...current, googleClientId: "", googleClientSecret: "" } : { ...current, microsoftClientId: "", microsoftClientSecret: "" });
      await reload();
      notify("success", `${provider === "google" ? "Google" : "Microsoft"} OAuth is configured.`);
    } catch (error) { notify("error", error instanceof Error ? error.message : "Failed to configure OAuth provider."); }
    finally { setSavingProvider(null); }
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
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {data?.security.oauthProviders.map((provider) => (
                    <span key={provider.key} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${provider.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {provider.name}: {provider.configured ? "Ready" : "Not configured"}
                    </span>
                  )) ?? <span className="text-xs text-slate-500">Loading...</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-500" htmlFor="session-mode">
            Session mode
            <Select id="session-mode" value={sessionMode} onChange={(event) => {
              const next = event.target.value as "password" | "oauth" | "hybrid";
              setSessionMode(next);
              setAllowLocalAuth(next !== "oauth");
            }}>
              <option value="password">Password sign-in</option>
              <option value="hybrid">Password + OAuth</option>
              <option value="oauth">OAuth only</option>
            </Select>
            <span className="font-normal">OAuth-only requires at least one configured provider.</span>
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm text-slate-700">
            Require multi-factor authentication
            <input type="checkbox" checked={requireMfa} onChange={(event) => setRequireMfa(event.target.checked)} className="h-4 w-4 accent-[#365CF5]" />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm text-slate-700">
            Allow local email/password auth
            <input type="checkbox" checked={allowLocalAuth} onChange={(event) => { setAllowLocalAuth(event.target.checked); setSessionMode(event.target.checked ? "hybrid" : "oauth"); }} className="h-4 w-4 accent-[#365CF5]" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500" htmlFor="session-timeout">
            Session timeout (minutes)
            <Input id="session-timeout" type="number" min={5} max={10080} step={1} value={sessionTimeoutMinutes} onChange={(event) => setSessionTimeoutMinutes(event.target.value)} placeholder="480" aria-describedby="session-timeout-help" />
            <span id="session-timeout-help" className="font-normal">Between 5 minutes and 7 days.</span>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500" htmlFor="security-theme">
            Workspace theme
            <Select id="security-theme" value={themeMode} onChange={(event) => setThemeMode(event.target.value)}>
            <option value="light">Light</option>
            <option value="system">System</option>
            <option value="dark">Dark</option>
            </Select>
          </label>
        </div>
        {sessionMode !== "password" ? (
          <div className="mt-4 rounded-[24px] border border-brand-100 bg-brand-50/40 p-4">
            <p className="text-sm font-semibold text-ink">Configure OAuth providers</p>
            <p className="mt-1 text-xs text-slate-500">Enter the credentials below and save. They will be written to <code>apps/api/.env</code> and applied to the running API. Secrets are never displayed after saving.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {[
                { key: "google", name: "Google", variables: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET" },
                { key: "microsoft", name: "Microsoft", variables: "MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET" },
              ].map((provider) => {
                const status = data?.security.oauthProviders.find((item) => item.key === provider.key);
                const google = provider.key === "google";
                return <div key={provider.key} className="rounded-2xl border border-line bg-white/80 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-ink">{provider.name}</p><span className={`text-[11px] font-semibold ${status?.configured ? "text-emerald-700" : "text-amber-700"}`}>{status?.configured ? "Configured" : "Needs setup"}</span></div><p className="mt-1 text-xs text-slate-500">Required: <code>{provider.variables}</code></p><div className="mt-3 grid gap-2"><Input type="text" autoComplete="off" value={google ? providerForm.googleClientId : providerForm.microsoftClientId} onChange={(event) => setProviderForm((current) => google ? { ...current, googleClientId: event.target.value } : { ...current, microsoftClientId: event.target.value })} placeholder={`${provider.name} client ID`} aria-label={`${provider.name} client ID`} /><Input type="password" autoComplete="new-password" value={google ? providerForm.googleClientSecret : providerForm.microsoftClientSecret} onChange={(event) => setProviderForm((current) => google ? { ...current, googleClientSecret: event.target.value } : { ...current, microsoftClientSecret: event.target.value })} placeholder={`${provider.name} client secret`} aria-label={`${provider.name} client secret`} /><button type="button" onClick={() => void saveOAuthProvider(provider.key as "google" | "microsoft")} disabled={savingProvider !== null} className="rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{savingProvider === provider.key ? "Saving..." : `Save ${provider.name}`}</button></div></div>;
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">Register this callback URL with both providers: <code className="break-all">{data?.security.oauthRedirectUri ?? "http://localhost:4000/api/v1/auth/oauth/{provider}/callback"}</code></p>
          </div>
        ) : null}
        <div className="mt-4 rounded-[24px] border border-line bg-soft/50 p-4">
          <p className="text-sm font-semibold text-ink">Password Policy</p>
          <p className="mt-1 text-xs text-slate-500">{data?.security.passwordPolicy ?? "Loading..."}</p>
          <p className="mt-3 text-xs text-slate-500">OAuth callback URL: <code className="break-all rounded bg-white px-1.5 py-0.5 text-[11px]">{data?.security.oauthRedirectUri ?? "Loading..."}</code></p>
          <p className="mt-2 text-xs text-slate-500">Use the provider forms above to save or replace credentials. The API environment is updated automatically.</p>
        </div>
        <button disabled={!data || saving} onClick={() => void saveSecurity()} className="mt-5 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? "Saving..." : "Save Security"}
        </button>
      </Card>
      <SettingsToast toast={toast} />
    </div>
  );
}

export function LivePermissionsSettingsPage() {
  const { data, toast, notify } = useSettingsData();
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<PermissionMember | null>(null);
  const [permissionDefinitions, setPermissionDefinitions] = useState<PermissionDefinition[]>([]);
  const [permissionRoles, setPermissionRoles] = useState<PermissionRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedPermissionKeys, setSelectedPermissionKeys] = useState<string[]>([]);
  const [newPermissionKey, setNewPermissionKey] = useState("");
  const [newPermissionDescription, setNewPermissionDescription] = useState("");
  const [permissionBusy, setPermissionBusy] = useState(false);

  useEffect(() => {
    void apiFetch<{ permissions: PermissionDefinition[]; roles: PermissionRole[] }>("/settings/permissions/catalog")
      .then((result) => { setPermissionDefinitions(result.permissions); setPermissionRoles(result.roles); if (result.roles[0]) { setSelectedRoleId(result.roles[0].id); setSelectedPermissionKeys(result.roles[0].permissionKeys); } })
      .catch((error) => notify("error", error instanceof Error ? error.message : "Unable to load permission definitions."));
  }, []);

  function selectPermissionRole(roleId: string) {
    const role = permissionRoles.find((item) => item.id === roleId);
    setSelectedRoleId(roleId);
    setSelectedPermissionKeys(role?.permissionKeys ?? []);
  }

  async function addPermission() {
    if (!newPermissionKey.trim()) return;
    const normalizedKey = newPermissionKey.trim().toLowerCase().replace(/\s+/g, ".");
    if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(normalizedKey)) {
      notify("error", "Use a permission key such as crm.customers.export or settings.manage.");
      return;
    }
    try {
      setPermissionBusy(true);
      const result = await apiFetch<{ permission: PermissionDefinition }>("/settings/permissions", { method: "POST", body: JSON.stringify({ key: normalizedKey, description: newPermissionDescription }) });
      setPermissionDefinitions((current) => [...current, result.permission].sort((a, b) => a.key.localeCompare(b.key)));
      setNewPermissionKey(""); setNewPermissionDescription("");
      notify("success", "Permission added. Assign it to a role below.");
    } catch (error) { notify("error", error instanceof Error ? error.message : "Unable to add permission."); }
    finally { setPermissionBusy(false); }
  }

  async function saveRolePermissions() {
    if (!selectedRoleId) return;
    try {
      setPermissionBusy(true);
      await apiFetch(`/settings/permissions/roles/${selectedRoleId}`, { method: "PATCH", body: JSON.stringify({ permissionKeys: selectedPermissionKeys }) });
      setPermissionRoles((current) => current.map((role) => role.id === selectedRoleId ? { ...role, permissionKeys: selectedPermissionKeys } : role));
      notify("success", "Role permissions updated.");
    } catch (error) { notify("error", error instanceof Error ? error.message : "Unable to update role permissions."); }
    finally { setPermissionBusy(false); }
  }
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
      <Card className="p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Permission builder</p><h2 className="mt-1 text-xl font-semibold text-ink">Edit role permissions</h2><p className="mt-1 text-sm text-slate-500">Choose a role, select the permissions it may use, and save. Permission keys can also be added for future protected actions.</p></div>
          <div className="flex flex-wrap gap-2"><Input value={newPermissionKey} onChange={(event) => setNewPermissionKey(event.target.value)} placeholder="crm.customers.export" className="min-w-[220px]" /><Input value={newPermissionDescription} onChange={(event) => setNewPermissionDescription(event.target.value)} placeholder="Description (optional)" className="min-w-[220px]" /><button type="button" onClick={() => void addPermission()} disabled={permissionBusy || !newPermissionKey.trim()} className="rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Add permission</button></div>
        </div>
        {permissionRoles.length ? <div className="mt-5 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]"><div><p className="text-xs font-semibold text-slate-500">Role</p><Select value={selectedRoleId} onChange={(event) => selectPermissionRole(event.target.value)} className="mt-1 w-full">{permissionRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</Select><p className="mt-2 text-xs text-slate-500">{permissionRoles.find((role) => role.id === selectedRoleId)?.description || "Select permissions for this role."}</p></div><div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{permissionDefinitions.map((permission) => <label key={permission.id} className="flex items-start gap-2 rounded-xl border border-line bg-soft/30 p-3 text-sm text-slate-700"><input type="checkbox" checked={selectedPermissionKeys.includes(permission.key)} onChange={(event) => setSelectedPermissionKeys((current) => event.target.checked ? [...current, permission.key] : current.filter((key) => key !== permission.key))} className="mt-0.5 h-4 w-4 accent-brand-500" /><span><span className="block font-semibold text-ink">{permission.key}</span>{permission.description ? <span className="mt-1 block text-xs text-slate-500">{permission.description}</span> : null}</span></label>)}</div><button type="button" onClick={() => void saveRolePermissions()} disabled={permissionBusy} className="mt-4 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{permissionBusy ? "Saving..." : "Save role permissions"}</button></div></div> : <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">No configurable roles were found for this workspace.</p>}
      </Card>
      <Card className="overflow-hidden">
        <TableHeader
          label="Permissions"
          title="Role access matrix"
          description="Review the access granted to each team member across the active CRM, finance, HR, operations, and administration modules. Select a row for the full access profile."
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
                {permissionModules.map((module) => <th key={module.key} className="px-4 py-2.5 font-semibold">{module.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => (
                <tr key={member.id} onClick={() => setSelectedMember(member)} className="cursor-pointer border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{member.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{member.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{member.role}</td>
                  {permissionModules.map((module) => <td key={module.key} className="px-4 py-3"><PermissionPill level={member.scope[module.key as PermissionModuleKey]} /></td>)}
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={permissionModules.length + 2} className="px-4 py-8 text-center text-sm text-slate-500">
                    No permission rows match the current search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">Access levels:</span>
          {["Full", "Edit", "Read", "Self", "None"].map((level) => <span key={level} className="inline-flex items-center gap-1.5"><PermissionPill level={level} /></span>)}
        </div>
      </Card>
      {selectedMember ? <PermissionDetailModal member={selectedMember} onClose={() => setSelectedMember(null)} /> : null}
      <SettingsToast toast={toast} />
    </div>
  );
}
