import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { waitUntil } from "cloudflare:workers";
import { sendOtpEmail, type EmailBindings } from "./email";
import { hashPassword, verifyPassword } from "./password";

export type AuthBindings = EmailBindings & {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
};

function createAuth(env: AuthBindings) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    // The address users see (the page, not the Worker), e.g. http://localhost:5173 in development.
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    emailAndPassword: {
      enabled: true,
      // New email accounts must enter the emailed code before they can sign in.
      requireEmailVerification: true,
      // The browser always sends a 64-character stretched key, never the typed password,
      // so the real "at least 8 characters" rule is checked on the sign-up form.
      minPasswordLength: 64,
      maxPasswordLength: 64,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    emailVerification: {
      // Signing in before confirming sends a fresh code.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
        // Refresh name and photo from Google on every Google sign-in, so accounts that
        // started with email + password pick up the Google photo once Google is linked.
        overrideUserInfoOnSignIn: true,
      },
    },
    plugins: [
      // 6-digit codes by email, for confirming new accounts and for "Forgot password?".
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        storeOTP: "hashed",
        sendVerificationOnSignUp: true,
        overrideDefaultEmailVerification: true,
        // Not awaited, so response time doesn't reveal whether an account exists;
        // waitUntil keeps the Worker alive until Mailjet has the email.
        sendVerificationOTP: async ({ email, otp, type }) => {
          waitUntil(sendOtpEmail(env, email, otp, type));
        },
      }),
    ],
    hooks: {
      // Better Auth hides "this email is taken" on sign-up (it fakes success so strangers
      // can't tell who has an account). For this app a clear message matters more, so
      // say so, and name the way that account signs in.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" || typeof ctx.body?.email !== "string") return;
        const existing = await ctx.context.internalAdapter.findUserByEmail(ctx.body.email, { includeAccounts: true });
        if (!existing) return;
        const hasPassword = existing.accounts.some((a) => a.providerId === "credential");
        throw APIError.from("UNPROCESSABLE_ENTITY", {
          code: hasPassword ? "EMAIL_TAKEN" : "EMAIL_TAKEN_GOOGLE",
          message: hasPassword
            ? "An account with this email already exists. Sign in instead."
            : "This email is already registered with Google. Use Continue with Google.",
        });
      }),
    },
    session: {
      // Keeps a signed copy of the session in a cookie for 5 minutes, so checking
      // who's logged in on every chunk request doesn't hit the database each time.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
  });
}

let cached: ReturnType<typeof createAuth> | undefined;

// The settings don't change while the Worker runs, so build Better Auth once and reuse it.
export function getAuth(env: AuthBindings) {
  cached ??= createAuth(env);
  return cached;
}
