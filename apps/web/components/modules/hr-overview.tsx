import { Card } from "@/components/ui/card";
import { employees } from "@/lib/data";

export function HrOverview() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Employees", "42"],
          ["On Leave", "5"],
          ["Pending Reviews", "8"],
          ["Payroll Run", "Aug 25"],
        ].map(([label, value]) => (
          <Card key={label} className="p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-line p-6">
          <h3 className="text-2xl font-semibold text-ink">People Directory</h3>
          <p className="mt-1 text-slate-500">Employee profiles, leave state, and payroll-sensitive roles.</p>
        </div>
        <div className="divide-y divide-line">
          {employees.map((employee) => (
            <div key={employee.email} className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 font-semibold text-brand-500">
                  {employee.name.split(" ").map((part) => part[0]).join("")}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <p className="text-xl font-semibold text-ink">{employee.name}</p>
                    <span className="rounded-full bg-soft px-3 py-1 text-sm text-slate-600">{employee.role}</span>
                  </div>
                  <p className="mt-1 text-base text-slate-500">{employee.email}</p>
                  <p className="mt-1 text-sm text-emerald-600">{employee.status}</p>
                </div>
              </div>
              <button className="rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600">
                Open Profile
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

