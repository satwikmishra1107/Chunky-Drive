// Animated SVG diagrams for the "How it works" page. Animations live in about.css.
// Animated groups are positioned with x/y, never a transform attribute: the CSS
// animation sets `transform` and would overwrite it.

import type { CSSProperties, ReactNode } from "react";

const MONO = "JetBrains Mono, ui-monospace, monospace";
const DISPLAY = "Space Grotesk, sans-serif";

const vars = (v: Record<string, string>) => v as CSSProperties;

// Diagrams keep a readable size on phones by scrolling sideways inside their frame.
function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="overflow-x-auto rounded-xl border border-line bg-surface glow-shadow">
      <div className="min-w-[620px] diagram-bg p-4 sm:p-6">
        {children}
      </div>
      <figcaption className="border-t border-line px-5 py-3 font-code text-[11px] text-muted">
        {label}
        <span className="text-accent sm:hidden"> · swipe to see all →</span>
      </figcaption>
    </figure>
  );
}

function Node({ x, y, w, h, tag, title, sub, hot = false }: {
  x: number;
  y: number;
  w: number;
  h: number;
  tag: string;
  title: string;
  sub: string;
  hot?: boolean;
}) {
  const cx = x + w / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} className={`fill-surface ${hot ? "stroke-accent/60" : "stroke-line"}`} />
      <text x={x + 14} y={y + 24} className="fill-accent" fontFamily={MONO} fontSize={10} letterSpacing={1}>
        {tag}
      </text>
      <text x={cx} y={y + h / 2 + 8} textAnchor="middle" className="fill-ink" fontFamily={DISPLAY} fontSize={17} fontWeight={600}>
        {title}
      </text>
      <text x={cx} y={y + h / 2 + 30} textAnchor="middle" className="fill-muted" fontFamily={MONO} fontSize={11}>
        {sub}
      </text>
    </g>
  );
}

// A small chunk travelling along a straight line.
function Piece({ x, y, w = 14, h = 8, dx = 0, dy = 0, delay, dur = 2.4 }: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  dx?: number;
  dy?: number;
  delay: number;
  dur?: number;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={2}
      className="flow fill-accent"
      style={vars({ "--dx": `${dx}px`, "--dy": `${dy}px`, "--delay": `${delay}s`, "--dur": `${dur}s` })}
    />
  );
}

export function ArchitectureDiagram() {
  // Boxes: browser, edge, storage across the top; metadata DB under the edge.
  const gaps = [
    { from: 180, to: 300, up: "upload", down: "download" },
    { from: 460, to: 580, up: "store", down: "fetch" },
  ];
  return (
    <Frame label="fig. 1 — system overview · chunks flow left to right on upload, right to left on download">
      <svg viewBox="0 0 760 380" className="block w-full" role="img" aria-label="Your browser sends chunks to the Edge API, which stores them on the storage network and records each one in the metadata database.">
        {gaps.map((g) => (
          <g key={g.from}>
            <line x1={g.from} y1={150} x2={g.to} y2={150} className="stroke-line" strokeWidth={2} />
            <line x1={g.from} y1={190} x2={g.to} y2={190} className="stroke-line" strokeWidth={2} />
            <text x={(g.from + g.to) / 2} y={136} textAnchor="middle" className="fill-muted" fontFamily={MONO} fontSize={11}>
              {g.up} →
            </text>
            <text x={(g.from + g.to) / 2} y={214} textAnchor="middle" className="fill-muted" fontFamily={MONO} fontSize={11}>
              ← {g.down}
            </text>
            {[0, 0.8, 1.6].map((d) => (
              <Piece key={`u${d}`} x={g.from + 2} y={146} dx={g.to - g.from - 18} delay={d} />
            ))}
            {[0.4, 1.2, 2.0].map((d) => (
              <Piece key={`d${d}`} x={g.to - 16} y={186} dx={-(g.to - g.from - 18)} delay={d} />
            ))}
          </g>
        ))}

        <line x1={380} y1={225} x2={380} y2={290} className="stroke-line" strokeWidth={2} strokeDasharray="4 5" />
        <text x={394} y={262} className="fill-muted" fontFamily={MONO} fontSize={11}>
          object ID + SHA-256
        </text>
        {[0, 1.2].map((d) => (
          <Piece key={d} x={376} y={228} w={8} h={10} dy={50} delay={d} />
        ))}

        <Node x={20} y={115} w={160} h={110} tag="CLIENT" title="Your browser" sub="split · hash · verify" />
        <Node x={300} y={115} w={160} h={110} tag="EDGE" title="Edge API" sub="auth · keys · stream" hot />
        <Node x={580} y={115} w={160} h={110} tag="STORAGE" title="Storage network" sub="third-party · unlimited" />
        <Node x={300} y={290} w={160} h={80} tag="METADATA" title="Database" sub="the map, not the bytes" />

        <text x={20} y={40} className="fill-muted" fontFamily={MONO} fontSize={11}>
          one file → many 8 MB chunks → anywhere on the network
        </text>
        <text x={740} y={40} textAnchor="end" className="fill-accent" fontFamily={MONO} fontSize={11}>
          storage keys never reach the browser
        </text>
      </svg>
    </Frame>
  );
}

