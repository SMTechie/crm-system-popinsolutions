"use client";

import type {
  Dispatch,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  SetStateAction,
  TextareaHTMLAttributes,
} from "react";
import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { getStoredSession } from "@/lib/session";

type HrOverview = {
  employees: number;
  onLeave: number;
  pendingLeave: number;
  attendanceEntries: number;
  payrollRuns: number;
  performanceReviews: number;
  documents: number;
};

type Employee = {
  id: string;
  employeeNumber?: string | null;
  fullName: string;
  email: string;
  phone?: string | null;
  idPassportNumber?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  title: string;
  department?: string | null;
  location?: string | null;
  managerName?: string | null;
  employmentStatus?: string | null;
  employmentType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  salaryAmount?: string | number | null;
  bankName?: string | null;
  bankAccountHolder?: string | null;
  bankAccountNumber?: string | null;
  bankBranch?: string | null;
  bankAccountType?: string | null;
  attendanceQrToken?: string | null;
  _count?: {
    leaveRequests: number;
    documents: number;
    attendanceRecords: number;
    payrollRuns: number;
    performanceReviews: number;
  };
};

type LeaveRequest = {
  id: string;
  employeeId: string;
  employee: { id: string; fullName: string; department?: string | null };
  startDate: string;
  endDate: string;
  type: string;
  status: string;
  reason?: string | null;
};

type AttendanceRecord = {
  id: string;
  employeeId: string;
  employee: { id: string; fullName: string; department?: string | null };
  date: string;
  status: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  notes?: string | null;
};

type PayrollRun = {
  id: string;
  employeeId: string;
  employee: { id: string; fullName: string; title?: string | null };
  periodLabel: string;
  payDate: string;
  grossAmount: string | number;
  deductions: string | number;
  netAmount: string | number;
  status: string;
  notes?: string | null;
  deductionItems?: PayrollDeduction[];
};

type PayrollDeduction = { id?: string; name: string; mode: "AMOUNT" | "PERCENT"; value: string };

type PerformanceReview = {
  id: string;
  employeeId: string;
  employee: { id: string; fullName: string; title?: string | null };
  reviewDate: string;
  score?: number | null;
  reviewerName?: string | null;
  status: string;
  summary?: string | null;
};

type EmployeeDocument = {
  id: string;
  employeeId: string;
  employee: { id: string; fullName: string; department?: string | null };
  label: string;
  category?: string | null;
  fileKey: string;
  expiresAt?: string | null;
  createdAt: string;
};

type ToastState = { type: "success" | "error"; message: string } | null;

const today = "2026-08-04";

const emptyEmployee = {
  id: "",
  employeeNumber: "",
  fullName: "",
  email: "",
  phone: "",
  idPassportNumber: "",
  dateOfBirth: "",
  gender: "",
  address: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  title: "",
  department: "",
  location: "",
  managerName: "",
  employmentStatus: "ACTIVE",
  employmentType: "FULL_TIME",
  startDate: today,
  endDate: "",
  salaryAmount: "",
  bankName: "",
  bankAccountHolder: "",
  bankAccountNumber: "",
  bankBranch: "",
  bankAccountType: "",
};

const emptyLeave = {
  id: "",
  employeeId: "",
  startDate: today,
  endDate: "2026-08-05",
  type: "PTO",
  status: "PENDING",
  reason: "",
};

const emptyAttendance = {
  id: "",
  employeeId: "",
  date: today,
  status: "PRESENT",
  checkInAt: "08:00",
  checkOutAt: "17:00",
  notes: "",
};

const emptyPayroll = {
  id: "",
  employeeId: "",
  periodLabel: "August 2026",
  payDate: today,
  grossAmount: "",
  deductions: "",
  deductionsInput: "",
  deductionsMode: "AMOUNT",
  deductionItems: [{ name: "", mode: "AMOUNT", value: "" }] as PayrollDeduction[],
  netAmount: "",
  status: "DRAFT",
  notes: "",
};

const emptyReview = {
  id: "",
  employeeId: "",
  reviewDate: today,
  score: "",
  reviewerName: "",
  status: "SCHEDULED",
  summary: "",
};

const emptyDocument = {
  id: "",
  employeeId: "",
  label: "",
  category: "Contract",
  fileKey: "",
  expiresAt: "",
};

function formatMoney(value?: string | number | null) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(parsed) ? parsed : 0);
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-ZA");
}

function toDateTime(date: string, time?: string) {
  if (!date) return undefined;
  return new Date(`${date}T${time && time.length > 0 ? time : "00:00"}:00`).toISOString();
}

function fromIsoTime(value?: string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(11, 16);
}

