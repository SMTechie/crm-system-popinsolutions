"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { storeSession } from "@/lib/session";
import { SHOW_GUIDE_AFTER_LOGIN_KEY } from "@/components/onboarding/permission-walkthrough";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Completing secure sign-in…");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) { setMessage("OAuth sign-in did not return a login code."); return; }
    void fetch(`${API_BASE_URL}/auth/oauth/exchange`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "OAuth sign-in failed.");
        storeSession({ token: result.accessToken, refreshToken: result.refreshToken, id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role, tenantId: result.user.tenantId, tenantName: result.user.tenantName, enabledModules: result.user.enabledModules ?? [], profilePictureUrl: result.user.profilePictureUrl });
        window.sessionStorage.setItem(SHOW_GUIDE_AFTER_LOGIN_KEY, "true");
        router.replace("/dashboard");
      })
      .catch((reason) => setMessage(reason instanceof Error ? reason.message : "OAuth sign-in failed."));
  }, [router]);

  return <main className="grid min-h-screen place-items-center bg-soft px-4"><p className="rounded-2xl border border-line bg-white p-6 text-sm text-slate-600">{message}</p></main>;
}
