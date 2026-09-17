import {
  BadgeCent,
  ClipboardList,
  Building2,
  Building,
  Calculator,
  FileText,
  FolderKanban,
  FormInput,
  Landmark,
  Receipt,
  Shield,
  Radar,
  Settings2,
  ShieldCheck,
  UserCog,
  UserRoundSearch,
  Users2,
  Workflow,
  ListTodo,
  KanbanSquare,
  WalletCards,
  BookOpenText,
  CalendarCheck2,
  Laptop,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ModuleSubmodule = {
  title: string;
  subtitle: string;
  href: string;
  icon: LucideIcon;
};

export type ModuleCard = {
  title: string;
  subtitle: string;
  href: string;
  icon: LucideIcon;
  tint: string;
  submodules: ModuleSubmodule[];
};

export const moduleCards: ModuleCard[] = [
  {
    title: "CRM",
    subtitle: "Contacts, leads, deals",
    href: "/crm",
    icon: Users2,
    tint: "bg-cyan-50 text-cyan-700",
    submodules: [
      { title: "Contacts", subtitle: "People and lead records", href: "/crm/contacts", icon: UserRoundSearch },
      { title: "Leads", subtitle: "Prospects and intake", href: "/crm/leads", icon: Radar },
      { title: "Companies", subtitle: "Accounts and organizations", href: "/crm/companies", icon: Users2 },
      { title: "Deals", subtitle: "Pipeline and opportunities", href: "/crm/deals", icon: Radar },
      { title: "Activities", subtitle: "Calls, emails, meetings", href: "/crm/activities", icon: Workflow },
      { title: "Tasks", subtitle: "Follow-ups and work items", href: "/crm/tasks", icon: ListTodo },
      { title: "Notes", subtitle: "Record notes and context", href: "/crm/notes", icon: FileText },
      { title: "Pipeline", subtitle: "Stage board view", href: "/crm/pipeline", icon: KanbanSquare },
    ],
  },
  {
    title: "Accounting",
    subtitle: "Invoices, expenses, payments",
    href: "/accounting",
    icon: ClipboardList,
    tint: "bg-emerald-50 text-emerald-600",
    submodules: [
      { title: "Invoices", subtitle: "Quotes and billing", href: "/accounting/invoices", icon: ClipboardList },
      { title: "Quotes", subtitle: "Draft estimates", href: "/accounting/quotes", icon: FileText },
      { title: "Expenses", subtitle: "Cost and vendor tracking", href: "/accounting/expenses", icon: Receipt },
      { title: "Payments", subtitle: "Collections and status", href: "/accounting/payments", icon: Radar },
      { title: "Customers", subtitle: "Client billing accounts", href: "/accounting/customers", icon: Building2 },
      { title: "Vendors", subtitle: "Supplier spend profiles", href: "/accounting/vendors", icon: Building },
      { title: "Banking", subtitle: "Cash and account balances", href: "/accounting/banking", icon: Landmark },
      { title: "Transactions", subtitle: "Ledger movement", href: "/accounting/transactions", icon: WalletCards },
      { title: "Chart of Accounts", subtitle: "Account structure", href: "/accounting/chart-of-accounts", icon: BookOpenText },
      { title: "Taxes", subtitle: "VAT and tax summary", href: "/accounting/taxes", icon: BadgeCent },
      { title: "Reports", subtitle: "P&L and cash flow", href: "/accounting/reports", icon: FormInput },
      { title: "Period Close", subtitle: "Monthly close checks", href: "/accounting/period-close", icon: CalendarCheck2 },
    ],
  },
  {
    title: "HR",
    subtitle: "Employees, leave, payroll",
    href: "/hr",
    icon: ShieldCheck,
    tint: "bg-rose-50 text-rose-600",
    submodules: [
      { title: "Employees", subtitle: "Profiles and directory", href: "/hr/employees", icon: UserCog },
      { title: "Leave", subtitle: "PTO and sick leave", href: "/hr/leave", icon: ShieldCheck },
      { title: "Payroll", subtitle: "Compensation readiness", href: "/hr/payroll", icon: Receipt },
      { title: "Payslips", subtitle: "Generate and download", href: "/hr/payslips", icon: FileText },
      { title: "Attendance", subtitle: "Time and presence", href: "/hr/attendance", icon: Radar },
      { title: "Performance", subtitle: "Reviews and growth", href: "/hr/performance", icon: FormInput },
      { title: "Documents", subtitle: "Contracts and records", href: "/hr/documents", icon: FolderKanban },
    ],
  },
  {
    title: "Assets",
    subtitle: "Equipment, inventory, IT lifecycle",
    href: "/assets",
    icon: Laptop,
    tint: "bg-indigo-50 text-indigo-600",
    submodules: [
      { title: "Asset register", subtitle: "Inventory and ownership", href: "/assets", icon: Laptop },
    ],
  },
  {
    title: "Settings",
    subtitle: "Tenant, users, permissions",
    href: "/settings",
    icon: Settings2,
    tint: "bg-slate-50 text-slate-600",
    submodules: [
      { title: "Workspace", subtitle: "Branding and defaults", href: "/settings/workspace", icon: Settings2 },
      { title: "Billing", subtitle: "Plans and subscription", href: "/settings/billing", icon: Calculator },
      { title: "Team Access", subtitle: "Users and roles", href: "/settings/team", icon: UserCog },
      { title: "Security", subtitle: "Authentication controls", href: "/settings/security", icon: Shield },
      { title: "Permissions", subtitle: "Access and policy", href: "/settings/permissions", icon: ShieldCheck },
    ],
  },
];

export const crmPipeline = [
  {
    stage: "New Leads",
    value: "$168k",
    deals: [
      { name: "Nexa Rollout", company: "Nexa Health", owner: "Lerato", amount: "$42k" },
      { name: "Campus Upgrade", company: "Northfield", owner: "Jacob", amount: "$18k" },
    ],
  },
  {
    stage: "Discovery",
    value: "$252k",
    deals: [
      { name: "Ops Stack", company: "Atlas Freight", owner: "Zinhle", amount: "$67k" },
      { name: "Call Center Refresh", company: "BluePeak", owner: "Maya", amount: "$31k" },
    ],
  },
  {
    stage: "Proposal",
    value: "$389k",
    deals: [
      { name: "Multi-site CRM", company: "Verta Group", owner: "Thabo", amount: "$115k" },
      { name: "Retail Service Hub", company: "Kibo Stores", owner: "Ernest", amount: "$94k" },
    ],
  },
  {
    stage: "Negotiation",
    value: "$144k",
    deals: [
      { name: "Partner Portal", company: "LuminaTech", owner: "Anele", amount: "$76k" },
    ],
  },
];

export const accountingStats = [
  { label: "Revenue", value: "R1.84M", delta: "+12.4%" },
  { label: "Outstanding", value: "R326K", delta: "-4.2%" },
  { label: "Expenses", value: "R812K", delta: "+2.1%" },
  { label: "Cash Runway", value: "11 months", delta: "+1.0" },
];

export const employees = [
  { name: "Jones Mayekiso", role: "Super Admin", email: "devops@popinsolutions.co.za", status: "Active now" },
  { name: "Ernest Molelekwa", role: "Agent", email: "ernest.m@popinsolutions.co.za", status: "Active 9h ago" },
  { name: "Zinhle Mhlambi", role: "Agent", email: "mhlambimichaela@gmail.com", status: "Active 1d ago" },
  { name: "Alman Deang", role: "Payroll Lead", email: "finance@popinsolutions.co.za", status: "On leave" },
];

export const formPalette = [
  { type: "text", label: "Text" },
  { type: "email", label: "Email" },
  { type: "phone", label: "Phone" },
  { type: "number", label: "Number" },
  { type: "select", label: "Dropdown" },
  { type: "multi-select", label: "Multi-select" },
  { type: "date", label: "Date" },
  { type: "checkbox", label: "Checkbox" },
  { type: "toggle", label: "Toggle" },
  { type: "file", label: "File upload" },
  { type: "rich-text", label: "Rich text" },
];
