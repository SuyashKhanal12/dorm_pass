import { NextResponse } from "next/server";
import { getRequests, setRequests, nextId, clearAll } from "@/lib/redis";
import type { GateRequest, HostelId } from "@/lib/types";
import { isHostelId } from "@/lib/types";
import { getSession } from "@/lib/session";
import { matchesExitScope, matchesEntryScope } from "@/lib/admin";

const LOG_RETENTION_DAYS = 7;

function purgeOld(requests: GateRequest[]): GateRequest[] {
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return requests.filter((r) => {
    if (r.status !== "returned" || !r.entryTime) return true;
    return new Date(r.entryTime).getTime() >= cutoff;
  });
}

function filterForSession(
  requests: GateRequest[],
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>
): GateRequest[] {
  if (!session.isAdmin) {
    return requests.filter((r) => r.entry.toLowerCase() === session.entry.toLowerCase());
  }
  const scope = session.adminScope ?? "all";
  if (scope === "all") return requests;
  return requests.filter((r) => {
    if (r.status === "out" && r.entryRequestedAt) {
      return matchesEntryScope(r.entryHostel, r.hostel, scope) || matchesExitScope(r.hostel, scope);
    }
    return matchesExitScope(r.hostel, scope);
  });
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    let requests = await getRequests();
    const before = requests.length;
    requests = purgeOld(requests);
    if (requests.length !== before) await setRequests(requests);

    return NextResponse.json(filterForSession(requests, session));
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load requests" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    if (session.isAdmin) {
      return NextResponse.json({ error: "Staff cannot create leave requests" }, { status: 403 });
    }

    const body = await req.json();
    const { dest, room, bed, hostel } = body;

    if (!dest) {
      return NextResponse.json({ error: "Destination is required" }, { status: 400 });
    }

    const roomStr = String(room ?? "").trim();
    const bedStr = String(bed ?? "").trim().toUpperCase();
    const hostelStr = String(hostel ?? "").trim().toUpperCase();

    if (!/^\d{3}$/.test(roomStr)) {
      return NextResponse.json({ error: "Room number must be exactly 3 digits (e.g. 312)." }, { status: 400 });
    }
    if (!/^[A-F]$/.test(bedStr)) {
      return NextResponse.json({ error: "Bed number must be a letter from A to F." }, { status: 400 });
    }
    if (!isHostelId(hostelStr)) {
      return NextResponse.json({ error: "Hostel must be KCA1, KCA2 or KCA3." }, { status: 400 });
    }

    if (new Date().getHours() < 5) {
      return NextResponse.json(
        { error: "Exit requests are closed from 12:00 AM to 5:00 AM" },
        { status: 403 }
      );
    }

    const requests = await getRequests();
    const entryLower = session.entry.toLowerCase();

    const active = requests.find(
      (r) =>
        r.entry.toLowerCase() === entryLower &&
        (r.status === "pending" || r.status === "out")
    );
    if (active) {
      return NextResponse.json(
        { error: "You already have an active leave request" },
        { status: 409 }
      );
    }

    const id = await nextId();
    const newReq: GateRequest = {
      id,
      name: session.name,
      entry: session.entry,
      dest: String(dest).trim().slice(0, 60),
      room: roomStr,
      bed: bedStr,
      hostel: hostelStr as HostelId,
      entryHostel: null,
      status: "pending",
      createdAt: new Date().toISOString(),
      exitTime: null,
      exitBy: null,
      entryTime: null,
      entryBy: null,
      entryRequestedAt: null,
    };

    requests.push(newReq);
    await setRequests(requests);
    return NextResponse.json(newReq, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create request" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!session.isAdmin || session.adminScope !== "all") {
      return NextResponse.json({ error: "Only main admin can clear all data" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    if (searchParams.get("confirm") !== "yes") {
      return NextResponse.json({ error: "Add ?confirm=yes to clear all data" }, { status: 400 });
    }
    await clearAll();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to clear data" },
      { status: 500 }
    );
  }
}
