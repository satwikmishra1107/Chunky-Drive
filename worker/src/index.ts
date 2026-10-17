import { Hono } from "hono";
import { getAuth, type AuthBindings } from "./auth";

type Bindings = AuthBindings & {
  STORAGE_BOT_TOKEN: string;
  CHANNEL_IDS: string;
};

// Set by the login check below, for every route except /api/auth/*.
type Variables = { userId: string };

type FileRow = {
  id: string;
  owner_id: string;
  name: string;
  size: number;
  mime_type: string | null;
  file_hash: string | null;
  channel_id: string;
  chunk_count: number;
  status: string;
  created_at: string;
};

// The third-party storage network's API.
const STORAGE_API = "https://discord.com/api/v10";
const CHUNK_SIZE = 8 * 1024 * 1024;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const MAX_THUMBNAIL_SIZE = 200 * 1024;
const THUMBNAIL_TYPES = ["image/webp", "image/jpeg"];

// Every route lives under /api so the frontend can be served from the same Worker later.
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath("/api");

// Sign-in, sign-out and session routes are handled entirely by Better Auth.
app.on(["GET", "POST"], "/auth/*", (c) => getAuth(c.env).handler(c.req.raw));

// Every other route needs a logged-in user, and only ever sees that user's files.
app.use("*", async (c, next) => {
  const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Not signed in" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// Calls the storage network's API, waiting and retrying when it says we are rate limited.
async function storageApi(
  env: Bindings,
  path: string,
  makeInit: () => RequestInit = () => ({}),
  attempts = 3,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const init = makeInit();
    const res = await fetch(`${STORAGE_API}${path}`, {
      ...init,
      headers: { Authorization: `Bot ${env.STORAGE_BOT_TOKEN}`, ...init.headers },
    });
    if (res.status !== 429 || attempt >= attempts) return res;
    const { retry_after, global } = await res.json<{ retry_after: number; global?: boolean }>();
    console.warn(
      `Rate limited (${global ? "global" : "route"}) on ${path}, waiting ${retry_after}s (attempt ${attempt}/${attempts})`,
    );
    await new Promise((resolve) => setTimeout(resolve, retry_after * 1000));
  }
}

function getFolder(env: Bindings, folderId: string, ownerId: string) {
  return env.DB.prepare("SELECT id FROM folders WHERE id = ? AND owner_id = ?").bind(folderId, ownerId).first();
}

function getFile(env: Bindings, fileId: string, ownerId: string) {
  return env.DB.prepare("SELECT * FROM files WHERE id = ? AND owner_id = ?")
    .bind(fileId, ownerId)
    .first<FileRow>();
}

// Start an upload: creates the file record and tells the client how big each chunk must be.
app.post("/files", async (c) => {
  const body = await c.req.json<{ name?: string; size?: number; mimeType?: string; folderId?: string | null }>();
  if (!body.name || !Number.isSafeInteger(body.size) || body.size! <= 0) {
    return c.json({ error: "name and a positive size are required" }, 400);
  }
  const folderId = body.folderId ?? null;
  if (folderId && !(await getFolder(c.env, folderId, c.get("userId")))) {
    return c.json({ error: "Folder not found" }, 404);
  }

  const channels = c.env.CHANNEL_IDS.split(",").map((id) => id.trim()).filter(Boolean);
  const channelId = channels[Math.floor(Math.random() * channels.length)];
  const fileId = crypto.randomUUID();
  const chunkCount = Math.ceil(body.size! / CHUNK_SIZE);

  await c.env.DB.prepare(
    "INSERT INTO files (id, owner_id, name, size, mime_type, channel_id, chunk_count, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(fileId, c.get("userId"), body.name, body.size, body.mimeType ?? null, channelId, chunkCount, folderId)
    .run();

  return c.json({ fileId, chunkSize: CHUNK_SIZE, chunkCount }, 201);
});

// Upload one chunk: the raw bytes are the request body, the browser-computed hash is a header.
app.put("/files/:id/chunks/:index", async (c) => {
  const index = Number(c.req.param("index"));
  const chunkHash = c.req.header("X-Chunk-Hash")?.toLowerCase();
  if (!chunkHash || !SHA256_HEX.test(chunkHash)) {
    return c.json({ error: "X-Chunk-Hash must be a SHA-256 hex string" }, 400);
  }

  const file = await getFile(c.env, c.req.param("id"), c.get("userId"));
  if (!file) return c.json({ error: "File not found" }, 404);
  if (file.status !== "uploading") return c.json({ error: "File is not accepting chunks" }, 409);
  if (!Number.isInteger(index) || index < 0 || index >= file.chunk_count) {
    return c.json({ error: "Chunk index out of range" }, 400);
  }

  const size = Number(c.req.header("Content-Length"));
  const body = c.req.raw.body;
  if (!body || !Number.isInteger(size) || size <= 0 || size > CHUNK_SIZE) {
    return c.json({ error: `Chunk must be 1 to ${CHUNK_SIZE} bytes` }, 413);
  }

  // Stream the chunk through instead of reading it into memory: copying 8 MB in JavaScript
  // goes over the free plan's 10 ms CPU limit, while a piped stream is moved by Cloudflare
  // itself. Only the small multipart header and footer are written by this code.
  const boundary = `chunky-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  // Multipart lines must end in CRLF.
  const CRLF = "\r\n";
  const head = encoder.encode(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="payload_json"`,
      "Content-Type: application/json",
      "",
      JSON.stringify({ attachments: [{ id: 0, filename: "chunk.bin" }] }),
      `--${boundary}`,
      `Content-Disposition: form-data; name="files[0]"; filename="chunk.bin"`,
      "Content-Type: application/octet-stream",
      "",
      "",
    ].join(CRLF),
  );
  const tail = encoder.encode(`${CRLF}--${boundary}--${CRLF}`);
  // Also checks the body really is `size` bytes: a longer or shorter one makes the send fail.
  const { readable, writable } = new FixedLengthStream(head.byteLength + size + tail.byteLength);
  const pump = (async () => {
    let writer = writable.getWriter();
    await writer.write(head);
    writer.releaseLock();
    await body.pipeTo(writable, { preventClose: true });
    writer = writable.getWriter();
    await writer.write(tail);
    await writer.close();
  })();

  // A stream can only be sent once, so a rate-limited send isn't retried here (attempts = 1);
  // the 503 below makes the browser retry the whole chunk after a pause.
  let res: Response;
  try {
    res = await storageApi(
      c.env,
      `/channels/${file.channel_id}/messages`,
      () => ({ method: "POST", body: readable, headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` } }),
      1,
    );
  } catch (error) {
    pump.catch(() => {});
    console.error("Chunk stream failed", error);
    return c.json({ error: "Chunk upload was interrupted" }, 400);
  }
  if (!res.ok) {
    // Rejected before reading everything: the half-sent stream errors, which is expected.
    pump.catch(() => {});
    if (res.status === 429) return c.json({ error: "Storage is busy, try again shortly" }, 503);
    console.error("Storage upload failed", res.status, await res.text());
    return c.json({ error: "Storage upload failed", storageStatus: res.status }, 502);
  }
  await pump;
  const message = await res.json<{ id: string }>();

  // A retried chunk replaces the earlier row.
  await c.env.DB.prepare(
    `INSERT INTO chunks (file_id, chunk_index, message_id, chunk_hash, size) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (file_id, chunk_index) DO UPDATE SET
       message_id = excluded.message_id, chunk_hash = excluded.chunk_hash, size = excluded.size`,
  )
    .bind(file.id, index, message.id, chunkHash, size)
    .run();

  return c.json({ ok: true });
});

// Finish an upload: checks every chunk arrived, then marks the file ready.
app.post("/files/:id/complete", async (c) => {
  const { fileHash } = await c.req.json<{ fileHash?: string }>();
  if (!fileHash || !SHA256_HEX.test(fileHash.toLowerCase())) {
    return c.json({ error: "fileHash must be a SHA-256 hex string" }, 400);
  }

  const file = await getFile(c.env, c.req.param("id"), c.get("userId"));
  if (!file) return c.json({ error: "File not found" }, 404);

  const totals = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM chunks WHERE file_id = ?",
  )
    .bind(file.id)
    .first<{ count: number; bytes: number }>();
  if (totals!.count !== file.chunk_count || totals!.bytes !== file.size) {
    return c.json(
      { error: "Upload incomplete", chunksReceived: totals!.count, chunksExpected: file.chunk_count },
      409,
    );
  }

  await c.env.DB.prepare("UPDATE files SET status = 'ready', file_hash = ? WHERE id = ?")
    .bind(fileHash.toLowerCase(), file.id)
    .run();

  return c.json({ ok: true });
});

// List the owner's finished files, newest first.
app.get("/files", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, size, mime_type, created_at, chunk_count, folder_id,
       EXISTS (SELECT 1 FROM thumbnails WHERE thumbnails.file_id = files.id) AS has_thumbnail
     FROM files
     WHERE owner_id = ? AND status = 'ready' ORDER BY created_at DESC`,
  )
    .bind(c.get("userId"))
    .all();
  return c.json(results);
});

// File details plus the ordered chunk list the client needs to download and verify.
app.get("/files/:id", async (c) => {
  const file = await getFile(c.env, c.req.param("id"), c.get("userId"));
  if (!file) return c.json({ error: "File not found" }, 404);

  const { results: chunks } = await c.env.DB.prepare(
    "SELECT chunk_index AS \"index\", chunk_hash AS hash, size FROM chunks WHERE file_id = ? ORDER BY chunk_index",
  )
    .bind(file.id)
    .all();

  return c.json({
    id: file.id,
    name: file.name,
    size: file.size,
    mimeType: file.mime_type,
    fileHash: file.file_hash,
    status: file.status,
    chunks,
  });
});

// Delete a file's records. The stored chunks are left in place on purpose.
app.delete("/files/:id", async (c) => {
  const file = await getFile(c.env, c.req.param("id"), c.get("userId"));
  if (!file) return c.json({ error: "File not found" }, 404);

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM thumbnails WHERE file_id = ?").bind(file.id),
    c.env.DB.prepare("DELETE FROM chunks WHERE file_id = ?").bind(file.id),
    c.env.DB.prepare("DELETE FROM files WHERE id = ?").bind(file.id),
  ]);

  return c.json({ ok: true });
});

// ---- Folders. A file sits in one folder (files.folder_id, NULL = My Drive); folders nest
// through parent_id. The page loads every folder at once and works out the tree itself.

const MAX_FOLDER_NAME = 255;

app.get("/folders", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, parent_id, created_at FROM folders WHERE owner_id = ? ORDER BY name COLLATE NOCASE",
  )
    .bind(c.get("userId"))
    .all();
  return c.json(results);
});

