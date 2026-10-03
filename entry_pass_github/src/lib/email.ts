/** Constructs the institutional email from a student roll number. */
export function studentEmail(entry: string): string {
  return `${entry.trim().toLowerCase()}@iitdabudhabi.ac.ae`;
}
