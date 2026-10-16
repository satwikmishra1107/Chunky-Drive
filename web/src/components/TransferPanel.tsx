import { useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, Download, LoaderCircle, Pause, Play, Upload, X } from "lucide-react";
import { formatBytes, formatDuration } from "../lib/format";
import ChunkBar from "./ChunkBar";

export type Transfer = {
  id: string;
  kind: "upload" | "download";
  name: string;
  size: number;
  done: number;
  // Bytes already done when this run started (a resumed download), so speed and time left
  // only count what this run moved.
  startDone?: number;
  // How full each chunk is (0 to 1), for the chunked progress bar.
  chunks?: number[];
  // Running in another open tab (see lib/sharedTransfers.ts).
  remote?: boolean;
  startedAt: number;
  status: "queued" | "active" | "paused" | "done" | "error";
  error?: string;
};

type Props = {
  transfers: Transfer[];
  onClear: () => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
};

function statusLine(t: Transfer): string {
  const line = progressLine(t);
  return t.remote ? `In another tab · ${line}` : line;
}

function progressLine(t: Transfer): string {
  if (t.status === "queued") return "Waiting…";
  if (t.status === "done") return t.kind === "upload" ? "Uploaded" : "Downloaded";
  if (t.status === "error") return t.error ?? "Failed";
  if (t.status === "paused") return `Paused · ${formatBytes(t.done)} of ${formatBytes(t.size)}`;
  const elapsed = (Date.now() - t.startedAt) / 1000;
  const speed = (t.done - (t.startDone ?? 0)) / elapsed;
  const eta = speed > 0 ? (t.size - t.done) / speed : Infinity;
  return `${formatBytes(t.done)} of ${formatBytes(t.size)} · ${formatDuration(eta)}`;
}

const iconButton = "shrink-0 rounded-full p-1.5 text-muted transition hover:bg-hover hover:text-ink";

export default function TransferPanel({ transfers, onClear, onPause, onResume, onCancel }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  if (transfers.length === 0) return null;

  const busy = transfers.filter((t) => t.status === "active" || t.status === "queued").length;
  const paused = transfers.filter((t) => t.status === "paused").length;
  const failed = transfers.filter((t) => t.status === "error").length;
  const plural = (n: number) => (n > 1 ? "s" : "");
  const title = busy
    ? `${busy} transfer${plural(busy)} in progress`
    : paused
      ? `${paused} download${plural(paused)} paused`
      : failed
        ? `${failed} transfer${plural(failed)} failed`
        : `${transfers.length} transfer${plural(transfers.length)} complete`;

  return (
    <div className="fixed bottom-0 right-4 z-20 w-[calc(100%-2rem)] overflow-hidden rounded-t-2xl border border-b-0 border-line bg-surface shadow-[0_8px_32px_rgba(0,0,0,0.18)] sm:right-6 sm:w-[380px]">
      <div className="flex items-center gap-1 bg-raised py-2 pl-5 pr-2">
        <span className="flex-1 text-sm font-semibold">{title}</span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-full p-2 hover:bg-hover"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          <ChevronDown className={`size-5 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
        {/* Clears finished items; paused downloads stay until resumed or cancelled. */}
        <button
          onClick={onClear}
          disabled={busy > 0 || transfers.every((t) => t.status === "paused")}
          className="rounded-full p-2 hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Clear finished"
        >
          <X className="size-5" />
        </button>
      </div>

      {!collapsed && (
        <ul className="max-h-72 overflow-y-auto py-1">
          {transfers.map((t) => {
            // Only the tab running a transfer can pause, resume or cancel it.
            const controllable = !t.remote;
            return (
              <li key={t.id} className="flex items-center gap-3 py-2.5 pl-5 pr-3">
                {t.kind === "upload" ? (
                  <Upload className="size-4 shrink-0 text-muted" />
                ) : (
                  <Download className="size-4 shrink-0 text-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{t.name}</div>
                  <div className={`truncate text-xs ${t.status === "error" ? "text-danger" : "text-muted"}`}>
                    {statusLine(t)}
                  </div>
                  {(t.status === "active" || t.status === "paused") && <ChunkBar chunks={t.chunks ?? []} />}
                </div>

                {controllable && t.status === "active" && (
                  <button onClick={() => onPause(t.id)} className={iconButton} aria-label={`Pause ${t.name}`} title="Pause">
                    <Pause className="size-4" />
                  </button>
                )}
                {controllable && t.status === "paused" && (
                  <button onClick={() => onResume(t.id)} className={iconButton} aria-label={`Resume ${t.name}`} title="Resume">
                    <Play className="size-4" />
                  </button>
                )}
                {controllable && (t.status === "active" || t.status === "paused") && (
                  <button
                    onClick={() => onCancel(t.id)}
                    className={`${iconButton} hover:text-danger`}
                    aria-label={`Cancel ${t.name}`}
                    title="Cancel"
                  >
                    <X className="size-4" />
                  </button>
                )}

                {t.status === "active" && !controllable && (
                  <LoaderCircle className="size-5 shrink-0 animate-spin text-accent" />
                )}
                {t.status === "done" && <CircleCheck className="size-5 shrink-0 text-emerald-500" />}
                {t.status === "error" && <CircleAlert className="size-5 shrink-0 text-danger" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
