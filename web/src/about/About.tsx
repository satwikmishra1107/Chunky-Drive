// Public "How it works" page at /about, for anyone curious how Chunky Drive stores files.
// Written for non-engineers first, with the technical detail right underneath.
// Uses the app's theme colors (Light/Dark). Never name the storage provider here: it's always "the storage network".

import { useEffect, type ReactNode } from "react";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";
import { ArchitectureDiagram, DownloadDiagram, ResumeDiagram, UploadDiagram } from "./diagrams";
import "./about.css";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";

const NAV = [
  { id: "architecture", label: "Architecture" },
  { id: "upload", label: "Upload" },
  { id: "download", label: "Download" },
  { id: "security", label: "Security" },
  { id: "stack", label: "Stack" },
];

const STATS = [
  { label: "Storage", value: "Unlimited" },
  { label: "Chunk size", value: "8 MB" },
  { label: "Transfer", value: "3 parallel lanes · retry + backoff" },
  { label: "Integrity", value: "SHA-256 per chunk + per file" },
  { label: "Downloads", value: "Pause, close the tab, resume" },
  { label: "Metadata", value: "≈ 25 MB per TB stored" },
];

function Section({ id, index, label, title, lead, children }: {
  id: string;
  index: string;
  label: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="ambient-glow scroll-mt-16 border-t border-line py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-12">
        <div data-reveal className="mb-8 flex items-center gap-3 font-code text-xs tracking-wider">
          <span className="text-accent">{index}</span>
          <span className="h-px w-8 bg-line" />
          <span className="uppercase text-muted">{label}</span>
        </div>
        <h2 data-reveal className="max-w-3xl font-display text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
          {title}
        </h2>
        <p data-reveal className="mt-6 max-w-3xl text-base font-light leading-relaxed text-ink/80 sm:text-lg">
          {lead}
        </p>
        <div className="mt-14 space-y-14">{children}</div>
      </div>
    </section>
  );
}

