import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { authClient } from "../lib/auth";
import { stretchPassword } from "../lib/password";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

// signin/signup: the two main forms. verify: enter the emailed code after signing up.
// forgot: ask for a reset code. reset: enter that code plus a new password.
type Mode = "signin" | "signup" | "verify" | "forgot" | "reset";

const MIN_PASSWORD = 8;
const RESEND_WAIT = 30;

const ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Wrong email or password. If you signed up with Google, use the Google button.",
  USER_ALREADY_EXISTS: "An account with this email already exists. Try signing in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists. Try signing in instead.",
  INVALID_OTP: "That code isn't right. Check the email and try again.",
  OTP_EXPIRED: "That code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "Too many wrong tries. Send a new code.",
};

const messageFor = (error: { code?: string; message?: string }) =>
  (error.code && ERRORS[error.code]) || error.message || "Something went wrong. Please try again.";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

// 16px text on phones: iOS Safari zooms the page into any input smaller than that.
const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base outline-none sm:text-sm transition placeholder:text-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/15";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function PasswordInput({ value, onChange, isNew }: { value: string; onChange: (v: string) => void; isNew: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={isNew ? MIN_PASSWORD : undefined}
        autoComplete={isNew ? "new-password" : "current-password"}
        className={`${inputClass} pr-11`}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center px-3.5 text-muted hover:text-ink"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </span>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      required
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      placeholder="000000"
      pattern="\d{6}"
      className={`${inputClass} text-center font-mono text-2xl tracking-[0.5em] sm:text-2xl`}
    />
  );
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>(() => (location.pathname === "/signup" ? "signup" : "signin"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"form" | "google" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const go = (next: Mode, message: string | null = null) => {
    setMode(next);
    setError(null);
    setNotice(message);
    setCode("");
    if (next === "verify" || next === "reset") setResendIn(RESEND_WAIT);
    if (next === "signin" || next === "signup") history.replaceState(null, "", next === "signup" ? "/signup" : "/");
  };

  // Runs a form step: shows the spinner, and turns a Better Auth error into a readable message.
  const run = async (step: () => Promise<{ error: { code?: string; message?: string } | null }>, onDone: () => void) => {
    setBusy("form");
    setError(null);
    setNotice(null);
    const { error } = await step();
    setBusy(null);
    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") go("verify", `This email isn't confirmed yet. We sent a new code to ${email}.`);
      else setError(messageFor(error));
      return;
    }
    onDone();
  };

  // Signed in: reload to the drive (also clears /signup from the address bar).
  const enterDrive = () => location.replace("/");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if ((mode === "signup" || mode === "reset") && password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    if (mode === "signin") {
      await run(async () => authClient.signIn.email({ email, password: await stretchPassword(email, password) }), enterDrive);
    } else if (mode === "signup") {
      await run(
        async () => authClient.signUp.email({ name: name.trim(), email, password: await stretchPassword(email, password) }),
        () => go("verify", `We sent a 6-digit code to ${email}.`),
      );
    } else if (mode === "verify") {
      await run(() => authClient.emailOtp.verifyEmail({ email, otp: code }), enterDrive);
    } else if (mode === "forgot") {
      await run(
        () => authClient.emailOtp.requestPasswordReset({ email }),
        () => go("reset", `If an account uses ${email}, a 6-digit code is on its way.`),
      );
    } else {
      await run(
        async () => authClient.emailOtp.resetPassword({ email, otp: code, password: await stretchPassword(email, password) }),
        () => {
          setPassword("");
          go("signin", "Password changed. Sign in with your new password.");
        },
      );
    }
  };

  const resend = async () => {
    setBusy("resend");
    setError(null);
    const { error } =
      mode === "verify"
        ? await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" })
        : await authClient.emailOtp.requestPasswordReset({ email });
    setBusy(null);
    if (error) setError(messageFor(error));
    else {
      setNotice(`A new code is on its way to ${email}.`);
      setResendIn(RESEND_WAIT);
    }
  };

  const google = async () => {
    setBusy("google");
    setError(null);
    // On success the browser leaves for Google, so this only continues on failure.
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
    if (error) {
      setError(messageFor(error));
      setBusy(null);
    }
  };

  const heading: Record<Mode, [string, string]> = {
    signin: ["Welcome back", "Sign in to get to your files."],
    signup: ["Create your account", "Unlimited storage, free."],
    verify: ["Check your email", "Enter the 6-digit code to confirm your email."],
    forgot: ["Forgot your password?", "We'll email you a code to set a new one."],
    reset: ["Set a new password", "Enter the code from your email and a new password."],
  };
  const submitLabel: Record<Mode, string> = {
    signin: "Sign in",
    signup: "Create account",
    verify: "Confirm email",
    forgot: "Send code",
    reset: "Change password",
  };
  const mainForm = mode === "signin" || mode === "signup";
  const codeStep = mode === "verify" || mode === "reset";

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex items-center justify-between p-4 md:px-6">
        <div className="flex items-center gap-2">
          <Logo className="size-7 text-accent" />
          <span className="text-lg font-extrabold tracking-tight">
            Shie<span className="text-accent">drive</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/about" className="text-sm font-medium text-muted transition hover:text-ink">
            How it works
          </a>
          <ThemeToggle />
        </div>
      </div>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          {!mainForm && (
            <button
              onClick={() => go("signin")}
              className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" />
              Back to sign in
            </button>
          )}

          <h1 className="text-2xl font-bold tracking-tight">{heading[mode][0]}</h1>
          <p className="mt-1 text-sm text-muted">{heading[mode][1]}</p>

          {mainForm && (
            <>
              <button
                onClick={google}
                disabled={busy !== null}
                className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition hover:bg-raised disabled:opacity-60"
              >
                {busy === "google" ? <LoaderCircle className="size-5 animate-spin text-muted" /> : <GoogleMark />}
                Continue with Google
              </button>
              <div className="my-6 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" />
                or with email
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          {notice && <p className="mt-6 rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-ink">{notice}</p>}

          <form onSubmit={submit} className={`space-y-3.5 ${mainForm ? "" : "mt-6"}`}>
            {mode === "signup" && (
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" className={inputClass} />
              </Field>
            )}
            {(mainForm || mode === "forgot") && (
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </Field>
            )}
            {codeStep && (
              <Field label="Code">
                <CodeInput value={code} onChange={setCode} />
              </Field>
            )}
            {(mainForm || mode === "reset") && (
              <Field
                label={mode === "reset" ? "New password" : "Password"}
                hint={mode === "signin" ? undefined : `At least ${MIN_PASSWORD} characters.`}
              >
                <PasswordInput value={password} onChange={setPassword} isNew={mode !== "signin"} />
              </Field>
            )}
            {mode === "signin" && (
              <div className="-mt-1 text-right">
                <button type="button" onClick={() => go("forgot")} className="text-sm font-medium text-accent hover:underline">
                  Forgot password?
                </button>
              </div>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={busy !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
            >
              {busy === "form" && <LoaderCircle className="size-4 animate-spin" />}
              {submitLabel[mode]}
            </button>
          </form>

          {codeStep && (
            <p className="mt-5 text-center text-sm text-muted">
              Didn't get it? Check spam, or{" "}
              <button
                onClick={resend}
                disabled={resendIn > 0 || busy !== null}
                className="font-semibold text-accent hover:underline disabled:text-muted disabled:no-underline"
              >
                {resendIn > 0 ? `resend in ${resendIn}s` : "send a new code"}
              </button>
            </p>
          )}

          {mainForm && (
            <p className="mt-6 text-center text-sm text-muted">
              {mode === "signup" ? "Already have an account? " : "New here? "}
              <button
                onClick={() => go(mode === "signup" ? "signin" : "signup")}
                className="font-semibold text-accent hover:underline"
              >
                {mode === "signup" ? "Sign in" : "Create an account"}
              </button>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
