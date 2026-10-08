"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ChevronLeft, IdCard, Mail, ShieldCheck, User } from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { Alert, Seal, Spinner, TextField, type ToastTone } from "./ui";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

type Step = "details" | "code";

interface LoginResponse {
  error?: string;
  step?: "otp_sent";
  email?: string;
  user?: SessionUser;
}

async function postLogin(body: Record<string, string>): Promise<{ ok: boolean; data: LoginResponse }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data: LoginResponse = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/**
 * One real input drawn as six cells. Keeping a single input means paste,
 * backspace and SMS autofill (one-time-code) all behave natively.
 */
function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  // Refocus after a failed attempt clears the field.
  useEffect(() => {
    if (!disabled && value === "") ref.current?.focus();
  }, [disabled, value]);

  const activeIndex = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <div className="code" data-invalid={invalid || undefined} onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        className="code-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        value={value}
        disabled={disabled}
        aria-label={`${CODE_LENGTH}-digit verification code`}
        aria-invalid={invalid || undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
          onChange(next);
          if (next.length === CODE_LENGTH) onComplete(next);
        }}
      />
      {Array.from({ length: CODE_LENGTH }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`code-cell${value[i] ? " is-filled" : ""}${focused && i === activeIndex ? " is-active" : ""}`}
        >
          {value[i] ?? ""}
        </span>
      ))}
    </div>
  );
}

export default function LoginScreen({
  onSignedIn,
  notify,
}: {
  onSignedIn: (user: SessionUser) => void;
  notify: (text: string, tone?: ToastTone) => void;
}) {
  const [step, setStep] = useState<Step>("details");
  const [entry, setEntry] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  /** Sends a code (or signs staff straight in). Also used for "Resend code". */
  const requestCode = useCallback(
    async (isResend = false) => {
      setError("");
      setBusy(true);
      try {
        const { ok, data } = await postLogin({ entry: entry.trim(), name: name.trim() });
        if (!ok) {
          setError(data.error || "Couldn't sign you in. Try again.");
          return;
        }
        if (data.user) {
          onSignedIn(data.user);
          return;
        }
        if (data.step === "otp_sent") {
          setMaskedEmail(data.email || "");
          setCode("");
          setStep("code");
          setResendIn(RESEND_SECONDS);
          if (isResend) notify("New code sent", "success");
        }
      } catch {
        setError("Can't reach the server. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    [entry, name, notify, onSignedIn]
  );

  const verify = useCallback(
    async (value: string) => {
      if (busy || value.length < CODE_LENGTH) return;
      setError("");
      setBusy(true);
      try {
        const { ok, data } = await postLogin({ entry: entry.trim(), name: name.trim(), otp: value });
        if (!ok) {
          setError(data.error || "That code didn't work. Try again.");
          setCode("");
          return;
        }
        if (data.user) onSignedIn(data.user);
      } catch {
        setError("Can't reach the server. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, entry, name, onSignedIn]
  );

  function submitDetails(e: FormEvent) {
    e.preventDefault();
    if (!busy && entry.trim() && name.trim()) void requestCode();
  }

  function submitCode(e: FormEvent) {
    e.preventDefault();
    void verify(code);
  }

  function backToDetails() {
    setStep("details");
    setCode("");
    setError("");
  }

  return (
    <main className="auth">
      <div className="auth-stack">
        {step === "details" ? (
          <section className="auth-card" key="details" aria-labelledby="auth-title">
            <header className="auth-head">
              <Seal size={64} alt="Indian Institute of Technology Delhi" className="auth-seal" />
              <h1 className="auth-title" id="auth-title">
                GatePass
              </h1>
              <p className="auth-sub">Hostel exit and return for IIT Delhi Abu Dhabi</p>
            </header>

            <form className="auth-form" onSubmit={submitDetails} noValidate>
              <TextField
                id="login-entry"
                label="Roll number"
                icon={IdCard}
                placeholder="2023CSB1092"
                value={entry}
                onChange={(e) => setEntry(e.target.value.replace(/\s/g, ""))}
                autoComplete="username"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={32}
              />
              <TextField
                id="login-name"
                label="First name"
                icon={User}
                placeholder="Your first name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="given-name"
                maxLength={40}
              />

              {error && <Alert>{error}</Alert>}

              <button className="btn btn-primary full" type="submit" disabled={busy || !entry.trim() || !name.trim()}>
                {busy ? (
                  <Spinner />
                ) : (
                  <>
                    Continue
                    <ArrowRight size={18} aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          </section>
        ) : (
          <section className="auth-card" key="code" aria-labelledby="auth-title">
            <button className="back-btn" type="button" onClick={backToDetails} disabled={busy}>
              <ChevronLeft size={18} aria-hidden="true" />
              Back
            </button>

            <header className="auth-head">
              <span className="auth-badge" aria-hidden="true">
                <Mail size={26} />
              </span>
              <h1 className="auth-title" id="auth-title">
                Check your email
              </h1>
              <p className="auth-sub">
                Enter the {CODE_LENGTH}-digit code sent to <strong>{maskedEmail}</strong>
              </p>
            </header>

            <form className="auth-form" onSubmit={submitCode} noValidate>
              <CodeInput
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (error) setError("");
                }}
                onComplete={(v) => void verify(v)}
                disabled={busy}
                invalid={!!error}
              />

              {error && <Alert>{error}</Alert>}

              <button className="btn btn-primary full" type="submit" disabled={busy || code.length < CODE_LENGTH}>
                {busy ? <Spinner /> : "Verify"}
              </button>

              <div className="resend">
                <span>Didn&apos;t get a code?</span>
                <button
                  className="link-btn"
                  type="button"
                  onClick={() => void requestCode(true)}
                  disabled={busy || resendIn > 0}
                >
                  {resendIn > 0 ? (
                    <>
                      Resend in <span className="tnum">{resendIn}</span>s
                    </>
                  ) : (
                    "Resend code"
                  )}
                </button>
              </div>
            </form>
          </section>
        )}

        <p className="auth-foot">
          {step === "details" ? (
            <>
              <span className="auth-foot-line">
                <ShieldCheck size={14} aria-hidden="true" />
                Your first name is linked to your roll number the first time you sign in.
              </span>
              Staff can enter their access code in place of a roll number.
            </>
          ) : (
            "Check your spam folder if the code hasn't arrived."
          )}
        </p>
      </div>
    </main>
  );
}
