"use client";

import type { PropsWithChildren } from "react";
import { useState } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { Topbar } from "@/components/layout/topbar";
import { PermissionWalkthrough } from "@/components/onboarding/permission-walkthrough";
import type { SessionUser } from "@/lib/session";

type AppShellProps = PropsWithChildren<{
  title: string;
  description: string;
  actionLabel?: string;
}>;

export function AppShell({ children, title, description, actionLabel }: AppShellProps) {
  const [user, setUser] = useState<SessionUser | null>(null);
  void title;
  void description;
  void actionLabel;

  return (
    <AuthGuard onResolved={setUser}>
      <div className="theme-page min-h-screen">
        <Topbar user={user} pageTitle={title} />
        <div className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
          <main>{children}</main>
        </div>
        {user ? <PermissionWalkthrough user={user} /> : null}
      </div>
    </AuthGuard>
  );
}
