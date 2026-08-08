"use client";

import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Overview = {
  revenue: number;
  outstanding: number;
  expenses: number;
  cash: number;
  openPeriods: number;
  journalEntries: number;
};

type Invoice = {
  id: string;
  number: string;
  customer: string;
  billingEmail?: string | null;
  billingPhone?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  contact?: {
    id: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
  } | null;
  company?: {
    id: string;
    name: string;
  } | null;
  total: string;
  subtotal: string;
  taxAmount: string;
  status: string;
  currency: string;
  purchaseOrder?: string | null;
  description?: string | null;
  notes?: string | null;
  issuedAt?: string;
  dueAt?: string;
};

type CrmContact = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  companyId?: string | null;
  company?: {
    id: string;
    name: string;
  } | null;
};

type Expense = {
  id: string;
  category: string;
  vendor?: string | null;
  amount: string;
  currency: string;
  invoiceId?: string | null;
  incurredAt: string;
};

type Payment = {
  id: string;
  provider: string;
  amount: string;
  receivedAt: string;
  invoice: { id: string; number: string; customer: string; currency: string };
};

type Vendor = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  category?: string | null;
  paymentTerms?: string | null;
  active: boolean;
};

type BankAccount = {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  currency: string;
  currentBalance: string;
  active: boolean;
};

type ChartAccount = {
  id: string;
  code: string;
  name: string;
  category: string;
  balanceSide: string;
  active: boolean;
};

type TaxRate = {
  id: string;
  name: string;
  code: string;
  ratePercent: string;
  appliesTo: string;
  active: boolean;
};

type AccountingPeriod = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
  closedAt?: string | null;
};

type JournalEntry = {
  id: string;
  entryDate: string;
  reference?: string | null;
  memo?: string | null;
  status: string;
  lines: Array<{
    id: string;
    description?: string | null;
    debit: string;
    credit: string;
    account: {
      id: string;
      code: string;
      name: string;
      category: string;
    };
  }>;
};

type TenantSettings = {
  tenant: { currency: string; name: string; supportEmail?: string | null; logoUrl?: string | null; timezone: string };
};

const emptyInvoice = {
  id: "",
  customer: "",
  billingEmail: "",
  billingPhone: "",
  contactId: "",
  companyId: "",
  number: "",
  purchaseOrder: "",
  description: "",
  notes: "",
  issuedAt: "2026-08-04",
  dueAt: "2026-08-18",
  subtotal: "",
  taxAmount: "",
  status: "SENT",
  currency: "ZAR",
};
const emptyExpense = { id: "", category: "", vendor: "", amount: "", currency: "ZAR", invoiceId: "", incurredAt: "2026-08-04" };
const emptyPayment = { id: "", provider: "Manual", amount: "", invoiceId: "", receivedAt: "2026-08-04T12:00" };
const emptyVendor = { id: "", name: "", email: "", phone: "", category: "", paymentTerms: "", active: "true" };
const emptyBank = { id: "", bankName: "", accountName: "", accountNumber: "", currency: "ZAR", currentBalance: "", active: "true" };
const emptyAccount = { id: "", code: "", name: "", category: "Asset", balanceSide: "DEBIT", active: "true" };
const emptyTaxRate = { id: "", name: "", code: "", ratePercent: "15", appliesTo: "SALES", active: "true" };
const emptyPeriod = { id: "", label: "", startDate: "2026-08-01", endDate: "2026-08-31", status: "OPEN" };
const emptyJournal = {
  id: "",
  entryDate: "2026-08-04",
  reference: "",
  memo: "",
  status: "POSTED",
  lineOneAccountId: "",
  lineOneDebit: "",
  lineOneCredit: "",
  lineTwoAccountId: "",
  lineTwoDebit: "",
  lineTwoCredit: "",
};

function parseApiError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(error.message) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(", ");
    return parsed.message || fallback;
  } catch {
    return error.message || fallback;
  }
}

