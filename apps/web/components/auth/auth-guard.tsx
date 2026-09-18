"use client";

import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { clearSession, getStoredSession, storeSession, type SessionUser } from "@/lib/session";
import { getAccessibleModules, isModuleEnabled } from "@/lib/modules";

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
          profilePictureUrl?: string | null;
        };

        const resolvedSession: SessionUser = {
          ...activeSession,
          id: me.id,
          email: me.email,
          name: me.name,
          role: me.role,
          tenantId: me.tenantId,
          tenantName: me.tenantName,
          enabledModules: me.enabledModules ?? activeSession.enabledModules ?? ["crm", "accounting", "hr", "attendance", "assets", "projects", "users", "settings"],
          profilePictureUrl: me.profilePictureUrl ?? activeSession.profilePictureUrl,
        };

        storeSession(resolvedSession);

        if (!isModuleEnabled(pathname, getAccessibleModules(resolvedSession.role, resolvedSession.enabledModules))) {
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
      <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#edf4ff_0%,#f9fbff_40%,#f5f8ff_100%)]" aria-label="Loading workspace" role="status">
        <div className="px-10 py-9">
          <div id="wifi-loader" aria-hidden="true">
            <svg className="circle-outer" viewBox="0 0 86 86"><circle className="back" cx="43" cy="43" r="40" /><circle className="front" cx="43" cy="43" r="40" /></svg>
            <svg className="circle-middle" viewBox="0 0 60 60"><circle className="back" cx="30" cy="30" r="27" /><circle className="front" cx="30" cy="30" r="27" /></svg>
            <svg className="circle-inner" viewBox="0 0 34 34"><circle className="back" cx="17" cy="17" r="14" /><circle className="front" cx="17" cy="17" r="14" /></svg>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
