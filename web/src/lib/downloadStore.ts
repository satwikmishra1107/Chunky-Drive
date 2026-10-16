// Keeps downloads in the browser's own storage (IndexedDB, on the user's disk), so a download
// survives pausing, closing the tab, or losing the connection, and resumes where it stopped.
//
//   jobs   – one record per download: which file, its chunk list and hashes, who started it
//   chunks – each chunk that has arrived and passed its hash check, keyed by [fileId, index]
//
// Everything for a file is deleted once it's saved to the Downloads folder, or cancelled.

import type { ChunkInfo } from "./api";

export type DownloadJob = {
  fileId: string;
  userId: string;
  name: string;
  size: number;
  mimeType: string | null;
  fileHash: string;
  chunks: ChunkInfo[];
};

const DB_NAME = "chunky-downloads";
const JOBS = "jobs";
const CHUNKS = "chunks";

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(JOBS, { keyPath: "fileId" });
      request.result.createObjectStore(CHUNKS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  });
  return opening;
}

// Runs one request inside a transaction and resolves once the transaction has committed.
async function run<T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const request = work(tx);
    tx.oncomplete = () => resolve(request ? request.result : (undefined as T));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const chunkRange = (fileId: string) => IDBKeyRange.bound([fileId, 0], [fileId, Infinity]);

export const saveJob = (job: DownloadJob) => run([JOBS], "readwrite", (tx) => tx.objectStore(JOBS).put(job));

export async function listJobs(userId: string): Promise<DownloadJob[]> {
  const jobs = await run<DownloadJob[]>([JOBS], "readonly", (tx) => tx.objectStore(JOBS).getAll());
  return jobs.filter((job) => job.userId === userId);
}

export const saveChunk = (fileId: string, index: number, data: Blob) =>
  run([CHUNKS], "readwrite", (tx) => tx.objectStore(CHUNKS).put(data, [fileId, index]));

// Chunk numbers already stored for a file.
export async function storedChunks(fileId: string): Promise<Set<number>> {
  const keys = await run<IDBValidKey[]>([CHUNKS], "readonly", (tx) => tx.objectStore(CHUNKS).getAllKeys(chunkRange(fileId)));
  return new Set(keys.map((key) => (key as [string, number])[1]));
}

// All stored chunks of a file, in chunk order (the key order sorts by index).
export const chunkBlobs = (fileId: string) =>
  run<Blob[]>([CHUNKS], "readonly", (tx) => tx.objectStore(CHUNKS).getAll(chunkRange(fileId)));

export const deleteJob = (fileId: string) =>
  run([JOBS, CHUNKS], "readwrite", (tx) => {
    tx.objectStore(JOBS).delete(fileId);
    tx.objectStore(CHUNKS).delete(chunkRange(fileId));
  });