const HASHES = ["9f2c…", "41ab…", "e07d…", "c3f1…", "5a90…", "b8e4…", "07dd…", "f16a…"];
const SEG = 85;

export function UploadDiagram() {
  const lanes = [
    { y: 180, chunks: [0, 3, 6] },
    { y: 225, chunks: [1, 4, 7] },
    { y: 270, chunks: [2, 5] },
  ];
  return (
    <Frame label="fig. 2 — upload · each chunk is read from disk, fingerprinted, and sent on one of three lanes">
      <svg viewBox="0 0 720 330" className="block w-full" role="img" aria-label="A 64 MB file is split into eight 8 MB chunks, each gets a SHA-256 fingerprint, and the chunks travel to the Edge API three at a time.">
        <text x={20} y={24} className="fill-muted" fontFamily={MONO} fontSize={11}>
          photo-archive.zip · 64 MB
        </text>
        <text x={700} y={24} textAnchor="end" className="fill-muted" fontFamily={MONO} fontSize={11}>
          8 chunks × 8 MB
        </text>

        <rect x={20} y={36} width={680} height={44} rx={8} className="fill-surface stroke-muted/40" />
        {HASHES.slice(1).map((_, i) => (
          <line key={i} x1={20 + SEG * (i + 1)} y1={36} x2={20 + SEG * (i + 1)} y2={80} className="stroke-muted/40" strokeDasharray="3 4" />
        ))}
        <rect x={20} y={36} width={SEG} height={44} rx={6} className="scan fill-accent/15 stroke-accent/70" />
        {HASHES.map((hash, i) => (
          <g key={hash}>
            <text x={20 + SEG * i + SEG / 2} y={63} textAnchor="middle" className="fill-muted" fontFamily={MONO} fontSize={12}>
              #{i}
            </text>
            <text
              className="hash fill-muted"
              x={20 + SEG * i + SEG / 2}
              y={104}
              textAnchor="middle"
              
              fontFamily={MONO}
              fontSize={11}
              style={vars({ "--delay": `${i * 0.6}s` })}
            >
              {hash}
            </text>
          </g>
        ))}
        <text x={20} y={134} className="fill-accent" fontFamily={MONO} fontSize={10} letterSpacing={1}>
          SHA-256 PER CHUNK ↑ · 3 PARALLEL LANES ↓
        </text>

        {lanes.map((lane, l) => (
          <g key={lane.y}>
            <line x1={20} y1={lane.y} x2={540} y2={lane.y} className="stroke-line" strokeWidth={2} />
            {lane.chunks.map((n, k) => (
              <g key={n} className="flow" style={vars({ "--dx": "470px", "--delay": `${l * 0.4 + k * 1.2}s`, "--dur": "3.6s" })}>
                <rect x={22} y={lane.y - 12} width={44} height={24} rx={5} className="fill-accent-soft stroke-accent/80" />
                <text x={44} y={lane.y + 4} textAnchor="middle" className="fill-ink" fontFamily={MONO} fontSize={11}>
                  #{n}
                </text>
              </g>
            ))}
          </g>
        ))}

        <Node x={540} y={155} w={160} h={140} tag="EDGE" title="Edge API" sub="validate → store" hot />
        <text x={620} y={318} textAnchor="middle" className="fill-muted" fontFamily={MONO} fontSize={10}>
          object ID + hash → database
        </text>
        <text x={20} y={318} className="fill-muted" fontFamily={MONO} fontSize={10}>
          a failed send retries after 1 s, then 2 s
        </text>
      </svg>
    </Frame>
  );
}

