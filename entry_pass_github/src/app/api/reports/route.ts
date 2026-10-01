import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getReports, setReports, nextReportId } from "@/lib/redis";
import type { MaintenanceReport, ReportCategory, ReportStatus } from "@/lib/types";

const VALID_CATEGORIES: ReportCategory[] = ["cleanliness", "maintenance"];
const VALID_STATUSES: ReportStatus[] = ["open", "in_progress", "resolved"];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reports = await getReports();

  // Filter logic:
  // - Students can only see their own reports
  // - Hostel Security (KCA1/KCA2/KCA3) can see all reports for their hostel
  // - Main Admin ("all") can see every report
  let filtered: MaintenanceReport[];

  if (!session.isAdmin) {
    filtered = reports.filter((r) => r.reportedByEntry === session.entry);
  } else if (session.adminScope && session.adminScope !== "all") {
    filtered = reports.filter((r) => r.hostel === session.adminScope);
  } else {
    filtered = reports;
  }

  return NextResponse.json({ reports: filtered });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reports = await getReports();

  // --- Admin: update status ---
  if (body.action === "update_status") {
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = Number(body.id);
    const status = String(body.status ?? "");

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid report id" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status as ReportStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const idx = reports.findIndex((r) => r.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const report = reports[idx];

    // Hostel staff can only update reports for their own hostel
    if (session.adminScope !== "all" && session.adminScope !== report.hostel) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    reports[idx].status = status as ReportStatus;
    await setReports(reports);

    return NextResponse.json({ ok: true, report: reports[idx] });
  }

  // --- Create a new report ---
  // Admins cannot create reports; only students/residents can
  if (session.isAdmin) {
    return NextResponse.json({ error: "Staff cannot file reports" }, { status: 403 });
  }

  const category = String(body.category ?? "").trim();
  const description = String(body.description ?? "").trim().slice(0, 500);
  const room = String(body.room ?? "").trim();
  const hostel = String(body.hostel ?? "").trim().toUpperCase();

  if (!VALID_CATEGORIES.includes(category as ReportCategory)) {
    return NextResponse.json({ error: "Category must be 'cleanliness' or 'maintenance'" }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }
  if (!/^\d{3}$/.test(room)) {
    return NextResponse.json({ error: "Room must be exactly 3 digits (e.g. 312)" }, { status: 400 });
  }
  if (!["KCA1", "KCA2", "KCA3"].includes(hostel)) {
    return NextResponse.json({ error: "Hostel must be KCA1, KCA2 or KCA3" }, { status: 400 });
  }

  const newReport: MaintenanceReport = {
    id: await nextReportId(),
    category: category as ReportCategory,
    description,
    room,
    hostel,
    status: "open",
    reportedByEntry: session.entry,
    reportedByName: session.name,
    createdAt: new Date().toISOString(),
  };

  reports.push(newReport);
  await setReports(reports);

  return NextResponse.json({ ok: true, report: newReport }, { status: 201 });
}

