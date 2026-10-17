// Thin wrappers around the Worker's /api routes.

export type FileSummary = {
  id: string;
  name: string;
  size: number;
  mime_type: string | null;
  created_at: string;
  has_thumbnail: number;
  chunk_count: number;
  folder_id: string | null;
};

// A folder; parent_id null means it sits at the top of My Drive.
export type Folder = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

export const thumbnailUrl = (id: string) => `/api/files/${id}/thumbnail`;

export type ChunkInfo = { index: number; hash: string; size: number };

export type FileDetails = {
  id: string;
  name: string;
  size: number;
  mimeType: string | null;
  fileHash: string | null;
  status: string;
  chunks: ChunkInfo[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export const listFiles = () => request<FileSummary[]>("/files");

export const getFile = (id: string) => request<FileDetails>(`/files/${id}`);

export const putThumbnail = (id: string, image: Blob) =>
  request<{ ok: true }>(`/files/${id}/thumbnail`, {
    method: "PUT",
    headers: { "Content-Type": image.type },
    body: image,
  });

export const listFolders = () => request<Folder[]>("/folders");

// `renamed` is true when the name was taken there and a " (1)"-style name was used instead.
export const createFolder = (name: string, parentId: string | null) =>
  request<{ folder: Folder; renamed: boolean }>("/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentId }),
  });

// Moves files and folders into `targetFolderId` (null = My Drive). `renamed` lists folders
// that got a " (1)"-style name because theirs was taken there.
export const moveItems = (fileIds: string[], folderIds: string[], targetFolderId: string | null) =>
  request<{ ok: true; renamed: { from: string; to: string }[] }>("/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileIds, folderIds, targetFolderId }),
  });

// Deletes the folder and everything inside it.
export const deleteFolder = (id: string) => request<{ ok: true }>(`/folders/${id}`, { method: "DELETE" });

export const deleteFile = (id: string) => request<{ ok: true }>(`/files/${id}`, { method: "DELETE" });

export const startUpload = (file: File, folderId: string | null) =>
  request<{ fileId: string; chunkSize: number; chunkCount: number }>("/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      folderId,
    }),
  });

export const completeUpload = (id: string, fileHash: string) =>
  request<{ ok: true }>(`/files/${id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileHash }),
  });

// Uses XMLHttpRequest instead of fetch because only XHR reports upload progress.
export function putChunk(
  id: string,
  index: number,
  data: ArrayBuffer,
  hash: string,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.onabort = () => reject(new DOMException("Upload paused", "AbortError"));
    xhr.open("PUT", `/api/files/${id}/chunks/${index}`);
    xhr.setRequestHeader("X-Chunk-Hash", hash);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Chunk ${index + 1} upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error(`Chunk ${index + 1} upload failed (network error)`));
    xhr.send(data);
  });
}

// Downloads one chunk, reporting bytes as they arrive.
export async function getChunk(
  id: string,
  index: number,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const res = await fetch(`/api/files/${id}/chunks/${index}`, { signal });
  if (!res.ok || !res.body) throw new Error(`Chunk ${index + 1} download failed (${res.status})`);

  const parts: Uint8Array[] = [];
  let loaded = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.byteLength;
    onProgress(loaded);
  }

  const data = new Uint8Array(loaded);
  let offset = 0;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.byteLength;
  }
  return data;
}
