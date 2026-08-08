import {
  BarChart3,
  FolderKanban,
  LayoutGrid,
  Settings2,
  ShieldCheck,
  Users2,
  Workflow,
} from "lucide-react";

export const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/crm", label: "CRM", icon: Users2 },
  { href: "/accounting", label: "Accounting", icon: BarChart3 },
  { href: "/hr", label: "HR", icon: ShieldCheck },
  { href: "/forms/builder", label: "Form Builder", icon: FolderKanban },
  { href: "/automation", label: "Automation", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings2 },
];
