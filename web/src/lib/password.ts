// Browser half of password storage (see worker/src/password.ts for the server half).
//
// The typed password never leaves the browser. It's stretched with PBKDF2 (600,000 rounds
// of SHA-256, salted with the email address) into a 64-character key, and that key is what
// gets sent and stored. The slow stretching is what makes stolen hashes hard to crack, and
// doing it here keeps the free Worker inside its CPU limit.
//
// Changing ROUNDS or the salt format would lock out every existing password account.

const ROUNDS = 600_000;

export async function stretchPassword(email: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(`chunkydrive:${email.trim().toLowerCase()}`),
      iterations: ROUNDS,
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
}
