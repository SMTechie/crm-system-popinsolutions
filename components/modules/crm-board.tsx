import { Card } from "@/components/ui/card";
import { crmPipeline } from "@/lib/data";

export function CrmBoard() {
  return (
    <div className="grid gap-4 xl:grid-cols-4">
      {crmPipeline.map((column) => (
        <Card key={column.stage} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{column.stage}</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{column.value}</p>
            </div>
            <span className="rounded-full bg-soft px-3 py-1 text-xs font-semibold text-brand-500">
              {column.deals.length} deals
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {column.deals.map((deal) => (
              <div key={deal.name} className="rounded-2xl border border-line bg-soft/60 p-4">
                <p className="text-lg font-semibold text-ink">{deal.name}</p>
                <p className="mt-1 text-sm text-slate-500">{deal.company}</p>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="rounded-full bg-white px-3 py-1 text-slate-600">{deal.owner}</span>
                  <span className="font-semibold text-brand-500">{deal.amount}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