// Create a folder. A name already used in that place gets " (1)", " (2)", … like Windows does,
// and the reply says so, so the page can tell the user.
app.post("/folders", async (c) => {
  const body = await c.req.json<{ name?: string; parentId?: string | null }>();
  const requested = body.name?.trim() ?? "";
  if (!requested || requested.length > MAX_FOLDER_NAME) {
    return c.json({ error: `Folder name must be 1 to ${MAX_FOLDER_NAME} characters` }, 400);
  }
  const ownerId = c.get("userId");
  const parentId = body.parentId ?? null;
  if (parentId && !(await getFolder(c.env, parentId, ownerId))) return c.json({ error: "Folder not found" }, 404);

  const { results } = await c.env.DB.prepare(
    "SELECT name FROM folders WHERE owner_id = ? AND parent_id IS ?",
  )
    .bind(ownerId, parentId)
    .all<{ name: string }>();
  const taken = new Set(results.map((row) => row.name.toLowerCase()));
  let name = requested;
  for (let n = 1; taken.has(name.toLowerCase()); n++) name = `${requested} (${n})`;

  const folder = { id: crypto.randomUUID(), name, parent_id: parentId, created_at: "" };
  try {
    const row = await c.env.DB.prepare(
      "INSERT INTO folders (id, owner_id, parent_id, name) VALUES (?, ?, ?, ?) RETURNING created_at",
    )
      .bind(folder.id, ownerId, parentId, name)
      .first<{ created_at: string }>();
    folder.created_at = row!.created_at;
  } catch {
    // Another tab took the same name a moment ago (the unique index caught it).
    return c.json({ error: "A folder with that name was just created. Please try again." }, 409);
  }
  return c.json({ folder, renamed: name !== requested }, 201);
});

