import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getReports, setReports, nextReportId } from "@/lib/redis";
import type { MaintenanceReport, ReportStatus } from "@/lib/types";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reports = await getReports();

  // Filter logic:
  // - Students can only see their own reports
  // - Hostel Security ("KCA1", "KCA2", etc.) can see reports for their hostel
  // - Main Admin ("all") can see every report
  let filtered = reports;

  if (!session.isAdmin) {
    filtered = reports.filter(r => r.reportedByEntry === session.entry);
  } else if (session.adminScope && session.adminScope !== "all") {
    filtered = reports.filter(r => r.hostel === session.adminScope);
  }

  return NextResponse.json({ reports: filtered });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const reports = await getReports();

  if (body.action === "update_status") {
    // Only admins can update status
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, status } = body;
    const reportIndex = reports.findIndex(r => r.id === id);
    if (reportIndex === -1) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Verify scope
    const report = reports[reportIndex];
    if (session.adminScope !== "all" && session.adminScope !== report.hostel) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    reports[reportIndex].status = status as ReportStatus;
    await setReports(reports);

    return NextResponse.json({ ok: true, report: reports[reportIndex] });
  }

  // Create a new report (Students usually create, but admins can too if needed)
  const { category, description, room, hostel } = body;
  
  if (!category || !description || !room || !hostel) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const newReport: MaintenanceReport = {
    id: await nextReportId(),
    category,
    description,
    room,
    hostel,
    status: "open",
    reportedByEntry: session.entry,
    reportedByName: session.name,
    createdAt: new Date().toISOString()
  };

  reports.push(newReport);
  await setReports(reports);

  return NextResponse.json({ ok: true, report: newReport });
}

