"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  LogOut,
  MoonStar,
  Settings2,
} from "lucide-react";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { moduleCards } from "@/lib/data";
import { filterModuleCards, getAccessibleModules } from "@/lib/modules";
import { navItems } from "@/lib/navigation";
import { clearSession, type SessionUser } from "@/lib/session";

type TopbarProps = {
  user: SessionUser | null;
  pageTitle?: string;
};

type NotificationItem = {
  id: string;
  label: string;
  detail: string;
  href: string;
};

const THEME_KEY = "popin-theme";
const DISMISSED_NOTIFICATIONS_KEY = "popin-dismissed-notifications";

export function Topbar({ user, pageTitle }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceLogo, setWorkspaceLogo] = useState<string | null>(null);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationStatus, setNotificationStatus] = useState("Loading activity...");
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);

  function signOut() {
    if (user?.refreshToken) void fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${user.refreshToken}` } }).catch(() => undefined);
    clearSession();
    router.replace("/login");
  }

  useEffect(() => {
    const storedTheme =
      typeof window !== "undefined" ? window.localStorage.getItem(THEME_KEY) : null;
    const nextTheme = storedTheme === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    if (!user?.token) return;
    void apiFetch<{ tenant: { logoUrl?: string | null } }>("/settings")
      .then((result) => setWorkspaceLogo(result.tenant.logoUrl ?? null))
      .catch(() => setWorkspaceLogo(null));
  }, [user?.token]);

  useEffect(() => {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.createElement("link");
    favicon.rel = "icon";
    favicon.href = workspaceLogo || "/icon.svg";
    if (!favicon.parentElement) document.head.appendChild(favicon);
    const appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]') ?? document.createElement("link");
    appleIcon.rel = "apple-touch-icon";
    appleIcon.href = workspaceLogo || "/icon.svg";
    if (!appleIcon.parentElement) document.head.appendChild(appleIcon);
  }, [workspaceLogo]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
      if (submenuRef.current && !submenuRef.current.contains(target)) {
        setSubmenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    setNotificationsOpen(false);
    setProfileOpen(false);
    setSubmenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    async function loadNotifications() {
      if (!user?.token) {
        setNotifications([]);
        setNotificationStatus("Sign in to view workspace activity.");
        return;
      }

      try {
        const items: NotificationItem[] = [];
        const enabledModules = getAccessibleModules(user.role, user.enabledModules ?? ["crm", "accounting", "hr", "attendance", "assets", "users", "settings"]);
        const requests: Array<Promise<void>> = [];

        if (enabledModules.includes("crm")) {
          requests.push(
            apiFetch<{ items: Array<{ id: string; title: string; stage: string }> }>("/crm/deals").then((crmDeals) => {
              crmDeals.items
                .filter((deal) => deal.stage === "NEW" || deal.stage === "DISCOVERY")
                .slice(0, 2)
                .forEach((deal) => {
                  items.push({
                    id: `deal-${deal.id}`,
                    label: `Pipeline attention: ${deal.title}`,
                    detail: `Current stage: ${deal.stage}`,
                    href: "/crm",
                  });
                });
            }),
          );
        }

        if (enabledModules.includes("accounting")) {
          requests.push(
            apiFetch<{ items: Array<{ id: string; customer: string; status: string; number: string }> }>("/accounting/invoices").then((accountingInvoices) => {
              accountingInvoices.items
                .filter((invoice) => invoice.status === "OVERDUE" || invoice.status === "SENT")
                .slice(0, 2)
                .forEach((invoice) => {
                  items.push({
                    id: `invoice-${invoice.id}`,
                    label: `Invoice watch: ${invoice.number}`,
                    detail: `${invoice.customer} is marked ${invoice.status.toLowerCase()}.`,
                    href: "/accounting",
                  });
                });
            }),
          );
        }

        if (enabledModules.includes("hr")) {
          requests.push(
            apiFetch<{ items: Array<{ id: string; status: string; employee: { fullName: string } }> }>("/hr/leave-requests").then((hrLeaveRequests) => {
              hrLeaveRequests.items
                .filter((request) => request.status === "PENDING")
                .slice(0, 2)
                .forEach((request) => {
                  items.push({
                    id: `leave-${request.id}`,
                    label: "Leave review needed",
                    detail: `${request.employee.fullName} is awaiting approval.`,
                    href: "/hr",
                  });
                });
            }),
          );
        }

        await Promise.all(requests);

        const dismissed = new Set<string>(
          JSON.parse(window.localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY) ?? "[]") as string[],
        );
        const visibleItems = items.filter((item) => !dismissed.has(item.id));
        setNotifications(visibleItems);
        setNotificationStatus(visibleItems.length ? "" : "No urgent workspace items right now.");
      } catch (error) {
        setNotifications([]);
        setNotificationStatus(error instanceof Error ? error.message : "Failed to load notifications.");
      }
    }

    void loadNotifications();
  }, [user?.enabledModules, user?.role, user?.token]);

  function clearNotifications() {
    const dismissed = new Set<string>(
      JSON.parse(window.localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY) ?? "[]") as string[],
    );
    notifications.forEach((item) => dismissed.add(item.id));
    window.localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify([...dismissed]));
    setNotifications([]);
    setNotificationStatus("No urgent workspace items right now.");
  }

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_KEY, nextTheme);
    }
    document.documentElement.dataset.theme = nextTheme;
  }

  const enabledModuleCards = useMemo(
    () => filterModuleCards(getAccessibleModules(user?.role, user?.enabledModules ?? ["crm", "accounting", "hr", "attendance", "assets", "users", "settings"])),
    [user?.enabledModules, user?.role],
  );
  const enabledNavItems = useMemo(
    () =>
      navItems.filter((item) =>
      item.href === "/dashboard" ||
        enabledModuleCards.some((card) => item.href === card.href || item.href.startsWith(card.href)),
      ),
    [enabledModuleCards],
  );

  const breadcrumbLabel = enabledNavItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ?? "Workspace";
  const activeModule = enabledModuleCards.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const breadcrumbSubmodule = activeModule?.submodules.find((item) => pathname === item.href) ?? null;

  return (
    <header className="theme-header sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur transition-colors">
      <div className="mx-auto max-w-[1600px] px-6 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="theme-surface theme-text grid h-11 w-11 place-items-center overflow-hidden rounded-full border border-line bg-white text-xs font-semibold text-ink">
              {workspaceLogo ? <img src={workspaceLogo} alt="Workspace logo" className="h-full w-full object-cover" /> : "POP"}
            </div>
            <div>
              <p className="theme-text text-xl font-semibold text-ink">{user?.tenantName ?? "Pop In Solutions"}</p>
            </div>
          </div>
          <div className="theme-surface flex flex-wrap items-center gap-3 rounded-[22px] border border-line bg-white px-2 py-2 shadow-[0_6px_18px_rgba(61,93,154,0.08)]">
            <div ref={notificationsRef} className="relative">
              <button
                onClick={() => setNotificationsOpen((current) => !current)}
                className="theme-subtext relative rounded-2xl border border-transparent px-3 py-3 text-slate-600 transition hover:border-line hover:bg-soft"
                aria-label="Open notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute left-7 top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {notifications.length}
                </span>
              </button>
              {notificationsOpen ? (
                <div className="theme-surface absolute left-1/2 top-[calc(100%+10px)] z-30 w-[min(320px,calc(100vw-2rem))] -translate-x-1/2 rounded-[24px] border border-line bg-white p-3 shadow-panel sm:left-auto sm:right-0 sm:translate-x-0">
                  <div className="flex items-center justify-between gap-3 px-2 pb-2">
                    <p className="theme-text text-sm font-semibold text-ink">Workspace Alerts</p>
                    {notifications.length ? (
                      <button
                        type="button"
                        onClick={clearNotifications}
                        className="theme-subtext text-xs font-semibold text-slate-500 transition hover:text-brand-500"
                      >
                        Clear all
                      </button>
                    ) : null}
                  </div>
                  {notifications.length ? (
                    <div className="space-y-2">
                      {notifications.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          className="block rounded-2xl border border-line px-4 py-3 transition hover:bg-soft"
                        >
                          <p className="theme-text text-sm font-semibold text-ink">{item.label}</p>
                          <p className="theme-subtext mt-1 text-xs text-slate-500">{item.detail}</p>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="theme-subtext px-2 py-3 text-sm text-slate-500">{notificationStatus}</p>
                  )}
                </div>
              ) : null}
            </div>

            <button
              onClick={toggleTheme}
              className="theme-surface theme-text rounded-2xl border border-line bg-white px-3 py-3 text-slate-700 transition hover:bg-soft"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            >
              <MoonStar className="h-5 w-5" />
            </button>

            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen((current) => !current)}
                className="theme-text flex items-center gap-2 rounded-2xl border border-transparent px-2 py-1 text-slate-700 transition hover:bg-soft"
              >
                <div className="theme-surface grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-xs font-semibold">
                  {user?.name
                    ?.split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2) ?? "PI"}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="theme-text text-sm font-semibold text-ink">{user?.name ?? "Workspace User"}</p>
                  <p className="theme-subtext text-xs text-slate-500">{user?.email ?? "team@popinsolutions.co.za"}</p>
                  <p className="theme-subtext text-[11px] text-slate-400">{user?.tenantName ?? "Workspace"}</p>
                </div>
                <ChevronDown className="h-4 w-4" />
              </button>
              {profileOpen ? (
                <div className="theme-surface absolute right-0 top-[calc(100%+10px)] w-[240px] rounded-[24px] border border-line bg-white p-3 shadow-panel">
                  <div className="rounded-2xl border border-line px-4 py-3">
                    <p className="theme-text text-sm font-semibold text-ink">{user?.name ?? "Workspace User"}</p>
                    <p className="theme-subtext mt-1 text-xs text-slate-500">{user?.email ?? "team@popinsolutions.co.za"}</p>
                    <p className="theme-subtext mt-1 text-xs text-slate-500">Role: {user?.role ?? "MEMBER"}</p>
                  </div>
                  <div className="mt-2 space-y-2">
                    <Link
                      href="/settings"
                      className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 transition hover:bg-soft"
                    >
                      <Settings2 className="h-4 w-4 text-brand-500" />
                      <span className="theme-text text-sm font-medium text-ink">Workspace Settings</span>
                    </Link>
                    <button
                      onClick={signOut}
                      className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left transition hover:bg-soft"
                    >
                      <LogOut className="h-4 w-4 text-brand-500" />
                      <span className="theme-text text-sm font-medium text-ink">Sign Out</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="theme-subtext mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Link href="/dashboard" className="theme-surface theme-text rounded-full bg-white px-4 py-2 font-medium text-slate-700 shadow-sm">
            Dashboard
          </Link>
          <span>/</span>
          <span>{breadcrumbLabel}</span>
          {pageTitle && pageTitle !== breadcrumbLabel ? (
            <>
              <span>/</span>
              {breadcrumbSubmodule ? (
                <div ref={submenuRef} className="relative">
                  <button
                    onClick={() => setSubmenuOpen((current) => !current)}
                    className="theme-surface theme-text inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition hover:bg-soft"
                  >
                    <span>{breadcrumbSubmodule.title}</span>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  {submenuOpen ? (
                    <div className="theme-surface subtle-scroll absolute left-0 top-[calc(100%+10px)] max-h-[min(70vh,560px)] w-[260px] overflow-y-auto rounded-[20px] border border-line bg-white p-2 shadow-panel">
                      {activeModule?.submodules.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="block rounded-2xl px-3 py-2.5 transition hover:bg-soft"
                        >
                          <p className="theme-text text-sm font-semibold text-ink">{item.title}</p>
                          <p className="theme-subtext mt-0.5 text-xs text-slate-500">{item.subtitle}</p>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <span className="theme-text font-medium text-slate-700">{pageTitle}</span>
              )}
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
