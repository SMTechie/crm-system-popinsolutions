"use client";

import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { clearSession, getStoredSession, storeSession, type SessionUser } from "@/lib/session";
import { isModuleEnabled } from "@/lib/modules";

type AuthGuardProps = PropsWithChildren<{
  onResolved?: (user: SessionUser) => void;
}>;

export function AuthGuard({ children, onResolved }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"checking" | "ready">("checking");

  useEffect(() => {
    const session = getStoredSession();

    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    const activeSession = session;

    async function validate() {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${activeSession.token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Session expired.");
        }

        const me = (await response.json()) as {
          id: string;
          email: string;
          name: string;
          role: string;
          tenantId: string;
          tenantName?: string;
          enabledModules?: string[];
        };

        const resolvedSession: SessionUser = {
          ...activeSession,
          id: me.id,
          email: me.email,
          name: me.name,
          role: me.role,
          tenantId: me.tenantId,
          tenantName: me.tenantName,
          enabledModules: me.enabledModules ?? activeSession.enabledModules ?? ["crm", "accounting", "hr", "attendance", "assets", "projects", "users", "forms", "automation", "settings"],
        };

        storeSession(resolvedSession);

        if (!isModuleEnabled(pathname, resolvedSession.enabledModules)) {
          router.replace("/dashboard");
          return;
        }

        onResolved?.(resolvedSession);
        setStatus("ready");
      } catch {
        clearSession();
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    }

    void validate();
  }, [onResolved, pathname, router]);

  if (status !== "ready") {
    return (
      <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#edf4ff_0%,#f9fbff_40%,#f5f8ff_100%)]">
        <div className="rounded-[28px] border border-line bg-white px-8 py-6 shadow-panel">
          <p className="text-lg font-semibold text-ink">Loading workspace...</p>
          <p className="mt-2 text-sm text-slate-500">Checking your Pop In session.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
