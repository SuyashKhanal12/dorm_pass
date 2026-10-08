import { timingSafeEqual } from "crypto";
import type { AdminScope } from "./types";

function envCodes(key: string): string[] {
  const raw = process.env[key];
  if (raw && raw.trim()) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function safeEqualStr(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a.toUpperCase(), "utf8");
    const bb = Buffer.from(b.toUpperCase(), "utf8");
    if (ba.length !== bb.length) {
      timingSafeEqual(ba, Buffer.alloc(ba.length));
      return false;
    }
    return timingSafeEqual(ba, bb);
  } catch {
    return a.toUpperCase() === b.toUpperCase();
  }
}

function matchesAny(entry: string, codes: string[]): boolean {
  return codes.some((c) => safeEqualStr(entry, c));
}

export function resolveAdmin(entry: string): {
  isAdmin: true;
  adminScope: AdminScope;
  label: string;
} | null {
  const e = entry.trim();
  if (!e) return null;

  const main = envCodes("GATEPASS_ADMIN_CODE");
  const kca1 = envCodes("GATEPASS_ADMIN_KCA1");
  const kca2 = envCodes("GATEPASS_ADMIN_KCA2");
  const kca3 = envCodes("GATEPASS_ADMIN_KCA3");

  if (matchesAny(e, main)) return { isAdmin: true, adminScope: "all", label: "Main admin" };
  if (matchesAny(e, kca1)) return { isAdmin: true, adminScope: "KCA1", label: "KCA1 staff" };
  if (matchesAny(e, kca2)) return { isAdmin: true, adminScope: "KCA2", label: "KCA2 staff" };
  if (matchesAny(e, kca3)) return { isAdmin: true, adminScope: "KCA3", label: "KCA3 staff" };
  return null;
}
