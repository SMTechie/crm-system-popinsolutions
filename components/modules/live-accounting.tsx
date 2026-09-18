"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type AccountingOverview = { revenue: number; outstanding: number; expenses: number };
type Invoice = {
  id: string;
  number: string;
  customer: string;
  total: string;
  subtotal: string;
  taxAmount: string;
  status: string;
  currency: string;
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

const emptyInvoice = { id: "", customer: "", subtotal: "", taxAmount: "", status: "SENT", currency: "ZAR" };
const emptyExpense = { id: "", category: "", vendor: "", amount: "", currency: "ZAR", invoiceId: "", incurredAt: "2026-08-04" };

export function LiveAccounting() {
  const [overview, setOverview] = useState<AccountingOverview | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [status, setStatus] = useState("");
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoice);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);

  async function load() {
    try {
      const [overviewData, invoicesData, expensesData] = await Promise.all([
        apiFetch<AccountingOverview>("/accounting/overview"),
        apiFetch<{ items: Invoice[] }>("/accounting/invoices"),
        apiFetch<{ items: Expense[] }>("/accounting/expenses"),
      ]);
      setOverview(overviewData);
      setInvoices(invoicesData.items);
      setExpenses(expensesData.items);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load accounting.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveInvoice() {
    try {
      const payload = {
        customer: invoiceForm.customer || undefined,
        subtotal: invoiceForm.subtotal ? Number(invoiceForm.subtotal) : undefined,
        taxAmount: invoiceForm.taxAmount ? Number(invoiceForm.taxAmount) : undefined,
        status: invoiceForm.status,
        currency: invoiceForm.currency || undefined,
      };
      if (invoiceForm.id) {
        await apiFetch(`/accounting/invoices/${invoiceForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        setStatus("Invoice updated successfully.");
      } else {
        await apiFetch("/accounting/invoices", { method: "POST", body: JSON.stringify(payload) });
        setStatus("Invoice created successfully.");
      }
      setInvoiceForm(emptyInvoice);
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save invoice.");
    }
  }

  async function saveExpense() {
    try {
      const payload = {
        category: expenseForm.category || undefined,
        vendor: expenseForm.vendor || undefined,
        amount: expenseForm.amount ? Number(expenseForm.amount) : undefined,
        currency: expenseForm.currency || undefined,
        invoiceId: expenseForm.invoiceId || "",
        incurredAt: expenseForm.incurredAt ? new Date(expenseForm.incurredAt).toISOString() : undefined,
      };
      if (expenseForm.id) {
        await apiFetch(`/accounting/expenses/${expenseForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        setStatus("Expense updated successfully.");
      } else {
        await apiFetch("/accounting/expenses", { method: "POST", body: JSON.stringify(payload) });
        setStatus("Expense created successfully.");
      }
      setExpenseForm(emptyExpense);
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save expense.");
    }
  }

  const statusCounts = invoices.reduce<Record<string, number>>((acc, invoice) => {
    acc[invoice.status] = (acc[invoice.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {status ? <Card className="p-4 text-sm text-slate-600">{status}</Card> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Revenue", `R${overview?.revenue?.toLocaleString() ?? "..."}`],
          ["Outstanding", `R${overview?.outstanding?.toLocaleString() ?? "..."}`],
          ["Expenses", `R${overview?.expenses?.toLocaleString() ?? "..."}`],
          ["Invoices", String(invoices.length || 0)],
        ].map(([label, value]) => (
          <Card key={label} className="p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-ink">Invoice pipeline</h3>
              <p className="mt-1 text-slate-500">Current invoice states from the accounting ledger.</p>
            </div>
            <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-500">{invoices.length} tracked</span>
          </div>
          <div className="mt-6 grid gap-3">
            {Object.entries(statusCounts).map(([label, count]) => (
              <div key={label} className="flex items-center justify-between rounded-2xl border border-line p-4">
                <div>
                  <p className="font-semibold text-ink">{label}</p>
                  <p className="text-sm text-slate-500">{count} invoices</p>
                </div>
                <p className="text-lg font-semibold text-brand-500">
                  R{invoices.filter((invoice) => invoice.status === label).reduce((sum, invoice) => sum + Number(invoice.total), 0).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-ink">{invoiceForm.id ? "Edit invoice" : "Create invoice"}</h3>
              <p className="mt-1 text-slate-500">Write and update real invoice records in the ledger.</p>
            </div>
            {invoiceForm.id ? <button onClick={() => setInvoiceForm(emptyInvoice)} className="rounded-2xl border border-line px-4 py-2 text-sm font-semibold text-slate-700">New Invoice</button> : null}
          </div>
          <div className="mt-6 grid gap-3">
            <input value={invoiceForm.customer} onChange={(event) => setInvoiceForm((current) => ({ ...current, customer: event.target.value }))} placeholder="Customer name" className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-brand-500" />
            <div className="grid gap-3 md:grid-cols-2">
              <input value={invoiceForm.subtotal} onChange={(event) => setInvoiceForm((current) => ({ ...current, subtotal: event.target.value }))} placeholder="Subtotal" className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-brand-500" />
              <input value={invoiceForm.taxAmount} onChange={(event) => setInvoiceForm((current) => ({ ...current, taxAmount: event.target.value }))} placeholder="Tax amount" className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-brand-500" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <select value={invoiceForm.status} onChange={(event) => setInvoiceForm((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-brand-500">
                {["DRAFT", "SENT", "PAID", "OVERDUE", "VOID"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input value={invoiceForm.currency} onChange={(event) => setInvoiceForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="Currency" className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-brand-500" />
            </div>
            <button onClick={() => void saveInvoice()} className="rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white">
              {invoiceForm.id ? "Update Invoice" : "Save Invoice"}
            </button>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-line p-6">
            <h3 className="text-2xl font-semibold text-ink">Live invoices</h3>
            <p className="mt-1 text-slate-500">Select an invoice to update the customer, totals, currency, or status.</p>
          </div>
          <div className="divide-y divide-line">
            {invoices.map((invoice) => (
              <button
                key={invoice.id}
                onClick={() => setInvoiceForm({ id: invoice.id, customer: invoice.customer, subtotal: String(Number(invoice.subtotal)), taxAmount: String(Number(invoice.taxAmount)), status: invoice.status, currency: invoice.currency })}
                className="flex w-full flex-col gap-3 px-6 py-5 text-left transition hover:bg-soft/50 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-lg font-semibold text-ink">{invoice.number}</p>
                  <p className="mt-1 text-sm text-slate-500">{invoice.customer}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-soft px-3 py-1 text-xs font-semibold text-slate-700">{invoice.status}</span>
                  <span className="font-semibold text-brand-500">{invoice.currency} {Number(invoice.total).toLocaleString()}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-ink">{expenseForm.id ? "Edit expense" : "Create expense"}</h3>
              <p className="mt-1 text-slate-500">Track and edit live operating expenses.</p>
            </div>
            {expenseForm.id ? <button onClick={() => setExpenseForm(emptyExpense)} className="rounded-2xl border border-line px-4 py-2 text-sm font-semibold text-slate-700">New Expense</button> : null}
          </div>
          <div className="mt-6 grid gap-3">
            <input value={expenseForm.category} onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))} placeholder="Category" className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-brand-500" />
            <input value={expenseForm.vendor} onChange={(event) => setExpenseForm((current) => ({ ...current, vendor: event.target.value }))} placeholder="Vendor" className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-brand-500" />
            <div className="grid gap-3 md:grid-cols-2">
              <input value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount" className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-brand-500" />
              <input value={expenseForm.currency} onChange={(event) => setExpenseForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="Currency" className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-brand-500" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <select value={expenseForm.invoiceId} onChange={(event) => setExpenseForm((current) => ({ ...current, invoiceId: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-brand-500">
                <option value="">Unlinked invoice</option>
                {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number}</option>)}
              </select>
              <input type="date" value={expenseForm.incurredAt} onChange={(event) => setExpenseForm((current) => ({ ...current, incurredAt: event.target.value }))} className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-brand-500" />
            </div>
            <button onClick={() => void saveExpense()} className="rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white">
              {expenseForm.id ? "Update Expense" : "Save Expense"}
            </button>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-line p-6">
          <h3 className="text-2xl font-semibold text-ink">Recent expenses</h3>
          <p className="mt-1 text-slate-500">Select an expense to edit vendor, category, amount, or invoice link.</p>
        </div>
        <div className="divide-y divide-line">
          {expenses.map((expense) => (
            <button
              key={expense.id}
              onClick={() => setExpenseForm({ id: expense.id, category: expense.category, vendor: expense.vendor ?? "", amount: String(Number(expense.amount)), currency: expense.currency, invoiceId: expense.invoiceId ?? "", incurredAt: expense.incurredAt.slice(0, 10) })}
              className="flex w-full flex-col gap-3 px-6 py-5 text-left transition hover:bg-soft/50 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="text-lg font-semibold text-ink">{expense.category}</p>
                <p className="text-sm text-slate-500">{expense.vendor ?? "Internal vendor"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">{new Date(expense.incurredAt).toLocaleDateString()}</span>
                <span className="font-semibold text-brand-500">{expense.currency} {Number(expense.amount).toLocaleString()}</span>
              </div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
