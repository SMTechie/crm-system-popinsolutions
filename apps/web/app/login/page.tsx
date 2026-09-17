"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Clock3, X } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { storeSession, getStoredSession } from "@/lib/session";

type AuthSession = {
  accessToken: string;
  refreshToken?: string;
  user: { id: string; email: string; name: string; role: string; tenantId: string; tenantName?: string; enabledModules?: string[] };
};

function getWorkspaceFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const queryWorkspace = params.get("workspace") || params.get("tenant");
  if (queryWorkspace?.trim()) return queryWorkspace.trim();

  const path = window.location.pathname.split("/").filter(Boolean);
  const workspaceIndex = path.findIndex((segment) => segment === "workspace" || segment === "tenant");
  if (workspaceIndex >= 0 && path[workspaceIndex + 1]) return path[workspaceIndex + 1];

  const hostnameParts = window.location.hostname.split(".");
  if (hostnameParts.length > 2 && hostnameParts[0] !== "www") return hostnameParts[0];

  return "demo-tenant";
}

export default function LoginPage() {
  const router = useRouter();
  const [nextRoute, setNextRoute] = useState("/dashboard");
  const [workspaceSlug, setWorkspaceSlug] = useState("demo-tenant");
  const [branding, setBranding] = useState({ name: "Pop In Solutions", logoUrl: "" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [showAttendance, setShowAttendance] = useState(false);
  const [attendanceAction, setAttendanceAction] = useState<"IN" | "OUT">("IN");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [attendanceQrToken, setAttendanceQrToken] = useState("");
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  function closeAttendance() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraActive(false);
    setShowAttendance(false);
    setAttendanceQrToken("");
    setEmployeeNumber("");
    setAttendanceMessage("");
  }

  async function getAttendanceLocation() {
    if (!navigator.geolocation) throw new Error("Location permission is required to record attendance.");
    return new Promise<string>((resolve, reject) => navigator.geolocation.getCurrentPosition(
      (position) => resolve(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`),
      () => reject(new Error("Please enable location permission before clocking in or out.")),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    ));
  }

  async function submitAttendance() {
    if (!attendanceQrToken && !employeeNumber.trim()) {
      setAttendanceMessage("Scan the employee QR code or enter an employee number.");
      return;
    }
    try {
      setAttendanceBusy(true);
      setAttendanceMessage("");
      const location = await getAttendanceLocation();
      const response = await fetch(`${API_BASE_URL}/auth/attendance/kiosk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: workspaceSlug, employeeNumber: employeeNumber.trim() || undefined, qrToken: attendanceQrToken || undefined, action: attendanceAction, location, device: navigator.userAgent }),
      });
      const result = await response.json() as { message?: string; employee?: { fullName: string } };
      if (!response.ok) throw new Error(result.message || "Attendance action failed.");
      setAttendanceMessage(`${result.employee?.fullName ?? "Employee"} ${attendanceAction === "IN" ? "clocked in" : "clocked out"} successfully.`);
      setEmployeeNumber("");
      setAttendanceQrToken("");
    } catch (reason) {
      setAttendanceMessage(reason instanceof Error ? reason.message : "Attendance action failed.");
    } finally {
      setAttendanceBusy(false);
    }
  }

  async function startCamera() {
    try {
      if (!("mediaDevices" in navigator) || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not available in this browser.");
      const Detector = (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
      if (!Detector) throw new Error("QR camera scanning is not supported here. Enter the employee number manually.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      cameraStreamRef.current = stream;
      setCameraActive(true);
      const detector = new Detector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!cameraStreamRef.current || !videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          const value = results[0]?.rawValue;
          if (value) {
            const parsed = new URL(value, window.location.origin);
            const token = parsed.searchParams.get("employeeQr") || parsed.searchParams.get("qr") || value;
            setAttendanceQrToken(token);
            setAttendanceMessage("QR code scanned. Select Clock in or Clock out.");
            cameraStreamRef.current.getTracks().forEach((track) => track.stop());
            cameraStreamRef.current = null;
            setCameraActive(false);
            return;
          }
        } catch { /* keep scanning */ }
        window.setTimeout(() => void scan(), 400);
      };
      window.setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
        void scan();
      }, 700);
    } catch (reason) {
      setAttendanceMessage(reason instanceof Error ? reason.message : "Unable to open the camera.");
    }
  }

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
    const workspace = getWorkspaceFromUrl();
    setWorkspaceSlug(workspace);
    void fetch(`${API_BASE_URL}/auth/workspace-branding`, { headers: { "X-Workspace-Slug": workspace } })
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as { name?: string; logoUrl?: string | null };
        setBranding({ name: result.name || "Pop In Solutions", logoUrl: result.logoUrl || "" });
      })
      .catch(() => undefined);

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
      enabledModules: session.user.enabledModules ?? ["crm", "accounting", "hr", "attendance", "assets", "projects", "users", "settings"],
      token: session.accessToken,
      refreshToken: session.refreshToken,
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
      setError("Enter your workspace, username, and password to continue.");
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
    await submitLogin(username, password, workspaceSlug);
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
          <div className="mx-auto grid h-14 w-14 place-items-center overflow-hidden rounded-full border border-line bg-white text-[11px] font-semibold text-ink md:h-16 md:w-16 md:text-xs">
            {branding.logoUrl ? <img src={branding.logoUrl} alt={`${branding.name} logo`} className="h-full w-full object-cover" /> : "POP IN"}
          </div>
          <div className="mx-auto mt-4 max-w-[500px] text-center md:mt-5">
            <h1 className="text-[1.75rem] font-semibold tracking-[-0.03em] text-ink md:text-[2rem]">{branding.name}</h1>
          </div>

          <button type="button" onClick={() => setShowAttendance(true)} className="mx-auto mt-4 flex items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-2.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50">
            <Clock3 className="h-4 w-4" /> Employee clock in / out
          </button>

          <form onSubmit={handleEmailLogin} className="mx-auto mt-6 max-w-[500px] space-y-3 md:mt-7">
            <label className="block text-left">
              <span className="mb-1.5 block px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Username</span>
              <input
                type="text"
                autoComplete="username"
                placeholder="Enter your username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-2xl border border-line bg-white px-5 py-3 text-[13px] text-ink outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 md:px-6 md:py-3.5 md:text-sm"
              />
            </label>
            <label className="block text-left">
              <span className="mb-1.5 block px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-line bg-white px-5 py-3 text-[13px] text-ink outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 md:px-6 md:py-3.5 md:text-sm"
              />
            </label>
            {error ? <p className="text-center text-sm font-medium text-rose-500">{error}</p> : null}
            <div className="flex flex-col items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="h-12 w-full rounded-2xl bg-[#171717] px-6 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(20,20,20,0.14)] transition hover:bg-[#292929] focus:outline-none focus:ring-4 focus:ring-slate-900/15 disabled:cursor-not-allowed disabled:opacity-60 md:h-14 md:text-base"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
              <p className="text-center text-[11px] text-slate-500 md:text-xs">
                Sign in securely with your workspace credentials.
              </p>
            </div>
          </form>
        </div>
        <p className="mt-5 text-center text-sm font-medium text-slate-500 md:mt-6 md:text-lg">
          Powered by <span className="text-ink">Pop In Solutions</span>
        </p>
      </div>

      {showAttendance ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-8 backdrop-blur-sm" onClick={closeAttendance}>
          <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.2)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Employee attendance</p><h2 className="mt-1 text-2xl font-semibold text-ink">Clock in or clock out</h2><p className="mt-1 text-sm text-slate-500">Scan the employee QR code or enter the employee number.</p></div>
              <button type="button" onClick={closeAttendance} className="rounded-full border border-line p-2 text-slate-600 hover:bg-soft" aria-label="Close attendance"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-soft p-1"><button type="button" onClick={() => setAttendanceAction("IN")} className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${attendanceAction === "IN" ? "bg-white text-brand-600 shadow-sm" : "text-slate-500"}`}>Clock in</button><button type="button" onClick={() => setAttendanceAction("OUT")} className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${attendanceAction === "OUT" ? "bg-white text-brand-600 shadow-sm" : "text-slate-500"}`}>Clock out</button></div>
              <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 p-4 text-center">
                {cameraActive ? <video ref={videoRef} autoPlay muted playsInline className="mx-auto aspect-video w-full max-w-sm rounded-2xl bg-slate-950 object-cover" /> : <div className="mx-auto grid h-28 w-28 place-items-center rounded-2xl bg-white text-brand-500"><Camera className="h-10 w-10" /></div>}
                <button type="button" onClick={() => void startCamera()} className="mt-3 rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">{cameraActive ? "Scanning with front camera…" : "Open front camera to scan QR"}</button>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400"><span className="h-px flex-1 bg-line" />or enter manually<span className="h-px flex-1 bg-line" /></div>
              <input value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)} placeholder="Employee number, e.g. EMP-000001" className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none focus:border-brand-500" />
              {attendanceQrToken ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">QR code ready for attendance.</p> : null}
              {attendanceMessage ? <p className="rounded-xl bg-slate-50 px-3 py-2 text-center text-sm font-medium text-slate-600">{attendanceMessage}</p> : null}
            </div>
            <div className="flex justify-end gap-3 border-t border-line px-6 py-4"><button type="button" onClick={closeAttendance} className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button type="button" disabled={attendanceBusy} onClick={() => void submitAttendance()} className="rounded-2xl bg-[#171717] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{attendanceBusy ? "Saving…" : attendanceAction === "IN" ? "Clock in" : "Clock out"}</button></div>
          </div>
        </div>
      ) : null}

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
