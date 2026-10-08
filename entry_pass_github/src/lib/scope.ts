import type { AdminScope } from "./types";
import { isHostelId } from "./types";

/**
 * Hostel-scope helpers. These are pure and safe to import from client code;
 * anything that touches secrets or Node APIs lives in `admin.ts`.
 */

export function matchesExitScope(hostel: string | undefined | null, scope: AdminScope | null): boolean {
  if (!scope || scope === "all") return true;
  return (hostel || "").toUpperCase() === scope;
}

export function matchesEntryScope(
  entryHostel: string | null | undefined,
  exitHostel: string | undefined | null,
  scope: AdminScope | null
): boolean {
  if (!scope || scope === "all") return true;
  const target = (entryHostel || exitHostel || "").toUpperCase();
  return target === scope;
}

export function scopeLabel(scope: AdminScope | null): string {
  if (!scope) return "Student";
  if (scope === "all") return "All hostels";
  if (isHostelId(scope)) return scope;
  return String(scope);
}

export function canStaffApproveExit(scope: AdminScope | null, hostel: string | undefined | null): boolean {
  if (!scope) return false;
  return matchesExitScope(hostel, scope);
}

export function canStaffApproveEntry(
  scope: AdminScope | null,
  entryHostel: string | null | undefined,
  exitHostel: string | undefined | null
): boolean {
  if (!scope) return false;
  return matchesEntryScope(entryHostel, exitHostel, scope);
}
