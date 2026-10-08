import type { ReportStatus, RequestStatus } from "./types";

export const EMPTY = "—";

export type PillTone = "neutral" | "pending" | "out" | "returned" | "rejected" | "expired" | "late";

export function formatTime(d: string | null): string {
  if (!d) return EMPTY;
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(d: string | null): string {
  if (!d) return EMPTY;
  const dt = new Date(d);
  return (
    dt.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) +
    " " +
    dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

/** m:ss, used for the approval countdown. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

/** "2h 10m" or "45m". */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function isToday(d: Date): boolean {
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const REQUEST_LABELS: Record<RequestStatus, string> = {
  pending: "Pending",
  out: "Outside",
  returned: "Returned",
  rejected: "Rejected",
  expired: "Expired",
};

export function statusLabel(status: RequestStatus): string {
  return REQUEST_LABELS[status] ?? status;
}

export function statusTone(status: RequestStatus): PillTone {
  return status;
}

const REPORT_LABELS: Record<ReportStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

export function reportStatusLabel(status: ReportStatus): string {
  return REPORT_LABELS[status] ?? status;
}

export function reportStatusTone(status: ReportStatus): PillTone {
  return status === "open" ? "pending" : status === "in_progress" ? "out" : "returned";
}
