# Chunky Drive

A Google-Drive-style file store that keeps files as 8 MB chunks in Discord channels.

```
web/      React page (Vite + Tailwind): upload, download, delete
worker/   Cloudflare Worker (Hono): talks to Discord and the D1 database
```

## How it works

- The browser splits a file into 8 MB chunks, hashes each one (SHA-256), and uploads 3 at a time.
- The Worker posts each chunk to a Discord channel and saves its message ID and hash in D1.
- Downloads fetch chunks by message ID, check every hash, and write them back in order.
- File hash = SHA-256 of the chunk hashes joined in order.

## Running locally

```
cd worker && npm install && npm run dev    # API on http://localhost:8787
cd web && npm install && npm run dev       # page on http://localhost:5173
```

The Worker needs `worker/.dev.vars` (see `.dev.vars.example`) with the bot token,
and the D1 database and channel IDs in `worker/wrangler.jsonc`.
The table layout is in `worker/schema.sql`.

`npm run roundtrip -- <file> [parallel]` in `worker/` tests an upload and download without the page.
