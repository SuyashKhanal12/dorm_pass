import type { GateRequest } from "./types";
import { formatDateTime, statusLabel } from "./format";

const HEADERS = [
  "Name",
  "Entry No",
  "Hostel",
  "Room",
  "Bed",
  "Destination",
  "Exit",
  "Exit approved by",
  "Entry hostel",
  "Entry",
  "Entry approved by",
  "Status",
];

/** Quote a cell and neutralise spreadsheet formula injection. */
function cell(value: string): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildLogsCsv(rows: GateRequest[]): string {
  const lines = [HEADERS.map(cell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.name,
        r.entry,
        r.hostel || "",
        r.room || "",
        r.bed || "",
        r.dest,
        formatDateTime(r.exitTime),
        r.exitBy || "",
        r.entryHostel || "",
        formatDateTime(r.entryTime),
        r.entryBy || "",
        statusLabel(r.status),
      ]
        .map(cell)
        .join(",")
    );
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  // The BOM keeps Excel from mangling non-ASCII characters.
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