export function DownloadDiagram() {
  const W = 79;
  return (
    <Frame label="fig. 3 — download · every chunk is re-hashed on arrival; a bad one is fetched again on its own">
      <svg viewBox="0 0 720 240" className="block w-full" role="img" aria-label="Chunks arrive and drop into place. One fails its fingerprint check, is fetched again, and once every chunk and the whole-file fingerprint match, the file is saved.">
        <text x={20} y={30} className="fill-muted" fontFamily={MONO} fontSize={11}>
          ↓ from the Edge API, 3 at a time
        </text>
        <text x={700} y={30} textAnchor="end" className="fill-muted" fontFamily={MONO} fontSize={11}>
          browser storage (IndexedDB)
        </text>

        {HASHES.map((_, i) => {
          const x = 20 + SEG * i;
          // Chunk 5 arrives corrupted first, so its good copy lands a little later.
          const delay = i === 5 ? 3.9 : i * 0.6;
          return (
            <g key={i}>
              <rect x={x} y={70} width={W} height={52} rx={7} fill="none" className="stroke-line" strokeDasharray="4 4" />
              <g className="slot" style={vars({ "--delay": `${delay}s` })}>
                <rect x={x} y={70} width={W} height={52} rx={7} className="fill-accent-soft stroke-accent/80" />
                <text x={x + W / 2} y={93} textAnchor="middle" className="fill-ink" fontFamily={MONO} fontSize={12}>
                  #{i}
                </text>
                <text x={x + W / 2} y={111} textAnchor="middle" className="fill-accent" fontFamily={MONO} fontSize={10}>
                  ✓ {HASHES[i]}
                </text>
              </g>
            </g>
          );
        })}

        <g className="bad">
          <rect x={20 + SEG * 5} y={70} width={W} height={52} rx={7} className="fill-danger/10 stroke-danger" />
          <text x={20 + SEG * 5 + W / 2} y={93} textAnchor="middle" className="fill-ink" fontFamily={MONO} fontSize={12}>
            #5
          </text>
          <text x={20 + SEG * 5 + W / 2} y={111} textAnchor="middle" className="fill-danger" fontFamily={MONO} fontSize={10}>
            ✕ 2d71…
          </text>
        </g>
        <text className="bad-note fill-danger" x={20 + SEG * 5 + W / 2} y={146} textAnchor="middle"  fontFamily={MONO} fontSize={10}>
          mismatch → fetch again
        </text>

        <rect className="done stroke-accent" x={14} y={64} width={692} height={64} rx={10} fill="none" strokeWidth={1.5} />

        <line x1={20} y1={180} x2={700} y2={180} className="stroke-line" />
        <text className="waiting fill-muted" x={20} y={210}  fontFamily={MONO} fontSize={12}>
          waiting for every chunk to pass its check…
        </text>
        <text className="done fill-accent" x={20} y={210}  fontFamily={MONO} fontSize={12}>
          ✓ file hash matches · joined in order · saved to Downloads
        </text>
      </svg>
    </Frame>
  );
}

// Paused download: verified chunks are already on disk, the rest are fetched on resume.
export function ResumeDiagram() {
  const total = 16;
  const saved = 10;
  return (
    <figure className="rounded-xl border border-line bg-surface glow-shadow">
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 font-code text-[11px]">
          <span className="text-muted">lecture-recordings.mp4 · 128 MB</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 px-2.5 py-1 text-accent">
            <span className="flex gap-0.5">
              <span className="h-2.5 w-0.5 bg-accent" />
              <span className="h-2.5 w-0.5 bg-accent" />
            </span>
            paused · 62%
          </span>
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <div
              key={i}
              className={`flex h-9 items-center justify-center rounded-md border font-code text-[10px] ${
                i < saved
                  ? "border-accent/60 bg-accent-soft text-ink/80"
                  : "pending border-dashed border-line text-muted"
              }`}
            >
              #{i}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-code text-[11px] text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-sm border border-accent/60 bg-accent-soft" /> verified, saved on this device
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-sm border border-dashed border-line" /> fetched when you press resume
          </span>
        </div>
      </div>
      <figcaption className="border-t border-line px-5 py-3 font-code text-[11px] text-muted">
        fig. 4 — resume · only the missing chunks are downloaded again
      </figcaption>
    </figure>
  );
}
