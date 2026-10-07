import { Redis } from "@upstash/redis";
import type { GateRequest, RegisteredUser, MaintenanceReport } from "./types";

// ─── Key schema ──────────────────────────────────────────────────────────────
// gatepass:request:{id}   → individual GateRequest JSON (atomic per-record ops)
// gatepass:request-ids    → Redis sorted set: score = id, member = id (index)
// gatepass:seq            → auto-increment counter
// gatepass:users          → hash: entry(lower) → RegisteredUser
// gatepass:otp:{entry}    → pending OTP record (TTL-keyed)
// gatepass:otp-rate:{e}   → rate-limit counter (TTL-keyed)
// ─────────────────────────────────────────────────────────────────────────────

const REQUEST_PREFIX = "gatepass:request:";
const REQUEST_IDS_KEY = "gatepass:request-ids"; // sorted set
const SEQ_KEY = "gatepass:seq";
const USERS_KEY = "gatepass:users";
const OTP_PREFIX = "gatepass:otp:";
const OTP_RATE_PREFIX = "gatepass:otp-rate:";

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
      "Missing Redis credentials. Expected KV_REST_API_URL + KV_REST_API_TOKEN " +
      "(or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)."
    );
  }
  return new Redis({ url, token });
}

/** Backfill any fields that may be missing from legacy records. */
function backfill(r: GateRequest): GateRequest {
  return {
    ...r,
    room: r.room ?? "",
    bed: r.bed ?? "",
    hostel: r.hostel ?? "",
    entryHostel: r.entryHostel ?? null,
  };
}

// ─── Per-request atomic helpers ───────────────────────────────────────────────

/**
 * Atomically save (create or update) a single GateRequest.
 * Only touches the key for this specific request — concurrent operations on
 * different requests are fully independent.
 */
export async function saveRequest(request: GateRequest): Promise<void> {
  const redis = getRedis();
  const key = REQUEST_PREFIX + request.id;
  // Pipeline: write the record AND register it in the index atomically.
  const p = redis.pipeline();
  p.set(key, request);
  p.zadd(REQUEST_IDS_KEY, { score: request.id, member: String(request.id) });
  await p.exec();
}

/** Fetch a single GateRequest by ID. Returns null if not found. */
export async function getRequestById(id: number): Promise<GateRequest | null> {
  const redis = getRedis();
  const data = await redis.get<GateRequest>(REQUEST_PREFIX + id);
  return data ? backfill(data) : null;
}

/**
 * Fetch ALL requests ordered by ID ascending.
 * Reads the ID index first, then batch-fetches each record.
 */
export async function getRequests(): Promise<GateRequest[]> {
  const redis = getRedis();

  // Retrieve all members from the sorted set (IDs in ascending order).
  const ids = await redis.zrange<string[]>(REQUEST_IDS_KEY, 0, -1);
  if (!ids || ids.length === 0) return [];

  // Batch-fetch all individual request keys in a single pipeline.
  const p = redis.pipeline();
  for (const id of ids) {
    p.get<GateRequest>(REQUEST_PREFIX + id);
  }
  const results = await p.exec<(GateRequest | null)[]>();

  return results
    .filter((r): r is GateRequest => r !== null)
    .map(backfill);
}

/** Remove a single request and its index entry. */
export async function deleteRequest(id: number): Promise<void> {
  const redis = getRedis();
  const p = redis.pipeline();
  p.del(REQUEST_PREFIX + id);
  p.zrem(REQUEST_IDS_KEY, String(id));
  await p.exec();
}

export async function nextId(): Promise<number> {
  const redis = getRedis();
  return await redis.incr(SEQ_KEY);
}

export async function clearAll(): Promise<void> {
  // Clears leave logs only — registered roll numbers / names stay bound.
  const redis = getRedis();

  // Collect all request keys from the index and delete them in bulk.
  const ids = await redis.zrange<string[]>(REQUEST_IDS_KEY, 0, -1);
  const p = redis.pipeline();
  for (const id of ids) {
    p.del(REQUEST_PREFIX + id);
  }
  p.del(REQUEST_IDS_KEY);
  p.del(SEQ_KEY);
  await p.exec();
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

export async function checkReportRateLimit(entry: string): Promise<{ allowed: boolean }> {
  const redis = getRedis();
  // Use UTC date as the daily bucket
  const today = new Date().toISOString().slice(0, 10);
  const key = `gatepass:report-rate:${entry.trim().toLowerCase()}:${today}`;
  
  const count = await redis.incr(key);
  if (count === 1) {
    // Expire safely after 25 hours to clean up Redis
    await redis.expire(key, 25 * 60 * 60);
  }
  
  return { allowed: count <= 3 };
}

