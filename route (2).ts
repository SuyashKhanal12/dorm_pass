import { NextResponse } from "next/server";
import { getUser, saveUser, checkOtpSendRate } from "@/lib/redis";
import { studentEmail } from "@/lib/email";
import type { RegisteredUser, SessionUser } from "@/lib/types";
import { resolveAdmin } from "@/lib/admin";
import { createSession, destroySession } from "@/lib/session";
import { isValidRoll, ROLL_HINT } from "@/lib/roll";

const OTP_SERVICE_URL = process.env.OTP_SERVICE_URL || "https://otp-service-beta.vercel.app";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return local.slice(0, 3) + "***@" + domain;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Replace any existing session with a fresh one and return the public user shape. */
async function startSession(user: SessionUser): Promise<SessionUser> {
  await destroySession();
  await createSession(user);
  return user;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const entry = String(body.entry || "").trim();
    const first = String(body.name || "").trim();
    const otp = body.otp ? String(body.otp).trim() : null;

    if (!entry || !first) {
      return NextResponse.json({ error: "Enter both your roll number and first name." }, { status: 400 });
    }

    if (!/^[A-Za-z\s'-]+$/.test(first)) {
      return NextResponse.json(
        { error: "First name can only contain letters, like Staff or your first name." },
        { status: 400 }
      );
    }

    const name = titleCase(first);

    // Staff sign in with an access code instead of a roll number; no OTP needed.
    const admin = resolveAdmin(entry);
    if (admin) {
      const user = await startSession({
        name,
        entry: admin.label,
        isAdmin: true,
        adminScope: admin.adminScope,
      });
      return NextResponse.json({ ok: true, user });
    }

    if (!isValidRoll(entry)) {
      return NextResponse.json(
        { error: `That roll number doesn't look right. ${ROLL_HINT} Staff should enter their access code.` },
        { status: 400 }
      );
    }

    const email = studentEmail(entry);

    // Step 1: send a code to the student's institutional email.
    if (!otp) {
      const rate = await checkOtpSendRate(entry);
      if (!rate.allowed) {
        const minutes = Math.max(1, Math.ceil((rate.retryAfterSec ?? 900) / 60));
        return NextResponse.json(
          { error: `Too many code requests. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
          { status: 429 }
        );
      }

      const genRes = await fetch(`${OTP_SERVICE_URL}/api/otp/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          type: "numeric",
          organization: "GatePass",
          subject: "GatePass verification code",
        }),
      });

      if (!genRes.ok) {
        const errorData = await genRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: errorData.message || "Couldn't send the code. Try again in a moment." },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, step: "otp_sent", email: maskEmail(email) });
    }

    // Step 2: verify the code, then sign in or register.
    const verifyRes = await fetch(`${OTP_SERVICE_URL}/api/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });

    if (!verifyRes.ok) {
      const errorData = await verifyRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.message || "That code is incorrect or has expired." },
        { status: 400 }
      );
    }

    const existing = await getUser(entry);

    if (existing) {
      if (existing.name.toLowerCase() !== name.toLowerCase()) {
        return NextResponse.json(
          {
            error: "That first name doesn't match this roll number.",
            detail: "This roll number is already registered to another first name.",
          },
          { status: 403 }
        );
      }
      const user = await startSession({
        name: existing.name,
        entry: existing.entry,
        isAdmin: false,
        adminScope: null,
      });
      return NextResponse.json({ ok: true, user });
    }

    const registered: RegisteredUser = {
      entry,
      name,
      email,
      verifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await saveUser(registered);
    const user = await startSession({
      name: registered.name,
      entry: registered.entry,
      isAdmin: false,
      adminScope: null,
    });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Login failed" },
      { status: 500 }
    );
  }
}
