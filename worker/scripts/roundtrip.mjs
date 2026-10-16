// Uploads a file to the Worker, downloads it back, and checks every hash.
// Usage: npm run roundtrip -- <path-to-file> [parallel=3] [workerUrl]
//
// File hash = SHA-256 of all chunk hashes (hex) joined in chunk order.
// The browser will compute it the same way.

import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import { basename } from "node:path";

const [filePath, parallelArg = "3", baseUrl = "http://localhost:8787"] = process.argv.slice(2);
const parallel = Number(parallelArg);
if (!filePath || !Number.isInteger(parallel) || parallel < 1) {
  console.error("Usage: npm run roundtrip -- <path-to-file> [parallel=3] [workerUrl]");
  process.exit(1);
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const seconds = (since) => (Date.now() - since) / 1000;
const mbPerSec = (bytes, secs) => (bytes / 1024 / 1024 / secs).toFixed(2);

async function api(path, init) {
  const res = await fetch(`${baseUrl}/api${path}`, init);
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  return res;
}

// Runs task(0..count-1) with at most `limit` running at the same time.
async function runPool(count, limit, task) {
  let next = 0;
  const lane = async () => {
    while (next < count) await task(next++);
  };
  await Promise.all(Array.from({ length: Math.min(limit, count) }, lane));
}

const { size } = await stat(filePath);

// 1. Start the upload.
const { fileId, chunkSize, chunkCount } = await (
  await api("/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: basename(filePath), size, mimeType: "application/octet-stream" }),
  })
).json();
console.log(
  `Uploading ${basename(filePath)} (${size} bytes) as ${chunkCount} chunk(s), ${parallel} at a time, file ID ${fileId}`,
);

// 2. Send the chunks, several at once. Hashes are kept by index since chunks finish out of order.
const uploadStart = Date.now();
const handle = await open(filePath);
const chunkHashes = new Array(chunkCount);
let uploaded = 0;
try {
  await runPool(chunkCount, parallel, async (index) => {
    const started = Date.now();
    const buffer = Buffer.alloc(Math.min(chunkSize, size - index * chunkSize));
    await handle.read(buffer, 0, buffer.length, index * chunkSize);
    const hash = sha256(buffer);
    chunkHashes[index] = hash;
    await api(`/files/${fileId}/chunks/${index}`, {
      method: "PUT",
      headers: { "X-Chunk-Hash": hash, "Content-Type": "application/octet-stream" },
      body: buffer,
    });
    console.log(`  up   chunk ${index + 1} done in ${seconds(started).toFixed(1)}s (${++uploaded}/${chunkCount})`);
  });
} finally {
  await handle.close();
}

// 3. Finish the upload.
const fileHash = sha256(chunkHashes.join(""));
await api(`/files/${fileId}/complete`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fileHash }),
});
const uploadSecs = seconds(uploadStart);
console.log(`Upload done in ${uploadSecs.toFixed(1)}s (${mbPerSec(size, uploadSecs)} MB/s)`);

// 4. Download the chunks, several at once, checking each against its stored hash.
const downloadStart = Date.now();
const info = await (await api(`/files/${fileId}`)).json();
const downloadedHashes = new Array(info.chunks.length);
let bytes = 0;
let downloaded = 0;
await runPool(info.chunks.length, parallel, async (i) => {
  const chunk = info.chunks[i];
  const started = Date.now();
  const data = Buffer.from(await (await api(`/files/${fileId}/chunks/${chunk.index}`)).arrayBuffer());
  const hash = sha256(data);
  if (hash !== chunk.hash) throw new Error(`Chunk ${chunk.index} is corrupt: expected ${chunk.hash}, got ${hash}`);
  downloadedHashes[chunk.index] = hash;
  bytes += data.length;
  console.log(
    `  down chunk ${chunk.index + 1} ok in ${seconds(started).toFixed(1)}s (${++downloaded}/${info.chunks.length})`,
  );
});
const downloadSecs = seconds(downloadStart);
console.log(`Download done in ${downloadSecs.toFixed(1)}s (${mbPerSec(bytes, downloadSecs)} MB/s)`);

// 5. Final check: rebuilt file hash and size must match.
if (sha256(downloadedHashes.join("")) !== info.fileHash || bytes !== info.size) {
  throw new Error("Rebuilt file does not match the stored file hash or size");
}
console.log(`PASS: all ${info.chunks.length} chunk(s) verified, ${bytes} bytes`);
