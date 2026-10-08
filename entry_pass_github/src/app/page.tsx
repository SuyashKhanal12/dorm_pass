"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdminScope, GateRequest, HostelId, MaintenanceReport, SessionUser } from "@/lib/types";
import { matchesEntryScope, matchesExitScope } from "@/lib/scope";
import { REQUEST_TIMEOUT_MS } from "@/lib/rules";
import { isToday } from "@/lib/format";
import { useHostelLocation } from "@/lib/useHostelLocation";
import AppHeader, { type View } from "@/components/AppHeader";
import LoginScreen from "@/components/LoginScreen";
import ReportsView from "@/components/ReportsView";
import StudentView from "@/components/StudentView";
import { LeaveRequestsView, LogsView, OutsideView } from "@/components/StaffViews";
import { ConfirmDialog, Seal, Spinner, ToastRegion, type ToastMessage, type ToastTone } from "@/components/ui";

const POLL_MS = 5000;

const PATCH_MESSAGES: Record<string, string> = {
  approve_exit: "Exit approved. The student is now outside.",
  reject_exit: "Exit request rejected.",
  approve_entry: "Check-in approved.",
  reject_entry: "Check-in rejected. The student can request again.",
  admin_mark_returned: "Marked as returned.",
};

export default function GatePassApp() {
  const [phase, setPhase] = useState<"checking" | "ready">("checking");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [requests, setRequests] = useState<GateRequest[]>([]);
  const [reports, setReports] = useState<MaintenanceReport[]>([]);
  const [view, setView] = useState<View>("student");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const bootstrapped = useRef(false);
  const toastSeq = useRef(0);
  const loc = useHostelLocation();
  const { locate } = loc;

  const notify = useCallback((text: string, tone: ToastTone = "info") => {
    setToast({ id: ++toastSeq.current, text, tone });
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToast((t) => (t && t.id === id ? null : t));
  }, []);

  /* ── Data ── */

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/requests", { credentials: "include" });
      if (res.status === 401) {
        setUser(null);
        return;
      }
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      const data: GateRequest[] = await res.json();
      const now = Date.now();
      // Show lapsed requests as expired right away; the server purges them later.
      setRequests(
        data.map((r) => {
          if (r.status === "pending" && r.createdAt && now - new Date(r.createdAt).getTime() > REQUEST_TIMEOUT_MS) {
            return { ...r, status: "expired" as const };
          }
          if (
            r.status === "out" &&
            r.entryRequestedAt &&
            now - new Date(r.entryRequestedAt).getTime() > REQUEST_TIMEOUT_MS
          ) {
            return { ...r, entryRequestedAt: null, entryHostel: null };
          }
          return r;
        })
      );
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

  /* ── Session ── */

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
            await Promise.all([loadRequests(), loadReports()]);
          }
        }
      } catch {
        /* Not signed in, or offline: fall through to the login screen. */
      } finally {
        setPhase("ready");
      }
    })();
  }, [loadRequests, loadReports]);

  const finishLogin = useCallback(
    (u: SessionUser) => {
      setUser(u);
      setView(u.isAdmin ? "security" : "student");
      notify(`Welcome, ${u.name}`, "success");
      void loadRequests();
      void loadReports();
    },
    [notify, loadRequests, loadReports]
  );

  async function signOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      /* The cookie is cleared server-side on a best-effort basis. */
    }
    setUser(null);
    setRequests([]);
    setReports([]);
  }

  // Poll while the tab is visible, and catch up as soon as it becomes visible again.
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      if (document.hidden) return;
      void loadRequests();
      void loadReports();
    };
    const id = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user, loadRequests, loadReports]);

  // Students: find the hostel as soon as they sign in.
  useEffect(() => {
    if (user && !user.isAdmin) locate();
  }, [user, locate]);

  /* ── Actions ── */

  const patchRequest = useCallback(
    async (id: number, action: string, extra?: { entryHostel?: string }): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await fetch(`/api/requests/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action, ...extra }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
        notify(
          action === "request_entry"
            ? extra?.entryHostel
              ? `Check-in request sent to ${extra.entryHostel} staff.`
              : "Check-in request sent."
            : PATCH_MESSAGES[action] || "Updated.",
          "success"
        );
        await loadRequests();
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : "That didn't work. Try again.", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [notify, loadRequests]
  );

  const createRequest = useCallback(
    async (input: { dest: string; room: string; bed: string; hostel: HostelId }): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await fetch("/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(input),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't send your request. Try again.");
        notify(`Request sent to ${input.hostel} staff.`, "success");
        await loadRequests();
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : "Couldn't send your request. Try again.", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [notify, loadRequests]
  );

  async function clearAllData() {
    if (!user?.isAdmin || user.adminScope !== "all") {
      notify("Only the main admin can clear all data.", "error");
      setConfirmClear(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/requests?confirm=yes", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't clear the logs.");
      notify("All logs cleared.", "success");
      await loadRequests();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Couldn't clear the logs.", "error");
    } finally {
      setBusy(false);
      setConfirmClear(false);
    }
  }

  /* ── Derived ── */

  const adminScope: AdminScope | null = user?.isAdmin ? (user.adminScope ?? "all") : null;

  const pending = useMemo(
    () => requests.filter((r) => r.status === "pending" && matchesExitScope(r.hostel, adminScope)),
    [requests, adminScope]
  );

  const outNow = useMemo(
    () =>
      requests.filter((r) => {
        if (r.status !== "out") return false;
        if (!adminScope || adminScope === "all") return true;
        // Hostel staff see students who left from their hostel, or are checking in there.
        if (r.entryRequestedAt) return matchesEntryScope(r.entryHostel, r.hostel, adminScope);
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

  /* ── Render ── */

  if (phase === "checking") {
    return (
      <div className="splash">
        <Seal size={72} alt="Indian Institute of Technology Delhi" />
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginScreen onSignedIn={finishLogin} notify={notify} />
        <ToastRegion toast={toast} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <>
      <div className="ambient" aria-hidden="true" />
      <AppHeader
        user={user}
        view={view}
        onNavigate={(next) => {
          setView(next);
          window.scrollTo({ top: 0 });
          if (next === "reports") void loadReports();
        }}
        onSignOut={signOut}
        pendingCount={pending.length}
        outsideCount={outNow.length}
      />

      <main className="app-main" data-view={view}>
        {/* Forms live in views that stay mounted, so a half-written request survives a tab switch. */}
        {!user.isAdmin && (
          <div className="view" hidden={view !== "student"}>
            <StudentView
              user={user}
              requests={requests}
              loc={loc}
              busy={busy}
              onCreate={createRequest}
              onPatch={patchRequest}
              onRefresh={loadRequests}
            />
          </div>
        )}

        {user.isAdmin && view === "security" && (
          <div className="view">
            <LeaveRequestsView
              pending={pending}
              adminScope={adminScope}
              busy={busy}
              onPatch={patchRequest}
              onRefresh={loadRequests}
            />
          </div>
        )}

        {user.isAdmin && view === "outside" && (
          <div className="view">
            <OutsideView
              outNow={outNow}
              adminScope={adminScope}
              busy={busy}
              onPatch={patchRequest}
              onRefresh={loadRequests}
            />
          </div>
        )}

        {user.isAdmin && view === "log" && (
          <div className="view">
            <LogsView
              rows={scopedLogs}
              outsideCount={outNow.length}
              returnedToday={returnedToday.length}
              adminScope={adminScope}
              busy={busy}
              onClearAll={() => setConfirmClear(true)}
            />
          </div>
        )}

        <div className="view" hidden={view !== "reports"}>
          <ReportsView
            user={user}
            reports={reports}
            adminScope={adminScope}
            detectedHostel={loc.zone}
            onReload={loadReports}
            notify={notify}
          />
        </div>
      </main>

      <ToastRegion toast={toast} onDismiss={dismissToast} />

      {confirmClear && (
        <ConfirmDialog
          title="Clear all logs?"
          message="This permanently deletes every leave record from the database. Registered roll numbers stay linked to their names."
          confirmLabel="Clear all logs"
          busy={busy}
          onConfirm={() => void clearAllData()}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </>
  );
}
