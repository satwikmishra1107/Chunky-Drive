// Upload and download engine: splits files, hashes chunks, moves 3 chunks at a time,
// and verifies every chunk on the way back. Downloads can pause and resume.
//
// File hash = SHA-256 of all chunk hashes (hex) joined in chunk order,
// the same rule as worker/scripts/roundtrip.mjs.

import { completeUpload, getChunk, getFile, putChunk, putThumbnail, startUpload } from "./api";
import { chunkBlobs, deleteJob, saveChunk, saveJob, storedChunks, type DownloadJob } from "./downloadStore";
import { makeThumbnail } from "./thumbnail";

const PARALLEL = 3;
const ATTEMPTS = 3;

// doneBytes for the size/time text; chunks[i] = how full chunk i is (0 to 1), for the chunked bar.
export type ProgressFn = (doneBytes: number, chunks: number[]) => void;

async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const fileHashOf = (chunkHashes: string[]) => sha256Hex(new TextEncoder().encode(chunkHashes.join("")));

// Runs task(0..count-1) with at most `limit` running at the same time.
// After a failure no new tasks start, and it only throws once every running task has
// finished, so nothing (like a chunk being saved) is still happening when the caller cleans up.
async function runPool(count: number, limit: number, task: (index: number) => Promise<void>) {
  let next = 0;
  let failed = false;
  const lane = async () => {
    while (next < count && !failed) {
      try {
        await task(next++);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const results = await Promise.allSettled(Array.from({ length: Math.min(limit, count) }, lane));
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

// Retries a step a few times with a short, growing pause before giving up.
// A pause isn't a failure, so it's never retried.
async function withRetry<T>(step: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await step();
    } catch (error) {
      if (attempt >= ATTEMPTS || error instanceof PausedError || (error as Error).name === "AbortError") throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Tracks bytes per chunk so progress never double-counts a retried chunk.
function progressTracker(onProgress: ProgressFn, chunkSizes: number[]) {
  const loadedBytes = new Array<number>(chunkSizes.length).fill(0);
  return (index: number, loaded: number) => {
    loadedBytes[index] = Math.min(loaded, chunkSizes[index]);
    const total = loadedBytes.reduce((sum, bytes) => sum + bytes, 0);
    onProgress(total, loadedBytes.map((bytes, i) => bytes / chunkSizes[i]));
  };
}

export async function uploadFile(file: File, onProgress: ProgressFn): Promise<void> {
  if (file.size === 0) throw new Error("Empty files can't be uploaded");

  const { fileId, chunkSize, chunkCount } = await startUpload(file);
  const chunkHashes = new Array<string>(chunkCount);
  const chunkSizes = Array.from({ length: chunkCount }, (_, i) => Math.min(chunkSize, file.size - i * chunkSize));
  const report = progressTracker(onProgress, chunkSizes);

  await runPool(chunkCount, PARALLEL, async (index) => {
    // Only this slice is read from disk, never the whole file.
    const data = await file.slice(index * chunkSize, (index + 1) * chunkSize).arrayBuffer();
    const hash = await sha256Hex(data);
    chunkHashes[index] = hash;
    await withRetry(() => putChunk(fileId, index, data, hash, (loaded) => report(index, loaded)));
  });

  await completeUpload(fileId, await fileHashOf(chunkHashes));

  // A missing preview isn't worth failing the upload over; the card just shows an icon.
  const thumbnail = await makeThumbnail(file);
  if (thumbnail) await putThumbnail(fileId, thumbnail).catch(() => {});
}

// Downloads go chunk by chunk into the browser's storage (lib/downloadStore.ts), then the
// finished file is handed to the browser's normal download. Stopping part-way (pause, closed
// tab, lost connection) keeps every verified chunk, so resuming only fetches what's missing.

export class PausedError extends Error {
  constructor() {
    super("Paused");
  }
}

// Fetches the file's chunk list and records a new download job.
export async function createDownloadJob(fileId: string, userId: string): Promise<DownloadJob> {
  const info = await getFile(fileId);
  if (info.status !== "ready" || !info.fileHash) throw new Error("This file isn't fully uploaded");
  if (info.chunks.reduce((sum, c) => sum + c.size, 0) !== info.size) throw new Error("File record is incomplete");

  const job: DownloadJob = {
    fileId,
    userId,
    name: info.name,
    size: info.size,
    mimeType: info.mimeType,
    fileHash: info.fileHash,
    chunks: info.chunks,
  };
  await saveJob(job);
  return job;
}

// Bytes and per-chunk progress already saved for a job, for showing paused downloads.
export async function savedProgress(job: DownloadJob): Promise<{ done: number; chunks: number[] }> {
  const have = await storedChunks(job.fileId);
  return {
    done: job.chunks.reduce((sum, c, i) => sum + (have.has(i) ? c.size : 0), 0),
    chunks: job.chunks.map((_, i) => (have.has(i) ? 1 : 0)),
  };
}

// Downloads whatever chunks are still missing, then saves the file. Aborting `signal` pauses:
// it throws PausedError and keeps everything already stored. So does losing the connection.
export async function runDownload(job: DownloadJob, signal: AbortSignal, onProgress: ProgressFn): Promise<void> {
  if ((await fileHashOf(job.chunks.map((c) => c.hash))) !== job.fileHash) {
    throw new Error("File failed its integrity check");
  }

  const have = await storedChunks(job.fileId);
  const report = progressTracker(
    onProgress,
    job.chunks.map((c) => c.size),
  );
  have.forEach((i) => report(i, job.chunks[i].size));
  const missing = job.chunks.map((_, i) => i).filter((i) => !have.has(i));

  try {
    await runPool(missing.length, PARALLEL, async (n) => {
      if (signal.aborted) throw new PausedError();
      const i = missing[n];
      const chunk = job.chunks[i];
      const bytes = await withRetry(async () => {
        if (signal.aborted) throw new PausedError();
        const data = await getChunk(job.fileId, chunk.index, (loaded) => report(i, loaded), signal);
        // A corrupt chunk throws, so withRetry downloads it again.
        if ((await sha256Hex(data as Uint8Array<ArrayBuffer>)) !== chunk.hash) {
          throw new Error(`Chunk ${chunk.index + 1} failed its integrity check`);
        }
        return data;
      });
      await saveChunk(job.fileId, i, new Blob([bytes as Uint8Array<ArrayBuffer>]));
    });
  } catch (error) {
    if (signal.aborted || !navigator.onLine) throw new PausedError();
    throw error;
  }

  // Every chunk is stored and verified: build the file and hand it to the browser.
  const parts = await chunkBlobs(job.fileId);
  if (parts.length !== job.chunks.length) throw new Error("Some chunks went missing; please download again");
  const url = URL.createObjectURL(new Blob(parts, { type: job.mimeType ?? "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = job.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  await deleteJob(job.fileId);
}