function HrToast({ toast }: { toast: ToastState }) {
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
  return <input {...props} className={`w-full rounded-2xl border border-line px-4 py-3 text-sm text-ink outline-none transition focus:border-brand-500 ${props.className ?? ""}`} />;
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand-500 ${props.className ?? ""}`} />;
}

function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`rounded-2xl border border-line px-4 py-3 text-sm text-ink outline-none transition focus:border-brand-500 ${props.className ?? ""}`} />;
}

function useHrData() {
  const [overview, setOverview] = useState<HrOverview | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [performanceReviews, setPerformanceReviews] = useState<PerformanceReview[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [toast, setToast] = useState<ToastState>(null);

  function notify(type: "success" | "error", message: string) {
    setToast({ type, message });
  }

  async function reload() {
    try {
      const [overviewData, employeeData, leaveData, attendanceData, payrollData, reviewData, documentData] = await Promise.all([
        apiFetch<HrOverview>("/hr/overview"),
        apiFetch<{ items: Employee[] }>("/hr/employees"),
        apiFetch<{ items: LeaveRequest[] }>("/hr/leave-requests"),
        apiFetch<{ items: AttendanceRecord[] }>("/hr/attendance"),
        apiFetch<{ items: PayrollRun[] }>("/hr/payroll-runs"),
        apiFetch<{ items: PerformanceReview[] }>("/hr/performance-reviews"),
        apiFetch<{ items: EmployeeDocument[] }>("/hr/documents"),
      ]);
      setOverview(overviewData);
      setEmployees(employeeData.items);
      setLeaveRequests(leaveData.items);
      setAttendance(attendanceData.items);
      setPayrollRuns(payrollData.items);
      setPerformanceReviews(reviewData.items);
      setDocuments(documentData.items);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to load HR workspace.");
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

  return {
    overview,
    employees,
    leaveRequests,
    attendance,
    payrollRuns,
    performanceReviews,
    documents,
    toast,
    notify,
    reload,
  };
}

function EmployeeModal({
  form,
  setForm,
  selectedPhoto,
  setSelectedPhoto,
  selectedDocuments,
  setSelectedDocuments,
  onClose,
  onSave,
}: {
  form: typeof emptyEmployee;
  setForm: Dispatch<SetStateAction<typeof emptyEmployee>>;
  selectedPhoto: File | null;
  setSelectedPhoto: (file: File | null) => void;
  selectedDocuments: File[];
  setSelectedDocuments: (files: File[]) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <BaseModal label={form.id ? "Edit Employee" : "Add Employee"} title="Manage employee profile" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Employee" : "Save Employee"}>
      <div className="space-y-5">
        <section className="rounded-3xl border border-line bg-slate-50/70 p-4"><div className="mb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Identity and contact</p><p className="mt-1 text-sm text-slate-600">Core employee details used across HR, payroll, and payslips.</p></div><div className="grid gap-3 md:grid-cols-2"><Input value={form.employeeNumber} onChange={(event) => setForm((current) => ({ ...current, employeeNumber: event.target.value }))} placeholder="Employee number (optional)" /><Input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Full name" required /><Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email address" required /><Input type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone number" /><Input value={form.idPassportNumber} onChange={(event) => setForm((current) => ({ ...current, idPassportNumber: event.target.value }))} placeholder="ID / passport number" /><label className="text-xs font-semibold text-slate-500">Date of birth<Input className="mt-1" type="date" value={form.dateOfBirth} onChange={(event) => setForm((current) => ({ ...current, dateOfBirth: event.target.value }))} /></label><Select value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}><option value="">Select gender</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="NON_BINARY">Non-binary</option><option value="PREFER_NOT_TO_SAY">Prefer not to say</option></Select><Textarea value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} rows={2} className="md:col-span-2" placeholder="Residential address" /></div></section>
        <section className="rounded-3xl border border-line bg-white p-4"><div className="mb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Employment</p><p className="mt-1 text-sm text-slate-600">Set the employee’s role, reporting line, status, and employment dates.</p></div><div className="grid gap-3 md:grid-cols-2"><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Job title" required /><Input value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} placeholder="Department" /><Input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="Work location" /><Input value={form.managerName} onChange={(event) => setForm((current) => ({ ...current, managerName: event.target.value }))} placeholder="Manager / supervisor" /><Select value={form.employmentStatus} onChange={(event) => setForm((current) => ({ ...current, employmentStatus: event.target.value }))}>{["ACTIVE", "ON_LEAVE", "PROBATION", "OFFBOARDED"].map((item) => <option key={item} value={item}>{item}</option>)}</Select><Select value={form.employmentType} onChange={(event) => setForm((current) => ({ ...current, employmentType: event.target.value }))}>{["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERN"].map((item) => <option key={item} value={item}>{item}</option>)}</Select><label className="text-xs font-semibold text-slate-500">Start date<Input className="mt-1" type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} required /></label><label className="text-xs font-semibold text-slate-500">End date (optional)<Input className="mt-1" type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></label></div></section>
        <section className="rounded-3xl border border-line bg-white p-4"><div className="mb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Compensation and banking</p><p className="mt-1 text-sm text-slate-600">These details support payroll preparation and payslip processing.</p></div><div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold text-slate-500">Monthly salary<Input className="mt-1" type="number" min="0" step="0.01" value={form.salaryAmount} onChange={(event) => setForm((current) => ({ ...current, salaryAmount: event.target.value }))} placeholder="0.00" /></label><Input value={form.bankName} onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))} placeholder="Bank name" /><Input value={form.bankAccountHolder} onChange={(event) => setForm((current) => ({ ...current, bankAccountHolder: event.target.value }))} placeholder="Account holder" /><Input inputMode="numeric" value={form.bankAccountNumber} onChange={(event) => setForm((current) => ({ ...current, bankAccountNumber: event.target.value }))} placeholder="Account number" /><Input value={form.bankBranch} onChange={(event) => setForm((current) => ({ ...current, bankBranch: event.target.value }))} placeholder="Branch code" /><Select value={form.bankAccountType} onChange={(event) => setForm((current) => ({ ...current, bankAccountType: event.target.value }))}><option value="">Account type</option><option value="CHEQUE">Cheque</option><option value="SAVINGS">Savings</option><option value="CURRENT">Current</option></Select></div></section>
        <section className="rounded-3xl border border-line bg-slate-50/70 p-4"><div className="mb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Emergency contact and files</p><p className="mt-1 text-sm text-slate-600">Attach a profile picture and employee records such as IDs, contracts, or tax documents.</p></div><div className="grid gap-3 md:grid-cols-2"><Input value={form.emergencyContactName} onChange={(event) => setForm((current) => ({ ...current, emergencyContactName: event.target.value }))} placeholder="Emergency contact name" /><Input type="tel" value={form.emergencyContactPhone} onChange={(event) => setForm((current) => ({ ...current, emergencyContactPhone: event.target.value }))} placeholder="Emergency contact phone" /><label className="rounded-2xl border border-dashed border-brand-300 bg-white p-4 text-xs font-semibold text-slate-600">Profile picture<input type="file" accept="image/png,image/jpeg" onChange={(event) => setSelectedPhoto(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-xs" />{selectedPhoto ? <span className="mt-1 block truncate font-normal text-slate-500">{selectedPhoto.name}</span> : null}</label><label className="rounded-2xl border border-dashed border-brand-300 bg-white p-4 text-xs font-semibold text-slate-600">Employee documents<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.docx" onChange={(event) => setSelectedDocuments(Array.from(event.target.files ?? []))} className="mt-2 block w-full text-xs" />{selectedDocuments.length ? <span className="mt-1 block font-normal text-slate-500">{selectedDocuments.length} file(s) selected</span> : null}</label></div></section>
      </div>
    </BaseModal>
  );
}

function EmployeeViewModal({ employee, documents, attendance, onClose }: { employee: Employee; documents: EmployeeDocument[]; attendance: AttendanceRecord[]; onClose: () => void }) {
  const employeeDocuments = documents.filter((document) => document.employeeId === employee.id);
  const [employeeAttendance, setEmployeeAttendance] = useState<AttendanceRecord[]>(attendance.filter((record) => record.employeeId === employee.id).slice(0, 10));
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState("");
  useEffect(() => {
    void apiFetch<{ qrDataUrl: string }>(`/attendance/employee-qr/${employee.id}`, { method: "POST" })
      .then((result) => setQrDataUrl(result.qrDataUrl))
      .catch((error) => setQrError(error instanceof Error ? error.message : "Unable to load QR code."));
  }, [employee.id]);
  useEffect(() => {
    void apiFetch<{ items: AttendanceRecord[] }>(`/hr/attendance?employeeId=${encodeURIComponent(employee.id)}&pageSize=50`)
      .then((result) => setEmployeeAttendance(result.items.slice(0, 10)))
      .catch(() => undefined);
  }, [employee.id]);
  const value = (item?: string | null) => item || "Not provided";
  return (
    <BaseModal label="Employee profile" title={employee.fullName} onClose={onClose} onSave={onClose} saveLabel="Close">
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-3xl border border-line bg-slate-50/70 p-4"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-xl font-semibold text-white">{employee.fullName.slice(0, 2).toUpperCase()}</div><div><p className="text-lg font-semibold text-ink">{employee.fullName}</p><p className="text-sm text-slate-500">{employee.title} · {employee.department || "General"}</p><p className="mt-1 text-xs text-slate-500">{employee.email}</p></div><span className="ml-auto rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{employee.employmentStatus || "ACTIVE"}</span></div>
        <section className="rounded-3xl border border-line p-4"><p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Employment and contact</p><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[["Employee number", employee.employeeNumber], ["Phone", employee.phone], ["Employment type", employee.employmentType], ["Start date", employee.startDate?.slice(0, 10)], ["End date", employee.endDate?.slice(0, 10)], ["Location", employee.location], ["Manager", employee.managerName], ["Date of birth", employee.dateOfBirth?.slice(0, 10)], ["ID / passport", employee.idPassportNumber]].map(([label, item]) => <div key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-ink">{value(item)}</p></div>)}</div></section>
        <section className="grid gap-5 md:grid-cols-2"><div className="rounded-3xl border border-line p-4"><p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Payroll and banking</p><div className="space-y-3 text-sm"><div className="flex justify-between gap-3"><span className="text-slate-500">Monthly salary</span><strong className="text-ink">{formatMoney(employee.salaryAmount)}</strong></div><div className="flex justify-between gap-3"><span className="text-slate-500">Bank</span><strong className="text-ink">{value(employee.bankName)}</strong></div><div className="flex justify-between gap-3"><span className="text-slate-500">Account holder</span><strong className="text-ink">{value(employee.bankAccountHolder)}</strong></div><div className="flex justify-between gap-3"><span className="text-slate-500">Account type</span><strong className="text-ink">{value(employee.bankAccountType)}</strong></div><div className="flex justify-between gap-3"><span className="text-slate-500">Account number</span><strong className="text-ink">{value(employee.bankAccountNumber)}</strong></div></div></div><div className="rounded-3xl border border-line p-4"><p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Emergency contact</p><p className="text-sm font-semibold text-ink">{value(employee.emergencyContactName)}</p><p className="mt-1 text-sm text-slate-500">{value(employee.emergencyContactPhone)}</p><p className="mt-4 text-xs text-slate-500">Address</p><p className="mt-1 text-sm text-ink">{value(employee.address)}</p></div></section>
        <section className="grid gap-5 md:grid-cols-2"><div className="rounded-3xl border border-line p-4"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Attendance QR code</p><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Ready</span></div>{qrDataUrl ? <><img src={qrDataUrl} alt={`Attendance QR code for ${employee.fullName}`} className="mx-auto mt-3 h-40 w-40 rounded-2xl border border-line p-2" /><div className="mt-3 flex justify-center gap-2"><a href={qrDataUrl} download={`${employee.fullName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-attendance-qr.png`} className="rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white">Download</a><button onClick={() => window.print()} className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-slate-700">Print</button></div></> : <p className="mt-3 text-sm text-slate-500">{qrError || "Loading QR code…"}</p>}</div><div className="rounded-3xl border border-line p-4"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Attendance history</p><span className="rounded-full bg-soft px-2.5 py-1 text-xs font-semibold text-slate-600">{employeeAttendance.length}</span></div>{employeeAttendance.length ? <div className="mt-3 space-y-2">{employeeAttendance.map((record) => <div key={record.id} className="rounded-2xl bg-slate-50 px-3 py-2.5"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-ink">{formatDate(record.date)}</p><span className="text-xs font-semibold text-emerald-700">{record.status}</span></div><p className="mt-1 text-xs text-slate-500">In: {fromIsoTime(record.checkInAt) || "—"} · Out: {fromIsoTime(record.checkOutAt) || "—"}</p><p className="mt-1 truncate text-[11px] text-slate-400">{record.notes || "No notes"}</p></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No attendance history yet.</p>}</div></section>
        <section className="rounded-3xl border border-line p-4"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Attached documents</p><span className="rounded-full bg-soft px-2.5 py-1 text-xs font-semibold text-slate-600">{employeeDocuments.length}</span></div>{employeeDocuments.length ? <div className="mt-3 space-y-2">{employeeDocuments.map((document) => <div key={document.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2.5"><div><p className="text-sm font-medium text-ink">{document.label}</p><p className="text-xs text-slate-500">{document.category || "Employee document"}</p></div><span className="text-xs text-slate-500">{document.expiresAt ? `Expires ${document.expiresAt.slice(0, 10)}` : "No expiry"}</span></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No documents attached yet.</p>}</section>
      </div>
    </BaseModal>
  );
}

function HrDetailModal({ title, subtitle, fields, onClose }: { title: string; subtitle?: string; fields: Array<[string, string]>; onClose: () => void }) {
  return <BaseModal label="Record details" title={title} onClose={onClose} onSave={onClose} saveLabel="Close"><div className="space-y-4"><p className="text-sm text-slate-500">{subtitle || "Review the saved record details below."}</p><div className="grid gap-3 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="rounded-2xl border border-line bg-slate-50/70 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-ink">{value || "Not provided"}</p></div>)}</div></div></BaseModal>;
}

function LeaveModal({ form, setForm, employees, onClose, onSave }: { form: typeof emptyLeave; setForm: Dispatch<SetStateAction<typeof emptyLeave>>; employees: Employee[]; onClose: () => void; onSave: () => void }) {
  const start = form.startDate ? new Date(form.startDate).getTime() : 0;
  const end = form.endDate ? new Date(form.endDate).getTime() : 0;
  const leaveDays = start && end && end >= start ? Math.floor((end - start) / 86400000) + 1 : 0;
  return (
    <BaseModal label={form.id ? "Edit Leave Request" : "Add Leave Request"} title="Prepare a leave request" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Request" : "Submit Request"}>
      <div className="space-y-5">
        <section className="rounded-3xl border border-line bg-slate-50/70 p-4"><div className="mb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Employee</p><p className="mt-1 text-sm text-slate-600">Select the employee submitting this leave request.</p></div><Select value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))} className="w-full"><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}{employee.department ? ` · ${employee.department}` : ""}</option>)}</Select></section>
        <section className="rounded-3xl border border-line bg-white p-4"><div className="mb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Leave period</p><p className="mt-1 text-sm text-slate-600">Choose the first and last day of the requested leave.</p></div><div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold text-slate-500">Start date<Input className="mt-1" type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></label><label className="text-xs font-semibold text-slate-500">End date<Input className="mt-1" type="date" min={form.startDate} value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></label><div className="flex items-center justify-between rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm md:col-span-2"><span className="text-slate-600">Requested duration</span><strong className="text-brand-700">{leaveDays ? `${leaveDays} day${leaveDays === 1 ? "" : "s"}` : "Set valid dates"}</strong></div></div></section>
        <section className="rounded-3xl border border-line bg-slate-50/70 p-4"><div className="mb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Request details</p></div><div className="grid gap-3 md:grid-cols-2"><Select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}><option value="PTO">Paid time off</option><option value="SICK">Sick leave</option><option value="UNPAID">Unpaid leave</option><option value="PARENTAL">Parental leave</option><option value="BEREAVEMENT">Bereavement leave</option><option value="OTHER">Other</option></Select><Select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>{["PENDING", "APPROVED", "REJECTED"].map((item) => <option key={item} value={item}>{item}</option>)}</Select><Textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} rows={4} className="md:col-span-2" placeholder="Reason or supporting context (optional)" /></div></section>
      </div>
    </BaseModal>
  );
}

function AttendanceModal({ form, setForm, employees, onClose, onSave }: { form: typeof emptyAttendance; setForm: Dispatch<SetStateAction<typeof emptyAttendance>>; employees: Employee[]; onClose: () => void; onSave: () => void }) {
  return (
    <BaseModal label={form.id ? "Edit Attendance" : "Add Attendance"} title="Manage attendance entry" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Attendance" : "Save Attendance"}>
      <div className="grid gap-3 md:grid-cols-2">
        <Select value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))} className="md:col-span-2">
          <option value="">Select employee</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
        </Select>
        <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
        <Select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
          {["PRESENT", "REMOTE", "LATE", "ABSENT", "HALF_DAY"].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
        <Input type="time" value={form.checkInAt} onChange={(event) => setForm((current) => ({ ...current, checkInAt: event.target.value }))} />
        <Input type="time" value={form.checkOutAt} onChange={(event) => setForm((current) => ({ ...current, checkOutAt: event.target.value }))} />
        <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={4} className="md:col-span-2" placeholder="Notes" />
      </div>
    </BaseModal>
  );
}

function PayrollModal({ form, setForm, employees, onClose, onSave }: { form: typeof emptyPayroll; setForm: Dispatch<SetStateAction<typeof emptyPayroll>>; employees: Employee[]; onClose: () => void; onSave: () => void }) {
  const selectedEmployee = employees.find((employee) => employee.id === form.employeeId);
  const gross = Math.max(0, Number(form.grossAmount) || 0);
  const deductions = Math.min(gross, form.deductionItems.reduce((sum, item) => sum + (item.mode === "PERCENT" ? gross * Math.max(0, Number(item.value) || 0) / 100 : Math.max(0, Number(item.value) || 0)), 0));
  const net = Math.max(0, gross - deductions);
  const money = (value: number) => `ZAR ${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const updateDeduction = (index: number, key: keyof PayrollDeduction, value: string) => setForm((current) => ({ ...current, deductionItems: current.deductionItems.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  const addDeduction = () => setForm((current) => ({ ...current, deductionItems: [...current.deductionItems, { name: "", mode: "AMOUNT", value: "" }] }));
  const removeDeduction = (index: number) => setForm((current) => ({ ...current, deductionItems: current.deductionItems.length === 1 ? current.deductionItems : current.deductionItems.filter((_, itemIndex) => itemIndex !== index) }));
  return (
    <BaseModal label={form.id ? "Edit Payroll Run" : "Add Payroll Run"} title="Prepare a professional payroll record" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Payroll" : "Save Payroll"}>
      <div className="space-y-5">
          <section className="rounded-3xl border border-line bg-slate-50/70 p-4">
            <div className="mb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Employee and period</p><p className="mt-1 text-sm text-slate-600">Choose the employee and pay date for this payroll record.</p></div>
            <div className="grid gap-3 md:grid-cols-2">
              <Select value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))} className="md:col-span-2">
                <option value="">Select employee</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
              </Select>
              <Input value={form.periodLabel} onChange={(event) => setForm((current) => ({ ...current, periodLabel: event.target.value }))} placeholder="Pay period, e.g. August 2026" />
              <Input type="date" value={form.payDate} onChange={(event) => setForm((current) => ({ ...current, payDate: event.target.value }))} />
            </div>
          </section>
          <section className="rounded-3xl border border-line bg-white p-4">
            <div className="mb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Pay calculation</p><p className="mt-1 text-sm text-slate-600">Net pay is calculated automatically from gross pay less deductions.</p></div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-500">Gross pay<Input className="mt-1" type="number" min="0" step="0.01" value={form.grossAmount} onChange={(event) => setForm((current) => ({ ...current, grossAmount: event.target.value }))} placeholder="0.00" /></label>
              <div className="flex min-h-[52px] items-center justify-between gap-3 rounded-2xl border border-line bg-soft/50 px-4 py-3 text-sm text-slate-600"><span className="shrink-0">Total deductions</span><strong className="min-w-0 truncate text-right text-rose-600">{money(deductions)}</strong></div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 md:col-span-2"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Net pay</p><p className="mt-1 text-2xl font-semibold text-emerald-900">{money(net)}</p></div>
            </div>
            <div className="mt-5 rounded-2xl border border-line bg-slate-50/70 p-3 md:col-span-2"><div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold text-ink">Deductions breakdown</p><p className="text-xs text-slate-500">Name every deduction and choose an amount or percentage.</p></div><button type="button" onClick={addDeduction} className="rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white">Add deduction</button></div><div className="space-y-2">{form.deductionItems.map((item, index) => <div key={index} className="grid gap-2 rounded-xl border border-line bg-white p-2 md:grid-cols-[minmax(0,1fr)_120px_130px_34px]"><Input value={item.name} onChange={(event) => updateDeduction(index, "name", event.target.value)} placeholder="Deduction name, e.g. PAYE" /><Input type="number" min="0" max={item.mode === "PERCENT" ? 100 : undefined} step="0.01" value={item.value} onChange={(event) => updateDeduction(index, "value", event.target.value)} placeholder="Value" /><Select value={item.mode} onChange={(event) => updateDeduction(index, "mode", event.target.value)}><option value="AMOUNT">Fixed amount</option><option value="PERCENT">Percentage</option></Select><button type="button" onClick={() => removeDeduction(index)} disabled={form.deductionItems.length === 1} className="rounded-xl border border-rose-200 text-rose-600 disabled:opacity-30">×</button></div>)}</div></div>
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            <Select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
              {["DRAFT", "APPROVED", "PAID"].map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <div className="rounded-2xl border border-line bg-soft/50 px-4 py-3 text-xs text-slate-600">Use <strong className="text-ink">Approved</strong> when reviewed and <strong className="text-ink">Paid</strong> after payment.</div>
            <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={4} className="md:col-span-2" placeholder="Payroll notes, payment reference, or approval comments" />
          </section>
        </div>
        <aside className="hidden">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Payroll summary</p>
          <div className="mt-4 rounded-2xl border border-line bg-white p-4">
            <p className="text-sm font-semibold text-ink">{selectedEmployee?.fullName || "Select an employee"}</p>
            <p className="mt-1 text-xs text-slate-500">{selectedEmployee?.title || selectedEmployee?.department || "Employee profile"}</p>
            <div className="mt-4 space-y-3 border-t border-line pt-4 text-sm"><div className="flex justify-between gap-3"><span className="text-slate-500">Pay period</span><strong className="text-ink">{form.periodLabel || "Not set"}</strong></div><div className="flex justify-between gap-3"><span className="text-slate-500">Pay date</span><strong className="text-ink">{form.payDate || "Not set"}</strong></div><div className="flex justify-between gap-3"><span className="text-slate-500">Gross pay</span><strong className="text-ink">{money(gross)}</strong></div><div className="flex justify-between gap-3"><span className="text-slate-500">Deductions</span><strong className="text-rose-600">− {money(deductions)}</strong></div></div>
            <div className="mt-4 flex items-end justify-between border-t border-line pt-4"><span className="text-sm font-semibold text-ink">Net pay</span><strong className="text-xl text-brand-500">{money(net)}</strong></div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">Review the employee, pay period, gross amount, deductions, and status before saving.</p>
        </aside>
    </BaseModal>
  );
}

function ReviewModal({ form, setForm, employees, onClose, onSave }: { form: typeof emptyReview; setForm: Dispatch<SetStateAction<typeof emptyReview>>; employees: Employee[]; onClose: () => void; onSave: () => void }) {
  return (
    <BaseModal label={form.id ? "Edit Review" : "Add Review"} title="Manage performance review" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Review" : "Save Review"}>
      <div className="grid gap-3 md:grid-cols-2">
        <Select value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))} className="md:col-span-2">
          <option value="">Select employee</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
        </Select>
        <Input type="date" value={form.reviewDate} onChange={(event) => setForm((current) => ({ ...current, reviewDate: event.target.value }))} />
        <Input type="number" min="1" max="5" value={form.score} onChange={(event) => setForm((current) => ({ ...current, score: event.target.value }))} placeholder="Score out of 5" />
        <Input value={form.reviewerName} onChange={(event) => setForm((current) => ({ ...current, reviewerName: event.target.value }))} placeholder="Reviewer name" />
        <Select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
          {["SCHEDULED", "IN_PROGRESS", "COMPLETED"].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
        <Textarea value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} rows={5} className="md:col-span-2" placeholder="Review summary" />
      </div>
    </BaseModal>
  );
}

