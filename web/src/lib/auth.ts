import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

// Talks to the Worker's /api/auth routes on the same address as the page.
export const authClient = createAuthClient({ plugins: [emailOTPClient()] });

export type SessionUser = typeof authClient.$Infer.Session.user;
