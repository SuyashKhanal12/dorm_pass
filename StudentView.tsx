"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  BedDouble,
  Building2,
  Clock,
  DoorClosed,
  History,
  House,
  LocateFixed,
  Lock,
  MapPin,
  MapPinOff,
  Moon,
  Send,
  Timer,
  type LucideIcon,
} from "lucide-react";
import type { GateRequest, HostelId, SessionUser } from "@/lib/types";
import type { HostelLocation, LocState } from "@/lib/useHostelLocation";
import { REQUEST_TIMEOUT_MS, isExitCurfew } from "@/lib/rules";
import { formatDateTime, formatDuration, formatTime, statusLabel, statusTone } from "@/lib/format";
import {
  Alert,
  Countdown,
  CountdownBar,
  EmptyState,
  Meta,
  MetaItem,
  PageHeader,
  Pill,
  Spinner,
  TextField,
} from "./ui";

const COMMON_DESTS = ["Library", "Mazyad Mall", "Airport", "Hospital", "Home"];

type FormField = "dest" | "room" | "bed";

interface Props {
  user: SessionUser;
  requests: GateRequest[];
  loc: HostelLocation;
  busy: boolean;
  onCreate: (input: { dest: string; room: string; bed: string; hostel: HostelId }) => Promise<boolean>;
  onPatch: (id: number, action: string, extra?: { entryHostel?: string }) => Promise<boolean>;
  onRefresh: () => void;
}

/* ── Location ──────────────────────────────────────────────────────────── */

function locationCopy(loc: HostelLocation): {
  icon: LucideIcon;
  title: string;
  text: string;
  action: string | null;
} {
  const { state, zone, accuracy, nearest } = loc;
  switch (state) {
    case "ok":
      return {
        icon: LocateFixed,
        title: `You're at ${zone ?? "your hostel"}`,
        text: `Inside the hostel area${accuracy != null ? `, accurate to about ${Math.round(accuracy)} m` : ""}.`,
        action: "Refresh",
      };
    case "outside":
      return {
        icon: MapPinOff,
        title: "Outside the hostel area",
        text: nearest
          ? `About ${Math.round(nearest.meters)} m from ${nearest.hostel}. Move closer, then refresh.`
          : "Exit and return only work from inside a hostel area.",
        action: "Refresh",
      };
    case "denied":
      return {
        icon: Lock,
        title: "Location is blocked",
        text: "Allow location for this site in your browser settings, then try again.",
        action: "Try again",
      };
    case "unavailable":
      return {
        icon: MapPinOff,
        title: "Can't find your location",
        text: "Try again outdoors with GPS turned on.",
        action: "Try again",
      };
    case "asking":
      return {
        icon: MapPin,
        title: "Finding your location",
        text: "Approve the location prompt if your browser asks.",
        action: null,
      };
    default:
      return {
        icon: MapPin,
        title: "Location is off",
        text: "Allow location so GatePass can confirm you're at your hostel.",
        action: "Turn on",
      };
  }
}

function locationFailure(state: LocState): string {
  if (state === "outside") return "You need to be inside a hostel area to request an exit or check in.";
  if (state === "denied") return "Turn on location access to request an exit or check in.";
  return "Location isn't available on this device, so GatePass can't confirm you're on campus.";
}

function LocationCard({ loc }: { loc: HostelLocation }) {
  const { icon: Icon, title, text, action } = locationCopy(loc);
  return (
    <div className="loc" data-state={loc.state} role="status">
      <span className="loc-icon" aria-hidden="true">
        {loc.state === "asking" ? <span className="spinner" /> : <Icon size={22} />}
      </span>
      <div className="loc-body">
        <p className="loc-title">{title}</p>
        <p className="loc-sub">{text}</p>
      </div>
      {action && (
        <button type="button" className="btn btn-secondary sm" onClick={() => loc.locate()}>
          {action}
        </button>
      )}
    </div>
  );
}

/* ── Current trip ──────────────────────────────────────────────────────── */

