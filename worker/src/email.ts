// Sends email through Resend (free plan: 3,000/month, 100/day).
// Mailjet is kept below, commented out, while its account is suspended; to switch back,
// swap which sendEmail is commented and restore the MAILJET_* keys.

export type EmailBindings = {
  RESEND_API_KEY: string;
  // MAILJET_API_KEY: string;
  // MAILJET_SECRET_KEY: string;
  MAIL_FROM: string;
  MAIL_FROM_NAME: string;
};

type OtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

const SUBJECTS: Record<OtpType, string> = {
  "email-verification": "Confirm your email",
  "forget-password": "Reset your password",
  "sign-in": "Your sign-in code",
  "change-email": "Confirm your new email",
};

const INTROS: Record<OtpType, string> = {
  "email-verification": "Use this code to confirm your email and finish creating your account.",
  "forget-password": "Use this code to set a new password.",
  "sign-in": "Use this code to sign in.",
  "change-email": "Use this code to confirm your new email address.",
};

async function sendEmail(env: EmailBindings, to: string, subject: string, text: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${env.MAIL_FROM_NAME} <${env.MAIL_FROM}>`,
      to: [to],
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) console.error("Resend send failed", res.status, await res.text());}

// Mailjet version (account suspended for now):
// async function sendEmail(env: EmailBindings, to: string, subject: string, text: string, html: string) {
//   const res = await fetch("https://api.mailjet.com/v3.1/send", {
//     method: "POST",
//     headers: {
//       Authorization: `Basic ${btoa(`${env.MAILJET_API_KEY}:${env.MAILJET_SECRET_KEY}`)}`,
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       Messages: [
//         {
//           From: { Email: env.MAIL_FROM, Name: env.MAIL_FROM_NAME },
//           To: [{ Email: to }],
//           Subject: subject,
//           TextPart: text,
//           HTMLPart: html,
//         },
//       ],
//     }),
//   });
//   if (!res.ok) console.error("Mailjet send failed", res.status, await res.text());
// }

export function sendOtpEmail(env: EmailBindings, to: string, otp: string, type: OtpType) {
  const subject = `${SUBJECTS[type]} – ${env.MAIL_FROM_NAME}`;
  const text = `${INTROS[type]}\n\n${otp}\n\nThe code expires in 10 minutes. If you didn't ask for it, you can ignore this email.`;
  const html = `<!doctype html>
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:440px;margin:0 auto;padding:32px 24px;color:#18181b">
  <p style="font-size:20px;font-weight:800;margin:0 0 24px">chunky<span style="color:#0f766e">drive</span></p>
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px">${INTROS[type]}</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f1f1ee;border-radius:12px;padding:16px;text-align:center;margin:0 0 20px">${otp}</p>
  <p style="font-size:13px;color:#6b6b73;line-height:1.5;margin:0">The code expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>
</div>`;
  return sendEmail(env, to, subject, text, html);
}
