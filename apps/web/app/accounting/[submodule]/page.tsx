import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import {
  LiveBanking,
  LiveChartOfAccounts,
  LiveCustomers,
  LiveExpensesPage,
  LiveInvoices,
  LivePaymentsPage,
  LivePeriodClose,
  LiveQuotes,
  LiveReportsPage,
  LiveTaxes,
  LiveTransactions,
  LiveVendors,
} from "@/components/modules/live-accounting-pages";
import { ContributionsRegister } from "@/components/modules/contributions-register";

const accountingSubmodules: Record<string, { title: string; description: string; component: ReactNode }> = {
  invoices: {
    title: "Accounting Invoices",
    description: "Create, review, and update quotes, invoices, and live billing records.",
    component: <LiveInvoices />,
  },
  contributions: {
    title: "Monthly Contributions",
    description: "Track recurring client contributions and mark monthly payment status.",
    component: <ContributionsRegister />,
  },
  quotes: {
    title: "Accounting Quotes",
    description: "Prepare draft estimates and convert quote-ready billing records.",
    component: <LiveQuotes />,
  },
  expenses: {
    title: "Accounting Expenses",
    description: "Track operating costs, vendors, and linked expense records from the ledger.",
    component: <LiveExpensesPage />,
  },
  payments: {
    title: "Accounting Payments",
    description: "Review payment status, collections, and cash movement across accounting records.",
    component: <LivePaymentsPage />,
  },
  customers: {
    title: "Accounting Companies",
    description: "See billed customers, invoice volume, receivables, and account totals.",
    component: <LiveCustomers />,
  },
  vendors: {
    title: "Accounting Vendors",
    description: "Review supplier profiles and spend derived from live expense activity.",
    component: <LiveVendors />,
  },
  banking: {
    title: "Accounting Banking",
    description: "Track operating balances, receivables, and cash movement in one place.",
    component: <LiveBanking />,
  },
  transactions: {
    title: "Accounting Transactions",
    description: "Browse the combined ledger across payments and expenses.",
    component: <LiveTransactions />,
  },
  "chart-of-accounts": {
    title: "Chart of Accounts",
    description: "Review your account structure and derived live balances.",
    component: <LiveChartOfAccounts />,
  },
  taxes: {
    title: "Accounting Taxes",
    description: "Monitor VAT and tax totals based on the live invoice book.",
    component: <LiveTaxes />,
  },
  reports: {
    title: "Accounting Reports",
    description: "Use live financial records to monitor operational accounting performance and outputs.",
    component: <LiveReportsPage />,
  },
  "period-close": {
    title: "Period Close",
    description: "Check monthly close readiness from invoices and expense activity.",
    component: <LivePeriodClose />,
  },
};

export default async function AccountingSubmodulePage({ params }: { params: Promise<{ submodule: string }> }) {
  const { submodule } = await params;
  const content = accountingSubmodules[submodule];

  if (!content) {
    notFound();
  }

  return (
    <AppShell title={content.title} description={content.description}>
      {content.component}
    </AppShell>
  );
}
