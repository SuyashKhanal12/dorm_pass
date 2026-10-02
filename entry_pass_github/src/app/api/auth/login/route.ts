import { NextResponse } from "next/server";
import { getUser, saveUser, checkOtpSendRate, setPendingOtp, getPendingOtp, clearPendingOtp } from "@/lib/redis";
import { studentEmail, sendOtpEmail, generateOtp } from "@/lib/email";
import type { RegisteredUser } from "@/lib/types";
import { resolveAdmin } from "@/lib/admin";
import { createSession, destroySession } from "@/lib/session";

function isStudentRoll(entry: string): boolean {
  return /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{4,32}$/.test(entry);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return local.slice(0, 3) + '***@' + domain;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const entry = String(body.entry || "").trim();
    const first = String(body.name || "").trim();
    const otp = body.otp ? String(body.otp).trim() : null;

    if (!entry || !first) {
      return NextResponse.json({ error: "Enter both entry number and first name." }, { status: 400 });
    }

    if (!/^[A-Za-z\s'-]+$/.test(first)) {
      return NextResponse.json(
        { error: "First name should only contain letters (e.g. Staff or your first name)." },
        { status: 400 }
      );
    }

    const name = first.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

    const admin = resolveAdmin(entry);
    if (admin) {
      await destroySession();
      await createSession({
        name,
        entry: admin.label,
        isAdmin: true,
        adminScope: admin.adminScope,
      });
      return NextResponse.json({
        ok: true,
        user: {
          name,
          entry: admin.label,
          isAdmin: true,
          adminScope: admin.adminScope,
        },
      });
    }

    if (!isStudentRoll(entry)) {
      return NextResponse.json(
        {
          error:
            "Invalid login. Students: use your roll (e.g. 2023CSB1092). Staff: use the staff code configured in Vercel.",
        },
        { status: 403 }
      );
    }

    const email = studentEmail(entry);

    if (!otp) {
      const rateCheck = await checkOtpSendRate(entry);
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { error: `Too many OTP requests. Try again later.` },
          { status: 429 }
        );
      }

      const code = generateOtp();
      await setPendingOtp({
        entry,
        name,
        email,
        otp: code,
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0,
      });

      const sendRes = await sendOtpEmail(email, name, code);

      if (!sendRes.sent) {
        return NextResponse.json(
          { error: sendRes.error || "Failed to send OTP email. Please try again later." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        step: 'otp_sent',
        email: maskEmail(email)
      });
    } else {
      const pending = await getPendingOtp(entry);
      if (!pending || pending.expiresAt < Date.now()) {
        return NextResponse.json({ error: "OTP expired. Please request a new one." }, { status: 400 });
      }

      if (pending.otp !== otp) {
        pending.attempts++;
        if (pending.attempts > 4) {
          await clearPendingOtp(entry);
          return NextResponse.json({ error: "Too many failed attempts. Request a new OTP." }, { status: 400 });
        }
        await setPendingOtp(pending);
        return NextResponse.json({ error: "Incorrect code." }, { status: 400 });
      }

      await clearPendingOtp(entry);

      const existing = await getUser(entry);

      if (existing) {
        if (existing.name.toLowerCase() !== name.toLowerCase()) {
          return NextResponse.json(
            {
              error: "Name does not match",
              detail: "This entry number is already registered to another first name.",
            },
            { status: 403 }
          );
        }
        await destroySession();
        await createSession({
          name: existing.name,
          entry: existing.entry,
          isAdmin: false,
          adminScope: null,
        });
        return NextResponse.json({
          ok: true,
          user: {
            name: existing.name,
            entry: existing.entry,
            isAdmin: false,
            adminScope: null,
          },
        });
      }

      const user: RegisteredUser = {
        entry,
        name,
        email,
        verifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      await saveUser(user);
      await destroySession();
      await createSession({
        name: user.name,
        entry: user.entry,
        isAdmin: false,
        adminScope: null,
      });

      return NextResponse.json({
        ok: true,
        user: {
          name: user.name,
          entry: user.entry,
          isAdmin: false,
          adminScope: null,
        },
      });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Login failed" },
      { status: 500 }
    );
  }
}
