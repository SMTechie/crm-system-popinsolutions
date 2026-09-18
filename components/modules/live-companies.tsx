"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Company = {
  id: string;
  name: string;
  industry?: string | null;
  website?: string | null;
};

const emptyCompany = { id: "", name: "", industry: "", website: "" };

export function LiveCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyForm, setCompanyForm] = useState(emptyCompany);
  const [companySearch, setCompanySearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("ALL");
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function notify(type: "success" | "error", message: string) {
    setToast({ type, message });
  }

  async function load() {
    try {
      const data = await apiFetch<{ items: Company[] }>("/crm/companies");
      setCompanies(data.items);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to load companies.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function saveCompany() {
    try {
      if (companyForm.id) {
        await apiFetch(`/crm/companies/${companyForm.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: companyForm.name || undefined,
            industry: companyForm.industry || "",
            website: companyForm.website || "",
          }),
        });
        notify("success", "Company updated successfully.");
      } else {
        await apiFetch("/crm/companies", {
          method: "POST",
          body: JSON.stringify(companyForm),
        });
        notify("success", "Company created successfully.");
      }
      setCompanyForm(emptyCompany);
      setShowCompanyForm(false);
      await load();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save company.");
    }
  }

  const industries = useMemo(
    () => Array.from(new Set(companies.map((company) => company.industry || "General"))).sort(),
    [companies],
  );

  const filteredCompanies = useMemo(() => {
    const term = companySearch.trim().toLowerCase();
    return companies.filter((company) => {
      const matchesSearch =
        term.length === 0 ||
        company.name.toLowerCase().includes(term) ||
        (company.industry ?? "").toLowerCase().includes(term) ||
        (company.website ?? "").toLowerCase().includes(term);

      const matchesFilter =
        industryFilter === "ALL" ||
        (company.industry || "General").toLowerCase() === industryFilter.toLowerCase();

      return matchesSearch && matchesFilter;
    });
  }, [companies, companySearch, industryFilter]);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeCompanyId) ?? null,
    [activeCompanyId, companies],
  );

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Companies</p>
              <h2 className="mt-1 text-lg font-semibold text-ink md:text-xl">Account and organization records</h2>
              <p className="mt-1 text-xs text-slate-500">Search, filter, edit, and create live company records from Neon.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                {filteredCompanies.length} shown
              </span>
              <button
                onClick={() => {
                  setCompanyForm(emptyCompany);
                  setShowCompanyForm(true);
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-soft"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add company</span>
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={companySearch}
                onChange={(event) => setCompanySearch(event.target.value)}
                placeholder="Search company, industry, website"
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
              />
            </label>
            <select
              value={industryFilter}
              onChange={(event) => setIndustryFilter(event.target.value)}
              className="rounded-2xl border border-line bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500"
            >
              <option value="ALL">All industries</option>
              {industries.map((industry) => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Company</th>
                <th className="px-4 py-2.5 font-semibold">Industry</th>
                <th className="px-4 py-2.5 font-semibold">Website</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((company) => (
                <tr key={company.id} className="border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setActiveCompanyId(company.id)}
                      className="text-sm font-semibold text-ink transition hover:text-brand-500"
                    >
                      {company.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{company.industry || "General"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{company.website || "No website"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setCompanyForm({
                            id: company.id,
                            name: company.name,
                            industry: company.industry ?? "",
                            website: company.website ?? "",
                          });
                          setShowCompanyForm(true);
                        }}
                        className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    No companies match the current search or filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {activeCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Company</p>
                <h3 className="mt-1 text-2xl font-semibold text-ink">{activeCompany.name}</h3>
                <p className="mt-1 text-sm text-slate-500">Organization profile from the live CRM workspace.</p>
              </div>
              <button
                onClick={() => setActiveCompanyId(null)}
                className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft"
              >
                Close
              </button>
            </div>
            <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
              <div className="rounded-[24px] border border-line p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Company Details</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Name</p>
                    <p className="mt-1 font-medium text-ink">{activeCompany.name}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Industry</p>
                    <p className="mt-1">{activeCompany.industry || "General"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Website</p>
                    {activeCompany.website ? (
                      <a
                        href={activeCompany.website}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block font-medium text-brand-500 hover:underline"
                      >
                        {activeCompany.website}
                      </a>
                    ) : (
                      <p className="mt-1">Not provided</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="rounded-[24px] border border-line p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Summary</p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-line bg-slate-50/70 p-4">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Record Type</p>
                    <p className="mt-1 text-sm font-semibold text-ink">Company Account</p>
                  </div>
                  <div className="rounded-2xl border border-line bg-slate-50/70 p-4">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Industry Segment</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{activeCompany.industry || "General"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showCompanyForm ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[28px] border border-line bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {companyForm.id ? "Edit Company" : "Add Company"}
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-ink">
                  {companyForm.id ? "Update company details" : "Create a new company"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">Save the company directly into your live CRM workspace.</p>
              </div>
              <button
                onClick={() => {
                  setShowCompanyForm(false);
                  if (!companyForm.id) {
                    setCompanyForm(emptyCompany);
                  }
                }}
                className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-soft"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 px-6 py-5 md:grid-cols-2">
              <input
                value={companyForm.name}
                onChange={(event) => setCompanyForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Company name"
                className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500"
              />
              <input
                value={companyForm.industry}
                onChange={(event) => setCompanyForm((current) => ({ ...current, industry: event.target.value }))}
                placeholder="Industry"
                className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500"
              />
              <input
                value={companyForm.website}
                onChange={(event) => setCompanyForm((current) => ({ ...current, website: event.target.value }))}
                placeholder="Website"
                className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 md:col-span-2"
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
              <button
                onClick={() => {
                  setShowCompanyForm(false);
                  if (!companyForm.id) {
                    setCompanyForm(emptyCompany);
                  }
                }}
                className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveCompany()}
                className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white"
              >
                {companyForm.id ? "Update Company" : "Save Company"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[70] max-w-sm">
          <div
            className={`rounded-[22px] border px-4 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.16)] ${
              toast.type === "success"
                ? "border-emerald-200 bg-white text-emerald-700"
                : "border-rose-200 bg-white text-rose-600"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">
              {toast.type === "success" ? "Success" : "Error"}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-700">{toast.message}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
