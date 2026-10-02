/** Sends a 6-digit OTP to institutional email via Resend. */

import { randomInt } from "crypto";

export async function sendOtpEmail(
  to: string,
  name: string,
  otp: string
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "GatePass <onboarding@resend.dev>";

  if (!apiKey) {
    console.warn("[GatePass] RESEND_API_KEY not set — OTP email not sent to", to);
    return { sent: false, error: "Email provider not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "GatePass verification code — IIT Delhi Abu Dhabi",
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
            <h2 style="color:#0c1222;margin:0 0 8px;">GatePass verification</h2>
            <p style="color:#5b6b7c;margin:0 0 16px;">IIT Delhi Abu Dhabi · Hostel exit &amp; return</p>
            <p style="color:#0c1222;">Hi ${escapeHtml(name)},</p>
            <p style="color:#0c1222;">Your one-time verification code is:</p>
            <p style="font-size:32px;letter-spacing:0.25em;font-weight:700;color:#7B1113;margin:16px 0;">${otp}</p>
            <p style="color:#5b6b7c;font-size:14px;">This code expires in 10 minutes. If you did not request it, ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[GatePass] Resend error", res.status, text);
      return { sent: false, error: "Failed to send email" };
    }
    return { sent: true };
  } catch (e) {
    console.error("[GatePass] sendOtpEmail threw", e);
    return { sent: false, error: "Failed to send email" };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

/** Constructs the institutional email from a student roll number. */
export function studentEmail(entry: string): string {
  return `${entry.trim().toLowerCase()}@iitdabudhabi.ac.ae`;
}

/** Cryptographically strong 6-digit OTP — never use Math.random for auth codes. */
export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}