// Move files and folders into `targetFolderId` (null = My Drive). Only database rows change,
// so it's instant at any size. A folder can't go inside itself or its own sub-folders, and a
// folder whose name is already used in the target gets " (1)"-style renamed, like on create.
// Files may share names, as in Google Drive.
const MAX_MOVE_ITEMS = 500;

app.post("/move", async (c) => {
  const body = await c.req.json<{ fileIds?: string[]; folderIds?: string[]; targetFolderId?: string | null }>();
  const fileIds = [...new Set(body.fileIds ?? [])];
  const folderIds = [...new Set(body.folderIds ?? [])];
  const targetId = body.targetFolderId ?? null;
  const ownerId = c.get("userId");
  if (fileIds.length + folderIds.length === 0) return c.json({ error: "Nothing to move" }, 400);
  if (fileIds.length + folderIds.length > MAX_MOVE_ITEMS) {
    return c.json({ error: `Move at most ${MAX_MOVE_ITEMS} items at once` }, 400);
  }
  if (targetId && !(await getFolder(c.env, targetId, ownerId))) return c.json({ error: "Folder not found" }, 404);

  // The target and every folder above it: none of the moving folders may be among them.
  if (targetId && folderIds.length) {
    const { results: above } = await c.env.DB.prepare(
      `WITH RECURSIVE up(id, parent_id) AS (
         SELECT id, parent_id FROM folders WHERE id = ? AND owner_id = ?
         UNION ALL SELECT folders.id, folders.parent_id FROM folders JOIN up ON folders.id = up.parent_id
       ) SELECT id FROM up`,
    )
      .bind(targetId, ownerId)
      .all<{ id: string }>();
    if (above.some((row) => folderIds.includes(row.id))) {
      return c.json({ error: "A folder can't be moved inside itself" }, 400);
    }
  }

  const { results: moving } = await c.env.DB.prepare(
    `SELECT id, name, parent_id FROM folders WHERE owner_id = ? AND id IN (SELECT value FROM json_each(?))`,
  )
    .bind(ownerId, JSON.stringify(folderIds))
    .all<{ id: string; name: string; parent_id: string | null }>();
  if (moving.length !== folderIds.length) return c.json({ error: "Folder not found" }, 404);

  // Folder names already in the target. Moved folders' new names are added as they're picked.
  const { results: present } = await c.env.DB.prepare("SELECT name FROM folders WHERE owner_id = ? AND parent_id IS ?")
    .bind(ownerId, targetId)
    .all<{ name: string }>();
  const taken = new Set(present.map((row) => row.name.toLowerCase()));

  const renamed: { from: string; to: string }[] = [];
  const statements: D1PreparedStatement[] = [];
  for (const folder of moving) {
    if (folder.parent_id === targetId) continue; // Already there.
    let name = folder.name;
    for (let n = 1; taken.has(name.toLowerCase()); n++) name = `${folder.name} (${n})`;
    taken.add(name.toLowerCase());
    if (name !== folder.name) renamed.push({ from: folder.name, to: name });
    statements.push(
      c.env.DB.prepare("UPDATE folders SET parent_id = ?, name = ? WHERE id = ? AND owner_id = ?").bind(targetId, name, folder.id, ownerId),
    );
  }
  if (fileIds.length) {
    statements.push(
      c.env.DB.prepare("UPDATE files SET folder_id = ? WHERE owner_id = ? AND id IN (SELECT value FROM json_each(?))").bind(
        targetId,
        ownerId,
        JSON.stringify(fileIds),
      ),
    );
  }

  try {
    if (statements.length) await c.env.DB.batch(statements);
  } catch {
    // Another tab used one of the new names a moment ago (the unique index caught it).
    return c.json({ error: "Some folder names changed while moving. Please try again." }, 409);
  }
  return c.json({ ok: true, renamed });
});

