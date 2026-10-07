import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { Redis } from "@upstash/redis";
import type { AdminScope } from "./types";

export const SESSION_COOKIE = "gatepass_sid";
const SESSION_PREFIX = "gatepass:session:";
/** 7 days */
const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

export interface SessionData {
  name: string;
  entry: string;
  isAdmin: boolean;
  adminScope: AdminScope | null;
  createdAt: string;
}

function getRedis() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("Missing Redis credentials for sessions.");
  }
  return new Redis({ url, token });
}

function isProd() {
  return process.env.NODE_ENV === "production" || !!process.env.VERCEL;
}

export async function createSession(data: Omit<SessionData, "createdAt">): Promise<string> {
  const redis = getRedis();
  const sid = randomBytes(32).toString("hex");
  const payload: SessionData = {
    ...data,
    createdAt: new Date().toISOString(),
  };
  await redis.set(SESSION_PREFIX + sid, payload, { ex: SESSION_TTL_SEC });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });

  return sid;
}

export async function getSession(): Promise<SessionData | null> {
  try {
    const jar = await cookies();
    const sid = jar.get(SESSION_COOKIE)?.value;
    if (!sid || sid.length < 32) return null;

    const redis = getRedis();
    const data = await redis.get<SessionData>(SESSION_PREFIX + sid);
    if (!data) return null;

    // Sliding expiry
    await redis.expire(SESSION_PREFIX + sid, SESSION_TTL_SEC);
    return data;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  try {
    const jar = await cookies();
    const sid = jar.get(SESSION_COOKIE)?.value;
    if (sid) {
      const redis = getRedis();
      await redis.del(SESSION_PREFIX + sid);
    }
    jar.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: isProd(),
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  } catch {
    /* ignore */
  }
}


