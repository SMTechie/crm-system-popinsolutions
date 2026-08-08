"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { storeSession, getStoredSession } from "@/lib/session";

type AuthSession = {
  accessToken: string;
  user: { id: string; email: string; name: string; role: string; tenantId: string; tenantName?: string; enabledModules?: string[] };
};

export default function LoginPage() {
  const router = useRouter();
  const [nextRoute, setNextRoute] = useState("/dashboard");
  const [workspaceSlug, setWorkspaceSlug] = useState("demo-tenant");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [signupForm, setSignupForm] = useState({
    workspaceName: "",
    workspaceSlug: "",
    ownerName: "",
    ownerEmail: "",
    password: "",
    planCode: "enterprise",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextRoute(params.get("next") || "/dashboard");

    const session = getStoredSession();
    if (session) {
      router.replace("/dashboard");
    }
  }, [router]);

  function completeLogin(session: AuthSession) {
    storeSession({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      tenantId: session.user.tenantId,
      tenantName: session.user.tenantName,
      enabledModules: session.user.enabledModules ?? ["crm", "accounting", "hr", "forms", "automation", "settings"],
      token: session.accessToken,
    });
    router.push(nextRoute);
  }

  async function checkWorkspaceAvailability(rawSlug: string) {
    if (!rawSlug.trim()) {
      setAvailabilityMessage("");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/workspace-availability`, {
        headers: {
          "X-Workspace-Slug": rawSlug.trim(),
        },
      });
      if (!response.ok) {
        throw new Error("Could not check workspace slug.");
      }
      const result = (await response.json()) as { available: boolean; message: string; slug: string };
      setSignupForm((current) => ({ ...current, workspaceSlug: result.slug || current.workspaceSlug }));
      setAvailabilityMessage(result.message);
    } catch (availabilityError) {
      setAvailabilityMessage(availabilityError instanceof Error ? availabilityError.message : "Could not check workspace slug.");
    }
  }

  async function submitLogin(userEmail: string, userPassword: string, workspace: string) {
    if (!workspace.trim() || !userEmail.trim() || !userPassword.trim()) {
      setError("Enter workspace, email, and password to continue.");
      return;
    }

    try {
      setError("");
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: userEmail.trim(),
          password: userPassword.trim(),
          tenantId: workspace.trim(),
        }),
      });

      if (!response.ok) {
        const rawMessage = await response.text();
        let message = "Login failed.";
        try {
          const parsed = JSON.parse(rawMessage) as { message?: string; error?: string; statusCode?: number };
          if (parsed.statusCode === 401) {
            message = "Invalid email or password. Please try again.";
          } else {
            message = parsed.message || parsed.error || message;
          }
        } catch {
          message = rawMessage || message;
        }
        throw new Error(message);
      }

      const session = (await response.json()) as AuthSession;
      completeLogin(session);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitLogin(email, password, workspaceSlug);
  }

  async function handleSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !signupForm.workspaceName.trim() ||
      !signupForm.workspaceSlug.trim() ||
      !signupForm.ownerName.trim() ||
      !signupForm.ownerEmail.trim() ||
      signupForm.password.trim().length < 10
    ) {
      setSignupError("Complete all workspace fields and use a password with at least 10 characters.");
      return;
    }

    try {
      setSignupLoading(true);
      setSignupError("");
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(signupForm),
      });

      if (!response.ok) {
        const rawMessage = await response.text();
        let message = "Workspace signup failed.";
        try {
          const parsed = JSON.parse(rawMessage) as { message?: string | string[]; error?: string };
          message = Array.isArray(parsed.message) ? parsed.message.join(", ") : parsed.message || parsed.error || message;
        } catch {
          message = rawMessage || message;
        }
        throw new Error(message);
      }

      const session = (await response.json()) as AuthSession;
      completeLogin(session);
    } catch (signupFailure) {
      setSignupError(signupFailure instanceof Error ? signupFailure.message : "Workspace signup failed.");
    } finally {
      setSignupLoading(false);
    }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#edf5ff_0%,#f6f9ff_35%,#eef3ff_100%)] px-4 py-4 md:px-6 md:py-5">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-3xl flex-col items-center justify-center md:min-h-[calc(100vh-2.5rem)]">
        <div className="w-full max-w-[560px] rounded-[28px] border border-white/70 bg-white/95 p-5 shadow-[0_20px_60px_rgba(84,113,181,0.14)] md:p-6">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-line bg-white text-[11px] font-semibold text-ink md:h-16 md:w-16 md:text-xs">
            POP IN
          </div>
          <div className="mx-auto mt-4 max-w-[500px] text-center md:mt-5">
            <h1 className="text-[1.75rem] font-semibold tracking-[-0.03em] text-ink md:text-[2rem]">Pop In Solutions Staff Portal</h1>
            <p className="mt-2 text-[13px] text-slate-500 md:text-sm">Secure enterprise access for CRM, finance, HR, and automation operations.</p>
          </div>

          <form onSubmit={handleEmailLogin} className="mx-auto mt-6 max-w-[500px] space-y-3 md:mt-7">
            <input
              type="text"
              placeholder="Workspace slug"
              value={workspaceSlug}
              onChange={(event) => setWorkspaceSlug(event.target.value)}
              className="w-full rounded-full border border-line bg-white px-5 py-3 text-[13px] text-ink outline-none transition focus:border-brand-500 md:px-6 md:py-3.5 md:text-sm"
            />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-full border border-line bg-white px-5 py-3 text-[13px] text-ink outline-none transition focus:border-brand-500 md:px-6 md:py-3.5 md:text-sm"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-full border border-line bg-white px-5 py-3 text-[13px] text-ink outline-none transition focus:border-brand-500 md:px-6 md:py-3.5 md:text-sm"
            />
            {error ? <p className="text-center text-sm font-medium text-rose-500">{error}</p> : null}
            <div className="flex flex-col items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="grid h-14 w-14 place-items-center rounded-full bg-[#171717] text-lg font-semibold text-white shadow-[0_16px_24px_rgba(20,20,20,0.14)] transition hover:scale-[1.03] md:h-16 md:w-16 md:text-xl"
              >
                {loading ? "..." : "Go"}
              </button>
              <p className="text-center text-[11px] text-slate-500 md:text-xs">
                Use your live workspace credentials to continue.
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowSignup(true);
                  setSignupError("");
                }}
                className="rounded-full border border-line px-4 py-2 text-[12px] font-semibold text-slate-700 transition hover:bg-soft"
              >
                Create a new workspace
              </button>
            </div>
          </form>
        </div>
        <p className="mt-5 text-center text-sm font-medium text-slate-500 md:mt-6 md:text-lg">
          Powered by <span className="text-ink">Pop In Solutions</span>
        </p>
      </div>

      {showSignup ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/30 px-4 py-6 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.18)] md:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">SaaS Onboarding</p>
                <h2 className="mt-1 text-2xl font-semibold text-ink md:text-[2.2rem]">Create a rentable client workspace</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">Provision a new tenant, choose a starting plan, and sign in immediately as the owner account.</p>
              </div>
              <button onClick={() => setShowSignup(false)} className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-soft">
                Close
              </button>
            </div>

            <form onSubmit={handleSignup} className="mt-5 grid gap-3 md:grid-cols-2">
              <input
                type="text"
                placeholder="Workspace name"
                value={signupForm.workspaceName}
                onChange={(event) =>
                  setSignupForm((current) => ({
                    ...current,
                    workspaceName: event.target.value,
                    workspaceSlug: current.workspaceSlug || event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                  }))
                }
                className="rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand-500"
              />
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Workspace slug"
                  value={signupForm.workspaceSlug}
                  onChange={(event) => setSignupForm((current) => ({ ...current, workspaceSlug: event.target.value }))}
                  onBlur={() => void checkWorkspaceAvailability(signupForm.workspaceSlug)}
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand-500"
                />
                {availabilityMessage ? <p className="text-xs text-slate-500">{availabilityMessage}</p> : null}
              </div>
              <input
                type="text"
                placeholder="Owner full name"
                value={signupForm.ownerName}
                onChange={(event) => setSignupForm((current) => ({ ...current, ownerName: event.target.value }))}
                className="rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand-500"
              />
              <input
                type="email"
                placeholder="Owner email"
                value={signupForm.ownerEmail}
                onChange={(event) => setSignupForm((current) => ({ ...current, ownerEmail: event.target.value }))}
                className="rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand-500"
              />
              <select
                value={signupForm.planCode}
                onChange={(event) => setSignupForm((current) => ({ ...current, planCode: event.target.value }))}
                className="rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand-500"
              >
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <input
                type="password"
                placeholder="Owner password"
                value={signupForm.password}
                onChange={(event) => setSignupForm((current) => ({ ...current, password: event.target.value }))}
                className="rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand-500"
              />
              <div className="rounded-[22px] border border-line bg-soft/40 p-4 md:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Plan behavior</p>
                <p className="mt-2 text-sm text-slate-600">
                  Starter enables CRM and Settings, Growth adds Accounting, Forms, and Automation, and Enterprise enables the full operating system including HR.
                </p>
              </div>
              {signupError ? <p className="text-sm font-medium text-rose-500 md:col-span-2">{signupError}</p> : null}
              <div className="flex flex-wrap items-center justify-end gap-3 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowSignup(false)}
                  className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-soft"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={signupLoading}
                  className="rounded-2xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
                >
                  {signupLoading ? "Creating..." : "Create Workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
