import { Card } from "@/components/ui/card";
import { accountingStats } from "@/lib/data";

export function AccountingOverview() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {accountingStats.map((stat) => (
          <Card key={stat.label} className="p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{stat.label}</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{stat.value}</p>
            <p className="mt-2 text-sm text-emerald-600">{stat.delta} vs last month</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-ink">Invoice pipeline</h3>
              <p className="mt-1 text-slate-500">Track draft, sent, paid, and overdue invoices.</p>
            </div>
            <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-500">24 open</span>
          </div>
          <div className="mt-6 grid gap-3">
            {[
              ["Draft", "R84,000", "6 invoices"],
              ["Sent", "R216,000", "11 invoices"],
              ["Paid", "R592,000", "32 invoices"],
              ["Overdue", "R110,000", "7 invoices"],
            ].map(([label, amount, meta]) => (
              <div key={label} className="flex items-center justify-between rounded-2xl border border-line p-4">
                <div>
                  <p className="font-semibold text-ink">{label}</p>
                  <p className="text-sm text-slate-500">{meta}</p>
                </div>
                <p className="text-lg font-semibold text-brand-500">{amount}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="text-2xl font-semibold text-ink">Finance menu</h3>
          <p className="mt-1 text-slate-500">Matches the clean modal system from your references.</p>
          <div className="mt-6 grid gap-3">
            {[
              ["Dashboard", "Finance overview"],
              ["Transactions", "Journals and ledgers"],
              ["Reports", "P&L, balance sheet, cash flow"],
              ["Setup", "Tax, currency, chart of accounts"],
              ["Banking", "Accounts and reconciliation"],
              ["Period Close", "Monthly close controls"],
            ].map(([title, subtitle]) => (
              <div key={title} className="rounded-2xl border border-line p-4">
                <p className="text-lg font-semibold text-ink">{title}</p>
                <p className="text-sm text-slate-500">{subtitle}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