// Delete a folder with everything inside it: sub-folders at any depth, their files, chunk
// records and thumbnails. As with single files, the stored chunks are left in place.
app.delete("/folders/:id", async (c) => {
  const ownerId = c.get("userId");
  const folder = await getFolder(c.env, c.req.param("id"), ownerId);
  if (!folder) return c.json({ error: "Folder not found" }, 404);

  // `tree` is the folder plus every folder below it.
  const tree = `WITH RECURSIVE tree(id) AS (
      SELECT id FROM folders WHERE id = ? AND owner_id = ?
      UNION ALL SELECT folders.id FROM folders JOIN tree ON folders.parent_id = tree.id
    )`;
  const filesInTree = "SELECT id FROM files WHERE owner_id = ? AND folder_id IN (SELECT id FROM tree)";
  const [id, owner] = [folder.id, ownerId];
  await c.env.DB.batch([
    c.env.DB.prepare(`${tree} DELETE FROM thumbnails WHERE file_id IN (${filesInTree})`).bind(id, owner, owner),
    c.env.DB.prepare(`${tree} DELETE FROM chunks WHERE file_id IN (${filesInTree})`).bind(id, owner, owner),
    c.env.DB.prepare(`${tree} DELETE FROM files WHERE id IN (${filesInTree})`).bind(id, owner, owner),
    c.env.DB.prepare(`${tree} DELETE FROM folders WHERE id IN (SELECT id FROM tree)`).bind(id, owner),
  ]);

  return c.json({ ok: true });
});

