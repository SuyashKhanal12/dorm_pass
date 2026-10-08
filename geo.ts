import type { HostelId } from "./types";

export type Hostel = { name: HostelId; lat: number; lng: number; radius: number };

/** Geofences, radius in metres. */
export const HOSTELS: Hostel[] = [
  { name: "KCA1", lat: 24.4028418, lng: 54.5875658, radius: 150 },
  { name: "KCA2", lat: 24.4028787, lng: 54.5871303, radius: 150 },
  { name: "KCA3", lat: 24.4052019, lng: 54.5991466, radius: 150 },
];

export function distMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** The hostel whose geofence contains the point, if any. */
export function hostelAt(lat: number, lng: number): Hostel | null {
  return HOSTELS.find((h) => distMeters(lat, lng, h.lat, h.lng) <= h.radius) ?? null;
}

export function closestHostel(lat: number, lng: number): { hostel: Hostel; meters: number } | null {
  let best: Hostel | null = null;
  let bestD = Infinity;
  for (const h of HOSTELS) {
    const d = distMeters(lat, lng, h.lat, h.lng);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best ? { hostel: best, meters: bestD } : null;
}
