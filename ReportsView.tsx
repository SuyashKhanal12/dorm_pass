"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Clock, DoorClosed, Send, Sparkles, User, Wrench, ClipboardCheck, Building2 } from "lucide-react";
import type { AdminScope, HostelId, MaintenanceReport, ReportCategory, ReportStatus, SessionUser } from "@/lib/types";
import { HOSTEL_IDS } from "@/lib/types";
import { formatDateTime, reportStatusLabel, reportStatusTone } from "@/lib/format";
import {
  Alert,
  EmptyState,
  Meta,
  MetaItem,
  PageHeader,
  Pill,
  Segmented,
  SelectField,
  Spinner,
  TextAreaField,
  TextField,
  type ToastTone,
} from "./ui";

const CATEGORIES = {
  cleanliness: { label: "Cleanliness", icon: Sparkles },
  maintenance: { label: "Maintenance", icon: Wrench },
} as const;

interface Props {
  user: SessionUser;
  reports: MaintenanceReport[];
  adminScope: AdminScope | null;
  /** Hostel detected by GPS, used to pre-select the hostel field. */
  detectedHostel: HostelId | null;
  onReload: () => Promise<void>;
  notify: (text: string, tone?: ToastTone) => void;
}

export default function ReportsView({ user, reports, adminScope, detectedHostel, onReload, notify }: Props) {
  const [category, setCategory] = useState<ReportCategory>("cleanliness");
  const [room, setRoom] = useState("");
  const [hostel, setHostel] = useState<HostelId | "">("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Pre-select the detected hostel unless the student has already chosen one.
  useEffect(() => {
    if (detectedHostel) setHostel((current) => current || detectedHostel);
  }, [detectedHostel]);

  const sorted = useMemo(
    () => reports.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [reports]
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError("");

    if (!/^\d{3}$/.test(room)) return setError("Room number must be 3 digits, like 312.");
    if (!hostel) return setError("Choose your hostel.");
    if (!description.trim()) return setError("Describe the issue so staff know what to look for.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ category, description: description.trim(), room, hostel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't submit the report. Try again.");
        return;
      }
      notify("Report submitted", "success");
      setDescription("");
      setRoom("");
      await onReload();
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: number, status: ReportStatus) {
    setUpdatingId(id);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "update_status", id, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify(data.error || "Couldn't update the report.", "error");
        return;
      }
      notify(status === "resolved" ? "Report resolved" : "Marked in progress", "success");
      await onReload();
    } catch {
      notify("Can't reach the server. Try again.", "error");
    } finally {
      setUpdatingId(null);
    }
  }

  const subtitle = user.isAdmin
    ? adminScope === "all"
      ? "All hostels. Update the status as issues are handled."
      : `${adminScope} only. Reports filed for this hostel.`
    : "Report a cleanliness or maintenance issue in your room or a common area.";

  return (
    <div className="stack">
      <PageHeader title="Reports" subtitle={subtitle} />

      {!user.isAdmin && (
        <form className="card card-pad form" onSubmit={submit} noValidate>
          <h2 className="card-title">New report</h2>

          <Segmented
            label="Report category"
            value={category}
            onChange={setCategory}
            options={(Object.keys(CATEGORIES) as ReportCategory[]).map((value) => ({
              value,
              label: CATEGORIES[value].label,
              icon: CATEGORIES[value].icon,
            }))}
          />

          <div className="field-row field-row-2">
            <TextField
              id="report-room"
              label="Room"
              icon={DoorClosed}
              placeholder="312"
              value={room}
              onChange={(e) => setRoom(e.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              maxLength={3}
              autoComplete="off"
            />
            <SelectField
              id="report-hostel"
              label="Hostel"
              icon={Building2}
              value={hostel}
              onChange={(e) => setHostel(e.target.value as HostelId | "")}
            >
              <option value="">Choose hostel</option>
              {HOSTEL_IDS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </SelectField>
          </div>

          <TextAreaField
            id="report-description"
            label="What's the issue?"
            placeholder="Describe what needs attention and where."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={4}
          />

          {error && <Alert>{error}</Alert>}

          <button className="btn btn-primary full" type="submit" disabled={submitting}>
            {submitting ? (
              <Spinner />
            ) : (
              <>
                <Send size={18} aria-hidden="true" />
                Submit report
              </>
            )}
          </button>
        </form>
      )}

      <section aria-labelledby="reports-title">
        <h2 className="section-title" id="reports-title">
          {user.isAdmin ? "All reports" : "Your reports"}
        </h2>
        <div className="card list">
          {sorted.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No reports yet"
              text={user.isAdmin ? "Reports from students appear here." : "Anything you report will show up here."}
            />
          ) : (
            sorted.map((r) => {
              const { label, icon: Icon } = CATEGORIES[r.category];
              const busy = updatingId === r.id;
              return (
                <div className="row" key={r.id}>
                  <span className={`row-icon cat-${r.category}`} aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <div className="row-main">
                    <p className="row-title">
                      <span className="truncate">{label}</span>
                      <Pill dot={false}>{r.hostel}</Pill>
                    </p>
                    <p className="row-text">{r.description}</p>
                    <Meta>
                      <MetaItem icon={DoorClosed}>Room {r.room}</MetaItem>
                      {user.isAdmin && (
                        <MetaItem icon={User}>
                          {r.reportedByName}, {r.reportedByEntry}
                        </MetaItem>
                      )}
                      <MetaItem icon={Clock}>{formatDateTime(r.createdAt)}</MetaItem>
                    </Meta>
                  </div>
                  <div className="row-end">
                    <Pill tone={reportStatusTone(r.status)}>{reportStatusLabel(r.status)}</Pill>
                    {user.isAdmin && r.status === "open" && (
                      <button
                        className="btn btn-secondary sm"
                        disabled={busy}
                        onClick={() => void updateStatus(r.id, "in_progress")}
                      >
                        Mark in progress
                      </button>
                    )}
                    {user.isAdmin && r.status !== "resolved" && (
                      <button
                        className="btn btn-primary sm"
                        disabled={busy}
                        onClick={() => void updateStatus(r.id, "resolved")}
                      >
                        <Check size={16} aria-hidden="true" />
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
