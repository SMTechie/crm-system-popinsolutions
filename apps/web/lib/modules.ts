import { moduleCards, type ModuleCard } from "@/lib/data";

export type ModuleKey = "crm" | "accounting" | "hr" | "attendance" | "assets" | "projects" | "users" | "forms" | "automation" | "settings";

const routeToModuleKey: Array<{ prefix: string; key: ModuleKey }> = [
  { prefix: "/crm", key: "crm" },
  { prefix: "/accounting", key: "accounting" },
  { prefix: "/hr", key: "hr" },
  { prefix: "/attendance", key: "attendance" },
  { prefix: "/assets", key: "assets" },
  { prefix: "/projects", key: "projects" },
  { prefix: "/settings/team", key: "users" },
  { prefix: "/forms", key: "forms" },
  { prefix: "/automation", key: "automation" },
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
