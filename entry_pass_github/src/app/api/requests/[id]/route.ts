import { NextResponse } from "next/server";
import { getRequestById, saveRequest } from "@/lib/redis";
import { isHostelId } from "@/lib/types";
import { getSession } from "@/lib/session";
import { canStaffApproveEntry, canStaffApproveExit } from "@/lib/admin";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const { action, entryHostel } = body as {
      action: string;
      entryHostel?: string;
    };

    // Fetch only the single record — no full-array read, so concurrent
    // operations on different records are fully independent and race-free.
    const r = await getRequestById(id);
    if (!r) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const actor = session.name;

    switch (action) {
      case "approve_exit": {
        if (!session.isAdmin) {
          return NextResponse.json({ error: "Staff only" }, { status: 403 });
        }
        if (!canStaffApproveExit(session.adminScope, r.hostel)) {
          return NextResponse.json({ error: "Not allowed for this hostel" }, { status: 403 });
        }
        if (r.status !== "pending") {
          return NextResponse.json({ error: "Not a pending exit request" }, { status: 400 });
        }
        r.status = "out";
        r.exitTime = now;
        r.exitBy = actor;
        break;
      }
      case "reject_exit": {
        if (!session.isAdmin) {
          return NextResponse.json({ error: "Staff only" }, { status: 403 });
        }
        if (!canStaffApproveExit(session.adminScope, r.hostel)) {
          return NextResponse.json({ error: "Not allowed for this hostel" }, { status: 403 });
        }
        if (r.status !== "pending") {
          return NextResponse.json({ error: "Not a pending exit request" }, { status: 400 });
        }
        r.status = "rejected";
        r.exitBy = actor;
        break;
      }
      case "request_entry": {
        if (session.isAdmin) {
          return NextResponse.json({ error: "Students only" }, { status: 403 });
        }
        if (r.entry.toLowerCase() !== session.entry.toLowerCase()) {
          return NextResponse.json({ error: "Not your request" }, { status: 403 });
        }
        if (r.status !== "out" || r.entryRequestedAt) {
          return NextResponse.json({ error: "Cannot request entry" }, { status: 400 });
        }
        const eh = String(entryHostel || r.hostel || "").trim().toUpperCase();
        if (!isHostelId(eh)) {
          return NextResponse.json(
            { error: "entryHostel must be KCA1, KCA2 or KCA3." },
            { status: 400 }
          );
        }
        r.entryRequestedAt = now;
        r.entryHostel = eh;
        break;
      }
      case "approve_entry": {
        if (!session.isAdmin) {
          return NextResponse.json({ error: "Staff only" }, { status: 403 });
        }
        if (!r.entryRequestedAt) {
          return NextResponse.json({ error: "No entry request pending" }, { status: 400 });
        }
        if (!canStaffApproveEntry(session.adminScope, r.entryHostel, r.hostel)) {
          return NextResponse.json({ error: "Not allowed for this hostel" }, { status: 403 });
        }
        r.entryTime = now;
        r.entryBy = actor;
        r.status = "returned";
        r.entryRequestedAt = null;
        break;
      }
      case "reject_entry": {
        if (!session.isAdmin) {
          return NextResponse.json({ error: "Staff only" }, { status: 403 });
        }
        if (!r.entryRequestedAt) {
          return NextResponse.json({ error: "No entry request pending" }, { status: 400 });
        }
        if (!canStaffApproveEntry(session.adminScope, r.entryHostel, r.hostel)) {
          return NextResponse.json({ error: "Not allowed for this hostel" }, { status: 403 });
        }
        r.entryRequestedAt = null;
        r.entryHostel = null;
        break;
      }
      case "admin_mark_returned": {
        if (!session.isAdmin) {
          return NextResponse.json({ error: "Staff only" }, { status: 403 });
        }
        if (r.status !== "out") {
          return NextResponse.json({ error: "Student is not outside" }, { status: 400 });
        }
        if (!canStaffApproveExit(session.adminScope, r.hostel)) {
          return NextResponse.json({ error: "Not allowed for this hostel" }, { status: 403 });
        }
        r.entryTime = now;
        r.entryBy = actor;
        r.status = "returned";
        r.entryRequestedAt = null;
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    // Atomic write — only the key for this specific request is updated.
    await saveRequest(r);
    return NextResponse.json(r);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update request" },
      { status: 500 }
    );
  }
}

