import { NextResponse } from "next/server";
import { getUser, saveUser } from "@/lib/redis";
import type { RegisteredUser } from "@/lib/types";
import { resolveAdmin } from "@/lib/admin";
import { createSession, destroySession } from "@/lib/session";

function isStudentRoll(entry: string): boolean {
  return /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{4,32}$/.test(entry);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const entry = String(body.entry || "").trim();
    const first = String(body.name || "").trim();

    if (!entry || !first) {
      return NextResponse.json({ error: "Enter both entry number and first name." }, { status: 400 });
    }

    if (!/^[A-Za-z\s'-]+$/.test(first)) {
      return NextResponse.json(
        { error: "First name should only contain letters (e.g. Staff or your first name)." },
        { status: 400 }
      );
    }

    const name = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    await destroySession();

    const admin = resolveAdmin(entry);
    if (admin) {
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

    const existing = await getUser(entry);

    if (existing) {
      if (existing.name.toLowerCase() !== name.toLowerCase()) {
        return NextResponse.json(
          {
            error: "Name did not matched",
            detail: "This entry number is already registered to another first name.",
          },
          { status: 403 }
        );
      }
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
      email: `${entry.toLowerCase()}@iitdabudhabi.ac.ae`,
      verifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await saveUser(user);
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
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Login failed" },
      { status: 500 }
    );
  }
}