function DocumentModal({ form, setForm, employees, selectedFile, setSelectedFile, onClose, onSave }: { form: typeof emptyDocument; setForm: Dispatch<SetStateAction<typeof emptyDocument>>; employees: Employee[]; selectedFile: File | null; setSelectedFile: (file: File | null) => void; onClose: () => void; onSave: () => void }) {
  return (
    <BaseModal label={form.id ? "Edit Document" : "Add Document"} title="Manage employee document" onClose={onClose} onSave={onSave} saveLabel={form.id ? "Update Document" : "Save Document"}>
      <div className="grid gap-3 md:grid-cols-2">
        <Select value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))} className="md:col-span-2">
          <option value="">Select employee</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
        </Select>
        <Input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="Document label" />
        <Input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Category" />
        {!form.id ? <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.docx" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} className="md:col-span-2" /> : null}
        <Input value={form.fileKey} onChange={(event) => setForm((current) => ({ ...current, fileKey: event.target.value }))} className="md:col-span-2" placeholder="File URL or storage key" />
        <Input type="date" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} />
      </div>
    </BaseModal>
  );
}

export function LiveHr() {
  const { overview, employees, leaveRequests, attendance, payrollRuns, performanceReviews, documents, toast } = useHrData();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Employees", String(overview?.employees ?? 0)],
          ["On Leave", String(overview?.onLeave ?? 0)],
          ["Pending Leave", String(overview?.pendingLeave ?? 0)],
          ["Attendance", String(overview?.attendanceEntries ?? 0)],
          ["Payroll", String(overview?.payrollRuns ?? 0)],
          ["Reviews", String(overview?.performanceReviews ?? 0)],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-line p-4">
            <h2 className="text-lg font-semibold text-ink">People directory</h2>
            <p className="mt-1 text-xs text-slate-500">Live employee records for HR, payroll, leave, and performance workflows.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="border-b border-line bg-slate-50/70">
                <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Employee</th>
                  <th className="px-4 py-2.5 font-semibold">Department</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Salary</th>
                </tr>
              </thead>
              <tbody>
                {employees.slice(0, 6).map((employee) => (
                  <tr key={employee.id} className="border-b border-line">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-ink">{employee.fullName}</p>
                      <p className="mt-1 text-xs text-slate-500">{employee.title}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{employee.department || "General"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{employee.employmentStatus || "ACTIVE"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{formatMoney(employee.salaryAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="overflow-hidden">
            <div className="border-b border-line p-4">
              <h2 className="text-lg font-semibold text-ink">Leave queue</h2>
              <p className="mt-1 text-xs text-slate-500">Pending and approved leave requests pulled from live data.</p>
            </div>
            <div className="divide-y divide-line">
              {leaveRequests.slice(0, 4).map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.employee.fullName}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.type} from {formatDate(item.startDate)} to {formatDate(item.endDate)}</p>
                    </div>
                    <span className="rounded-full bg-soft px-2.5 py-1 text-[11px] font-semibold text-slate-700">{item.status}</span>
                  </div>
                </div>
              ))}
              {leaveRequests.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No leave requests yet.</p> : null}
            </div>
          </Card>

          <Card className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-line p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Documents</p>
              <p className="mt-2 text-xl font-semibold text-ink">{documents.length}</p>
            </div>
            <div className="rounded-2xl border border-line p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Attendance</p>
              <p className="mt-2 text-xl font-semibold text-ink">{attendance.length}</p>
            </div>
            <div className="rounded-2xl border border-line p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Payroll Runs</p>
              <p className="mt-2 text-xl font-semibold text-ink">{payrollRuns.length}</p>
            </div>
            <div className="rounded-2xl border border-line p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Reviews</p>
              <p className="mt-2 text-xl font-semibold text-ink">{performanceReviews.length}</p>
            </div>
          </Card>
        </div>
      </div>
      <HrToast toast={toast} />
    </div>
  );
}

export function LiveEmployeesPage() {
  const { employees, documents, attendance, toast, notify, reload } = useHrData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyEmployee);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<File[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeQr, setEmployeeQr] = useState<{ employee: Employee; qrDataUrl: string; scanUrl: string } | null>(null);

  const departmentOptions = useMemo(() => Array.from(new Set(employees.map((item) => item.department || "General"))).sort(), [employees]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter((item) => {
      const matchesSearch =
        term.length === 0 ||
        item.fullName.toLowerCase().includes(term) ||
        item.email.toLowerCase().includes(term) ||
        (item.title ?? "").toLowerCase().includes(term) ||
        (item.department ?? "").toLowerCase().includes(term);
      const matchesFilter = filter === "ALL" || (item.department || "General").toLowerCase() === filter.toLowerCase();
      return matchesSearch && matchesFilter;
    });
  }, [employees, filter, search]);

  async function saveEmployee() {
    try {
      const payload = {
        employeeNumber: form.employeeNumber || undefined,
        fullName: form.fullName || undefined,
        email: form.email || undefined,
        phone: form.phone || "",
        idPassportNumber: form.idPassportNumber || "",
        dateOfBirth: form.dateOfBirth || "",
        gender: form.gender || "",
        address: form.address || "",
        emergencyContactName: form.emergencyContactName || "",
        emergencyContactPhone: form.emergencyContactPhone || "",
        title: form.title || undefined,
        department: form.department || "",
        location: form.location || "",
        managerName: form.managerName || "",
        employmentStatus: form.employmentStatus || undefined,
        employmentType: form.employmentType || "",
        startDate: form.startDate || "",
        endDate: form.endDate || "",
        salaryAmount: form.salaryAmount || "",
        bankName: form.bankName || "",
        bankAccountHolder: form.bankAccountHolder || "",
        bankAccountNumber: form.bankAccountNumber || "",
        bankBranch: form.bankBranch || "",
        bankAccountType: form.bankAccountType || "",
      };
      let employeeId = form.id;
      if (form.id) {
        await apiFetch(`/hr/employees/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Employee updated successfully.");
      } else {
        const result = await apiFetch<{ item?: Employee }>("/hr/employees", { method: "POST", body: JSON.stringify(payload) });
        employeeId = result.item?.id ?? "";
        notify("success", "Employee created successfully.");
      }
      const files = [...(selectedPhoto ? [selectedPhoto] : []), ...selectedDocuments];
      if (employeeId && files.length) {
        await Promise.all(files.map(async (file, index) => {
          const multipart = new FormData();
          multipart.append("file", file);
          multipart.append("employeeId", employeeId);
          multipart.append("label", index === 0 && selectedPhoto ? "Profile picture" : file.name);
          multipart.append("category", index === 0 && selectedPhoto ? "PROFILE_PHOTO" : "EMPLOYEE_DOCUMENT");
          await apiFetch("/hr/documents/upload", { method: "POST", body: multipart });
        }));
        notify("success", `${files.length} employee file${files.length === 1 ? "" : "s"} uploaded.`);
      }
      setForm(emptyEmployee);
      setSelectedPhoto(null);
      setSelectedDocuments([]);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save employee.");
    }
  }

  async function deleteEmployee(employeeId: string) {
    try {
      await apiFetch(`/hr/employees/${employeeId}`, { method: "DELETE" });
      notify("success", "Employee deleted successfully.");
      setPendingDelete(null);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete employee.");
    }
  }

  async function generateEmployeeQr(employee: Employee) {
    try {
      const result = await apiFetch<{ qrDataUrl: string; scanUrl: string }>(`/attendance/employee-qr/${employee.id}`, { method: "POST" });
      setEmployeeQr({ employee, qrDataUrl: result.qrDataUrl, scanUrl: result.scanUrl });
      notify("success", `Attendance QR ready for ${employee.fullName}.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Unable to generate employee QR code.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Employees" title="Team directory" description="Search, filter, add, edit, and remove live employee records from Neon." count={filtered.length} addLabel="Add employee" onAdd={() => { setForm(emptyEmployee); setSelectedPhoto(null); setSelectedDocuments([]); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search employee, email, title, department" filter={filter} setFilter={setFilter} filterOptions={[{ value: "ALL", label: "All departments" }, ...departmentOptions.map((item) => ({ value: item, label: item }))]} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Employee</th>
                <th className="px-4 py-2.5 font-semibold">Title</th>
                <th className="px-4 py-2.5 font-semibold">Department</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Salary</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((employee) => (
                <tr key={employee.id} onClick={() => setSelectedEmployee(employee)} className="cursor-pointer border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{employee.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{employee.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{employee.title}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{employee.department || "General"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{employee.employmentStatus || "ACTIVE"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{formatMoney(employee.salaryAmount)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={(event) => { event.stopPropagation(); setForm({ ...emptyEmployee, id: employee.id, employeeNumber: employee.employeeNumber ?? "", fullName: employee.fullName, email: employee.email, phone: employee.phone ?? "", idPassportNumber: employee.idPassportNumber ?? "", dateOfBirth: employee.dateOfBirth?.slice(0, 10) ?? "", gender: employee.gender ?? "", address: employee.address ?? "", emergencyContactName: employee.emergencyContactName ?? "", emergencyContactPhone: employee.emergencyContactPhone ?? "", title: employee.title, department: employee.department ?? "", location: employee.location ?? "", managerName: employee.managerName ?? "", employmentStatus: employee.employmentStatus ?? "ACTIVE", employmentType: employee.employmentType ?? "FULL_TIME", startDate: employee.startDate?.slice(0, 10) ?? today, endDate: employee.endDate?.slice(0, 10) ?? "", salaryAmount: employee.salaryAmount?.toString() ?? "", bankName: employee.bankName ?? "", bankAccountHolder: employee.bankAccountHolder ?? "", bankAccountNumber: employee.bankAccountNumber ?? "", bankBranch: employee.bankBranch ?? "", bankAccountType: employee.bankAccountType ?? "" }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button>
                      <button onClick={(event) => { event.stopPropagation(); void generateEmployeeQr(employee); }} className="rounded-xl border border-brand-200 px-2.5 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50">QR code</button>
                      <button onClick={(event) => { event.stopPropagation(); setPendingDelete(employee.id); }} className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No employees match the current search or filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <EmployeeModal form={form} setForm={setForm} selectedPhoto={selectedPhoto} setSelectedPhoto={setSelectedPhoto} selectedDocuments={selectedDocuments} setSelectedDocuments={setSelectedDocuments} onClose={() => setShowForm(false)} onSave={() => void saveEmployee()} /> : null}
      {employeeQr ? <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 px-4 py-8 backdrop-blur-sm"><div className="w-full max-w-md rounded-[28px] border border-line bg-white p-6 text-center shadow-[0_30px_80px_rgba(15,23,42,0.2)]"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Employee attendance QR</p><h2 className="mt-2 text-2xl font-semibold text-ink">{employeeQr.employee.fullName}</h2><p className="mt-1 text-sm text-slate-500">Scan this code to open the secure employee clock-in page.</p><img src={employeeQr.qrDataUrl} alt={`Attendance QR for ${employeeQr.employee.fullName}`} className="mx-auto mt-5 h-64 w-64 rounded-2xl border border-line p-3" /><div className="mt-5 flex flex-wrap justify-center gap-2"><a href={employeeQr.qrDataUrl} download={`${employeeQr.employee.fullName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-attendance-qr.png`} className="rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">Download QR</a><button onClick={() => window.print()} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700">Print</button><button onClick={() => setEmployeeQr(null)} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700">Close</button></div></div></div> : null}
      {selectedEmployee ? <EmployeeViewModal employee={selectedEmployee} documents={documents} attendance={attendance} onClose={() => setSelectedEmployee(null)} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this employee?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteEmployee(pendingDelete)} confirmLabel="Delete Employee" /> : null}
      <HrToast toast={toast} />
    </div>
  );
}

export function LiveLeavePage() {
  const { leaveRequests, employees, toast, notify, reload } = useHrData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyLeave);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leaveRequests.filter((item) => {
      const matchesSearch = term.length === 0 || item.employee.fullName.toLowerCase().includes(term) || item.type.toLowerCase().includes(term) || (item.reason ?? "").toLowerCase().includes(term);
      const matchesFilter = filter === "ALL" || item.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [filter, leaveRequests, search]);

  async function saveLeave() {
    try {
      const payload = { employeeId: form.employeeId || undefined, startDate: toDateTime(form.startDate), endDate: toDateTime(form.endDate), type: form.type || undefined, status: form.status, reason: form.reason || "" };
      if (form.id) {
        await apiFetch(`/hr/leave-requests/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Leave request updated successfully.");
      } else {
        await apiFetch("/hr/leave-requests", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Leave request created successfully.");
      }
      setForm(emptyLeave);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save leave request.");
    }
  }

  async function deleteLeave(itemId: string) {
    try {
      await apiFetch(`/hr/leave-requests/${itemId}`, { method: "DELETE" });
      notify("success", "Leave request deleted successfully.");
      setPendingDelete(null);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete leave request.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Leave" title="Leave management" description="Track PTO, sick leave, approvals, and leave reasons in one live table." count={filtered.length} addLabel="Add leave" onAdd={() => { setForm(emptyLeave); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search employee, leave type, reason" filter={filter} setFilter={setFilter} filterOptions={[{ value: "ALL", label: "All statuses" }, { value: "PENDING", label: "Pending" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" }]} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Employee</th>
                <th className="px-4 py-2.5 font-semibold">Type</th>
                <th className="px-4 py-2.5 font-semibold">Dates</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} onClick={() => setSelectedLeave(item)} className="cursor-pointer border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{item.employee.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.reason || "No reason"}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.type}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{formatDate(item.startDate)} to {formatDate(item.endDate)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={(event) => { event.stopPropagation(); setForm({ id: item.id, employeeId: item.employeeId, startDate: item.startDate.slice(0, 10), endDate: item.endDate.slice(0, 10), type: item.type, status: item.status, reason: item.reason ?? "" }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button>
                      <button onClick={(event) => { event.stopPropagation(); setPendingDelete(item.id); }} className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No leave requests match the current search or filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <LeaveModal form={form} setForm={setForm} employees={employees} onClose={() => setShowForm(false)} onSave={() => void saveLeave()} /> : null}
      {selectedLeave ? <HrDetailModal title={`${selectedLeave.employee.fullName} · ${selectedLeave.type}`} subtitle="Leave request details" fields={[["Employee", selectedLeave.employee.fullName], ["Leave type", selectedLeave.type], ["Start date", formatDate(selectedLeave.startDate)], ["End date", formatDate(selectedLeave.endDate)], ["Status", selectedLeave.status], ["Reason", selectedLeave.reason || "Not provided"]]} onClose={() => setSelectedLeave(null)} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this leave request?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteLeave(pendingDelete)} confirmLabel="Delete Leave" /> : null}
      <HrToast toast={toast} />
    </div>
  );
}

export function LivePayrollPage() {
  const { payrollRuns, employees, toast, notify, reload } = useHrData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyPayroll);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollRun | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payrollRuns.filter((item) => {
      const matchesSearch = term.length === 0 || item.employee.fullName.toLowerCase().includes(term) || item.periodLabel.toLowerCase().includes(term) || (item.notes ?? "").toLowerCase().includes(term);
      const matchesFilter = filter === "ALL" || item.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [filter, payrollRuns, search]);

  async function savePayroll() {
    try {
      const payload = {
        employeeId: form.employeeId || undefined,
        periodLabel: form.periodLabel || undefined,
        payDate: toDateTime(form.payDate),
        grossAmount: form.grossAmount || "0",
        deductions: form.deductionItems.reduce((sum, item) => sum + (item.mode === "PERCENT" ? (Number(form.grossAmount) || 0) * (Number(item.value) || 0) / 100 : Number(item.value) || 0), 0).toFixed(2),
        deductionItems: form.deductionItems.filter((item) => item.name.trim()).map((item) => ({ name: item.name, mode: item.mode, value: Number(item.value) || 0 })),
        netAmount: Math.max(0, (Number(form.grossAmount) || 0) - form.deductionItems.reduce((sum, item) => sum + (item.mode === "PERCENT" ? (Number(form.grossAmount) || 0) * (Number(item.value) || 0) / 100 : Number(item.value) || 0), 0)).toFixed(2),
        status: form.status,
        notes: form.notes || "",
      };
      if (form.id) {
        await apiFetch(`/hr/payroll-runs/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Payroll run updated successfully.");
      } else {
        await apiFetch("/hr/payroll-runs", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Payroll run created successfully.");
      }
      setForm(emptyPayroll);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save payroll run.");
    }
  }

  async function deletePayroll(itemId: string) {
    try {
      await apiFetch(`/hr/payroll-runs/${itemId}`, { method: "DELETE" });
      notify("success", "Payroll run deleted successfully.");
      setPendingDelete(null);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete payroll run.");
    }
  }

  async function downloadPayslip(item: PayrollRun) {
    try {
      const session = getStoredSession();
      const response = await fetch(`${API_BASE_URL}/hr/payroll-runs/${item.id}/payslip`, { headers: { Authorization: `Bearer ${session?.token ?? ""}`, "X-Tenant-Id": session?.tenantId ?? "" } });
      if (!response.ok) throw new Error(await response.text());
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `payslip-${item.employee.fullName}-${item.periodLabel}.pdf`; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { notify("error", error instanceof Error ? error.message : "Failed to download payslip."); }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Payroll" title="Payroll runs" description="Run payroll records with gross pay, deductions, net pay, and period status." count={filtered.length} addLabel="Add payroll" onAdd={() => { setForm(emptyPayroll); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search employee, period, notes" filter={filter} setFilter={setFilter} filterOptions={[{ value: "ALL", label: "All statuses" }, { value: "DRAFT", label: "Draft" }, { value: "APPROVED", label: "Approved" }, { value: "PAID", label: "Paid" }]} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Employee</th>
                <th className="px-4 py-2.5 font-semibold">Period</th>
                <th className="px-4 py-2.5 font-semibold">Pay Date</th>
                <th className="px-4 py-2.5 font-semibold">Net</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} onClick={() => setSelectedPayroll(item)} className="cursor-pointer border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{item.employee.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.employee.title || "Employee"}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.periodLabel}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{formatDate(item.payDate)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{formatMoney(item.netAmount)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={(event) => { event.stopPropagation(); void downloadPayslip(item); }} className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 px-2.5 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50"><Download className="h-3.5 w-3.5" /> Payslip</button>
                      <button onClick={(event) => { event.stopPropagation(); setForm({ id: item.id, employeeId: item.employeeId, periodLabel: item.periodLabel, payDate: item.payDate.slice(0, 10), grossAmount: String(item.grossAmount), deductions: String(item.deductions), deductionsInput: String(item.deductions), deductionsMode: "AMOUNT", deductionItems: item.deductionItems?.map((deduction) => ({ id: deduction.id, name: deduction.name, mode: deduction.mode, value: String(deduction.value) })) ?? [{ name: "Total deductions", mode: "AMOUNT", value: String(item.deductions) }], netAmount: String(item.netAmount), status: item.status, notes: item.notes ?? "" }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button>
                      <button onClick={(event) => { event.stopPropagation(); setPendingDelete(item.id); }} className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-soft">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No payroll runs match the current search or filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <PayrollModal form={form} setForm={setForm} employees={employees} onClose={() => setShowForm(false)} onSave={() => void savePayroll()} /> : null}
      {selectedPayroll ? <HrDetailModal title={`${selectedPayroll.employee.fullName} · ${selectedPayroll.periodLabel}`} subtitle="Payroll run details" fields={[["Employee", selectedPayroll.employee.fullName], ["Pay period", selectedPayroll.periodLabel], ["Pay date", formatDate(selectedPayroll.payDate)], ["Gross pay", formatMoney(selectedPayroll.grossAmount)], ["Deductions", formatMoney(selectedPayroll.deductions)], ["Net pay", formatMoney(selectedPayroll.netAmount)], ["Status", selectedPayroll.status], ["Notes", selectedPayroll.notes || "Not provided"]]} onClose={() => setSelectedPayroll(null)} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this payroll run?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deletePayroll(pendingDelete)} confirmLabel="Delete Payroll" /> : null}
      <HrToast toast={toast} />
    </div>
  );
}

export function LivePayslipsPage() {
  const { payrollRuns, toast, notify } = useHrData();
  const [search, setSearch] = useState("");
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollRun | null>(null);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payrollRuns.filter((item) => !term || `${item.employee.fullName} ${item.periodLabel} ${item.status}`.toLowerCase().includes(term));
  }, [payrollRuns, search]);

  async function downloadPayslip(item: PayrollRun) {
    try {
      const session = getStoredSession();
      const response = await fetch(`${API_BASE_URL}/hr/payroll-runs/${item.id}/payslip`, { headers: { Authorization: `Bearer ${session?.token ?? ""}`, "X-Tenant-Id": session?.tenantId ?? "" } });
      if (!response.ok) throw new Error(await response.text());
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `payslip-${item.employee.fullName}-${item.periodLabel}.pdf`; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { notify("error", error instanceof Error ? error.message : "Failed to download payslip."); }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Payslips" title="Employee payslips" description="Generate and download branded payslips from approved payroll records." count={filtered.length} search={search} setSearch={setSearch} searchPlaceholder="Search employee, period, status" />
        <div className="border-b border-line bg-soft/30 px-5 py-4"><div className="grid gap-3 md:grid-cols-3"><div><p className="text-xs text-slate-500">Available records</p><p className="mt-1 text-xl font-semibold text-ink">{payrollRuns.length}</p></div><div><p className="text-xs text-slate-500">Approved or paid</p><p className="mt-1 text-xl font-semibold text-emerald-600">{payrollRuns.filter((item) => item.status === "APPROVED" || item.status === "PAID").length}</p></div><div><p className="text-xs text-slate-500">Total net payroll</p><p className="mt-1 text-xl font-semibold text-brand-500">{formatMoney(payrollRuns.reduce((sum, item) => sum + Number(item.netAmount), 0))}</p></div></div></div>
        <div className="overflow-x-auto"><table className="min-w-full text-left"><thead className="border-b border-line bg-slate-50/70"><tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500"><th className="px-4 py-2.5 font-semibold">Employee</th><th className="px-4 py-2.5 font-semibold">Pay period</th><th className="px-4 py-2.5 font-semibold">Pay date</th><th className="px-4 py-2.5 font-semibold">Net pay</th><th className="px-4 py-2.5 font-semibold">Status</th><th className="px-4 py-2.5 text-right font-semibold">Action</th></tr></thead><tbody>
          {filtered.map((item) => <tr key={item.id} onClick={() => setSelectedPayslip(item)} className="cursor-pointer border-b border-line transition hover:bg-soft/40"><td className="px-4 py-3"><p className="text-sm font-semibold text-ink">{item.employee.fullName}</p><p className="mt-1 text-xs text-slate-500">{item.employee.title || "Employee"}</p></td><td className="px-4 py-3 text-sm text-slate-600">{item.periodLabel}</td><td className="px-4 py-3 text-sm text-slate-600">{formatDate(item.payDate)}</td><td className="px-4 py-3 text-sm font-semibold text-brand-500">{formatMoney(item.netAmount)}</td><td className="px-4 py-3"><span className="rounded-full bg-soft px-2.5 py-1 text-[10px] font-semibold text-slate-700">{item.status}</span></td><td className="px-4 py-3 text-right"><button onClick={(event) => { event.stopPropagation(); void downloadPayslip(item); }} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600"><Download className="h-3.5 w-3.5" /> Download payslip</button></td></tr>)}
          {filtered.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No payslips match your search.</td></tr> : null}
        </tbody></table></div>
      </Card>
      <HrToast toast={toast} />
      {selectedPayslip ? <HrDetailModal title={`${selectedPayslip.employee.fullName} · ${selectedPayslip.periodLabel}`} subtitle="Payslip details" fields={[["Employee", selectedPayslip.employee.fullName], ["Pay period", selectedPayslip.periodLabel], ["Pay date", formatDate(selectedPayslip.payDate)], ["Gross pay", formatMoney(selectedPayslip.grossAmount)], ["Deductions", formatMoney(selectedPayslip.deductions)], ["Net pay", formatMoney(selectedPayslip.netAmount)], ["Status", selectedPayslip.status]]} onClose={() => setSelectedPayslip(null)} /> : null}
    </div>
  );
}

export function LiveAttendancePage() {
  const { attendance, employees, toast, notify, reload } = useHrData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyAttendance);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceRecord | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return attendance.filter((item) => {
      const matchesSearch = term.length === 0 || item.employee.fullName.toLowerCase().includes(term) || item.status.toLowerCase().includes(term) || (item.notes ?? "").toLowerCase().includes(term);
      const matchesFilter = filter === "ALL" || item.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [attendance, filter, search]);

  async function saveAttendance() {
    try {
      const payload = {
        employeeId: form.employeeId || undefined,
        date: toDateTime(form.date),
        status: form.status,
        checkInAt: form.checkInAt ? toDateTime(form.date, form.checkInAt) : "",
        checkOutAt: form.checkOutAt ? toDateTime(form.date, form.checkOutAt) : "",
        notes: form.notes || "",
      };
      if (form.id) {
        await apiFetch(`/hr/attendance/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Attendance record updated successfully.");
      } else {
        await apiFetch("/hr/attendance", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Attendance record created successfully.");
      }
      setForm(emptyAttendance);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save attendance record.");
    }
  }

  async function deleteAttendance(itemId: string) {
    try {
      await apiFetch(`/hr/attendance/${itemId}`, { method: "DELETE" });
      notify("success", "Attendance record deleted successfully.");
      setPendingDelete(null);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete attendance record.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Attendance" title="Time and presence" description="Keep employee presence, daily status, and check-in/check-out records live." count={filtered.length} addLabel="Add attendance" onAdd={() => { setForm(emptyAttendance); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search employee, attendance status, notes" filter={filter} setFilter={setFilter} filterOptions={[{ value: "ALL", label: "All statuses" }, { value: "PRESENT", label: "Present" }, { value: "REMOTE", label: "Remote" }, { value: "LATE", label: "Late" }, { value: "ABSENT", label: "Absent" }, { value: "HALF_DAY", label: "Half day" }]} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Employee</th>
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Hours</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} onClick={() => setSelectedAttendance(item)} className="cursor-pointer border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{item.employee.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.employee.department || "General"}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{formatDate(item.date)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.status}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{fromIsoTime(item.checkInAt) || "--:--"} to {fromIsoTime(item.checkOutAt) || "--:--"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={(event) => { event.stopPropagation(); setForm({ id: item.id, employeeId: item.employeeId, date: item.date.slice(0, 10), status: item.status, checkInAt: fromIsoTime(item.checkInAt), checkOutAt: fromIsoTime(item.checkOutAt), notes: item.notes ?? "" }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button>
                      <button onClick={(event) => { event.stopPropagation(); setPendingDelete(item.id); }} className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No attendance records match the current search or filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <AttendanceModal form={form} setForm={setForm} employees={employees} onClose={() => setShowForm(false)} onSave={() => void saveAttendance()} /> : null}
      {selectedAttendance ? <HrDetailModal title={`${selectedAttendance.employee.fullName} · ${formatDate(selectedAttendance.date)}`} subtitle="Attendance record details" fields={[["Employee", selectedAttendance.employee.fullName], ["Date", formatDate(selectedAttendance.date)], ["Status", selectedAttendance.status], ["Check in", fromIsoTime(selectedAttendance.checkInAt) || "Not recorded"], ["Check out", fromIsoTime(selectedAttendance.checkOutAt) || "Not recorded"], ["Notes", selectedAttendance.notes || "Not provided"]]} onClose={() => setSelectedAttendance(null)} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this attendance entry?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteAttendance(pendingDelete)} confirmLabel="Delete Attendance" /> : null}
      <HrToast toast={toast} />
    </div>
  );
}

export function LivePerformancePage() {
  const { performanceReviews, employees, toast, notify, reload } = useHrData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyReview);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<PerformanceReview | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return performanceReviews.filter((item) => {
      const matchesSearch = term.length === 0 || item.employee.fullName.toLowerCase().includes(term) || (item.reviewerName ?? "").toLowerCase().includes(term) || (item.summary ?? "").toLowerCase().includes(term);
      const matchesFilter = filter === "ALL" || item.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [filter, performanceReviews, search]);

  async function saveReview() {
    try {
      const payload = {
        employeeId: form.employeeId || undefined,
        reviewDate: toDateTime(form.reviewDate),
        score: form.score ? Number(form.score) : null,
        reviewerName: form.reviewerName || "",
        status: form.status,
        summary: form.summary || "",
      };
      if (form.id) {
        await apiFetch(`/hr/performance-reviews/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Performance review updated successfully.");
      } else {
        await apiFetch("/hr/performance-reviews", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Performance review created successfully.");
      }
      setForm(emptyReview);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save performance review.");
    }
  }

  async function deleteReview(itemId: string) {
    try {
      await apiFetch(`/hr/performance-reviews/${itemId}`, { method: "DELETE" });
      notify("success", "Performance review deleted successfully.");
      setPendingDelete(null);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete performance review.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Performance" title="Performance reviews" description="Track review cycles, scores, reviewer ownership, and follow-up summaries." count={filtered.length} addLabel="Add review" onAdd={() => { setForm(emptyReview); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search employee, reviewer, summary" filter={filter} setFilter={setFilter} filterOptions={[{ value: "ALL", label: "All statuses" }, { value: "SCHEDULED", label: "Scheduled" }, { value: "IN_PROGRESS", label: "In progress" }, { value: "COMPLETED", label: "Completed" }]} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Employee</th>
                <th className="px-4 py-2.5 font-semibold">Reviewer</th>
                <th className="px-4 py-2.5 font-semibold">Review Date</th>
                <th className="px-4 py-2.5 font-semibold">Score</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} onClick={() => setSelectedReview(item)} className="cursor-pointer border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{item.employee.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.employee.title || "Employee"}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.reviewerName || "Not set"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{formatDate(item.reviewDate)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.score ?? "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={(event) => { event.stopPropagation(); setForm({ id: item.id, employeeId: item.employeeId, reviewDate: item.reviewDate.slice(0, 10), score: item.score?.toString() ?? "", reviewerName: item.reviewerName ?? "", status: item.status, summary: item.summary ?? "" }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button>
                      <button onClick={(event) => { event.stopPropagation(); setPendingDelete(item.id); }} className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-soft">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No performance reviews match the current search or filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <ReviewModal form={form} setForm={setForm} employees={employees} onClose={() => setShowForm(false)} onSave={() => void saveReview()} /> : null}
      {selectedReview ? <HrDetailModal title={`${selectedReview.employee.fullName} · Performance review`} subtitle="Performance review details" fields={[["Employee", selectedReview.employee.fullName], ["Review date", formatDate(selectedReview.reviewDate)], ["Reviewer", selectedReview.reviewerName || "Not provided"], ["Score", selectedReview.score ? `${selectedReview.score} / 5` : "Not scored"], ["Status", selectedReview.status], ["Summary", selectedReview.summary || "Not provided"]]} onClose={() => setSelectedReview(null)} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this performance review?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteReview(pendingDelete)} confirmLabel="Delete Review" /> : null}
      <HrToast toast={toast} />
    </div>
  );
}

export function LiveDocumentsPage() {
  const { documents, employees, toast, notify, reload } = useHrData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyDocument);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<EmployeeDocument | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const categories = useMemo(() => Array.from(new Set(documents.map((item) => item.category || "General"))).sort(), [documents]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return documents.filter((item) => {
      const matchesSearch = term.length === 0 || item.employee.fullName.toLowerCase().includes(term) || item.label.toLowerCase().includes(term) || (item.category ?? "").toLowerCase().includes(term);
      const matchesFilter = filter === "ALL" || (item.category || "General").toLowerCase() === filter.toLowerCase();
      return matchesSearch && matchesFilter;
    });
  }, [documents, filter, search]);

  async function saveDocument() {
    try {
      const payload = { employeeId: form.employeeId || undefined, label: form.label || undefined, category: form.category || "", fileKey: form.fileKey || undefined, expiresAt: form.expiresAt ? toDateTime(form.expiresAt) : "" };
      if (form.id) {
        await apiFetch(`/hr/documents/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        notify("success", "Document updated successfully.");
      } else {
        if (selectedFile) {
          const multipart = new FormData();
          multipart.append("file", selectedFile);
          if (form.employeeId) multipart.append("employeeId", form.employeeId);
          if (form.label) multipart.append("label", form.label);
          if (form.category) multipart.append("category", form.category);
          const expiry = form.expiresAt ? toDateTime(form.expiresAt) : undefined;
          if (expiry) multipart.append("expiresAt", expiry);
          await apiFetch("/hr/documents/upload", { method: "POST", body: multipart });
        } else {
          await apiFetch("/hr/documents", { method: "POST", body: JSON.stringify(payload) });
        }
        notify("success", "Document created successfully.");
      }
      setForm(emptyDocument);
      setSelectedFile(null);
      setShowForm(false);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to save document.");
    }
  }

  async function deleteDocument(itemId: string) {
    try {
      await apiFetch(`/hr/documents/${itemId}`, { method: "DELETE" });
      notify("success", "Document deleted successfully.");
      setPendingDelete(null);
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Failed to delete document.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableHeader label="Documents" title="Employee documents" description="Store contracts, IDs, compliance files, and HR records per employee." count={filtered.length} addLabel="Add document" onAdd={() => { setForm(emptyDocument); setShowForm(true); }} search={search} setSearch={setSearch} searchPlaceholder="Search employee, document, category" filter={filter} setFilter={setFilter} filterOptions={[{ value: "ALL", label: "All categories" }, ...categories.map((item) => ({ value: item, label: item }))]} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-line bg-slate-50/70">
              <tr className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Employee</th>
                <th className="px-4 py-2.5 font-semibold">Document</th>
                <th className="px-4 py-2.5 font-semibold">Category</th>
                <th className="px-4 py-2.5 font-semibold">Expiry</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} onClick={() => setSelectedDocument(item)} className="cursor-pointer border-b border-line transition hover:bg-soft/40">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{item.employee.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.employee.department || "General"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-ink md:text-sm">{item.label}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.fileKey}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.category || "General"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 md:text-sm">{item.expiresAt ? formatDate(item.expiresAt) : "No expiry"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={(event) => { event.stopPropagation(); setForm({ id: item.id, employeeId: item.employeeId, label: item.label, category: item.category ?? "", fileKey: item.fileKey, expiresAt: item.expiresAt?.slice(0, 10) ?? "" }); setShowForm(true); }} className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-soft">Edit</button>
                      <button onClick={(event) => { event.stopPropagation(); setPendingDelete(item.id); }} className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-soft">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No documents match the current search or filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {showForm ? <DocumentModal form={form} setForm={setForm} employees={employees} selectedFile={selectedFile} setSelectedFile={setSelectedFile} onClose={() => setShowForm(false)} onSave={() => void saveDocument()} /> : null}
      {selectedDocument ? <HrDetailModal title={selectedDocument.label} subtitle={`${selectedDocument.employee.fullName} · ${selectedDocument.category || "Employee document"}`} fields={[["Employee", selectedDocument.employee.fullName], ["Category", selectedDocument.category || "General"], ["File", selectedDocument.fileKey], ["Expires", selectedDocument.expiresAt ? formatDate(selectedDocument.expiresAt) : "No expiry"], ["Uploaded", formatDate(selectedDocument.createdAt)]]} onClose={() => setSelectedDocument(null)} /> : null}
      {pendingDelete ? <DeleteModal title="Remove this document?" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteDocument(pendingDelete)} confirmLabel="Delete Document" /> : null}
      <HrToast toast={toast} />
    </div>
  );
}
