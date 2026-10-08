"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Clock,
  Download,
  DoorClosed,
  Footprints,
  House,
  IdCard,
  Inbox,
  MapPin,
  ScrollText,
  Search,
  Timer,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AdminScope, GateRequest } from "@/lib/types";
import { LATE_AFTER_HOURS, REQUEST_TIMEOUT_MS } from "@/lib/rules";
import { EMPTY, formatDateTime, formatDuration, formatTime, statusLabel, statusTone } from "@/lib/format";
import { buildLogsCsv, downloadCsv } from "@/lib/csv";
import {
  Avatar,
  Countdown,
  EmptyState,
  Meta,
  MetaItem,
  PageHeader,
  Pill,
  SelectField,
  TextField,
} from "./ui";

type PatchFn = (id: number, action: string, extra?: { entryHostel?: string }) => Promise<boolean>;

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

function matchesQuery(r: GateRequest, q: string): boolean {
  if (!q) return true;
  return (
    r.name.toLowerCase().includes(q) ||
    r.entry.toLowerCase().includes(q) ||
    r.dest.toLowerCase().includes(q) ||
    (r.hostel || "").toLowerCase().includes(q)
  );
}

/* ── Leave requests ────────────────────────────────────────────────────── */

export function LeaveRequestsView({
  pending,
  adminScope,
  busy,
  onPatch,
  onRefresh,
}: {
  pending: GateRequest[];
  adminScope: AdminScope | null;
  busy: boolean;
  onPatch: PatchFn;
  onRefresh: () => void;
}) {
  const sorted = useMemo(() => pending.slice().sort((a, b) => ms(a.createdAt) - ms(b.createdAt)), [pending]);

  return (
    <div className="stack">
      <PageHeader
        title="Leave requests"
        subtitle={
          (adminScope === "all"
            ? "All hostels. Approving a request marks the student as outside."
            : `${adminScope} only. Showing exit requests from this hostel.`) +
          " Requests expire after 3 minutes."
        }
        actions={pending.length > 0 ? <Pill tone="pending">{pending.length} waiting</Pill> : undefined}
      />

      <div className="card list">
        {sorted.length === 0 ? (
          <EmptyState icon={Inbox} title="Nothing waiting" text="New leave requests appear here as students send them." />
        ) : (
          sorted.map((r) => (
            <div className="row" key={r.id}>
              <Avatar name={r.name} />
              <div className="row-main">
                <p className="row-title">
                  <span className="truncate">{r.name}</span>
                  {r.hostel && <Pill dot={false}>{r.hostel}</Pill>}
                </p>
                <Meta>
                  <MetaItem icon={IdCard}>{r.entry}</MetaItem>
                  <MetaItem icon={DoorClosed}>
                    Room {r.room || EMPTY}, bed {r.bed || EMPTY}
                  </MetaItem>
                  <MetaItem icon={MapPin}>{r.dest}</MetaItem>
                  <MetaItem icon={Clock}>{formatTime(r.createdAt)}</MetaItem>
                  <MetaItem icon={Timer}>
                    Expires in <Countdown since={r.createdAt} timeoutMs={REQUEST_TIMEOUT_MS} onElapsed={onRefresh} />
                  </MetaItem>
                </Meta>
              </div>
              <div className="row-end">
                <button
                  className="btn btn-primary sm"
                  disabled={busy}
                  onClick={() => void onPatch(r.id, "approve_exit")}
                >
                  <Check size={16} aria-hidden="true" />
                  Approve
                </button>
                <button
                  className="btn btn-danger sm"
                  disabled={busy}
                  onClick={() => void onPatch(r.id, "reject_exit")}
                >
                  <X size={16} aria-hidden="true" />
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Currently outside ─────────────────────────────────────────────────── */

export function OutsideView({
  outNow,
  adminScope,
  busy,
  onPatch,
  onRefresh,
}: {
  outNow: GateRequest[];
  adminScope: AdminScope | null;
  busy: boolean;
  onPatch: PatchFn;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = outNow.filter((r) => matchesQuery(r, q));
    const checkingIn = filtered
      .filter((r) => r.entryRequestedAt)
      .sort((a, b) => ms(a.entryRequestedAt) - ms(b.entryRequestedAt));
    const rest = filtered.filter((r) => !r.entryRequestedAt).sort((a, b) => ms(a.exitTime) - ms(b.exitTime));
    return [...checkingIn, ...rest];
  }, [outNow, query]);

  return (
    <div className="stack">
      <PageHeader
        title="Currently outside"
        subtitle={
          adminScope === "all"
            ? "All hostels. Check-in requests appear first."
            : `${adminScope}: students who left from here, or are checking in here.`
        }
        actions={outNow.length > 0 ? <Pill tone="out">{outNow.length} outside</Pill> : undefined}
      />

      <div className="toolbar">
        <div className="toolbar-grow">
          <TextField
            id="outside-search"
            label="Search students who are outside"
            hideLabel
            icon={Search}
            className="sm"
            placeholder="Search by name, roll number or destination"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="card list">
        {list.length === 0 ? (
          <EmptyState
            icon={Footprints}
            title={query ? "No matches" : "No one is outside"}
            text={query ? "Try a different name, roll number or destination." : "Students who leave will appear here."}
          />
        ) : (
          list.map((r) => {
            if (r.entryRequestedAt) {
              const at = r.entryHostel || r.hostel;
              return (
                <div className="row row-highlight" key={r.id}>
                  <Avatar name={r.name} />
                  <div className="row-main">
                    <p className="row-title">
                      <span className="truncate">{r.name}</span>
                      <Pill tone="pending">Check-in at {at}</Pill>
                    </p>
                    <Meta>
                      <MetaItem icon={IdCard}>{r.entry}</MetaItem>
                      {r.hostel && r.entryHostel && r.hostel !== r.entryHostel && (
                        <MetaItem icon={House}>Left from {r.hostel}</MetaItem>
                      )}
                      <MetaItem icon={DoorClosed}>
                        Room {r.room || EMPTY}, bed {r.bed || EMPTY}
                      </MetaItem>
                      <MetaItem icon={MapPin}>{r.dest}</MetaItem>
                      <MetaItem icon={Timer}>
                        Expires in{" "}
                        <Countdown since={r.entryRequestedAt} timeoutMs={REQUEST_TIMEOUT_MS} onElapsed={onRefresh} />
                      </MetaItem>
                    </Meta>
                  </div>
                  <div className="row-end">
                    <button
                      className="btn btn-primary sm"
                      disabled={busy}
                      onClick={() => void onPatch(r.id, "approve_entry")}
                    >
                      <Check size={16} aria-hidden="true" />
                      Approve
                    </button>
                    <button
                      className="btn btn-danger sm"
                      disabled={busy}
                      onClick={() => void onPatch(r.id, "reject_entry")}
                    >
                      <X size={16} aria-hidden="true" />
                      Reject
                    </button>
                  </div>
                </div>
              );
            }

            const outFor = Date.now() - ms(r.exitTime);
            const late = outFor > LATE_AFTER_HOURS * 3600000;
            return (
              <div className="row" key={r.id}>
                <Avatar name={r.name} />
                <div className="row-main">
                  <p className="row-title">
                    <span className="truncate">{r.name}</span>
                    <Pill tone={late ? "late" : "out"}>{late ? "Late" : "Outside"}</Pill>
                  </p>
                  <Meta>
                    <MetaItem icon={IdCard}>{r.entry}</MetaItem>
                    {r.hostel && <MetaItem icon={House}>Left from {r.hostel}</MetaItem>}
                    <MetaItem icon={DoorClosed}>
                      Room {r.room || EMPTY}, bed {r.bed || EMPTY}
                    </MetaItem>
                    <MetaItem icon={MapPin}>{r.dest}</MetaItem>
                    <MetaItem icon={Clock}>
                      Since {formatDateTime(r.exitTime)} ({formatDuration(outFor)})
                    </MetaItem>
                  </Meta>
                </div>
                <div className="row-end">
                  <button
                    className="btn btn-secondary sm"
                    disabled={busy}
                    onClick={() => void onPatch(r.id, "admin_mark_returned")}
                  >
                    Mark returned
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── Logs ──────────────────────────────────────────────────────────────── */

const COLUMNS = [
  ["name", "Student"],
  ["entry", "Roll number"],
  ["hostel", "Hostel"],
  ["room", "Room"],
  ["bed", "Bed"],
  ["dest", "Destination"],
  ["exitTime", "Exit"],
  ["exitBy", "Exit by"],
  ["entryHostel", "Entry hostel"],
  ["entryTime", "Entry"],
  ["entryBy", "Entry by"],
  ["status", "Status"],
] as const;

type ColumnKey = (typeof COLUMNS)[number][0];

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="card stat">
      <span className="stat-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <p className="stat-num tnum">{value}</p>
      <p className="stat-label">{label}</p>
    </div>
  );
}

export function LogsView({
  rows,
  outsideCount,
  returnedToday,
  adminScope,
  busy,
  onClearAll,
}: {
  rows: GateRequest[];
  outsideCount: number;
  returnedToday: number;
  adminScope: AdminScope | null;
  busy: boolean;
  onClearAll: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sortKey, setSortKey] = useState<ColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => (status === "all" || r.status === status) && matchesQuery(r, q));

    if (!sortKey) {
      // Newest activity first.
      return filtered.sort(
        (a, b) => ms(b.entryTime || b.exitTime || b.createdAt) - ms(a.entryTime || a.exitTime || a.createdAt)
      );
    }
    const value = (r: GateRequest): number | string =>
      sortKey === "exitTime" || sortKey === "entryTime" ? ms(r[sortKey]) : String(r[sortKey] ?? "").toLowerCase();

    return filtered.sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      return av < bv ? -sortDir : av > bv ? sortDir : 0;
    });
  }, [rows, query, status, sortKey, sortDir]);

  function toggleSort(key: ColumnKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  function exportCsv() {
    downloadCsv(`gatepass_logs_${new Date().toISOString().slice(0, 10)}.csv`, buildLogsCsv(visible));
  }

  return (
    <div className="stack">
      <PageHeader
        title="Logs"
        subtitle={`${adminScope === "all" ? "All hostels" : `${adminScope} only`}. Returned trips are removed 7 days after check-in.`}
      />

      <div className="stats">
        <Stat icon={Footprints} label="Currently outside" value={outsideCount} />
        <Stat icon={House} label="Returned today" value={returnedToday} />
        <Stat icon={ScrollText} label="Total records" value={rows.length} />
      </div>

      <div className="toolbar">
        <div className="toolbar-grow">
          <TextField
            id="log-search"
            label="Search logs"
            hideLabel
            icon={Search}
            className="sm"
            placeholder="Search by name, roll number or destination"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="toolbar-select">
          <SelectField
            id="log-status"
            label="Filter by status"
            hideLabel
            className="sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="out">Outside</option>
            <option value="returned">Returned</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
          </SelectField>
        </div>
        <button className="btn btn-secondary sm" onClick={exportCsv} disabled={visible.length === 0}>
          <Download size={16} aria-hidden="true" />
          Export CSV
        </button>
        {adminScope === "all" && (
          <button className="btn btn-danger sm" onClick={onClearAll} disabled={busy}>
            <Trash2 size={16} aria-hidden="true" />
            Clear all data
          </button>
        )}
      </div>

      <div className="card table-card">
        {visible.length === 0 ? (
          <EmptyState icon={ScrollText} title="No records match" text="Adjust the search or status filter." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {COLUMNS.map(([key, label]) => (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={sortKey === key ? (sortDir === 1 ? "ascending" : "descending") : "none"}
                    >
                      <button type="button" className="th-btn" onClick={() => toggleSort(key)}>
                        {label}
                        {sortKey === key ? (
                          sortDir === 1 ? (
                            <ChevronUp size={14} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={14} aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDown size={14} className="th-idle" aria-hidden="true" />
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td className="td-strong">{r.name}</td>
                    <td>{r.entry}</td>
                    <td>{r.hostel || EMPTY}</td>
                    <td>{r.room || EMPTY}</td>
                    <td>{r.bed || EMPTY}</td>
                    <td>{r.dest}</td>
                    <td>{formatDateTime(r.exitTime)}</td>
                    <td>{r.exitBy || EMPTY}</td>
                    <td>{r.entryHostel || EMPTY}</td>
                    <td>{formatDateTime(r.entryTime)}</td>
                    <td>{r.entryBy || EMPTY}</td>
                    <td>
                      <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