function TripCard({
  request: r,
  loc,
  busy,
  error,
  onReturn,
  onRefresh,
}: {
  request: GateRequest;
  loc: HostelLocation;
  busy: boolean;
  error: string;
  onReturn: () => void;
  onRefresh: () => void;
}) {
  const place = `Room ${r.room || "—"}, bed ${r.bed || "—"}`;

  if (r.status === "pending") {
    return (
      <article className="card trip" aria-label="Current request">
        <div className="trip-top">
          <Pill tone="pending">Waiting for staff</Pill>
          <span className="trip-timer">
            <Timer size={15} aria-hidden="true" />
            Expires in <Countdown since={r.createdAt} timeoutMs={REQUEST_TIMEOUT_MS} onElapsed={onRefresh} />
          </span>
        </div>
        <h2 className="trip-title">{r.dest}</h2>
        <Meta>
          <MetaItem icon={Building2}>{r.hostel || "Hostel"}</MetaItem>
          <MetaItem icon={DoorClosed}>{place}</MetaItem>
          <MetaItem icon={Clock}>Requested at {formatTime(r.createdAt)}</MetaItem>
        </Meta>
        <CountdownBar since={r.createdAt} timeoutMs={REQUEST_TIMEOUT_MS} />
        <p className="trip-note">
          Staff at {r.hostel || "your hostel"} will see this on their dashboard. If it isn&apos;t approved in time, it
          expires and you can send a new one.
        </p>
      </article>
    );
  }

  if (r.entryRequestedAt) {
    const at = r.entryHostel || r.hostel;
    return (
      <article className="card trip" aria-label="Current trip">
        <div className="trip-top">
          <Pill tone="pending">Check-in requested</Pill>
          <span className="trip-timer">
            <Timer size={15} aria-hidden="true" />
            Expires in <Countdown since={r.entryRequestedAt} timeoutMs={REQUEST_TIMEOUT_MS} onElapsed={onRefresh} />
          </span>
        </div>
        <h2 className="trip-title">Waiting for {at} staff</h2>
        <Meta>
          <MetaItem icon={MapPin}>Out for {r.dest}</MetaItem>
          <MetaItem icon={Clock}>Requested at {formatTime(r.entryRequestedAt)}</MetaItem>
        </Meta>
        <CountdownBar since={r.entryRequestedAt} timeoutMs={REQUEST_TIMEOUT_MS} />
      </article>
    );
  }

  const elapsed = r.exitTime ? Date.now() - new Date(r.exitTime).getTime() : 0;

  return (
    <article className="card trip" aria-label="Current trip">
      <div className="trip-top">
        <Pill tone="out">Outside</Pill>
        {r.exitTime && (
          <span className="trip-timer">
            <Clock size={15} aria-hidden="true" />
            Since <span className="tnum">{formatTime(r.exitTime)}</span> ({formatDuration(elapsed)})
          </span>
        )}
      </div>
      <h2 className="trip-title">{r.dest}</h2>
      <Meta>
        {r.hostel && <MetaItem icon={Building2}>Left from {r.hostel}</MetaItem>}
        <MetaItem icon={DoorClosed}>{place}</MetaItem>
      </Meta>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn-primary full trip-cta" onClick={onReturn} disabled={busy}>
        {busy ? (
          <Spinner />
        ) : (
          <>
            <House size={18} aria-hidden="true" />
            I&apos;m back{loc.zone ? ` at ${loc.zone}` : ""}
          </>
        )}
      </button>
      <p className="field-hint trip-hint">You can check in at any of the three hostels.</p>
    </article>
  );
}

/* ── View ──────────────────────────────────────────────────────────────── */

