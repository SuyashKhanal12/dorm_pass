export type RequestStatus = "pending" | "out" | "returned" | "rejected" | "expired";

export type HostelId = "KCA1" | "KCA2" | "KCA3";

export type AdminScope = "all" | HostelId;

export interface GateRequest {
  id: number;
  name: string;
  entry: string;
  dest: string;
  /** Hostel room number - exactly 3 digits */
  room: string;
  /** Bed letter A-F */
  bed: string;
  /** Hostel the student is assigned to / exited from */
  hostel: HostelId | string;
  /** Hostel where entry was requested (may differ from exit hostel) */
  entryHostel: HostelId | string | null;
  status: RequestStatus;
  createdAt: string;
  exitTime: string | null;
  exitBy: string | null;
  entryTime: string | null;
  entryBy: string | null;
  entryRequestedAt: string | null;
}

export type ReportCategory = "cleanliness" | "maintenance";
export type ReportStatus = "open" | "in_progress" | "resolved";

export interface MaintenanceReport {
  id: number;
  category: ReportCategory;
  description: string;
  room: string;
  hostel: HostelId | string;
  status: ReportStatus;
  reportedByEntry: string;
  reportedByName: string;
  createdAt: string;
}

export interface SessionUser {
  name: string;
  entry: string;
  isAdmin: boolean;
  /** null for students; "all" for main admin; KCA1/2/3 for hostel staff */
  adminScope: AdminScope | null;
}

/** Bound on first successful registration - entry number locks to this name forever. */
export interface RegisteredUser {
  entry: string;
  name: string;
  email: string;
  verifiedAt: string;
  createdAt: string;
}

export interface PendingOtp {
  entry: string;
  name: string;
  email: string;
  otp: string;
  expiresAt: number;
  attempts: number;
}

export const HOSTEL_IDS: HostelId[] = ["KCA1", "KCA2", "KCA3"];

export function isHostelId(v: string): v is HostelId {
  return HOSTEL_IDS.includes(v as HostelId);
}

