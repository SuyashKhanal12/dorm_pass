"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./globals.css";
import type { AdminScope, GateRequest, HostelId, MaintenanceReport, SessionUser } from "@/lib/types";
import { matchesEntryScope, matchesExitScope, scopeLabel } from "@/lib/admin";

const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;
const LATE_HOURS = 8;
const SESSION_KEY = "gatepass_session";

type Hostel = { name: HostelId; lat: number; lng: number; radius: number };

const HOSTELS: Hostel[] = [
  { name: "KCA1", lat: 24.4028418, lng: 54.5875658, radius: 150 },
  { name: "KCA2", lat: 24.4028787, lng: 54.5871303, radius: 150 },
  { name: "KCA3", lat: 24.4052019, lng: 54.5991466, radius: 150 },
];

type LocState = "idle" | "asking" | "ok" | "outside" | "denied" | "unavailable";

function distMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestHostel(lat: number, lng: number): Hostel | null {
  return HOSTELS.find((h) => distMeters(lat, lng, h.lat, h.lng) <= h.radius) || null;
}

function closestHostelInfo(lat: number, lng: number): { hostel: Hostel; meters: number } | null {
  let best: Hostel | null = null;
  let bestD = Infinity;
  for (const h of HOSTELS) {
    const d = distMeters(lat, lng, h.lat, h.lng);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best ? { hostel: best, meters: bestD } : null;
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return (
    dt.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) +
    " " +
    dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

function formatCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function formatDuration(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function remainingMs(ts: string | null) {
  return ts ? REQUEST_TIMEOUT_MS - (Date.now() - new Date(ts).getTime()) : null;
}

function isExitCurfew() {
  const utcHour = new Date().getUTCHours();
  const localHour = (utcHour + 4) % 24; // UTC+4 for Abu Dhabi
  return localHour < 5;
}

function isToday(d: Date) {
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function pillClass(status: string) {
  if (status === "pending") return "pending";
  if (status === "out") return "out";
  if (status === "returned") return "returned";
  if (status === "expired") return "expired";
  return "rejected";
}

function statusLabel(status: string) {
  if (status === "out") return "Outside";
  if (status === "returned") return "Completed";
  if (status === "expired") return "Expired";
  return status;
}

function InstituteLogo({ size = 48 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/iitd-seal.svg"
      width={size}
      height={size}
      alt="Indian Institute of Technology Delhi"
      className="inst-logo"
      style={{ objectFit: "contain" }}
    />
  );
}

function InstituteLogoWide({ height = 96 }: { height?: number }) {
  return (
    <div className="login-brand-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/iitd-seal.svg"
        height={height}
        width={height}
        alt="Indian Institute of Technology Delhi"
        className="inst-logo-wide"
        style={{ objectFit: "contain", display: "block", margin: "0 auto 12px" }}
      />
      <div className="inst-name">Indian Institute of Technology Delhi</div>
      <div className="inst-campus">Abu Dhabi</div>
    </div>
  );
}

function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className="toast show" role="alert" aria-live="polite">{msg}</div>;
}

const COMMON_DESTS = ["Library", "Mazyad Mall", "Airport", "Hospital", "Home"];

export default function GatePassApp() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [requests, setRequests] = useState<GateRequest[]>([]);
  const [view, setView] = useState<"student" | "security" | "outside" | "log" | "reports">("student");
  const [dest, setDest] = useState("");
  const [room, setRoom] = useState("");
  const [bed, setBed] = useState("");
  const [hostelPick, setHostelPick] = useState<HostelId | "">("");
  const [loginEntry, setLoginEntry] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [locErr, setLocErr] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [locState, setLocState] = useState<LocState>("idle");
  const [locZone, setLocZone] = useState<string | null>(null);
  const [locAcc, setLocAcc] = useState<number | null>(null);
  const [locExtra, setLocExtra] = useState<{ hostel: string; meters: number } | null>(null);
  const [outsideSearch, setOutsideSearch] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState("all");
  const [sortKey, setSortKey] = useState<keyof GateRequest | null>(null);
  const [sortDir, setSortDir] = useState(1);
  const [reports, setReports] = useState<MaintenanceReport[]>([]);
  const [reportCat, setReportCat] = useState<"cleanliness" | "maintenance">("cleanliness");
  const [reportDesc, setReportDesc] = useState("");
  const [reportRoom, setReportRoom] = useState("");
  const [reportHostel, setReportHostel] = useState<HostelId | "">(""); 
  const [reportErr, setReportErr] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const bootstrapped = useRef(false);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/requests", { credentials: "include" });
      if (res.status === 401) {
        setUser(null);
        try { localStorage.removeItem(SESSION_KEY); } catch {}
        return;
      }
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      const data: GateRequest[] = await res.json();
      const now = Date.now();
      const patched = data.map((r) => {
        if (r.status === "pending" && r.createdAt && now - new Date(r.createdAt).getTime() > REQUEST_TIMEOUT_MS) {
          return { ...r, status: "expired" as const };
        }
        if (r.status === "out" && r.entryRequestedAt && now - new Date(r.entryRequestedAt).getTime() > REQUEST_TIMEOUT_MS) {
          return { ...r, entryRequestedAt: null, entryHostel: null };
        }
        return r;
      });
      setRequests(patched);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const res = await fetch("/api/reports", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports ?? []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            const u = data.user as SessionUser;
            setUser(u);
            setView(u.isAdmin ? "security" : "student");
            try {
              localStorage.setItem(SESSION_KEY, JSON.stringify(u));
            } catch {}
            await loadRequests();
            await loadReports();
            return;
          }
        }
      } catch {}
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {}
    })();
  }, [loadRequests, loadReports]);

  // Auto-fill room and bed from past requests
  useEffect(() => {
    if (!user || user.isAdmin || view !== "student" || requests.length === 0) return;
    if (!room && !bed) {
      const myRequests = requests.filter((r) => r.entry.toLowerCase() === user.entry.toLowerCase());
      if (myRequests.length > 0) {
        const latest = myRequests.reduce((a, b) => new Date(a.createdAt).getTime() > new Date(b.createdAt).getTime() ? a : b);
        if (latest.room) setRoom(latest.room);
        if (latest.bed) setBed(latest.bed);
      }
    }
  }, [requests, user, view, room, bed]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      loadRequests();
      loadReports();
    }, 5000);
    return () => clearInterval(id);
  }, [user, loadRequests, loadReports]);

  useEffect(() => {
    if (!user || user.isAdmin) return;
    locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function finishLogin(u: SessionUser) {
    setUser(u);
    setView(u.isAdmin ? "security" : "student");
    setLoginErr("");
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    } catch {}
    loadRequests();
    loadReports();
  }

  async function signIn() {
    setLoginErr("");
    setLoading(true);
    try {
      const body: Record<string, string> = { entry: loginEntry.trim(), name: loginName.trim() };
      if (otpStep) {
        body.otp = otpCode.trim();
      }
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginErr(data.error || "Sign-in failed");
        return;
      }
      if (!otpStep && data.step === "otp_sent") {
        setOtpStep(true);
        setOtpEmail(data.email || "");
        showToast("OTP sent to your email");
        return;
      }
      if (data.user) {
        showToast(data.user.isAdmin ? "Welcome, staff" : "Signed in");
        finishLogin(data.user as SessionUser);
      }
    } catch {
      setLoginErr("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    setUser(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
  }

  function locate(cb?: (zone: Hostel | null, state: LocState) => void) {
    if (!navigator.geolocation) {
      setLocState("unavailable");
      cb?.(null, "unavailable");
      return;
    }
    setLocState("asking");
    const onOk = (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;
      const zone = nearestHostel(lat, lng);
      const s: LocState = zone ? "ok" : "outside";
      setLocState(s);
      setLocZone(zone?.name ?? null);
      setLocAcc(acc);
      if (zone) setHostelPick(zone.name);
      if (!zone) {
        const info = closestHostelInfo(lat, lng);
        setLocExtra(info ? { hostel: info.hostel.name, meters: info.meters } : null);
      } else setLocExtra(null);
      cb?.(zone, s);
    };
    const onErr = (err: GeolocationPositionError) => {
      const s: LocState = err.code === 1 ? "denied" : "unavailable";
      setLocState(s);
      cb?.(null, s);
    };
    navigator.geolocation.getCurrentPosition(
      onOk,
      (err) => {
        if (err.code === 1) {
          onErr(err);
          return;
        }
        navigator.geolocation.getCurrentPosition(onOk, onErr, {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 0,
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  function withHostelLocation(onInside: (zone: Hostel) => void) {
    setLocErr("");
    locate((zone, s) => {
      if (zone) {
        onInside(zone);
        return;
      }
      setLocErr(
        s === "outside"
          ? "You need to be within a hostel area to request an exit or mark an entry."
          : s === "denied"
            ? "Turn on location access to request an exit or mark an entry."
            : "Location isn't available on this device — can't verify you're on campus."
      );
    });
  }

  async function submitRequest() {
    if (!user) return;
    const active = requests.find(
      (r) => r.entry.toLowerCase() === user.entry.toLowerCase() && (r.status === "pending" || r.status === "out")
    );
    if (active) {
      showToast(
        active.status === "out"
          ? "Finish your current trip first — request entry, then you can apply for a new leave"
          : "You already have a leave request waiting on staff"
      );
      return;
    }
    if (isExitCurfew()) {
      showToast("Exit requests are closed from 12:00 AM to 5:00 AM");
      return;
    }
    if (!dest.trim()) {
      showToast("Enter where you are going");
      return;
    }
    if (!/^\d{3}$/.test(room.trim())) {
      showToast("Room number must be exactly 3 digits (e.g. 312)");
      return;
    }
    if (!/^[A-Fa-f]$/.test(bed.trim())) {
      showToast("Bed number must be A, B, C, D, E or F");
      return;
    }
    withHostelLocation(async (zone) => {
      const hostel = zone.name;
      setLoading(true);
      try {
        const res = await fetch("/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            dest: dest.trim(),
            room: room.trim(),
            bed: bed.trim().toUpperCase(),
            hostel,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        setDest("");
        setRoom("");
        setBed("");
        showToast(`Leave request sent for ${hostel} — waiting on staff`);
        await loadRequests();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to send request");
      } finally {
        setLoading(false);
      }
    });
  }

  async function patchRequest(id: number, action: string, extra?: { entryHostel?: string }) {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const messages: Record<string, string> = {
        approve_exit: "Approved exit — student marked outside",
        reject_exit: "Rejected exit request",
        request_entry: extra?.entryHostel
          ? `Entry request sent to ${extra.entryHostel} staff`
          : "Entry request sent — waiting on staff",
        approve_entry: "Approved entry",
        reject_entry: "Rejected entry request — they can request again",
        admin_mark_returned: "Marked as returned",
      };
      showToast(messages[action] || "Updated");
      await loadRequests();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Action failed");
    } finally {
      setLoading(false);
    }
  }

  async function clearData() {
    if (!user?.isAdmin || user.adminScope !== "all") {
      showToast("Only main admin can clear all data");
      return;
    }
    if (!confirm("Clear all GatePass logs in the cloud database? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/requests?confirm=yes", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast("All data cleared");
      await loadRequests();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to clear");
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    const scope = user?.adminScope ?? "all";
    const q = logSearch.trim().toLowerCase();
    const rows = requests.filter((r) => {
      if (scope !== "all" && !matchesExitScope(r.hostel, scope)) return false;
      if (logFilter !== "all" && r.status !== logFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.entry.toLowerCase().includes(q) ||
        r.dest.toLowerCase().includes(q) ||
        (r.hostel || "").toLowerCase().includes(q)
      );
    });
    const csvSafe = (v: string) => {
      let s = String(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = [
      [
        "Name",
        "Entry No",
        "Hostel",
        "Room",
        "Bed",
        "Destination",
        "Exit",
        "Exit approved by",
        "Entry hostel",
        "Entry",
        "Entry approved by",
        "Status",
      ]
        .map(csvSafe)
        .join(","),
    ]
      .concat(
        rows.map((r) =>
          [
            r.name,
            r.entry,
            r.hostel || "",
            r.room || "",
            r.bed || "",
            r.dest,
            fmtDateTime(r.exitTime),
            r.exitBy || "",
            r.entryHostel || "",
            fmtDateTime(r.entryTime),
            r.entryBy || "",
            statusLabel(r.status),
          ]
            .map(csvSafe)
            .join(",")
        )
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gatepass_logs_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const adminScope: AdminScope | null = user?.isAdmin ? user.adminScope ?? "all" : null;

  const myActive = useMemo(() => {
    if (!user) return null;
    return (
      requests.find(
        (r) =>
          r.entry.toLowerCase() === user.entry.toLowerCase() &&
          (r.status === "pending" || r.status === "out")
      ) || null
    );
  }, [requests, user]);

  const pending = useMemo(
    () =>
      requests.filter(
        (r) => r.status === "pending" && matchesExitScope(r.hostel, adminScope)
      ),
    [requests, adminScope]
  );

  const outNow = useMemo(
    () =>
      requests.filter((r) => {
        if (r.status !== "out") return false;
        if (!adminScope || adminScope === "all") return true;
        // Hostel staff: show students who exited from this hostel OR are requesting entry here
        if (r.entryRequestedAt) {
          return matchesEntryScope(r.entryHostel, r.hostel, adminScope);
        }
        return matchesExitScope(r.hostel, adminScope);
      }),
    [requests, adminScope]
  );

  const returnedToday = useMemo(
    () =>
      requests.filter(
        (r) =>
          r.status === "returned" &&
          r.entryTime &&
          isToday(new Date(r.entryTime)) &&
          matchesExitScope(r.hostel, adminScope)
      ),
    [requests, adminScope]
  );

  const scopedLogs = useMemo(
    () => requests.filter((r) => matchesExitScope(r.hostel, adminScope)),
    [requests, adminScope]
  );

  const locTitle =
    locState === "idle"
      ? "Location is off"
      : locState === "asking"
        ? "Finding you…"
        : locState === "ok"
          ? `You're at ${locZone || "your hostel"}`
          : locState === "outside"
            ? "Outside the hostel area"
            : locState === "denied"
              ? "Location is blocked"
              : "Can't get your location";

  const locSub =
    locState === "idle"
      ? "Allow location so we can confirm you're at your hostel."
      : locState === "asking"
        ? "Approve the location prompt in your browser."
        : locState === "ok"
          ? `Inside ${locZone}${locAcc != null ? ` · accurate to ~${Math.round(locAcc)} m` : ""}. You can request exit or return here.`
          : locState === "outside"
            ? locExtra
              ? `About ${Math.round(locExtra.meters)} m from ${locExtra.hostel}. Move closer, then tap Refresh.`
              : "Exit and return only work from inside a hostel zone."
            : locState === "denied"
              ? "Allow location for this site in browser settings, then try again."
              : "Your device couldn't find a position. Try outdoors with GPS on.";

  const locBtn =
    locState === "idle" || locState === "denied" || locState === "unavailable"
      ? locState === "idle"
        ? "Turn on"
        : "Try again"
      : locState === "ok" || locState === "outside"
        ? "Refresh"
        : "";

  if (!user) {
    return (
      <>
        <div id="login-screen">
          <div className="login-card premium-card">
            <div className="login-brand">
              <InstituteLogoWide height={100} />
            </div>
            <div className="login-divider" />
            <h1 className="gt">GatePass</h1>
            <p className="login-tag">Hostel exit &amp; return · IIT Delhi Abu Dhabi</p>

            {otpStep ? (
              <>
                <p className="login-foot" style={{ marginTop: 0, marginBottom: 20 }}>
                  Enter the 6-digit code sent to {otpEmail}
                </p>
                <div className="mf">
                  <input
                    type="text"
                    id="ln-otp"
                    placeholder=" "
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && signIn()}
                    inputMode="numeric"
                    maxLength={6}
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                  />
                  <label htmlFor="ln-otp">OTP Code</label>
                  <fieldset aria-hidden="true">
                    <legend>
                      <span>OTP Code</span>
                    </legend>
                  </fieldset>
                </div>
                {loginErr && (
                  <div className="err show" style={{ textAlign: "center", margin: "-2px 0 10px" }}>
                    {loginErr}
                  </div>
                )}
                <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: 8 }}>
                  <button className="btn ghost" onClick={() => { setOtpStep(false); setOtpCode(""); }} disabled={loading}>
                    Back
                  </button>
                  <button className="btn btn-premium" onClick={signIn} disabled={loading} style={{ minWidth: 120 }}>
                    {loading ? <span className="spinner"></span> : "Verify"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mf">
                  <input
                    type="text"
                    id="ln-entry"
                    placeholder=" "
                    value={loginEntry}
                    onChange={(e) => setLoginEntry(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && signIn()}
                    autoComplete="off"
                  />
                  <label htmlFor="ln-entry">Entry / roll number</label>
                  <fieldset aria-hidden="true">
                    <legend>
                      <span>Entry / roll number</span>
                    </legend>
                  </fieldset>
                </div>
                <div className="mf">
                  <input
                    type="text"
                    id="ln-name"
                    placeholder=" "
                    value={loginName}
                    onChange={(e) => setLoginName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && signIn()}
                    autoComplete="off"
                  />
                  <label htmlFor="ln-name">First name</label>
                  <fieldset aria-hidden="true">
                    <legend>
                      <span>First name</span>
                    </legend>
                  </fieldset>
                </div>
                {loginErr && (
                  <div className="err show" style={{ textAlign: "center", margin: "-2px 0 10px" }}>
                    {loginErr}
                  </div>
                )}
                <button className="btn btn-premium" onClick={signIn} disabled={loading} style={{ minWidth: 160, marginTop: 8 }}>
                  {loading ? <span className="spinner"></span> : "Sign in"}
                </button>

                <p className="login-foot">Students: roll number + first name · Staff: hostel code from office</p>
                <p className="login-privacy">Your first name is locked to your roll number on first sign-in.</p>
              </>
            )}
          </div>
        </div>
        <div className="toast-wrap">{toast && <Toast msg={toast} onDone={() => setToast(null)} />}</div>
      </>
    );
  }

  return (
    <>
      <header className="premium-header">
        <div className="hbar">
          <div className="brand">
            <InstituteLogo size={42} />
            <div>
              <div className="wm">
                <span className="gt">GatePass</span>
                <span className="tag">live</span>
              </div>
              <div className="inst-sm">
                IIT Delhi · Abu Dhabi
                {user.isAdmin && (
                  <span className="scope-chip">{scopeLabel(user.adminScope)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="tabs">
            {!user.isAdmin && (
              <button className={`tab ${view === "student" ? "active" : ""}`} onClick={() => setView("student")}>
                My requests
              </button>
            )}
            {!user.isAdmin && (
              <button className={`tab ${view === "reports" ? "active" : ""}`} onClick={() => { setView("reports"); loadReports(); }}>
                Reports
              </button>
            )}
            {user.isAdmin && (
              <>
                <button className={`tab ${view === "security" ? "active" : ""}`} onClick={() => setView("security")}>
                  Leave requests
                  {pending.length > 0 && <span className="badge-count">{pending.length}</span>}
                </button>
                <button className={`tab ${view === "outside" ? "active" : ""}`} onClick={() => setView("outside")}>
                  Currently outside
                  {outNow.length > 0 && <span className="badge-count out">{outNow.length}</span>}
                </button>
                <button className={`tab ${view === "log" ? "active" : ""}`} onClick={() => setView("log")}>
                  Logs
                </button>
                <button className={`tab ${view === "reports" ? "active" : ""}`} onClick={() => { setView("reports"); loadReports(); }}>
                  Reports
                </button>
              </>
            )}
          </div>
          <div className="userchip">
            <span>
              {user.name}
              {user.isAdmin
                ? ` · ${scopeLabel(user.adminScope)}`
                : ` · ${user.entry}`}
            </span>
            <button className="btn ghost" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="wrap">
        {/* STUDENT */}
        <div className={`view ${view === "student" ? "active" : ""}`}>
          <div className={`loc premium-loc`} data-state={locState} role="status">
            <div className="loc-ic" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
            </div>
            <div className="loc-body">
              <b>{locTitle}</b>
              <span>{locSub}</span>
            </div>
            {locBtn && (
              <button className="btn ghost" onClick={() => locate()}>
                {locBtn}
              </button>
            )}
          </div>

          <h2>New exit request</h2>
          <p className="muted">One leave at a time. GPS sets your hostel automatically. Room must be 3 digits; bed A–F.</p>
          {locErr && <div className="err show">{locErr}</div>}

          {!myActive && !isExitCurfew() && (
            <div className="card premium-card">
              <div className="mf">
                <input
                  type="text"
                  id="dest"
                  placeholder=" "
                  value={dest}
                  onChange={(e) => setDest(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitRequest()}
                  maxLength={60}
                  autoComplete="off"
                />
                <label htmlFor="dest">Where are you going</label>
                <fieldset aria-hidden="true">
                  <legend>
                    <span>Where are you going</span>
                  </legend>
                </fieldset>
              </div>
              <div className="quick-dests">
                {COMMON_DESTS.map((d) => (
                  <button key={d} className="chip-dest" onClick={() => setDest(d)}>
                    {d}
                  </button>
                ))}
              </div>

              <div className="field-row three">
                <div className="mf">
                  <input
                    type="text"
                    id="room"
                    placeholder=" "
                    value={room}
                    onChange={(e) => setRoom(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    onKeyDown={(e) => e.key === "Enter" && submitRequest()}
                    inputMode="numeric"
                    maxLength={3}
                    autoComplete="off"
                  />
                  <label htmlFor="room">Room (3 digits)</label>
                  <fieldset aria-hidden="true">
                    <legend>
                      <span>Room (3 digits)</span>
                    </legend>
                  </fieldset>
                </div>
                <div className="mf">
                  <input
                    type="text"
                    id="bed"
                    placeholder=" "
                    value={bed}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase().replace(/[^A-F]/g, "").slice(0, 1);
                      setBed(v);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && submitRequest()}
                    maxLength={1}
                    autoComplete="off"
                  />
                  <label htmlFor="bed">Bed (A–F)</label>
                  <fieldset aria-hidden="true">
                    <legend>
                      <span>Bed (A–F)</span>
                    </legend>
                  </fieldset>
                </div>
                <div className="mf hostel-display">
                  <div className="static-field">
                    <span className="static-label">Hostel (from GPS)</span>
                    <span className="static-value">{locZone || hostelPick || "—"}</span>
                  </div>
                </div>
              </div>
              <p className="hint">You must be inside a hostel zone. Return can be requested at any of the three hostels.</p>
              <div style={{ marginTop: 18 }}>
                <button className="btn btn-premium" onClick={submitRequest} disabled={loading}>
                  Send for approval
                </button>
              </div>
            </div>
          )}

          {myActive && (
            <div className="card premium-card" id="active-notice" role="status">
              {myActive.status === "pending" ? (
                <p className="note">
                  Request for <b>{myActive.dest}</b> at <b>{myActive.hostel || "hostel"}</b> is waiting on staff
                  {remainingMs(myActive.createdAt) != null
                    ? ` — expires in ${formatCountdown(remainingMs(myActive.createdAt)!)}`
                    : ""}
                  .
                </p>
              ) : myActive.entryRequestedAt ? (
                <p className="note">
                  Entry requested at <b>{myActive.entryHostel || myActive.hostel}</b> for <b>{myActive.dest}</b>
                  {remainingMs(myActive.entryRequestedAt) != null
                    ? ` (expires in ${formatCountdown(remainingMs(myActive.entryRequestedAt)!)})`
                    : ""}
                  .
                </p>
              ) : (
                <p className="note">
                  You&apos;re out for <b>{myActive.dest}</b>
                  {myActive.hostel ? ` (exited ${myActive.hostel})` : ""}
                  {myActive.exitTime ? ` since ${fmt(myActive.exitTime)}` : ""}. Use <b>I&apos;m back</b> when you return to any hostel.
                </p>
              )}
            </div>
          )}

          {isExitCurfew() && !myActive && (
            <div className="card premium-card">
              <p className="note">
                Exit requests are closed from 12:00 AM to 5:00 AM. You can still request entry if you&apos;re already out.
              </p>
            </div>
          )}

          <h2 className="sub">Request entry</h2>
          <div className="card premium-card">
            {requests
              .filter((r) => r.entry.toLowerCase() === user.entry.toLowerCase() && r.status === "out")
              .map((r) =>
                r.entryRequestedAt ? (
                  <div className="row" key={r.id}>
                    <div className="who">
                      <b>Entry at {r.entryHostel || r.hostel}</b>
                      <span>
                        Waiting on staff · {r.dest}
                        {remainingMs(r.entryRequestedAt) != null
                          ? ` · expires in ${formatCountdown(remainingMs(r.entryRequestedAt)!)}`
                          : ""}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="row" key={r.id}>
                    <div className="who">
                      <b>Out for {r.dest}</b>
                      <span>
                        Exited {r.hostel || "—"} · since {fmtDateTime(r.exitTime)}
                        {locZone ? ` · you are at ${locZone}` : ""}
                      </span>
                    </div>
                    <div className="actions">
                      <button
                        className="btn btn-premium"
                        disabled={loading}
                        onClick={() =>
                          withHostelLocation((zone) =>
                            patchRequest(r.id, "request_entry", { entryHostel: zone.name })
                          )
                        }
                      >
                        I&apos;m back{locZone ? ` at ${locZone}` : ""}
                      </button>
                    </div>
                  </div>
                )
              )}
            {requests.filter((r) => r.entry.toLowerCase() === user.entry.toLowerCase() && r.status === "out").length ===
              0 && <p className="empty">Nothing to check in right now.</p>}
          </div>

          <h2 className="sub">Your requests</h2>
          <div className="card premium-card">
            {requests
              .filter((r) => r.entry.toLowerCase() === user.entry.toLowerCase())
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((r) => (
                <div className="row row-stack" key={r.id}>
                  <div className="who">
                    <b>
                      {r.dest}
                      {r.hostel ? ` · ${r.hostel}` : ""}
                    </b>
                    <span>
                      Rm {r.room || "—"} / Bed {r.bed || "—"}
                      {" · "}
                      {r.status === "pending"
                        ? `Requested ${fmtDateTime(r.createdAt)}`
                        : r.status === "out"
                          ? `Out since ${fmtDateTime(r.exitTime)}`
                          : r.status === "returned"
                            ? `Returned ${fmtDateTime(r.entryTime)}${r.entryHostel ? ` @ ${r.entryHostel}` : ""}`
                            : statusLabel(r.status)}
                    </span>
                  </div>
                  <span className={`pill ${pillClass(r.status)}`}>{statusLabel(r.status)}</span>
                </div>
              ))}
            {requests.filter((r) => r.entry.toLowerCase() === user.entry.toLowerCase()).length === 0 && (
              <p className="empty">No requests yet — submit one above.</p>
            )}
          </div>
        </div>

        {/* STAFF: LEAVE */}
        <div className={`view ${view === "security" ? "active" : ""}`}>
          <h2>Leave requests</h2>
          <p className="muted">
            {adminScope === "all"
              ? "Main admin · all hostels. Approving marks the student outside."
              : `${adminScope} staff only · exit requests from this hostel.`}{" "}
            Unapproved requests expire after 3 minutes.
          </p>
          <div className="card premium-card">
            {pending.length === 0 && <p className="empty">Nothing waiting.</p>}
            {pending
              .slice()
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .map((r) => {
                const remain = remainingMs(r.createdAt);
                return (
                  <div className="row" key={r.id}>
                    <div className="who">
                      <b>{r.name}</b>
                      <span>
                        {r.entry} · {r.hostel || "—"} · Rm {r.room || "—"} / Bed {r.bed || "—"} · {r.dest} ·{" "}
                        {fmtDateTime(r.createdAt)}
                        {remain != null ? ` · expires in ${formatCountdown(remain)}` : ""}
                      </span>
                    </div>
                    <div className="actions">
                      <button className="btn btn-premium" disabled={loading} onClick={() => patchRequest(r.id, "approve_exit")}>
                        Approve
                      </button>
                      <button
                        className="btn ghost reject"
                        disabled={loading}
                        onClick={() => patchRequest(r.id, "reject_exit")}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* STAFF: OUTSIDE */}
        <div className={`view ${view === "outside" ? "active" : ""}`}>
          <h2>Currently outside</h2>
          <p className="muted">
            {adminScope === "all"
              ? "All hostels. Entry requests pin to the top."
              : `${adminScope}: students who exited here, or are requesting entry at this hostel.`}
          </p>
          <div className="logs-toolbar" style={{ marginBottom: 14 }}>
            <input
              type="text"
              className="search-input"
              placeholder="Search who's currently outside…"
              value={outsideSearch}
              onChange={(e) => setOutsideSearch(e.target.value)}
            />
          </div>
          <div className="card premium-card">
            {(() => {
              const q = outsideSearch.trim().toLowerCase();
              const filtered = outNow.filter(
                (r) =>
                  !q ||
                  r.name.toLowerCase().includes(q) ||
                  r.entry.toLowerCase().includes(q) ||
                  r.dest.toLowerCase().includes(q) ||
                  (r.hostel || "").toLowerCase().includes(q)
              );
              const pendingEntry = filtered
                .filter((r) => r.entryRequestedAt)
                .sort((a, b) => new Date(a.entryRequestedAt!).getTime() - new Date(b.entryRequestedAt!).getTime());
              const rest = filtered
                .filter((r) => !r.entryRequestedAt)
                .sort((a, b) => new Date(a.exitTime!).getTime() - new Date(b.exitTime!).getTime());
              const list = [...pendingEntry, ...rest];
              if (list.length === 0) return <p className="empty">No one is out right now.</p>;
              return list.map((r) => {
                if (r.entryRequestedAt) {
                  const remain = remainingMs(r.entryRequestedAt);
                  return (
                    <div className="row entry-pending" key={r.id}>
                      <div className="who">
                        <b>{r.name}</b>
                        <span>
                          {r.entry} · entry at <b>{r.entryHostel || r.hostel}</b>
                          {r.hostel && r.entryHostel && r.hostel !== r.entryHostel
                            ? ` (exited ${r.hostel})`
                            : ""}{" "}
                          · Rm {r.room || "—"} / Bed {r.bed || "—"} · {r.dest}
                          {remain != null ? ` · expires in ${formatCountdown(remain)}` : ""}
                        </span>
                      </div>
                      <div className="actions">
                        <span className="pill pending">Entry @ {r.entryHostel || r.hostel}</span>
                        <button
                          className="btn btn-premium"
                          disabled={loading}
                          onClick={() => patchRequest(r.id, "approve_entry")}
                        >
                          Approve
                        </button>
                        <button
                          className="btn ghost reject"
                          disabled={loading}
                          onClick={() => patchRequest(r.id, "reject_entry")}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                }
                const ms = Date.now() - new Date(r.exitTime!).getTime();
                const late = ms > LATE_HOURS * 3600000;
                return (
                  <div className="row" key={r.id}>
                    <div className="who">
                      <b>{r.name}</b>
                      <span>
                        {r.entry} · {r.hostel || "—"} · Rm {r.room || "—"} / Bed {r.bed || "—"} · {r.dest} · Out since{" "}
                        {fmtDateTime(r.exitTime)} <span className="elapsed">({formatDuration(ms)})</span>
                      </span>
                    </div>
                    <div className="actions">
                      <span className={`pill ${late ? "late" : "out"}`}>{late ? "Late" : "Out"}</span>
                      <button
                        className="btn ghost sm"
                        disabled={loading}
                        onClick={() => patchRequest(r.id, "admin_mark_returned")}
                      >
                        Mark returned
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* LOGS */}
        <div className={`view ${view === "log" ? "active" : ""}`}>
          <h2>Logs</h2>
          <p className="muted">
            {adminScope === "all" ? "All hostels · " : `${adminScope} only · `}
            full date &amp; time. Completed trips removed 7 days after return.
          </p>
          <div className="stats">
            <div className="stat premium-stat">
              <b>{outNow.length}</b>
              <span>Currently outside</span>
            </div>
            <div className="stat premium-stat">
              <b>{returnedToday.length}</b>
              <span>Returned today</span>
            </div>
            <div className="stat premium-stat">
              <b>{scopedLogs.length}</b>
              <span>Total records</span>
            </div>
          </div>
          <h2 className="sub">All records</h2>
          <div className="logs-toolbar">
            <input
              type="text"
              className="search-input"
              placeholder="Search by name, entry, hostel or destination"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
            />
            <select className="filter-select" value={logFilter} onChange={(e) => setLogFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="out">Currently outside</option>
              <option value="returned">Returned</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
            <button className="btn ghost" onClick={exportCSV}>
              Export CSV
            </button>
            {adminScope === "all" && (
              <button className="btn ghost reject" onClick={clearData}>
                Clear all data
              </button>
            )}
          </div>
          <div className="card premium-card" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  {(
                    [
                      ["name", "Student"],
                      ["entry", "Entry no."],
                      ["hostel", "Hostel"],
                      ["room", "Room"],
                      ["bed", "Bed"],
                      ["dest", "Destination"],
                      ["exitTime", "Exit"],
                      ["exitBy", "Exit by"],
                      ["entryHostel", "Entry hostel"],
                      ["entryTime", "Entry"],
                      ["entryBy", "Entry by"],
                      ["status", "Status"],
                    ] as const
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      className="sortable"
                      onClick={() => {
                        if (sortKey === key) setSortDir(-sortDir);
                        else {
                          setSortKey(key);
                          setSortDir(1);
                        }
                      }}
                    >
                      {label}
                      <span className="arrow">{sortKey === key ? (sortDir === 1 ? "▲" : "▼") : ""}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const q = logSearch.trim().toLowerCase();
                  let rows = scopedLogs.filter((r) => {
                    if (logFilter !== "all" && r.status !== logFilter) return false;
                    if (!q) return true;
                    return (
                      r.name.toLowerCase().includes(q) ||
                      r.entry.toLowerCase().includes(q) ||
                      r.dest.toLowerCase().includes(q) ||
                      (r.hostel || "").toLowerCase().includes(q)
                    );
                  });
                  rows = sortKey
                    ? rows.slice().sort((a, b) => {
                        const getVal = (x: GateRequest) => {
                          if (sortKey === "exitTime" || sortKey === "entryTime") {
                            const v = x[sortKey];
                            return v ? new Date(v).getTime() : 0;
                          }
                          return String(x[sortKey!] ?? "").toLowerCase();
                        };
                        const av = getVal(a);
                        const bv = getVal(b);
                        if (av < bv) return -1 * sortDir;
                        if (av > bv) return 1 * sortDir;
                        return 0;
                      })
                    : rows
                        .slice()
                        .sort(
                          (a, b) =>
                            new Date(b.entryTime || b.exitTime || b.createdAt).getTime() -
                            new Date(a.entryTime || a.exitTime || a.createdAt).getTime()
                        );
                  if (rows.length === 0)
                    return (
                      <tr>
                        <td colSpan={12} className="empty">
                          No records match.
                        </td>
                      </tr>
                    );
                  return rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.entry}</td>
                      <td>{r.hostel || "—"}</td>
                      <td>{r.room || "—"}</td>
                      <td>{r.bed || "—"}</td>
                      <td>{r.dest}</td>
                      <td>{fmtDateTime(r.exitTime)}</td>
                      <td>{r.exitBy || "—"}</td>
                      <td>{r.entryHostel || "—"}</td>
                      <td>{fmtDateTime(r.entryTime)}</td>
                      <td>{r.entryBy || "—"}</td>
                      <td>
                        <span className={`pill ${pillClass(r.status)}`}>{statusLabel(r.status)}</span>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* REPORTS: Cleanliness & Maintenance */}
        <div className={`view ${view === "reports" ? "active" : ""}`}>
          <h2>Cleanliness &amp; Maintenance</h2>
          <p className="muted">
            {user.isAdmin
              ? adminScope === "all"
                ? "All hostels · view and update status of all reports."
                : `${adminScope} · reports filed for this hostel.`
              : "Report an issue in your room or common areas. Staff will be notified."}
          </p>

          {/* Submit form — students only */}
          {!user.isAdmin && (
            <div className="card premium-card" style={{ marginBottom: 20 }}>
              <h2 className="sub" style={{ marginTop: 0 }}>Submit a report</h2>
              {reportErr && <div className="err show">{reportErr}</div>}
              <div className="field-row three" style={{ marginBottom: 12 }}>
                <div className="mf">
                  <select
                    value={reportCat}
                    onChange={(e) => setReportCat(e.target.value as "cleanliness" | "maintenance")}
                    style={{ width: "100%", padding: "12px 14px", background: "#f8f9fb", border: "1px solid #e0e3ea", borderRadius: 12, fontSize: 15 }}
                  >
                    <option value="cleanliness">🧹 Cleanliness</option>
                    <option value="maintenance">🔧 Maintenance</option>
                  </select>
                </div>
                <div className="mf">
                  <input
                    type="text"
                    placeholder="Room (3 digits)"
                    value={reportRoom}
                    onChange={(e) => setReportRoom(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    inputMode="numeric"
                    maxLength={3}
                    style={{ width: "100%", padding: "12px 14px", background: "#f8f9fb", border: "1px solid #e0e3ea", borderRadius: 12, fontSize: 15 }}
                  />
                </div>
                <div className="mf">
                  <select
                    value={reportHostel}
                    onChange={(e) => setReportHostel(e.target.value as HostelId | "")}
                    style={{ width: "100%", padding: "12px 14px", background: "#f8f9fb", border: "1px solid #e0e3ea", borderRadius: 12, fontSize: 15 }}
                  >
                    <option value="">Select hostel</option>
                    <option value="KCA1">KCA1</option>
                    <option value="KCA2">KCA2</option>
                    <option value="KCA3">KCA3</option>
                  </select>
                </div>
              </div>
              <textarea
                placeholder="Describe the issue in detail…"
                value={reportDesc}
                onChange={(e) => setReportDesc(e.target.value)}
                maxLength={500}
                rows={4}
                style={{ width: "100%", padding: "12px 14px", background: "#f8f9fb", border: "1px solid #e0e3ea", borderRadius: 12, fontSize: 15, resize: "vertical", boxSizing: "border-box" }}
              />
              <div style={{ marginTop: 14 }}>
                <button
                  className="btn btn-premium"
                  disabled={reportLoading}
                  onClick={async () => {
                    setReportErr("");
                    if (!reportRoom || !/^\d{3}$/.test(reportRoom)) { setReportErr("Room must be exactly 3 digits"); return; }
                    if (!reportHostel) { setReportErr("Select a hostel"); return; }
                    if (!reportDesc.trim()) { setReportErr("Description is required"); return; }
                    setReportLoading(true);
                    try {
                      const res = await fetch("/api/reports", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ category: reportCat, description: reportDesc.trim(), room: reportRoom, hostel: reportHostel }),
                      });
                      const data = await res.json();
                      if (!res.ok) { setReportErr(data.error || "Failed to submit"); return; }
                      showToast("Report submitted successfully");
                      setReportDesc("");
                      setReportRoom("");
                      setReportHostel("");
                      await loadReports();
                    } catch {
                      setReportErr("Network error. Please try again.");
                    } finally {
                      setReportLoading(false);
                    }
                  }}
                >
                  {reportLoading ? "Submitting…" : "Submit report"}
                </button>
              </div>
            </div>
          )}

          {/* Reports list */}
          <div className="card premium-card">
            {reports.length === 0 ? (
              <p className="empty">No reports found.</p>
            ) : (
              reports
                .slice()
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((r) => (
                  <div className="row row-stack" key={r.id} style={{ borderBottom: "1px solid #f0f2f5", paddingBottom: 12, marginBottom: 12 }}>
                    <div className="who">
                      <b>
                        {r.category === "cleanliness" ? "🧹" : "🔧"} {r.category.charAt(0).toUpperCase() + r.category.slice(1)}
                        {" · "}Room {r.room} · {r.hostel}
                      </b>
                      <span>{r.description}</span>
                      <span style={{ color: "#8a9bb0", fontSize: 12, marginTop: 2 }}>
                        Reported by {r.reportedByName} ({r.reportedByEntry}) · {new Date(r.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="actions" style={{ alignItems: "center", gap: 8 }}>
                      <span className={`pill ${r.status === "open" ? "pending" : r.status === "in_progress" ? "out" : "returned"}`}>
                        {r.status === "open" ? "Open" : r.status === "in_progress" ? "In progress" : "Resolved"}
                      </span>
                      {user.isAdmin && r.status !== "resolved" && (
                        <>
                          {r.status === "open" && (
                            <button
                              className="btn ghost sm"
                              disabled={loading}
                              onClick={async () => {
                                const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "update_status", id: r.id, status: "in_progress" }) });
                                if (res.ok) { showToast("Marked in progress"); await loadReports(); } else { const d = await res.json(); showToast(d.error || "Failed"); }
                              }}
                            >
                              Mark in progress
                            </button>
                          )}
                          <button
                            className="btn ghost sm"
                            disabled={loading}
                            onClick={async () => {
                              const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "update_status", id: r.id, status: "resolved" }) });
                              if (res.ok) { showToast("Marked resolved"); await loadReports(); } else { const d = await res.json(); showToast(d.error || "Failed"); }
                            }}
                          >
                            Resolve
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      <div className="toast-wrap">{toast && <Toast msg={toast} onDone={() => setToast(null)} />}</div>
    </>
  );
}