function useAccountingData() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [settings, setSettings] = useState<TenantSettings["tenant"] | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function notify(type: "success" | "error", message: string) {
    setToast({ type, message });
  }

  async function load() {
    try {
      const [
        overviewData,
        invoicesData,
        expensesData,
        paymentsData,
        contactsData,
        vendorsData,
        bankAccountsData,
        chartAccountsData,
        taxRatesData,
        periodsData,
        journalEntriesData,
        settingsData,
      ] = await Promise.all([
        apiFetch<Overview>("/accounting/overview"),
        apiFetch<{ items: Invoice[] }>("/accounting/invoices"),
        apiFetch<{ items: Expense[] }>("/accounting/expenses"),
        apiFetch<{ items: Payment[] }>("/accounting/payments"),
        apiFetch<{ items: CrmContact[] }>("/crm/contacts"),
        apiFetch<{ items: Vendor[] }>("/accounting/vendors"),
        apiFetch<{ items: BankAccount[] }>("/accounting/bank-accounts"),
        apiFetch<{ items: ChartAccount[] }>("/accounting/chart-accounts"),
        apiFetch<{ items: TaxRate[] }>("/accounting/tax-rates"),
        apiFetch<{ items: AccountingPeriod[] }>("/accounting/periods"),
        apiFetch<{ items: JournalEntry[] }>("/accounting/journal-entries"),
        apiFetch<TenantSettings>("/settings"),
      ]);

      setOverview(overviewData);
      setInvoices(invoicesData.items);
      setExpenses(expensesData.items);
      setPayments(paymentsData.items);
      setContacts(contactsData.items);
      setVendors(vendorsData.items);
      setBankAccounts(bankAccountsData.items);
      setChartAccounts(chartAccountsData.items);
      setTaxRates(taxRatesData.items);
      setPeriods(periodsData.items);
      setJournalEntries(journalEntriesData.items);
      setSettings(settingsData.tenant);
    } catch (error) {
      notify("error", parseApiError(error, "Failed to load accounting."));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return {
    overview,
    invoices,
    expenses,
    payments,
    contacts,
    vendors,
    bankAccounts,
    chartAccounts,
    taxRates,
    periods,
    journalEntries,
    settings,
    toast,
    notify,
    reload: load,
  };
}

function AccountingToast({ toast }: { toast: { type: "success" | "error"; message: string } | null }) {
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
        {filterOptions && filter && setFilter ? (
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-2xl border border-line bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500">
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
      <div className="mx-auto w-full max-w-[1480px] rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5 lg:px-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">{title}</h3>
          </div>
          <button onClick={onClose} className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft">Close</button>
        </div>
        <div className="px-6 py-5 lg:px-8">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4 lg:px-8">
          <button onClick={onClose} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft">Cancel</button>
          <button onClick={onSave} className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}

function InvoiceModal({
  form,
  setForm,
  contacts,
  settings,
  onClose,
  onSave,
  title,
  buttonLabel,
}: {
  form: typeof emptyInvoice;
  setForm: Dispatch<SetStateAction<typeof emptyInvoice>>;
  contacts: CrmContact[];
  settings: TenantSettings["tenant"] | null;
  onClose: () => void;
  onSave: () => void;
  title: string;
  buttonLabel: string;
}) {
  const selectedContact = contacts.find((contact) => contact.id === form.contactId);
  const issuedDisplay = form.issuedAt ? new Date(form.issuedAt).toLocaleDateString("en-ZA") : "Today";
  const dueDisplay = form.dueAt ? new Date(form.dueAt).toLocaleDateString("en-ZA") : "Set due date";

  return (
    <BaseModal label={title} title="Create a branded accounting document" onClose={onClose} onSave={onSave} saveLabel={buttonLabel}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.88fr)]">
        <div className="grid gap-3 md:grid-cols-2">
          <select
            value={form.contactId}
            onChange={(event) => {
              const selected = contacts.find((contact) => contact.id === event.target.value);
              setForm((current) => ({
                ...current,
                contactId: event.target.value,
                companyId: selected?.company?.id ?? selected?.companyId ?? "",
                customer: selected?.fullName ?? current.customer,
                billingEmail: selected?.email ?? current.billingEmail,
                billingPhone: selected?.phone ?? current.billingPhone,
              }));
            }}
            className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2"
          >
            <option value="">Link CRM client</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.fullName}{contact.company?.name ? ` - ${contact.company.name}` : ""}
              </option>
            ))}
          </select>
          <input value={form.customer} onChange={(event) => setForm((current) => ({ ...current, customer: event.target.value }))} placeholder="Billing name" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2" />
          <input value={form.billingEmail} onChange={(event) => setForm((current) => ({ ...current, billingEmail: event.target.value }))} placeholder="Billing email" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
          <input value={form.billingPhone} onChange={(event) => setForm((current) => ({ ...current, billingPhone: event.target.value }))} placeholder="Billing phone" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
          <input value={form.number} onChange={(event) => setForm((current) => ({ ...current, number: event.target.value.toUpperCase() }))} placeholder="Invoice number" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
          <input value={form.purchaseOrder} onChange={(event) => setForm((current) => ({ ...current, purchaseOrder: event.target.value }))} placeholder="PO / reference" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
          <input type="date" value={form.issuedAt} onChange={(event) => setForm((current) => ({ ...current, issuedAt: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
          <input type="date" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
          <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description / scope of work" rows={3} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2" />
          <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes / payment terms" rows={3} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2" />
          <input value={form.subtotal} onChange={(event) => setForm((current) => ({ ...current, subtotal: event.target.value }))} placeholder="Subtotal" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
          <input value={form.taxAmount} onChange={(event) => setForm((current) => ({ ...current, taxAmount: event.target.value }))} placeholder="Tax amount" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
            {["DRAFT", "SENT", "PAID", "OVERDUE", "VOID"].map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="Currency" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        </div>
        <div className="rounded-[28px] border border-line bg-soft/40 p-5 xl:sticky xl:top-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt="Workspace logo" className="h-14 w-14 rounded-2xl border border-line object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-white text-sm font-semibold text-ink">
                  {(settings?.name || "PI").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-ink">{settings?.name || "Workspace"}</p>
                <p className="text-xs text-slate-500">{settings?.supportEmail || "support@workspace.local"}</p>
              </div>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700">{form.status}</span>
          </div>
          <div className="mt-5 rounded-3xl border border-line bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Document Preview</p>
            <div className="mt-3 space-y-2">
              <div>
                <p className="text-xs text-slate-500">Bill To</p>
                <p className="text-sm font-semibold text-ink">{form.customer || "Select a CRM client"}</p>
                <p className="text-xs text-slate-500">{form.billingEmail || selectedContact?.email || "Client email will show here"}</p>
                <p className="text-xs text-slate-500">{form.billingPhone || selectedContact?.phone || "Client phone will show here"}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-soft/40 p-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Invoice No.</p>
                  <p className="text-sm font-semibold text-ink">{form.number || "Auto-generated"}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">PO / Ref</p>
                  <p className="text-sm font-semibold text-ink">{form.purchaseOrder || "None"}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Issued</p>
                  <p className="text-sm font-semibold text-ink">{issuedDisplay}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Due</p>
                  <p className="text-sm font-semibold text-ink">{dueDisplay}</p>
                </div>
              </div>
              {form.description ? (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Description</p>
                  <p className="text-xs text-slate-600">{form.description}</p>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-soft/40 p-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Subtotal</p>
                  <p className="text-sm font-semibold text-ink">{form.currency} {Number(form.subtotal || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Tax</p>
                  <p className="text-sm font-semibold text-ink">{form.currency} {Number(form.taxAmount || 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-3">
                <p className="text-sm font-semibold text-ink">Total</p>
                <p className="text-base font-semibold text-brand-500">{form.currency} {(Number(form.subtotal || 0) + Number(form.taxAmount || 0)).toLocaleString()}</p>
              </div>
              {form.notes ? (
                <div className="border-t border-line pt-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Notes</p>
                  <p className="text-xs text-slate-600">{form.notes}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </BaseModal>
  );
}

function ExpenseModal({ form, setForm, invoices, onClose, onSave }: { form: typeof emptyExpense; setForm: Dispatch<SetStateAction<typeof emptyExpense>>; invoices: Invoice[]; onClose: () => void; onSave: () => void }) {
  return (
    <BaseModal label={form.id ? "Edit Expense" : "Add Expense"} title="Update expense details" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Expense" : "Save Expense"}>
      <div className="grid gap-3 md:grid-cols-2">
        <input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Category" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.vendor} onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value }))} placeholder="Vendor" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="Currency" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <select value={form.invoiceId} onChange={(event) => setForm((current) => ({ ...current, invoiceId: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
          <option value="">Unlinked invoice</option>
          {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number}</option>)}
        </select>
        <input type="date" value={form.incurredAt} onChange={(event) => setForm((current) => ({ ...current, incurredAt: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
      </div>
    </BaseModal>
  );
}

function PaymentModal({ form, setForm, invoices, onClose, onSave }: { form: typeof emptyPayment; setForm: Dispatch<SetStateAction<typeof emptyPayment>>; invoices: Invoice[]; onClose: () => void; onSave: () => void }) {
  return (
    <BaseModal label={form.id ? "Edit Payment" : "Add Payment"} title="Update payment details" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Payment" : "Save Payment"}>
      <div className="grid gap-3 md:grid-cols-2">
        <select value={form.invoiceId} onChange={(event) => setForm((current) => ({ ...current, invoiceId: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2">
          <option value="">Select invoice</option>
          {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number} - {invoice.customer}</option>)}
        </select>
        <input value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))} placeholder="Provider" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input type="datetime-local" value={form.receivedAt} onChange={(event) => setForm((current) => ({ ...current, receivedAt: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2" />
      </div>
    </BaseModal>
  );
}

function VendorModal({ form, setForm, onClose, onSave }: { form: typeof emptyVendor; setForm: Dispatch<SetStateAction<typeof emptyVendor>>; onClose: () => void; onSave: () => void }) {
  return (
    <BaseModal label={form.id ? "Edit Vendor" : "Add Vendor"} title="Manage vendor profile" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Vendor" : "Save Vendor"}>
      <div className="grid gap-3 md:grid-cols-2">
        <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Vendor name" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2" />
        <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Category" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.paymentTerms} onChange={(event) => setForm((current) => ({ ...current, paymentTerms: event.target.value }))} placeholder="Payment terms" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <select value={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
    </BaseModal>
  );
}

function BankModal({ form, setForm, onClose, onSave }: { form: typeof emptyBank; setForm: Dispatch<SetStateAction<typeof emptyBank>>; onClose: () => void; onSave: () => void }) {
  return (
    <BaseModal label={form.id ? "Edit Bank Account" : "Add Bank Account"} title="Manage banking profile" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Account" : "Save Account"}>
      <div className="grid gap-3 md:grid-cols-2">
        <input value={form.bankName} onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))} placeholder="Bank name" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.accountName} onChange={(event) => setForm((current) => ({ ...current, accountName: event.target.value }))} placeholder="Account name" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.accountNumber} onChange={(event) => setForm((current) => ({ ...current, accountNumber: event.target.value }))} placeholder="Account number" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="Currency" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.currentBalance} onChange={(event) => setForm((current) => ({ ...current, currentBalance: event.target.value }))} placeholder="Current balance" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <select value={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
    </BaseModal>
  );
}

function ChartAccountModal({ form, setForm, onClose, onSave }: { form: typeof emptyAccount; setForm: Dispatch<SetStateAction<typeof emptyAccount>>; onClose: () => void; onSave: () => void }) {
  return (
    <BaseModal label={form.id ? "Edit Account" : "Add Account"} title="Manage chart account" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Account" : "Save Account"}>
      <div className="grid gap-3 md:grid-cols-2">
        <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Account name" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
          {["Asset", "Liability", "Equity", "Income", "Expense"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={form.balanceSide} onChange={(event) => setForm((current) => ({ ...current, balanceSide: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
          {["DEBIT", "CREDIT"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
    </BaseModal>
  );
}

function TaxRateModal({ form, setForm, onClose, onSave }: { form: typeof emptyTaxRate; setForm: Dispatch<SetStateAction<typeof emptyTaxRate>>; onClose: () => void; onSave: () => void }) {
  return (
    <BaseModal label={form.id ? "Edit Tax Rate" : "Add Tax Rate"} title="Manage tax setup" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Tax Rate" : "Save Tax Rate"}>
      <div className="grid gap-3 md:grid-cols-2">
        <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Tax name" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Code" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.ratePercent} onChange={(event) => setForm((current) => ({ ...current, ratePercent: event.target.value }))} placeholder="Rate percent" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <select value={form.appliesTo} onChange={(event) => setForm((current) => ({ ...current, appliesTo: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
          {["SALES", "PURCHASES", "BOTH"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
    </BaseModal>
  );
}

function PeriodModal({ form, setForm, onClose, onSave }: { form: typeof emptyPeriod; setForm: Dispatch<SetStateAction<typeof emptyPeriod>>; onClose: () => void; onSave: () => void }) {
  return (
    <BaseModal label={form.id ? "Edit Period" : "Add Period"} title="Manage accounting period" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Period" : "Save Period"}>
      <div className="grid gap-3 md:grid-cols-2">
        <input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="Period label" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2" />
        <input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2">
          {["OPEN", "REVIEW", "CLOSED"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
    </BaseModal>
  );
}

function JournalModal({
  form,
  setForm,
  chartAccounts,
  onClose,
  onSave,
}: {
  form: typeof emptyJournal;
  setForm: Dispatch<SetStateAction<typeof emptyJournal>>;
  chartAccounts: ChartAccount[];
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <BaseModal label={form.id ? "Edit Journal Entry" : "Add Journal Entry"} title="Manage general ledger entry" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Entry" : "Save Entry"}>
      <div className="grid gap-3 md:grid-cols-2">
        <input type="date" value={form.entryDate} onChange={(event) => setForm((current) => ({ ...current, entryDate: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} placeholder="Reference" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <input value={form.memo} onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))} placeholder="Memo" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2" />
        <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2">
          {["POSTED", "DRAFT"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={form.lineOneAccountId} onChange={(event) => setForm((current) => ({ ...current, lineOneAccountId: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
          <option value="">Debit account</option>
          {chartAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
        </select>
        <input value={form.lineOneDebit} onChange={(event) => setForm((current) => ({ ...current, lineOneDebit: event.target.value, lineOneCredit: "0" }))} placeholder="Debit amount" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
        <select value={form.lineTwoAccountId} onChange={(event) => setForm((current) => ({ ...current, lineTwoAccountId: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500">
          <option value="">Credit account</option>
          {chartAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
        </select>
        <input value={form.lineTwoCredit} onChange={(event) => setForm((current) => ({ ...current, lineTwoCredit: event.target.value, lineTwoDebit: "0" }))} placeholder="Credit amount" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500" />
      </div>
    </BaseModal>
  );
}

function DerivedTable({
  label,
  title,
  description,
  rows,
  columns,
  search,
  setSearch,
  placeholder,
}: {
  label: string;
  title: string;
  description: string;
  rows: Array<Record<string, string>>;
  columns: Array<{ key: string; label: string; align?: "left" | "right" }>;
  search: string;
  setSearch: (value: string) => void;
  placeholder: string;
}) {
  return (
    <Card className="overflow-hidden">
      <TableHeader label={label} title={title} description={description} count={rows.length} search={search} setSearch={setSearch} searchPlaceholder={placeholder} />
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="border-b border-line bg-slate-50/70">
            <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
              {columns.map((column) => <th key={column.key} className={`px-4 py-2.5 font-semibold ${column.align === "right" ? "text-right" : ""}`}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-line transition hover:bg-soft/40">
                {columns.map((column) => <td key={column.key} className={`px-4 py-3 text-xs text-slate-600 md:text-sm ${column.align === "right" ? "text-right font-semibold text-brand-500" : ""}`}>{row[column.key]}</td>)}
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-slate-500">No records available.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function LiveInvoices() {
  const { invoices, contacts, settings, toast, notify, reload } = useAccountingData();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [form, setForm] = useState(emptyInvoice);
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesSearch = term.length === 0 || invoice.number.toLowerCase().includes(term) || invoice.customer.toLowerCase().includes(term) || invoice.currency.toLowerCase().includes(term);
      const matchesStatus = statusFilter === "ALL" || invoice.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, statusFilter]);

  async function saveInvoice() {
    try {
      const payload = {
        customer: form.customer || undefined,
        billingEmail: form.billingEmail || undefined,
        billingPhone: form.billingPhone || undefined,
        number: form.number || undefined,
        purchaseOrder: form.purchaseOrder || undefined,
        description: form.description || undefined,
        notes: form.notes || undefined,
        issuedAt: form.issuedAt ? new Date(form.issuedAt).toISOString() : undefined,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
        subtotal: form.subtotal ? Number(form.subtotal) : undefined,
        taxAmount: form.taxAmount ? Number(form.taxAmount) : undefined,
        status: form.status,
        currency: form.currency || undefined,
      };
      const linkedPayload = {
        ...payload,
        contactId: form.contactId || undefined,
        companyId: form.companyId || undefined,
      };
      if (form.id) {
        await apiFetch(`/accounting/invoices/${form.id}`, { method: "PATCH", body: JSON.stringify(linkedPayload) });
        notify("success", "Invoice updated successfully.");
      } else {
        await apiFetch("/accounting/invoices", { method: "POST", body: JSON.stringify(linkedPayload) });
        notify("success", "Invoice created successfully.");
      }
      setForm(emptyInvoice);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to save invoice."));
    }
  }

  async function deleteInvoice(invoiceId: string) {
    try {
      await apiFetch(`/accounting/invoices/${invoiceId}`, { method: "DELETE" });
      setPendingDelete(null);
      notify("success", "Invoice deleted successfully.");
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to delete invoice."));
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Invoices" title="Billing and invoice records" description="Create, search, update, and manage live invoice records." count={filtered.length} addLabel="Add invoice" onAdd={() => { setForm(emptyInvoice); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search invoice, customer, currency" filter={statusFilter} setFilter={setStatusFilter} filterOptions={[{ value: "ALL", label: "All statuses" }, { value: "DRAFT", label: "Draft" }, { value: "SENT", label: "Sent" }, { value: "PAID", label: "Paid" }, { value: "OVERDUE", label: "Overdue" }, { value: "VOID", label: "Void" }]} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70"><tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500"><th className="px-4 py-2.5 font-semibold">Invoice</th><th className="px-4 py-2.5 font-semibold">Customer</th><th className="px-4 py-2.5 font-semibold">CRM Link</th><th className="px-4 py-2.5 font-semibold">Status</th><th className="px-4 py-2.5 font-semibold">Total</th><th className="px-4 py-2.5 text-right font-semibold">Actions</th></tr></thead>
            <tbody>
              {filtered.map((invoice) => (
                <tr key={invoice.id} className="border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3 text-sm font-semibold text-ink">{invoice.number}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{invoice.customer}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{invoice.contact?.fullName || invoice.company?.name || "Unlinked"}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-soft px-2.5 py-1 text-[10px] font-semibold text-slate-700">{invoice.status}</span></td>
                  <td className="px-4 py-3 text-xs font-semibold text-brand-500 md:text-sm">{invoice.currency} {Number(invoice.total).toLocaleString()}</td>
                  <td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><button onClick={() => { setForm({ id: invoice.id, customer: invoice.customer, billingEmail: invoice.billingEmail ?? "", billingPhone: invoice.billingPhone ?? "", contactId: invoice.contactId ?? "", companyId: invoice.companyId ?? "", number: invoice.number ?? "", purchaseOrder: invoice.purchaseOrder ?? "", description: invoice.description ?? "", notes: invoice.notes ?? "", issuedAt: invoice.issuedAt?.slice(0, 10) ?? "2026-08-04", dueAt: invoice.dueAt?.slice(0, 10) ?? "2026-08-18", subtotal: String(Number(invoice.subtotal)), taxAmount: String(Number(invoice.taxAmount)), status: invoice.status, currency: invoice.currency }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button><button onClick={() => setPendingDelete(invoice.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /><span>Delete</span></button></div></td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No invoices match the current search or filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <InvoiceModal form={form} setForm={setForm} contacts={contacts} settings={settings} onClose={() => { setShowForm(false); if (!form.id) setForm(emptyInvoice); }} onSave={() => void saveInvoice()} title={form.id ? "Edit Invoice" : "Create Invoice"} buttonLabel={form.id ? "Update Invoice" : "Create Invoice"} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this invoice?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteInvoice(pendingDelete)} confirmLabel="Delete Invoice" /> : null}
      <AccountingToast toast={toast} />
    </div>
  );
}

export function LiveQuotes() {
  const { invoices, contacts, settings, toast, notify, reload } = useAccountingData();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ ...emptyInvoice, status: "DRAFT" });
  const [showForm, setShowForm] = useState(false);
  const quotes = useMemo(() => invoices.filter((invoice) => invoice.status === "DRAFT"), [invoices]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotes.filter((quote) => term.length === 0 || quote.number.toLowerCase().includes(term) || quote.customer.toLowerCase().includes(term));
  }, [quotes, search]);

  async function saveQuote() {
    try {
      const payload = {
        customer: form.customer || undefined,
        contactId: form.contactId || undefined,
        companyId: form.companyId || undefined,
        billingEmail: form.billingEmail || undefined,
        billingPhone: form.billingPhone || undefined,
        number: form.number || undefined,
        purchaseOrder: form.purchaseOrder || undefined,
        description: form.description || undefined,
        notes: form.notes || undefined,
        issuedAt: form.issuedAt ? new Date(form.issuedAt).toISOString() : undefined,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
        subtotal: form.subtotal ? Number(form.subtotal) : undefined,
        taxAmount: form.taxAmount ? Number(form.taxAmount) : undefined,
        status: "DRAFT",
        currency: form.currency || undefined,
      };
      if (form.id) {
        await apiFetch(`/accounting/invoices/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Quote updated successfully.");
      } else {
        await apiFetch("/accounting/invoices", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Quote created successfully.");
      }
      setForm({ ...emptyInvoice, status: "DRAFT" });
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to save quote."));
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Quotes" title="Draft estimates and quotes" description="Manage draft billing records before sending or converting them." count={filtered.length} addLabel="Add quote" onAdd={() => { setForm({ ...emptyInvoice, status: "DRAFT" }); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search quote or customer" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70"><tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500"><th className="px-4 py-2.5 font-semibold">Quote</th><th className="px-4 py-2.5 font-semibold">Customer</th><th className="px-4 py-2.5 font-semibold">Value</th><th className="px-4 py-2.5 text-right font-semibold">Actions</th></tr></thead>
            <tbody>
              {filtered.map((quote) => <tr key={quote.id} className="border-b border-line transition hover:bg-soft/40"><td className="px-4 py-3 text-sm font-semibold text-ink">{quote.number}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{quote.customer}</td><td className="px-4 py-3 text-xs font-semibold text-brand-500 md:text-sm">{quote.currency} {Number(quote.total).toLocaleString()}</td><td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><button onClick={() => { setForm({ id: quote.id, customer: quote.customer, billingEmail: quote.billingEmail ?? "", billingPhone: quote.billingPhone ?? "", contactId: quote.contactId ?? "", companyId: quote.companyId ?? "", number: quote.number ?? "", purchaseOrder: quote.purchaseOrder ?? "", description: quote.description ?? "", notes: quote.notes ?? "", issuedAt: quote.issuedAt?.slice(0, 10) ?? "2026-08-04", dueAt: quote.dueAt?.slice(0, 10) ?? "2026-08-18", subtotal: String(Number(quote.subtotal)), taxAmount: String(Number(quote.taxAmount)), status: "DRAFT", currency: quote.currency }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button></div></td></tr>)}
              {filtered.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No quotes available yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <InvoiceModal form={form} setForm={setForm} contacts={contacts} settings={settings} onClose={() => { setShowForm(false); if (!form.id) setForm({ ...emptyInvoice, status: "DRAFT" }); }} onSave={() => void saveQuote()} title={form.id ? "Edit Quote" : "Create Quote"} buttonLabel={form.id ? "Update Quote" : "Create Quote"} /> : null}
      <AccountingToast toast={toast} />
    </div>
  );
}

export function LiveExpensesPage() {
  const { expenses, invoices, toast, notify, reload } = useAccountingData();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyExpense);
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return expenses.filter((expense) => term.length === 0 || expense.category.toLowerCase().includes(term) || (expense.vendor ?? "").toLowerCase().includes(term));
  }, [expenses, search]);

  async function saveExpense() {
    try {
      const payload = { category: form.category || undefined, vendor: form.vendor || undefined, amount: form.amount ? Number(form.amount) : undefined, currency: form.currency || undefined, invoiceId: form.invoiceId || "", incurredAt: form.incurredAt ? new Date(form.incurredAt).toISOString() : undefined };
      if (form.id) {
        await apiFetch(`/accounting/expenses/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Expense updated successfully.");
      } else {
        await apiFetch("/accounting/expenses", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Expense created successfully.");
      }
      setForm(emptyExpense);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to save expense."));
    }
  }

  async function deleteExpense(expenseId: string) {
    try {
      await apiFetch(`/accounting/expenses/${expenseId}`, { method: "DELETE" });
      setPendingDelete(null);
      notify("success", "Expense deleted successfully.");
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to delete expense."));
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Expenses" title="Cost and vendor records" description="Track operating expenses and supplier spend." count={filtered.length} addLabel="Add expense" onAdd={() => { setForm(emptyExpense); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search category or vendor" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70"><tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500"><th className="px-4 py-2.5 font-semibold">Category</th><th className="px-4 py-2.5 font-semibold">Vendor</th><th className="px-4 py-2.5 font-semibold">Amount</th><th className="px-4 py-2.5 font-semibold">Date</th><th className="px-4 py-2.5 text-right font-semibold">Actions</th></tr></thead>
            <tbody>
              {filtered.map((expense) => <tr key={expense.id} className="border-b border-line transition hover:bg-soft/40"><td className="px-4 py-3 text-sm font-semibold text-ink">{expense.category}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{expense.vendor ?? "Internal vendor"}</td><td className="px-4 py-3 text-xs font-semibold text-brand-500 md:text-sm">{expense.currency} {Number(expense.amount).toLocaleString()}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{new Date(expense.incurredAt).toLocaleDateString()}</td><td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><button onClick={() => { setForm({ id: expense.id, category: expense.category, vendor: expense.vendor ?? "", amount: String(Number(expense.amount)), currency: expense.currency, invoiceId: expense.invoiceId ?? "", incurredAt: expense.incurredAt.slice(0, 10) }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button><button onClick={() => setPendingDelete(expense.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /><span>Delete</span></button></div></td></tr>)}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No expenses match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <ExpenseModal form={form} setForm={setForm} invoices={invoices} onClose={() => { setShowForm(false); if (!form.id) setForm(emptyExpense); }} onSave={() => void saveExpense()} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this expense?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteExpense(pendingDelete)} confirmLabel="Delete Expense" /> : null}
      <AccountingToast toast={toast} />
    </div>
  );
}

export function LivePaymentsPage() {
  const { payments, invoices, toast, notify, reload } = useAccountingData();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyPayment);
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payments.filter((payment) => term.length === 0 || payment.invoice.number.toLowerCase().includes(term) || payment.invoice.customer.toLowerCase().includes(term) || payment.provider.toLowerCase().includes(term));
  }, [payments, search]);

  async function savePayment() {
    try {
      const payload = { invoiceId: form.invoiceId || "", provider: form.provider || undefined, amount: form.amount ? Number(form.amount) : undefined, receivedAt: form.receivedAt ? new Date(form.receivedAt).toISOString() : undefined };
      if (form.id) {
        await apiFetch(`/accounting/payments/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Payment updated successfully.");
      } else {
        await apiFetch("/accounting/payments", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Payment created successfully.");
      }
      setForm(emptyPayment);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to save payment."));
    }
  }

  async function deletePayment(paymentId: string) {
    try {
      await apiFetch(`/accounting/payments/${paymentId}`, { method: "DELETE" });
      setPendingDelete(null);
      notify("success", "Payment deleted successfully.");
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to delete payment."));
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Payments" title="Collections and received funds" description="Track incoming payments against live invoices." count={filtered.length} addLabel="Add payment" onAdd={() => { setForm({ ...emptyPayment, receivedAt: new Date().toISOString().slice(0, 16) }); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search invoice, customer, provider" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70"><tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500"><th className="px-4 py-2.5 font-semibold">Invoice</th><th className="px-4 py-2.5 font-semibold">Customer</th><th className="px-4 py-2.5 font-semibold">Provider</th><th className="px-4 py-2.5 font-semibold">Amount</th><th className="px-4 py-2.5 text-right font-semibold">Actions</th></tr></thead>
            <tbody>
              {filtered.map((payment) => <tr key={payment.id} className="border-b border-line transition hover:bg-soft/40"><td className="px-4 py-3 text-sm font-semibold text-ink">{payment.invoice.number}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{payment.invoice.customer}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{payment.provider}</td><td className="px-4 py-3 text-xs font-semibold text-brand-500 md:text-sm">{payment.invoice.currency} {Number(payment.amount).toLocaleString()}</td><td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><button onClick={() => { setForm({ id: payment.id, provider: payment.provider, amount: String(Number(payment.amount)), invoiceId: payment.invoice.id, receivedAt: new Date(payment.receivedAt).toISOString().slice(0, 16) }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button><button onClick={() => setPendingDelete(payment.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /><span>Delete</span></button></div></td></tr>)}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No payments match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <PaymentModal form={form} setForm={setForm} invoices={invoices} onClose={() => { setShowForm(false); if (!form.id) setForm(emptyPayment); }} onSave={() => void savePayment()} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this payment?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deletePayment(pendingDelete)} confirmLabel="Delete Payment" /> : null}
      <AccountingToast toast={toast} />
    </div>
  );
}

export function LiveCustomers() {
  const { invoices } = useAccountingData();
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const customers = invoices.reduce<Record<string, { invoices: number; total: number; outstanding: number; currency: string }>>((acc, invoice) => {
      const current = acc[invoice.customer] ?? { invoices: 0, total: 0, outstanding: 0, currency: invoice.currency };
      current.invoices += 1;
      current.total += Number(invoice.total);
      if (invoice.status !== "PAID") current.outstanding += Number(invoice.total);
      acc[invoice.customer] = current;
      return acc;
    }, {});
    return Object.entries(customers).map(([customer, value]) => ({
      customer,
      invoices: String(value.invoices),
      total: `${value.currency} ${value.total.toLocaleString()}`,
      outstanding: `${value.currency} ${value.outstanding.toLocaleString()}`,
    })).filter((row) => row.customer.toLowerCase().includes(search.trim().toLowerCase()));
  }, [invoices, search]);
  return <DerivedTable label="Customers" title="Billing customers" description="Customer accounts derived from live invoice records." rows={rows} columns={[{ key: "customer", label: "Customer" }, { key: "invoices", label: "Invoices" }, { key: "total", label: "Total billed", align: "right" }, { key: "outstanding", label: "Outstanding", align: "right" }]} search={search} setSearch={setSearch} placeholder="Search customer" />;
}

export function LiveVendors() {
  const { vendors, toast, notify, reload } = useAccountingData();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyVendor);
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const filtered = useMemo(() => vendors.filter((vendor) => `${vendor.name} ${vendor.email ?? ""} ${vendor.category ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())), [vendors, search]);

  async function saveVendor() {
    try {
      const payload = { name: form.name || undefined, email: form.email || undefined, phone: form.phone || undefined, category: form.category || undefined, paymentTerms: form.paymentTerms || undefined, active: form.active === "true" };
      if (form.id) {
        await apiFetch(`/accounting/vendors/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Vendor updated successfully.");
      } else {
        await apiFetch("/accounting/vendors", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Vendor created successfully.");
      }
      setForm(emptyVendor);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to save vendor."));
    }
  }

  async function deleteVendor(vendorId: string) {
    try {
      await apiFetch(`/accounting/vendors/${vendorId}`, { method: "DELETE" });
      setPendingDelete(null);
      notify("success", "Vendor deleted successfully.");
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to delete vendor."));
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Vendors" title="Supplier management" description="Track real supplier records, contacts, and payment terms." count={filtered.length} addLabel="Add vendor" onAdd={() => { setForm(emptyVendor); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search vendor, email, category" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70"><tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500"><th className="px-4 py-2.5 font-semibold">Vendor</th><th className="px-4 py-2.5 font-semibold">Category</th><th className="px-4 py-2.5 font-semibold">Terms</th><th className="px-4 py-2.5 font-semibold">Status</th><th className="px-4 py-2.5 text-right font-semibold">Actions</th></tr></thead>
            <tbody>
              {filtered.map((vendor) => <tr key={vendor.id} className="border-b border-line transition hover:bg-soft/40"><td className="px-4 py-3"><div className="text-sm font-semibold text-ink">{vendor.name}</div><div className="text-xs text-slate-500">{vendor.email || "No email"}{vendor.phone ? ` • ${vendor.phone}` : ""}</div></td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{vendor.category || "General"}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{vendor.paymentTerms || "Standard"}</td><td className="px-4 py-3"><span className="rounded-full bg-soft px-2.5 py-1 text-[10px] font-semibold text-slate-700">{vendor.active ? "ACTIVE" : "INACTIVE"}</span></td><td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><button onClick={() => { setForm({ id: vendor.id, name: vendor.name, email: vendor.email ?? "", phone: vendor.phone ?? "", category: vendor.category ?? "", paymentTerms: vendor.paymentTerms ?? "", active: vendor.active ? "true" : "false" }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button><button onClick={() => setPendingDelete(vendor.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /><span>Delete</span></button></div></td></tr>)}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No vendors match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <VendorModal form={form} setForm={setForm} onClose={() => { setShowForm(false); if (!form.id) setForm(emptyVendor); }} onSave={() => void saveVendor()} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this vendor?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteVendor(pendingDelete)} confirmLabel="Delete Vendor" /> : null}
      <AccountingToast toast={toast} />
    </div>
  );
}

export function LiveBanking() {
  const { bankAccounts, overview, settings, toast, notify, reload } = useAccountingData();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyBank);
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const filtered = useMemo(() => bankAccounts.filter((account) => `${account.bankName} ${account.accountName} ${account.currency}`.toLowerCase().includes(search.trim().toLowerCase())), [bankAccounts, search]);
  const currency = settings?.currency || "ZAR";

  async function saveAccount() {
    try {
      const payload = { bankName: form.bankName || undefined, accountName: form.accountName || undefined, accountNumber: form.accountNumber || undefined, currency: form.currency || undefined, currentBalance: form.currentBalance ? Number(form.currentBalance) : 0, active: form.active === "true" };
      if (form.id) {
        await apiFetch(`/accounting/bank-accounts/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Bank account updated successfully.");
      } else {
        await apiFetch("/accounting/bank-accounts", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Bank account created successfully.");
      }
      setForm(emptyBank);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to save bank account."));
    }
  }

  async function deleteAccount(accountId: string) {
    try {
      await apiFetch(`/accounting/bank-accounts/${accountId}`, { method: "DELETE" });
      setPendingDelete(null);
      notify("success", "Bank account deleted successfully.");
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to delete bank account."));
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Cash Position</p><p className="mt-2 text-xl font-semibold text-ink">{currency} {(overview?.cash ?? 0).toLocaleString()}</p></Card>
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Accounts</p><p className="mt-2 text-xl font-semibold text-ink">{bankAccounts.length}</p></Card>
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Open Periods</p><p className="mt-2 text-xl font-semibold text-ink">{overview?.openPeriods ?? 0}</p></Card>
      </div>
      <Card className="overflow-hidden">
        <TableHeader label="Banking" title="Bank accounts and balances" description="Manage live operating and reserve accounts." count={filtered.length} addLabel="Add account" onAdd={() => { setForm({ ...emptyBank, currency }); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search bank account" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70"><tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500"><th className="px-4 py-2.5 font-semibold">Bank</th><th className="px-4 py-2.5 font-semibold">Account</th><th className="px-4 py-2.5 font-semibold">Currency</th><th className="px-4 py-2.5 font-semibold">Balance</th><th className="px-4 py-2.5 text-right font-semibold">Actions</th></tr></thead>
            <tbody>
              {filtered.map((account) => <tr key={account.id} className="border-b border-line transition hover:bg-soft/40"><td className="px-4 py-3 text-sm font-semibold text-ink">{account.bankName}</td><td className="px-4 py-3"><div className="text-sm text-slate-700">{account.accountName}</div><div className="text-xs text-slate-500">•••• {account.accountNumber.slice(-4)}</div></td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{account.currency}</td><td className="px-4 py-3 text-xs font-semibold text-brand-500 md:text-sm">{account.currency} {Number(account.currentBalance).toLocaleString()}</td><td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><button onClick={() => { setForm({ id: account.id, bankName: account.bankName, accountName: account.accountName, accountNumber: account.accountNumber, currency: account.currency, currentBalance: String(Number(account.currentBalance)), active: account.active ? "true" : "false" }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button><button onClick={() => setPendingDelete(account.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /><span>Delete</span></button></div></td></tr>)}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No bank accounts match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <BankModal form={form} setForm={setForm} onClose={() => { setShowForm(false); if (!form.id) setForm(emptyBank); }} onSave={() => void saveAccount()} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this bank account?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteAccount(pendingDelete)} confirmLabel="Delete Account" /> : null}
      <AccountingToast toast={toast} />
    </div>
  );
}

export function LiveTransactions() {
  const { journalEntries, chartAccounts, overview, settings, toast, notify, reload } = useAccountingData();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyJournal);
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const currency = settings?.currency || "ZAR";
  const filtered = useMemo(() => journalEntries.filter((entry) => `${entry.reference ?? ""} ${entry.memo ?? ""} ${entry.status} ${entry.lines.map((line) => line.account.name).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase())), [journalEntries, search]);

  async function saveEntry() {
    try {
      const amount = Number(form.lineOneDebit || form.lineTwoCredit || 0);
      const payload = {
        entryDate: new Date(form.entryDate).toISOString(),
        reference: form.reference || undefined,
        memo: form.memo || undefined,
        status: form.status,
        lines: [
          { accountId: form.lineOneAccountId, debit: amount, credit: 0 },
          { accountId: form.lineTwoAccountId, debit: 0, credit: amount },
        ].filter((line) => line.accountId),
      };
      if (form.id) {
        await apiFetch(`/accounting/journal-entries/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Journal entry updated successfully.");
      } else {
        await apiFetch("/accounting/journal-entries", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Journal entry created successfully.");
      }
      setForm(emptyJournal);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to save journal entry."));
    }
  }

  async function deleteEntry(entryId: string) {
    try {
      await apiFetch(`/accounting/journal-entries/${entryId}`, { method: "DELETE" });
      setPendingDelete(null);
      notify("success", "Journal entry deleted successfully.");
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to delete journal entry."));
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Journal Entries</p><p className="mt-2 text-xl font-semibold text-ink">{overview?.journalEntries ?? journalEntries.length}</p></Card>
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Base Currency</p><p className="mt-2 text-xl font-semibold text-ink">{currency}</p></Card>
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Chart Accounts</p><p className="mt-2 text-xl font-semibold text-ink">{chartAccounts.length}</p></Card>
      </div>
      <Card className="overflow-hidden">
        <TableHeader label="Transactions" title="General ledger entries" description="Post real journal entries for enterprise accounting control." count={filtered.length} addLabel="Add entry" onAdd={() => { setForm(emptyJournal); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search reference, memo, account" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70"><tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500"><th className="px-4 py-2.5 font-semibold">Date</th><th className="px-4 py-2.5 font-semibold">Reference</th><th className="px-4 py-2.5 font-semibold">Memo</th><th className="px-4 py-2.5 font-semibold">Lines</th><th className="px-4 py-2.5 text-right font-semibold">Actions</th></tr></thead>
            <tbody>
              {filtered.map((entry) => <tr key={entry.id} className="border-b border-line align-top transition hover:bg-soft/40"><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{new Date(entry.entryDate).toLocaleDateString()}</td><td className="px-4 py-3 text-sm font-semibold text-ink">{entry.reference || "Manual entry"}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{entry.memo || "No memo"}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{entry.lines.map((line) => `${line.account.code} ${line.account.name} (${Number(line.debit) > 0 ? `D ${Number(line.debit).toLocaleString()}` : `C ${Number(line.credit).toLocaleString()}`})`).join(" • ")}</td><td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><button onClick={() => { const debitLine = entry.lines.find((line) => Number(line.debit) > 0) ?? entry.lines[0]; const creditLine = entry.lines.find((line) => Number(line.credit) > 0) ?? entry.lines[1] ?? entry.lines[0]; setForm({ id: entry.id, entryDate: entry.entryDate.slice(0, 10), reference: entry.reference ?? "", memo: entry.memo ?? "", status: entry.status, lineOneAccountId: debitLine?.account.id ?? "", lineOneDebit: debitLine ? String(Number(debitLine.debit)) : "", lineOneCredit: "0", lineTwoAccountId: creditLine?.account.id ?? "", lineTwoDebit: "0", lineTwoCredit: creditLine ? String(Number(creditLine.credit)) : "" }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button><button onClick={() => setPendingDelete(entry.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /><span>Delete</span></button></div></td></tr>)}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No journal entries match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <JournalModal form={form} setForm={setForm} chartAccounts={chartAccounts} onClose={() => { setShowForm(false); if (!form.id) setForm(emptyJournal); }} onSave={() => void saveEntry()} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this journal entry?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteEntry(pendingDelete)} confirmLabel="Delete Entry" /> : null}
      <AccountingToast toast={toast} />
    </div>
  );
}

export function LiveChartOfAccounts() {
  const { chartAccounts, toast, notify, reload } = useAccountingData();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyAccount);
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const filtered = useMemo(() => chartAccounts.filter((account) => `${account.code} ${account.name} ${account.category}`.toLowerCase().includes(search.trim().toLowerCase())), [chartAccounts, search]);

  async function saveAccount() {
    try {
      const payload = { code: form.code || undefined, name: form.name || undefined, category: form.category, balanceSide: form.balanceSide, active: form.active === "true" };
      if (form.id) {
        await apiFetch(`/accounting/chart-accounts/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Chart account updated successfully.");
      } else {
        await apiFetch("/accounting/chart-accounts", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Chart account created successfully.");
      }
      setForm(emptyAccount);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to save chart account."));
    }
  }

  async function deleteAccount(accountId: string) {
    try {
      await apiFetch(`/accounting/chart-accounts/${accountId}`, { method: "DELETE" });
      setPendingDelete(null);
      notify("success", "Chart account deleted successfully.");
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to delete chart account."));
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Chart of Accounts" title="Real account structure" description="Maintain the actual chart of accounts used by journals and reporting." count={filtered.length} addLabel="Add account" onAdd={() => { setForm(emptyAccount); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search account code, name, category" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70"><tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500"><th className="px-4 py-2.5 font-semibold">Code</th><th className="px-4 py-2.5 font-semibold">Name</th><th className="px-4 py-2.5 font-semibold">Category</th><th className="px-4 py-2.5 font-semibold">Balance Side</th><th className="px-4 py-2.5 text-right font-semibold">Actions</th></tr></thead>
            <tbody>
              {filtered.map((account) => <tr key={account.id} className="border-b border-line transition hover:bg-soft/40"><td className="px-4 py-3 text-sm font-semibold text-ink">{account.code}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{account.name}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{account.category}</td><td className="px-4 py-3"><span className="rounded-full bg-soft px-2.5 py-1 text-[10px] font-semibold text-slate-700">{account.balanceSide}</span></td><td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><button onClick={() => { setForm({ id: account.id, code: account.code, name: account.name, category: account.category, balanceSide: account.balanceSide, active: account.active ? "true" : "false" }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button><button onClick={() => setPendingDelete(account.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /><span>Delete</span></button></div></td></tr>)}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No chart accounts match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <ChartAccountModal form={form} setForm={setForm} onClose={() => { setShowForm(false); if (!form.id) setForm(emptyAccount); }} onSave={() => void saveAccount()} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this chart account?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteAccount(pendingDelete)} confirmLabel="Delete Account" /> : null}
      <AccountingToast toast={toast} />
    </div>
  );
}

export function LiveTaxes() {
  const { taxRates, invoices, settings, toast, notify, reload } = useAccountingData();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyTaxRate);
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const filtered = useMemo(() => taxRates.filter((rate) => `${rate.name} ${rate.code} ${rate.appliesTo}`.toLowerCase().includes(search.trim().toLowerCase())), [taxRates, search]);
  const currency = settings?.currency || "ZAR";
  const totalTax = invoices.reduce((sum, invoice) => sum + Number(invoice.taxAmount), 0);
  const taxableBase = invoices.reduce((sum, invoice) => sum + Number(invoice.subtotal), 0);

  async function saveTaxRate() {
    try {
      const payload = { name: form.name || undefined, code: form.code || undefined, ratePercent: form.ratePercent ? Number(form.ratePercent) : 0, appliesTo: form.appliesTo, active: form.active === "true" };
      if (form.id) {
        await apiFetch(`/accounting/tax-rates/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Tax rate updated successfully.");
      } else {
        await apiFetch("/accounting/tax-rates", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Tax rate created successfully.");
      }
      setForm(emptyTaxRate);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to save tax rate."));
    }
  }

  async function deleteTaxRate(taxRateId: string) {
    try {
      await apiFetch(`/accounting/tax-rates/${taxRateId}`, { method: "DELETE" });
      setPendingDelete(null);
      notify("success", "Tax rate deleted successfully.");
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to delete tax rate."));
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Taxable Base</p><p className="mt-2 text-xl font-semibold text-ink">{currency} {taxableBase.toLocaleString()}</p></Card>
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Output Tax</p><p className="mt-2 text-xl font-semibold text-ink">{currency} {totalTax.toLocaleString()}</p></Card>
      </div>
      <Card className="overflow-hidden">
        <TableHeader label="Taxes" title="Tax rates and VAT rules" description="Manage real tax rate setup while tracking current output tax exposure." count={filtered.length} addLabel="Add tax rate" onAdd={() => { setForm(emptyTaxRate); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search tax name, code, scope" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70"><tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500"><th className="px-4 py-2.5 font-semibold">Tax</th><th className="px-4 py-2.5 font-semibold">Code</th><th className="px-4 py-2.5 font-semibold">Rate</th><th className="px-4 py-2.5 font-semibold">Applies To</th><th className="px-4 py-2.5 text-right font-semibold">Actions</th></tr></thead>
            <tbody>
              {filtered.map((rate) => <tr key={rate.id} className="border-b border-line transition hover:bg-soft/40"><td className="px-4 py-3 text-sm font-semibold text-ink">{rate.name}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{rate.code}</td><td className="px-4 py-3 text-xs font-semibold text-brand-500 md:text-sm">{Number(rate.ratePercent)}%</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{rate.appliesTo}</td><td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><button onClick={() => { setForm({ id: rate.id, name: rate.name, code: rate.code, ratePercent: String(Number(rate.ratePercent)), appliesTo: rate.appliesTo, active: rate.active ? "true" : "false" }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button><button onClick={() => setPendingDelete(rate.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /><span>Delete</span></button></div></td></tr>)}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No tax rates match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <TaxRateModal form={form} setForm={setForm} onClose={() => { setShowForm(false); if (!form.id) setForm(emptyTaxRate); }} onSave={() => void saveTaxRate()} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this tax rate?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteTaxRate(pendingDelete)} confirmLabel="Delete Tax Rate" /> : null}
      <AccountingToast toast={toast} />
    </div>
  );
}

export function LiveReportsPage() {
  const { overview, invoices, expenses, payments, settings, vendors, bankAccounts } = useAccountingData();
  const currency = settings?.currency || "ZAR";
  const profit = (overview?.revenue ?? 0) - (overview?.expenses ?? 0);
  const rows = [
    { metric: "Revenue", value: `${currency} ${(overview?.revenue ?? 0).toLocaleString()}` },
    { metric: "Expenses", value: `${currency} ${(overview?.expenses ?? 0).toLocaleString()}` },
    { metric: "Net Profit", value: `${currency} ${profit.toLocaleString()}` },
    { metric: "Outstanding Receivables", value: `${currency} ${(overview?.outstanding ?? 0).toLocaleString()}` },
    { metric: "Cash Position", value: `${currency} ${(overview?.cash ?? 0).toLocaleString()}` },
    { metric: "Invoice Count", value: String(invoices.length) },
    { metric: "Expense Count", value: String(expenses.length) },
    { metric: "Payment Count", value: String(payments.length) },
    { metric: "Vendor Count", value: String(vendors.length) },
    { metric: "Bank Accounts", value: String(bankAccounts.length) },
  ];
  const [search, setSearch] = useState("");
  const filtered = rows.filter((row) => `${row.metric} ${row.value}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <DerivedTable label="Reports" title="Financial reports" description="High-level reporting across the live accounting workspace." rows={filtered} columns={[{ key: "metric", label: "Metric" }, { key: "value", label: "Value", align: "right" }]} search={search} setSearch={setSearch} placeholder="Search report metric" />;
}

export function LivePeriodClose() {
  const { periods, invoices, expenses, toast, notify, reload } = useAccountingData();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyPeriod);
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const filtered = useMemo(() => periods.filter((period) => `${period.label} ${period.status}`.toLowerCase().includes(search.trim().toLowerCase())), [periods, search]);

  async function savePeriod() {
    try {
      const payload = { label: form.label || undefined, startDate: new Date(form.startDate).toISOString(), endDate: new Date(form.endDate).toISOString(), status: form.status as "OPEN" | "REVIEW" | "CLOSED" };
      if (form.id) {
        await apiFetch(`/accounting/periods/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Period updated successfully.");
      } else {
        await apiFetch("/accounting/periods", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Period created successfully.");
      }
      setForm(emptyPeriod);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to save period."));
    }
  }

  async function closePeriod(periodId: string) {
    try {
      await apiFetch(`/accounting/periods/${periodId}/close`, { method: "POST" });
      notify("success", "Period closed successfully.");
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to close period."));
    }
  }

  async function deletePeriod(periodId: string) {
    try {
      await apiFetch(`/accounting/periods/${periodId}`, { method: "DELETE" });
      setPendingDelete(null);
      notify("success", "Period deleted successfully.");
      await reload();
    } catch (error) {
      notify("error", parseApiError(error, "Failed to delete period."));
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Open Periods</p><p className="mt-2 text-xl font-semibold text-ink">{periods.filter((period) => period.status !== "CLOSED").length}</p></Card>
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Live Invoices</p><p className="mt-2 text-xl font-semibold text-ink">{invoices.length}</p></Card>
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Live Expenses</p><p className="mt-2 text-xl font-semibold text-ink">{expenses.length}</p></Card>
      </div>
      <Card className="overflow-hidden">
        <TableHeader label="Period Close" title="Monthly close management" description="Maintain close periods and trigger formal close actions." count={filtered.length} addLabel="Add period" onAdd={() => { setForm(emptyPeriod); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search period label or status" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70"><tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500"><th className="px-4 py-2.5 font-semibold">Period</th><th className="px-4 py-2.5 font-semibold">Start</th><th className="px-4 py-2.5 font-semibold">End</th><th className="px-4 py-2.5 font-semibold">Status</th><th className="px-4 py-2.5 text-right font-semibold">Actions</th></tr></thead>
            <tbody>
              {filtered.map((period) => <tr key={period.id} className="border-b border-line transition hover:bg-soft/40"><td className="px-4 py-3 text-sm font-semibold text-ink">{period.label}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{new Date(period.startDate).toLocaleDateString()}</td><td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{new Date(period.endDate).toLocaleDateString()}</td><td className="px-4 py-3"><span className="rounded-full bg-soft px-2.5 py-1 text-[10px] font-semibold text-slate-700">{period.status}</span></td><td className="px-4 py-3"><div className="flex items-center justify-end gap-2">{period.status !== "CLOSED" ? <button onClick={() => void closePeriod(period.id)} className="rounded-xl border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50">Close</button> : null}<button onClick={() => { setForm({ id: period.id, label: period.label, startDate: period.startDate.slice(0, 10), endDate: period.endDate.slice(0, 10), status: period.status }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button><button onClick={() => setPendingDelete(period.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /><span>Delete</span></button></div></td></tr>)}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No accounting periods match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <PeriodModal form={form} setForm={setForm} onClose={() => { setShowForm(false); if (!form.id) setForm(emptyPeriod); }} onSave={() => void savePeriod()} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this accounting period?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deletePeriod(pendingDelete)} confirmLabel="Delete Period" /> : null}
      <AccountingToast toast={toast} />
    </div>
  );
}
