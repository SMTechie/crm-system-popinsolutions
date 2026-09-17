import { moduleCards, type ModuleCard } from "@/lib/data";

export type ModuleKey = "crm" | "accounting" | "hr" | "attendance" | "assets" | "users" | "settings";

const roleModules: Record<string, ModuleKey[]> = {
  SALES_MANAGER: ["crm", "accounting"],
  ACCOUNTANT: ["crm", "accounting", "hr", "attendance"],
  HR_MANAGER: ["crm", "accounting", "hr", "attendance", "users"],
  PROJECT_MANAGER: ["crm", "accounting", "hr", "attendance", "assets"],
  IT_MANAGER: ["crm", "accounting", "hr", "attendance", "assets", "users", "settings"],
  AGENT: ["crm", "attendance"],
  EMPLOYEE: ["attendance"],
  VIEWER: ["crm", "accounting", "hr", "attendance", "assets"],
};

export function getAccessibleModules(role: string | undefined, enabledModules: string[]) {
  const normalizedRole = role?.toUpperCase() ?? "";
  if (["OWNER", "ADMIN", "SUPER_ADMIN", "ORGANISATION_ADMIN"].includes(normalizedRole)) return enabledModules;
  const allowed = roleModules[normalizedRole] ?? [];
  return enabledModules.filter((moduleKey) => allowed.includes(moduleKey as ModuleKey));
}

const routeToModuleKey: Array<{ prefix: string; key: ModuleKey }> = [
  { prefix: "/crm", key: "crm" },
  { prefix: "/accounting", key: "accounting" },
  { prefix: "/hr", key: "hr" },
  { prefix: "/attendance", key: "attendance" },
  { prefix: "/assets", key: "assets" },
  { prefix: "/settings/team", key: "users" },
  { prefix: "/settings", key: "settings" },
];

export function getModuleKeyFromPath(pathname: string): ModuleKey | null {
  return routeToModuleKey.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`))?.key ?? null;
}

export function filterModuleCards(enabledModules: string[]): ModuleCard[] {
  return moduleCards.filter((card) => {
    const moduleKey = getModuleKeyFromPath(card.href);
    return !moduleKey || enabledModules.includes(moduleKey);
  });
}

export function isModuleEnabled(pathname: string, enabledModules: string[]) {
  const moduleKey = getModuleKeyFromPath(pathname);
  if (!moduleKey) return true;
  return enabledModules.includes(moduleKey);
}