// Save the small preview image the browser made for a picture file.
app.put("/files/:id/thumbnail", async (c) => {
  const mimeType = c.req.header("Content-Type") ?? "";
  if (!THUMBNAIL_TYPES.includes(mimeType)) return c.json({ error: "Unsupported thumbnail type" }, 415);

  const file = await getFile(c.env, c.req.param("id"), c.get("userId"));
  if (!file) return c.json({ error: "File not found" }, 404);

  const data = await c.req.arrayBuffer();
  if (data.byteLength === 0 || data.byteLength > MAX_THUMBNAIL_SIZE) {
    return c.json({ error: `Thumbnail must be 1 to ${MAX_THUMBNAIL_SIZE} bytes` }, 413);
  }

  await c.env.DB.prepare("INSERT OR REPLACE INTO thumbnails (file_id, mime_type, data) VALUES (?, ?, ?)")
    .bind(file.id, mimeType, data)
    .run();

  return c.json({ ok: true });
});

app.get("/files/:id/thumbnail", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT thumbnails.mime_type, thumbnails.data FROM thumbnails
     JOIN files ON files.id = thumbnails.file_id
     WHERE files.id = ? AND files.owner_id = ?`,
  )
    .bind(c.req.param("id"), c.get("userId"))
    .first<{ mime_type: string; data: ArrayBuffer | number[] }>();
  if (!row) return c.json({ error: "Thumbnail not found" }, 404);

  // A file's thumbnail never changes, so the browser can keep it.
  return new Response(new Uint8Array(row.data), {
    headers: { "Content-Type": row.mime_type, "Cache-Control": "private, max-age=31536000, immutable" },
  });
});

// Download one chunk: looks up the message for a fresh attachment link, then streams the bytes through.
app.get("/files/:id/chunks/:index", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT chunks.message_id, files.channel_id FROM chunks
     JOIN files ON files.id = chunks.file_id
     WHERE files.id = ? AND files.owner_id = ? AND chunks.chunk_index = ?`,
  )
    .bind(c.req.param("id"), c.get("userId"), Number(c.req.param("index")))
    .first<{ message_id: string; channel_id: string }>();
  if (!row) return c.json({ error: "Chunk not found" }, 404);

  const res = await storageApi(c.env, `/channels/${row.channel_id}/messages/${row.message_id}`);
  if (!res.ok) {
    console.error("Storage lookup failed", res.status, await res.text());
    return c.json({ error: "Storage lookup failed", storageStatus: res.status }, 502);
  }
  const message = await res.json<{ attachments: { url: string }[] }>();
  const url = message.attachments[0]?.url;
  if (!url) return c.json({ error: "Chunk attachment missing" }, 502);

  const download = await fetch(url);
  if (!download.ok || !download.body) {
    return c.json({ error: "Storage download failed", status: download.status }, 502);
  }

  return new Response(download.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": download.headers.get("Content-Length") ?? "",
    },
  });
});

// Uploads that never finished (closed tab, shut-down laptop, lost connection) stay hidden in
// 'uploading' forever. Once a day, drop the records of any older than a day. As with deleting
// a file, the stored chunks are left in place.
async function cleanUpUnfinishedUploads(env: Bindings) {
  const stale = "SELECT id FROM files WHERE status != 'ready' AND created_at < datetime('now', '-1 day')";
  const [thumbnails, chunks, files] = await env.DB.batch([
    env.DB.prepare(`DELETE FROM thumbnails WHERE file_id IN (${stale})`),
    env.DB.prepare(`DELETE FROM chunks WHERE file_id IN (${stale})`),
    env.DB.prepare(stale.replace("SELECT id FROM", "DELETE FROM")),
  ]);
  console.log(
    `Cleanup: removed ${files.meta.changes} unfinished uploads, ${chunks.meta.changes} chunk rows, ${thumbnails.meta.changes} thumbnails`,
  );
}

export default {
  fetch: app.fetch,
  // Runs on the schedule in wrangler.jsonc ("triggers").
  scheduled: (_controller, env, ctx) => ctx.waitUntil(cleanUpUnfinishedUploads(env)),
} satisfies ExportedHandler<Bindings>;
