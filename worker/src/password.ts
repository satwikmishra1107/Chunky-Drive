// Server half of password storage.
//
// The browser never sends the real password. It first runs it through PBKDF2 with
// 600,000 rounds (web/src/lib/password.ts) and sends the resulting 64-character key.
// That slow step is what protects passwords; here we only add a random salt and one
// fast SHA-256, which keeps sign-in well inside the free plan's 10 ms CPU limit.
//
// Stored format: sha256:<salt hex>:<hash hex>

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)?.map((pair) => parseInt(pair, 16)) ?? []);

async function digest(salt: Uint8Array, key: string): Promise<Uint8Array> {
  const keyBytes = encoder.encode(key);
  const input = new Uint8Array(salt.length + keyBytes.length);
  input.set(salt);
  input.set(keyBytes, salt.length);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}

export async function hashPassword(key: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `sha256:${toHex(salt)}:${toHex(await digest(salt, key))}`;
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const [scheme, saltHex, hashHex] = hash.split(":");
  if (scheme !== "sha256" || !saltHex || !hashHex) return false;

  const expected = fromHex(hashHex);
  const actual = await digest(fromHex(saltHex), password);
  if (actual.length !== expected.length) return false;

  // Compare every byte, so the time taken doesn't reveal how much of the hash matched.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
