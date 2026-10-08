"use client";

import { useCallback, useState } from "react";
import type { HostelId } from "./types";
import { closestHostel, hostelAt } from "./geo";

export type LocState = "idle" | "asking" | "ok" | "outside" | "denied" | "unavailable";

export interface HostelLocation {
  state: LocState;
  /** The hostel the device is currently inside, if any. */
  zone: HostelId | null;
  /** GPS accuracy in metres. */
  accuracy: number | null;
  /** Closest hostel, set only while the device is outside every geofence. */
  nearest: { hostel: HostelId; meters: number } | null;
  locate: (done?: (zone: HostelId | null, state: LocState) => void) => void;
}

export function useHostelLocation(): HostelLocation {
  const [state, setState] = useState<LocState>("idle");
  const [zone, setZone] = useState<HostelId | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [nearest, setNearest] = useState<HostelLocation["nearest"]>(null);

  const locate = useCallback<HostelLocation["locate"]>((done) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unavailable");
      done?.(null, "unavailable");
      return;
    }
    setState("asking");

    const onOk = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy: acc } = pos.coords;
      const inside = hostelAt(latitude, longitude);
      const next: LocState = inside ? "ok" : "outside";
      setState(next);
      setZone(inside?.name ?? null);
      setAccuracy(acc);
      if (inside) {
        setNearest(null);
      } else {
        const info = closestHostel(latitude, longitude);
        setNearest(info ? { hostel: info.hostel.name, meters: info.meters } : null);
      }
      done?.(inside?.name ?? null, next);
    };

    const onErr = (err: GeolocationPositionError) => {
      const next: LocState = err.code === 1 ? "denied" : "unavailable";
      setState(next);
      setZone(null);
      done?.(null, next);
    };

    navigator.geolocation.getCurrentPosition(
      onOk,
      (err) => {
        // Permission denied is final; for anything else retry with coarse accuracy.
        if (err.code === 1) {
          onErr(err);
          return;
        }
        navigator.geolocation.getCurrentPosition(onOk, onErr, {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 0,
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, []);

  return { state, zone, accuracy, nearest, locate };
}