// Numbered "under the hood" steps: a short plain line, then the technical detail.
function Steps({ steps }: { steps: { title: string; body: ReactNode }[] }) {
  return (
    <ol data-reveal className="grid gap-x-12 gap-y-8 md:grid-cols-2">
      {steps.map((step, i) => (
        <li key={step.title} className="border-t border-line pt-4">
          <div className="flex items-baseline gap-3">
            <span className="font-code text-xs text-accent">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="font-display text-lg font-semibold text-ink">{step.title}</h3>
          </div>
          <p className="mt-2 text-sm font-light leading-relaxed text-muted">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-line px-1.5 py-0.5 font-code text-[0.8em] text-ink/80">{children}</code>;
}

function Card({ tag, title, children }: { tag: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6 transition-colors duration-500 hover:border-muted/40">
      <p className="font-code text-[11px] tracking-wider text-accent">{tag}</p>
      <h3 className="mt-3 font-display text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm font-light leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function Table({ name, note, rows }: { name: string; note: string; rows: [string, string, string][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-4">
        <h3 className="font-code text-sm font-medium text-ink">{name}</h3>
        <span className="font-code text-[11px] text-muted">{note}</span>
      </div>
      <dl className="divide-y divide-line">
        {rows.map(([field, type, meaning]) => (
          <div key={field} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-4 px-5 py-3 text-sm">
            <dt className="font-code text-[12px] text-accent">
              {field}
              <span className="block text-[10px] text-muted/70">{type}</span>
            </dt>
            <dd className="font-light text-muted">{meaning}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const FAQ = [
  {
    q: "Is the storage really unlimited?",
    a: "Yes. File contents live on the storage network, which has no practical cap for us. Our own database only keeps the map — roughly 25 MB of rows for every terabyte of files — so there's no per-user quota to hit.",
  },
  {
    q: "What if a piece gets corrupted or lost on the way?",
    a: "It fails its fingerprint check and is fetched again automatically. A file is only saved once every piece, and the fingerprint of the whole file, match what was recorded at upload.",
  },
  {
    q: "What happens if my internet drops mid-download?",
    a: "The download pauses instead of failing. Every piece that already arrived and checked out stays on your device, so resuming only fetches what's missing — even after you close the tab.",
  },
  {
    q: "Is there a file size limit?",
    a: "Uploads read your file from disk one 8 MB slice at a time, so a large file needs no more memory than a small one. Downloads are reassembled in your browser's storage, so the practical limit is the free space on your device.",
  },
  {
    q: "Can I organise files into folders?",
    a: "Yes — folders inside folders, as deep as you like. Moving files or whole folders is instant whatever their size, because only the map in the database changes; the stored pieces never move.",
  },
  {
    q: "Who can see my files?",
    a: "Only your account. Every request is checked against your session, and every database lookup is filtered to files you own — asking for someone else's file simply returns “not found”.",
  },
];

export default function About() {
  useEffect(() => {
    document.title = "How it works · Chunky Drive";

    // Fade sections up as they come into view.
    const items = document.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="about min-h-dvh bg-bg font-body text-ink antialiased">
      <link rel="stylesheet" href={FONTS} precedence="default" />

      <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6 md:px-12">
          <a href="#top" className="flex items-center gap-2.5">
            <Logo className="size-6 text-accent" />
            <span className="font-display text-sm font-semibold tracking-tight text-ink">Chunky Drive</span>
          </a>
          <nav className="flex items-center gap-4 text-sm sm:gap-7">
            {NAV.map((item) => (
              <a key={item.id} href={`#${item.id}`} className="hidden text-muted transition-colors hover:text-ink lg:inline">
                {item.label}
              </a>
            ))}
            <a
              href="/"
              className="group inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-1.5 text-ink/80 transition-colors hover:border-accent/60 hover:text-ink"
            >
              Open Drive
              <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="ambient-glow pb-24 pt-36 md:pb-32 md:pt-44">
          <div className="mx-auto grid max-w-6xl gap-14 px-4 sm:px-6 md:px-12 lg:grid-cols-12 lg:gap-16">
            <div className="space-y-6 lg:col-span-7">
              <div data-reveal className="flex flex-wrap items-center gap-3 font-code text-xs text-muted">
                <span className="text-accent">01</span>
                <span>2026</span>
                <span>· Distributed file storage</span>
              </div>
              <h1 data-reveal className="font-display text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
                Chunky Drive
              </h1>
              <p data-reveal className="font-display text-xl font-medium leading-snug text-ink/80 sm:text-2xl">
                Unlimited cloud storage — without running a single storage server.
              </p>
              <p data-reveal className="text-base font-light leading-relaxed text-ink/80">
                Chunky Drive works like any cloud drive: sign in, drop in a file, download it anywhere. Behind the
                scenes, every file is cut into 8 MB pieces, fingerprinted, and spread across a third-party storage
                network. Our own database keeps only a map of where each piece lives — so the space available to you is
                effectively unlimited.
              </p>
              <p data-reveal className="text-base font-light leading-relaxed text-ink/80">
                This page walks through exactly how that works, from the moment a file leaves your browser to the
                moment it comes back, byte-for-byte identical.
              </p>
              <div data-reveal className="flex flex-wrap items-center gap-6 pt-2 text-sm">
                <a
                  href="/"
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-medium text-accent-ink transition-colors hover:opacity-90"
                >
                  Start storing files
                  <ArrowUpRight className="size-4" />
                </a>
                <a href="#architecture" className="group inline-flex items-center gap-2 text-ink/80 transition-colors hover:text-ink">
                  See how it works
                  <ArrowDown className="size-3.5 transition-transform group-hover:translate-y-0.5" />
                </a>
              </div>
            </div>

            <dl data-reveal className="grid grid-cols-2 content-center gap-x-8 gap-y-6 lg:col-span-5">
              {STATS.map((stat) => (
                <div key={stat.label} className="border-t border-line pt-3">
                  <dt className="font-code text-[11px] tracking-wide text-muted">{stat.label}</dt>
                  <dd className={`mt-1 text-ink ${stat.label === "Storage" ? "font-display text-2xl font-semibold text-accent" : "text-sm"}`}>
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <Section
          id="architecture"
          index="02"
          label="Architecture"
          title="Four moving parts, one job each."
          lead="Your browser does the heavy lifting, a small server at the edge holds the keys and checks who you are, the storage network holds the bytes, and a database remembers where every piece went. No part ever needs the whole file in one place."
        >
          <div data-reveal>
            <ArchitectureDiagram />
          </div>
          <div data-reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card tag="CLIENT" title="Your browser">
              Splits, fingerprints and reassembles files with the Web Crypto API. Each 8 MB slice is read from disk only
              when it's being sent, so big files never sit in memory.
            </Card>
            <Card tag="EDGE" title="Edge API">
              A Cloudflare Worker (Hono) running close to you. Checks your session on every request, holds the storage
              credentials, and streams chunks through without buffering them.
            </Card>
            <Card tag="STORAGE" title="Storage network">
              A third-party network built for files. Each chunk is stored as its own object and addressed by an ID.
              Capacity is the network's concern, not ours — that's where “unlimited” comes from.
            </Card>
            <Card tag="METADATA" title="Database">
              Cloudflare D1 (SQLite at the edge). Holds file records, the ordered chunk map and every fingerprint — never
              a single byte of file content.
            </Card>
          </div>
        </Section>

        <Section
          id="upload"
          index="03"
          label="Upload"
          title="Upload: slice, fingerprint, send three at a time."
          lead="When you drop a file in, your browser cuts it into 8 MB pieces, gives each piece a unique fingerprint, and sends three pieces at once. If a piece doesn't make it, it quietly tries again. The file only appears in your drive once every piece has arrived."
        >
          <div data-reveal>
            <UploadDiagram />
          </div>
          <Steps
            steps={[
              {
                title: "Reserve",
                body: (
                  <>
                    <Code>POST /api/files</Code> with name and size. The Worker creates a file record in the{" "}
                    <Code>uploading</Code> state inside the folder you're in, picks a storage bucket for all of its chunks, and replies with the file
                    ID, chunk size and chunk count.
                  </>
                ),
              },
              {
                title: "Slice",
                body: (
                  <>
                    <Code>Blob.slice()</Code> reads just one chunk's bytes from disk at a time, so a 10 GB upload uses
                    about as much memory as a 10 MB one.
                  </>
                ),
              },
              {
                title: "Fingerprint",
                body: (
                  <>
                    Each chunk is hashed with SHA-256 through <Code>crypto.subtle</Code>, and the hash travels with the
                    chunk in an <Code>X-Chunk-Hash</Code> header.
                  </>
                ),
              },
              {
                title: "Send",
                body: (
                  <>
                    A pool of three lanes <Code>PUT</Code>s chunks in parallel, retrying failures up to five times with a
                    growing 1–4 s pause. The Worker checks ownership, index range, size (≤ 8 MB) and hash format, then
                    streams the chunk straight through to the storage network without buffering it.
                  </>
                ),
              },
              {
                title: "Record",
                body: (
                  <>
                    The chunk's object ID and hash are written to D1 as an upsert keyed on{" "}
                    <Code>(file_id, chunk_index)</Code>, so a retried chunk replaces its earlier row instead of
                    duplicating it.
                  </>
                ),
              },
              {
                title: "Seal",
                body: (
                  <>
                    The browser sends the file hash — SHA-256 of all chunk hashes in order. The Worker confirms the chunk
                    count and total bytes match before flipping the file to <Code>ready</Code>. Half-finished uploads never
                    show up.
                  </>
                ),
              },
            ]}
          />
        </Section>

        <Section
          id="download"
          index="04"
          label="Download"
          title="Download: every piece checked before it counts."
          lead="Downloading runs the same trip in reverse. Each piece is fingerprinted again the moment it arrives; if anything doesn't match, that one piece is fetched again. You only get the file once all of it checks out."
        >
          <div data-reveal>
            <DownloadDiagram />
          </div>
          <Steps
            steps={[
              {
                title: "Check the map",
                body: (
                  <>
                    The browser fetches the ordered chunk list and recomputes the file hash from it. If that doesn't
                    match the hash sealed at upload, it stops before downloading a single byte.
                  </>
                ),
              },
              {
                title: "Resolve",
                body: (
                  <>
                    For each chunk, the Worker looks up its object ID, asks the storage network for a fresh link, and
                    streams the response body straight through to the browser.
                  </>
                ),
              },
              {
                title: "Verify",
                body: (
                  <>
                    The browser SHA-256s every chunk as it lands. A mismatch throws, and the same retry loop fetches that
                    chunk again — up to five attempts — while the other lanes keep going.
                  </>
                ),
              },
              {
                title: "Assemble",
                body: (
                  <>
                    Verified chunks are written to IndexedDB. When all are present they're joined in order into one{" "}
                    <Code>Blob</Code>, saved straight to your Downloads folder, and the temporary copy is cleared.
                  </>
                ),
              },
            ]}
          />
        </Section>

        <Section
          id="resume"
          index="05"
          label="Resume"
          title="Pause, close the tab, come back tomorrow."
          lead="Because verified pieces are saved on your device as they arrive, a download can stop at any moment and pick up exactly where it left off — after a pause, a closed tab, or a dropped connection."
        >
          <div data-reveal className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <ResumeDiagram />
            </div>
            <ul className="space-y-5 lg:col-span-5">
              {[
                ["Pause", "An AbortController stops in-flight requests; nothing already verified is thrown away."],
                ["Offline", "If the connection drops, the download is marked paused, not failed."],
                ["Reopen", "Unfinished jobs are restored from IndexedDB and shown as paused when you return."],
                ["Resume", "Only the missing chunk indexes are requested — finished work is never repeated."],
                ["Uploads", "Pause and resume too while the tab is open: the server already records every chunk it receives, so resuming sends only the rest. Closing the tab cancels them, and a daily job sweeps up any that slip through."],
                ["Many tabs", "A BroadcastChannel shares live progress, so a second tab shows transfers running in the first."],
              ].map(([title, body]) => (
                <li key={title} className="border-t border-line pt-3">
                  <p className="font-code text-[11px] tracking-wide text-accent">{title}</p>
                  <p className="mt-1 text-sm font-light leading-relaxed text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section
          id="data"
          index="06"
          label="Data model"
          title="Three tables hold the whole system together."
          lead="The database never stores file contents. It keeps one record per file, one small row per piece, and the folder tree — just enough to find, order and verify every byte, and to show it where you put it."
        >
          <div data-reveal className="grid items-start gap-6 lg:grid-cols-2">
            <Table
              name="files"
              note="one row per file"
              rows={[
                ["id", "uuid · pk", "The file's ID."],
                ["owner_id", "text", "Who it belongs to. Every query filters on this."],
                ["name · size · mime_type", "text · int · text", "What you see in the drive."],
                ["bucket_id", "text", "Where on the storage network all of its chunks live."],
                ["chunk_count", "int", "How many pieces to expect."],
                ["file_hash", "sha-256", "Hash of the ordered chunk hashes, set when the upload is sealed."],
                ["folder_id", "fk → folders", "The folder it sits in; empty means the top of My Drive."],
                ["status", "enum", "uploading → ready (or failed)."],
              ]}
            />
            <div className="grid gap-6">
              <Table
                name="chunks"
                note="one row per 8 MB piece · cascades on delete"
                rows={[
                  ["file_id", "fk → files", "Which file this piece belongs to."],
                  ["chunk_index", "int", "Its position. (file_id, chunk_index) is the primary key."],
                  ["object_id", "text", "Where the piece sits on the storage network."],
                  ["chunk_hash", "sha-256", "The fingerprint checked on every download."],
                  ["size", "int", "Bytes in this piece (the last one is usually smaller)."],
                ]}
              />
              <Table
                name="folders"
                note="one row per folder · nests through parent_id"
                rows={[
                  ["id", "uuid · pk", "The folder's ID."],
                  ["owner_id", "text", "Who it belongs to."],
                  ["parent_id", "fk → folders", "The folder it sits in; deleting a folder removes everything below it."],
                  ["name", "text", "Unique among its neighbours, ignoring case — a clash becomes “Photos (1)”."],
                ]}
              />
            </div>
          </div>
          <dl data-reveal className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
            {[
              ["Per chunk row", "≈ 180 bytes"],
              ["Per terabyte stored", "≈ 25 MB of metadata"],
              ["Storage IDs", "Kept as TEXT — too large for a JS number"],
            ].map(([label, value]) => (
              <div key={label} className="border-t border-line pt-3">
                <dt className="font-code text-[11px] tracking-wide text-muted">{label}</dt>
                <dd className="mt-1 text-sm text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          id="security"
          index="07"
          label="Security"
          title="Keys stay on the server. Files stay yours."
          lead="Nobody's browser ever sees the storage credentials. Every request is checked against your session, every lookup is filtered to your account, and your password never leaves your device in a readable form."
        >
          <div data-reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card tag="CREDENTIALS" title="Server-side only">
              Storage credentials live as encrypted Worker secrets. The browser only ever talks to{" "}
              <span className="font-code text-ink/80">/api</span> on the same domain.
            </Card>
            <Card tag="ACCESS" title="Scoped to the owner">
              Every route requires a valid session and every query includes the owner's ID — someone else's file ID
              returns 404, not their data.
            </Card>
            <Card tag="PASSWORDS" title="Stretched in the browser">
              PBKDF2-SHA-256 with 600,000 rounds runs on your device before anything is sent. The server adds a random
              16-byte salt and a SHA-256, and compares in constant time.
            </Card>
            <Card tag="SIGN-IN" title="Google or email">
              Google OAuth, or email and password with 6-digit codes for verifying accounts and resetting passwords. Codes
              are stored hashed and expire after 10 minutes.
            </Card>
            <Card tag="SESSIONS" title="Fast and signed">
              A signed session cookie is cached for 5 minutes, so checking who you are on every chunk request doesn't hit
              the database each time.
            </Card>
            <Card tag="INTEGRITY" title="Two layers of hashing">
              A fingerprint per chunk catches a damaged piece; a fingerprint over all of them catches a missing,
              swapped or reordered one.
            </Card>
          </div>
        </Section>

        <Section
          id="stack"
          index="08"
          label="Stack"
          title="Serverless, at the edge, end to end."
          lead="There's no server to patch and no disk to fill. The page and the API are served from Cloudflare's network, and every push to main is built and deployed automatically."
        >
          <div data-reveal className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Frontend", ["React 19", "TypeScript", "Vite", "Tailwind CSS v4"]],
              ["In the browser", ["Web Crypto (SHA-256, PBKDF2)", "IndexedDB", "BroadcastChannel", "OffscreenCanvas thumbnails"]],
              ["Edge", ["Cloudflare Workers", "Hono", "Better Auth", "Cron Triggers", "Transactional email"]],
              ["Data & delivery", ["Cloudflare D1 (SQLite)", "Third-party storage network", "Workers Builds CI/CD", "Custom domain + TLS"]],
            ].map(([group, items]) => (
              <div key={group as string} className="border-t border-line pt-3">
                <p className="font-code text-[11px] tracking-wide text-accent">{group}</p>
                <ul className="mt-3 space-y-2 text-sm font-light text-ink/80">
                  {(items as string[]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="faq"
          index="09"
          label="FAQ"
          title="Questions people usually ask."
          lead="The short answers, without the diagrams."
        >
          <div data-reveal className="divide-y divide-line border-y border-line">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-display text-lg font-medium text-ink">
                  {item.q}
                  <span className="font-code text-accent transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm font-light leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </Section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 font-code text-xs text-muted sm:px-6 md:px-12">
          <span>Designed and built by Satwik Mishra</span>
          <a href="/" className="text-ink/80 transition-colors hover:text-ink">
            chunkydrive.satwikdevs.in ↗
          </a>
        </div>
      </footer>
    </div>
  );
}
