/** Business rules shared by the API routes and the UI. */

/** Exit and entry requests that staff haven't acted on lapse after this long. */
export const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

/** Students outside for longer than this are flagged as late. */
export const LATE_AFTER_HOURS = 8;

/** Exit requests are closed from midnight until this hour, Abu Dhabi time. */
export const EXIT_OPENS_HOUR = 5;

const ABU_DHABI_UTC_OFFSET_HOURS = 4;

/** Hour of day (0-23) in Abu Dhabi, independent of the device's time zone. */
export function abuDhabiHour(now: Date = new Date()): number {
  return (now.getUTCHours() + ABU_DHABI_UTC_OFFSET_HOURS) % 24;
}

export function isExitCurfew(now: Date = new Date()): boolean {
  return abuDhabiHour(now) < EXIT_OPENS_HOUR;
}
