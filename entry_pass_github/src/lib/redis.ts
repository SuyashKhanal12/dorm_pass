import { Redis } from "@upstash/redis";
import type { GateRequest, RegisteredUser, PendingOtp, MaintenanceReport } from "./types";

const KEY = "gatepass:requests";
const SEQ_KEY = "gatepass:seq";
const USERS_KEY = "gatepass:users"; // hash: entry(lower) -> RegisteredUser
const OTP_PREFIX = "gatepass:otp:"; // key per entry
const OTP_RATE_PREFIX = "gatepass:otp-rate:"; // rate limit login OTP requests

function getRedis() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing Redis credentials. Expected KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)."
    );
  }

  return new Redis({ url, token });
}

export async function getRequests(): Promise<GateRequest[]> {
  const redis = getRedis();
  const data = await redis.get<GateRequest[]>(KEY);
  // Backfill fields for older records
  return (data ?? []).map((r) => ({
    ...r,
    room: r.room ?? "",
    bed: r.bed ?? "",
    hostel: r.hostel ?? "",
    entryHostel: r.entryHostel ?? null,
  }));
}

export async function setRequests(requests: GateRequest[]): Promise<void> {
  const redis = getRedis();
  await redis.set(KEY, requests);
}

export async function nextId(): Promise<number> {
  const redis = getRedis();
  return await redis.incr(SEQ_KEY);
}

export async function clearAll(): Promise<void> {
  // Clears leave logs only — registered roll numbers / names stay bound.
  const redis = getRedis();
  await redis.del(KEY);
  await redis.del(SEQ_KEY);
}

export async function getUser(entry: string): Promise<RegisteredUser | null> {
  const redis = getRedis();
  const key = entry.trim().toLowerCase();
  const data = await redis.hget<RegisteredUser>(USERS_KEY, key);
  return data ?? null;
}

export async function saveUser(user: RegisteredUser): Promise<void> {
  const redis = getRedis();
  await redis.hset(USERS_KEY, { [user.entry.toLowerCase()]: user });
}

export async function setPendingOtp(otp: PendingOtp, ttlSec = 600): Promise<void> {
  const redis = getRedis();
  const key = OTP_PREFIX + otp.entry.toLowerCase();
  await redis.set(key, otp, { ex: Math.max(1, Math.min(ttlSec, 600)) });
}

export async function getPendingOtp(entry: string): Promise<PendingOtp | null> {
  const redis = getRedis();
  const data = await redis.get<PendingOtp>(OTP_PREFIX + entry.trim().toLowerCase());
  return data ?? null;
}

export async function clearPendingOtp(entry: string): Promise<void> {
  const redis = getRedis();
  await redis.del(OTP_PREFIX + entry.trim().toLowerCase());
}

/** Returns true if allowed; false if rate-limited. Max 5 OTP sends per entry per 15 minutes. */
export async function checkOtpSendRate(entry: string): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const redis = getRedis();
  const key = OTP_RATE_PREFIX + entry.trim().toLowerCase();
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 15 * 60);
  }
  if (count > 5) {
    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfterSec: ttl > 0 ? ttl : 900 };
  }
  return { allowed: true };
}

const REPORTS_KEY = "gatepass:reports";
const REPORTS_SEQ_KEY = "gatepass:reports_seq";

export async function getReports(): Promise<MaintenanceReport[]> {
  const redis = getRedis();
  const data = await redis.get<MaintenanceReport[]>(REPORTS_KEY);
  return data ?? [];
}

export async function setReports(reports: MaintenanceReport[]): Promise<void> {
  const redis = getRedis();
  await redis.set(REPORTS_KEY, reports);
}

export async function nextReportId(): Promise<number> {
  const redis = getRedis();
  return await redis.incr(REPORTS_SEQ_KEY);
}