export default function StudentView({ user, requests, loc, busy, onCreate, onPatch, onRefresh }: Props) {
  const [dest, setDest] = useState("");
  const [room, setRoom] = useState("");
  const [bed, setBed] = useState("");
  const [formErr, setFormErr] = useState<{ field?: FormField; text: string } | null>(null);
  const [tripErr, setTripErr] = useState("");
  const prefilled = useRef(false);

  const mine = useMemo(
    () =>
      requests
        .filter((r) => r.entry.toLowerCase() === user.entry.toLowerCase())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [requests, user.entry]
  );

  const active = useMemo(() => mine.find((r) => r.status === "pending" || r.status === "out") ?? null, [mine]);
  const curfew = isExitCurfew();

  // Pre-fill room and bed from the student's most recent request, once.
  useEffect(() => {
    if (prefilled.current || mine.length === 0) return;
    prefilled.current = true;
    const latest = mine[0];
    if (latest.room) setRoom((v) => v || latest.room);
    if (latest.bed) setBed((v) => v || latest.bed);
  }, [mine]);

  /** Runs `onInside` only if a fresh location fix places the student inside a hostel. */
  function requireHostel(onInside: (zone: HostelId) => void, onFail: (text: string) => void) {
    loc.locate((zone, state) => {
      if (zone) onInside(zone);
      else onFail(locationFailure(state));
    });
  }

  function fail(field: FormField | undefined, text: string) {
    setFormErr({ field, text });
    if (field) document.getElementById(`exit-${field}`)?.focus();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormErr(null);

    const destination = dest.trim();
    if (active) return fail(undefined, "You already have an active leave request.");
    if (isExitCurfew()) return fail(undefined, "Exit requests are closed from 12:00 AM to 5:00 AM.");
    if (!destination) return fail("dest", "Enter where you're going.");
    if (!/^\d{3}$/.test(room)) return fail("room", "Room number must be 3 digits, like 312.");
    if (!/^[A-F]$/.test(bed)) return fail("bed", "Bed must be a letter from A to F.");

    requireHostel(
      async (zone) => {
        const ok = await onCreate({ dest: destination, room, bed, hostel: zone });
        if (ok) setDest("");
      },
      (text) => setFormErr({ text })
    );
  }

  function returnNow(r: GateRequest) {
    setTripErr("");
    requireHostel(
      (zone) => {
        void onPatch(r.id, "request_entry", { entryHostel: zone });
      },
      (text) => setTripErr(text)
    );
  }

  const hostelValue = loc.zone ?? (loc.state === "asking" ? "Detecting…" : "Not detected");

  return (
    <div className="stack">
      <PageHeader title="Requests" subtitle="Ask to leave your hostel, and check back in when you return." />

      <LocationCard loc={loc} />

      {active ? (
        <TripCard
          key={`${active.id}-${active.status}-${active.entryRequestedAt ?? ""}`}
          request={active}
          loc={loc}
          busy={busy}
          error={tripErr}
          onReturn={() => returnNow(active)}
          onRefresh={onRefresh}
        />
      ) : curfew ? (
        <div className="card card-pad notice">
          <span className="notice-icon" aria-hidden="true">
            <Moon size={22} />
          </span>
          <div>
            <p className="notice-title">Exit requests are closed</p>
            <p className="notice-text">Requests reopen at 5:00 AM. If you&apos;re already out, you can still check in.</p>
          </div>
        </div>
      ) : (
        <form className="card card-pad form" onSubmit={submit} noValidate>
          <h2 className="card-title">New exit request</h2>

          <div className="form-group">
            <TextField
              id="exit-dest"
              label="Where are you going?"
              icon={MapPin}
              placeholder="Library, mall, airport…"
              value={dest}
              onChange={(e) => {
                setDest(e.target.value);
                if (formErr) setFormErr(null);
              }}
              invalid={formErr?.field === "dest"}
              maxLength={60}
              autoComplete="off"
            />
            <div className="chips" role="group" aria-label="Common destinations">
              {COMMON_DESTS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  aria-pressed={dest === d}
                  onClick={() => {
                    setDest(d);
                    if (formErr) setFormErr(null);
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <TextField
              id="exit-room"
              label="Room"
              placeholder="312"
              value={room}
              onChange={(e) => {
                setRoom(e.target.value.replace(/\D/g, "").slice(0, 3));
                if (formErr) setFormErr(null);
              }}
              invalid={formErr?.field === "room"}
              inputMode="numeric"
              maxLength={3}
              autoComplete="off"
            />
            <TextField
              id="exit-bed"
              label="Bed"
              placeholder="A"
              value={bed}
              onChange={(e) => {
                setBed(e.target.value.toUpperCase().replace(/[^A-F]/g, "").slice(0, 1));
                if (formErr) setFormErr(null);
              }}
              invalid={formErr?.field === "bed"}
              maxLength={1}
              autoComplete="off"
              autoCapitalize="characters"
            />
            <TextField
              id="exit-hostel"
              label="Hostel"
              value={hostelValue}
              readOnly
              tabIndex={-1}
              icon={LocateFixed}
              className="is-static"
            />
          </div>

          {formErr && <Alert>{formErr.text}</Alert>}

          <button className="btn btn-primary full" type="submit" disabled={busy}>
            {busy ? (
              <Spinner />
            ) : (
              <>
                <Send size={18} aria-hidden="true" />
                Send for approval
              </>
            )}
          </button>
        </form>
      )}

      <section aria-labelledby="history-title">
        <h2 className="section-title" id="history-title">
          History
        </h2>
        <div className="card list">
          {mine.length === 0 ? (
            <EmptyState icon={History} title="No requests yet" text="Your leave requests will show up here." />
          ) : (
            mine.map((r) => (
              <div className="row" key={r.id}>
                <div className="row-main">
                  <p className="row-title">
                    <span className="truncate">{r.dest}</span>
                    {r.hostel && <Pill dot={false}>{r.hostel}</Pill>}
                  </p>
                  <Meta>
                    <MetaItem icon={BedDouble}>
                      Room {r.room || "—"}, bed {r.bed || "—"}
                    </MetaItem>
                    <MetaItem icon={Clock}>
                      {r.status === "out"
                        ? `Out since ${formatDateTime(r.exitTime)}`
                        : r.status === "returned"
                          ? `Returned ${formatDateTime(r.entryTime)}${r.entryHostel ? ` at ${r.entryHostel}` : ""}`
                          : `Requested ${formatDateTime(r.createdAt)}`}
                    </MetaItem>
                  </Meta>
                </div>
                <div className="row-end">
                  <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
