import { useCallback, useEffect, useRef, useState } from "react";
import { CloudUpload, HardDrive, Info, Infinity as InfinityIcon, LayoutGrid, List, Plus, Search } from "lucide-react";
import FileCard from "./components/FileCard";
import ConfirmDialog from "./components/ConfirmDialog";
import FileList from "./components/FileList";
import Logo from "./components/Logo";
import ThemeToggle from "./components/ThemeToggle";
import UserMenu from "./components/UserMenu";
import type { SessionUser } from "./lib/auth";
import TransferPanel, { type Transfer } from "./components/TransferPanel";
import { useSharedTransfers } from "./lib/sharedTransfers";
import { deleteFile, listFiles, type FileSummary } from "./lib/api";
import { formatBytes } from "./lib/format";
import { deleteJob, listJobs, type DownloadJob } from "./lib/downloadStore";
import {
  createDownloadJob,
  createUploadJob,
  PausedError,
  runDownload,
  runUpload,
  savedProgress,
  type UploadJob,
} from "./lib/transfer";

type View = "grid" | "list";
const VIEW_KEY = "chunky:view";

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

type Props = { user: SessionUser };

export default function Drive({ user }: Props) {
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(savedView);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FileSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Uploads run one file at a time (each file already sends 3 chunks at once).
  const uploadQueue = useRef<Promise<void>>(Promise.resolve());

  const refresh = useCallback(async () => {
    try {
      setFiles(await listFiles());
      setLoadError(null);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Transfers running in this user's other open tabs, shown alongside this tab's own.
  const { remoteTransfers, dismissFinished } = useSharedTransfers(user.id, transfers, refresh);
  // Paused downloads live in shared browser storage, so every tab already lists them itself.
  // Skip other tabs' copies of those, and hide our own copy while another tab is running it.
  const remoteShown = remoteTransfers.filter((t) => !(t.kind === "download" && t.status === "paused"));
  const runningElsewhere = new Set(remoteShown.filter((t) => t.status === "active").map((t) => t.id));
  const allTransfers = [
    ...transfers.filter((t) => !(t.status === "paused" && runningElsewhere.has(t.id))),
    ...remoteShown,
  ];

  const changeView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice just won't be remembered.
    }
  };

  const updateTransfer = (id: string, patch: Partial<Transfer>) =>
    setTransfers((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  // Uploads in this tab, by transfer id. `job` is set once the server has a record for the file.
  const uploads = useRef(new Map<string, { file: File; job?: UploadJob }>());
  const uploadControls = useRef(new Map<string, AbortController>());
  // Settles once an upload has fully stopped, so cancelling can delete its record afterwards.
  const uploadRuns = useRef(new Map<string, Promise<void>>());

  const runUploadJob = async (id: string) => {
    const entry = uploads.current.get(id);
    if (!entry || uploadControls.current.has(id)) return; // Cancelled while waiting, or already running.
    const control = new AbortController();
    uploadControls.current.set(id, control);
    updateTransfer(id, { status: "active", startedAt: Date.now(), error: undefined });
    try {
      entry.job ??= await createUploadJob(entry.file);
      let first = true;
      const run = runUpload(entry.file, entry.job, control.signal, (done, chunks) => {
        // The first report is what the server already had, so speed counts only new bytes.
        updateTransfer(id, first ? { done, chunks, startDone: done } : { done, chunks });
        first = false;
      });
      uploadRuns.current.set(id, run.then(() => {}, () => {}));
      await run;
      uploads.current.delete(id);
      updateTransfer(id, { status: "done" });
      await refresh();
    } catch (error) {
      if (error instanceof PausedError) {
        updateTransfer(id, { status: "paused" });
        return;
      }
      uploads.current.delete(id);
      updateTransfer(id, { status: "error", error: (error as Error).message });
    } finally {
      uploadControls.current.delete(id);
      uploadRuns.current.delete(id);
    }
  };

  // Uploads run one file at a time, in the order they were added.
  const queueUpload = (id: string) => {
    uploadQueue.current = uploadQueue.current.then(() => runUploadJob(id));
  };

  const addUploads = (picked: FileList | null) => {
    if (!picked?.length) return;
    for (const file of Array.from(picked)) {
      const id = crypto.randomUUID();
      uploads.current.set(id, { file });
      setTransfers((all) => [
        ...all,
        { id, kind: "upload", name: file.name, size: file.size, done: 0, startedAt: 0, status: "queued" },
      ]);
      queueUpload(id);
    }
  };

  const pauseUpload = (id: string) => uploadControls.current.get(id)?.abort();

  const resumeUpload = (id: string) => {
    if (!uploads.current.has(id) || uploadControls.current.has(id)) return;
    updateTransfer(id, { status: "queued" });
    queueUpload(id);
  };

  const cancelUpload = async (id: string) => {
    const entry = uploads.current.get(id);
    const stopped = uploadRuns.current.get(id);
    uploads.current.delete(id);
    uploadControls.current.get(id)?.abort();
    setTransfers((all) => all.filter((t) => t.id !== id));
    await stopped;
    if (entry?.job) await deleteFile(entry.job.fileId).catch(() => {});
  };

  // A closed tab can't reach the file again, so its unfinished uploads are dropped on the way
  // out. If even this doesn't get through (crash, dead battery), the Worker's daily cleanup does it.
  useEffect(() => {
    const dropUnfinished = (event: PageTransitionEvent) => {
      if (event.persisted) return; // Kept in the back/forward cache: the page may come back and resume.
      for (const { job } of uploads.current.values()) {
        if (job) fetch(`/api/files/${job.fileId}`, { method: "DELETE", keepalive: true }).catch(() => {});
      }
    };
    window.addEventListener("pagehide", dropUnfinished);
    return () => window.removeEventListener("pagehide", dropUnfinished);
  }, []);

  // Downloads use the file's id as their transfer id, so a file has at most one download.
  const downloadJobs = useRef(new Map<string, DownloadJob>());
  const downloadControls = useRef(new Map<string, AbortController>());
  // Settles once a download has fully stopped, including any chunk that was still being saved.
  const downloadRuns = useRef(new Map<string, Promise<void>>());

  const runDownloadJob = async (job: DownloadJob) => {
    const id = job.fileId;
    const control = new AbortController();
    downloadControls.current.set(id, control);
    const saved = await savedProgress(job);
    updateTransfer(id, { status: "active", startedAt: Date.now(), startDone: saved.done, ...saved, error: undefined });
    try {
      const run = runDownload(job, control.signal, (done, chunks) => updateTransfer(id, { done, chunks }));
      downloadRuns.current.set(id, run.then(() => {}, () => {}));
      await run;
      updateTransfer(id, { status: "done" });
    } catch (error) {
      if (error instanceof PausedError) {
        updateTransfer(id, { status: "paused" });
        return;
      }
      // A real failure: stop the other chunk requests and forget the saved chunks.
      control.abort();
      await deleteJob(id).catch(() => {});
      updateTransfer(id, { status: "error", error: (error as Error).message });
    } finally {
      if (downloadControls.current.get(id) === control) {
        downloadControls.current.delete(id);
        downloadRuns.current.delete(id);
      }
    }
  };

  const startDownload = async (file: FileSummary) => {
    const existing = transfers.find((t) => t.id === file.id);
    if (existing?.status === "active" || existing?.status === "queued" || runningElsewhere.has(file.id)) return;
    if (existing?.status === "paused") return resumeDownload(file.id);

    setTransfers((all) => [
      ...all.filter((t) => t.id !== file.id),
      { id: file.id, kind: "download", name: file.name, size: file.size, done: 0, startedAt: Date.now(), status: "queued" },
    ]);
    let job: DownloadJob;
    try {
      job = await createDownloadJob(file.id, user.id);
    } catch (error) {
      updateTransfer(file.id, { status: "error", error: (error as Error).message });
      return;
    }
    downloadJobs.current.set(file.id, job);
    await runDownloadJob(job);
  };

  const pauseDownload = (id: string) => downloadControls.current.get(id)?.abort();

  const resumeDownload = async (id: string) => {
    const job = downloadJobs.current.get(id);
    if (job && !downloadControls.current.has(id)) await runDownloadJob(job);
  };

  const cancelDownload = async (id: string) => {
    // Stop first. Half-downloaded chunks are simply dropped; a chunk that already arrived and
    // passed its check may still be saving, so wait for that to finish before deleting.
    const stopped = downloadRuns.current.get(id);
    downloadControls.current.get(id)?.abort();
    downloadJobs.current.delete(id);
    setTransfers((all) => all.filter((t) => t.id !== id));
    await stopped;
    await deleteJob(id).catch(() => {});
  };

  // Lists downloads saved in this browser (paused, or interrupted by a closed tab) as paused,
  // and drops paused entries whose download was finished or cancelled in another tab.
  const syncSavedDownloads = useCallback(async () => {
    let jobs: DownloadJob[];
    try {
      jobs = await listJobs(user.id);
    } catch {
      return; // Browser storage unavailable (e.g. some private modes): nothing to resume.
    }
    const entries = await Promise.all(jobs.map(async (job) => ({ job, progress: await savedProgress(job) })));
    for (const { job } of entries) downloadJobs.current.set(job.fileId, job);
    const saved = new Set(jobs.map((job) => job.fileId));

    setTransfers((all) => {
      const kept = all.filter((t) => !(t.kind === "download" && t.status === "paused" && !saved.has(t.id)));
      const known = new Set(kept.map((t) => t.id));
      const added: Transfer[] = entries
        .filter(({ job }) => !known.has(job.fileId))
        .map(({ job, progress }) => ({
          id: job.fileId,
          kind: "download",
          name: job.name,
          size: job.size,
          ...progress,
          startedAt: 0,
          status: "paused",
        }));
      return [...kept, ...added];
    });
  }, [user.id]);

  // Re-check saved downloads on open, and whenever another tab's downloads start, stop or finish.
  const remoteDownloadState = remoteTransfers
    .filter((t) => t.kind === "download")
    .map((t) => `${t.id}:${t.status}`)
    .join(",");
  useEffect(() => {
    syncSavedDownloads();
  }, [syncSavedDownloads, remoteDownloadState]);

  const confirmDelete = async () => {
    const file = pendingDelete;
    if (!file) return;
    setPendingDelete(null);
    // Hide it straight away; put the list back from the server if the delete fails.
    setFiles((all) => all.filter((f) => f.id !== file.id));
    try {
      await deleteFile(file.id);
    } catch (error) {
      alert(`Couldn't delete "${file.name}": ${(error as Error).message}`);
      await refresh();
    }
  };

  const visible = files.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()));
  const usedBytes = files.reduce((sum, f) => sum + f.size, 0);
  const openPicker = () => inputRef.current?.click();

  const viewButton = (value: View, label: string, Icon: typeof List) => (
    <button
      onClick={() => changeView(value)}
      aria-label={label}
      aria-pressed={view === value}
      className={`rounded-full p-2 transition ${view === value ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"}`}
    >
      <Icon className="size-4" />
    </button>
  );

  return (
    <div
      className="flex h-dvh flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addUploads(e.dataTransfer.files);
      }}
    >
      <header className="flex h-16 shrink-0 items-center gap-4 px-4 md:px-5">
        <div className="flex shrink-0 items-center gap-2.5 md:w-56">
          <Logo className="size-8 text-accent" busy={allTransfers.some((t) => t.status === "active")} />
          <span className="hidden text-xl font-extrabold tracking-tight sm:inline">
            Shie<span className="text-accent">drive</span>
          </span>
        </div>
        <label className="flex h-11 max-w-2xl flex-1 items-center gap-3 rounded-full border border-transparent bg-raised px-4 transition focus-within:border-accent/50 focus-within:bg-surface">
          <Search className="size-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your files"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm"
          />
        </label>
        <a
          href="/about"
          title="How Shie Drive works"
          className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-2 text-sm font-semibold text-accent transition hover:bg-accent-soft lg:px-3"
        >
          <Info className="size-4" />
          <span className="hidden lg:inline">How Shie Drive works?</span>
        </a>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <ThemeToggle />
          <UserMenu user={user} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col px-3 pb-4 md:flex">
          <button
            onClick={openPicker}
            className="mb-5 flex w-fit items-center gap-2.5 rounded-2xl bg-accent px-5 py-3.5 font-semibold text-accent-ink shadow-md shadow-accent/25 transition hover:brightness-105 active:scale-[0.98]"
          >
            <Plus className="size-5" strokeWidth={2.5} />
            New
          </button>
          <nav>
            <div className="flex items-center gap-3 rounded-full bg-accent-soft px-4 py-2 text-sm font-semibold text-accent">
              <HardDrive className="size-4" />
              My Drive
            </div>
          </nav>
          <div className="mt-auto rounded-2xl bg-raised p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <InfinityIcon className="size-4 text-accent" />
              Unlimited storage
            </div>
            <p className="mt-1 text-xs text-muted">
              {formatBytes(usedBytes)} in {files.length} file{files.length === 1 ? "" : "s"}
            </p>
          </div>
        </aside>

        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addUploads(e.target.files);
            e.target.value = "";
          }}
        />

        <main className="relative mx-3 mb-3 flex-1 overflow-y-auto rounded-3xl border border-line bg-surface px-4 py-5 md:ml-0 md:mr-4 md:px-6">
          <div className="mb-5 flex items-center gap-3">
            <h1 className="flex-1 text-2xl font-bold tracking-tight">My Drive</h1>
            <div className="flex rounded-full bg-raised p-1">
              {viewButton("grid", "Grid view", LayoutGrid)}
              {viewButton("list", "List view", List)}
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted">Loading files…</p>
          ) : loadError ? (
            <p className="text-sm text-danger">Couldn't load files: {loadError}. Is the Worker running?</p>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-24 text-center text-muted">
              <div className="rounded-3xl bg-accent-soft p-5">
                <CloudUpload className="size-10 text-accent" strokeWidth={1.5} />
              </div>
              {query ? (
                <p>No files match “{query}”.</p>
              ) : (
                <>
                  <p className="font-semibold text-ink">Nothing here yet</p>
                  <p className="text-sm">Drop files anywhere, or use the New button.</p>
                </>
              )}
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
              {visible.map((file) => (
                <FileCard key={file.id} file={file} onDownload={startDownload} onDelete={setPendingDelete} />
              ))}
            </div>
          ) : (
            <FileList files={visible} onDownload={startDownload} onDelete={setPendingDelete} />
          )}

          {dragging && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl border-2 border-dashed border-accent bg-accent-soft/85">
              <div className="flex flex-col items-center gap-2 text-accent">
                <CloudUpload className="size-12" />
                <span className="font-semibold">Drop files to upload</span>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* On phones the sidebar is hidden, so New becomes a floating button. */}
      <button
        onClick={openPicker}
        aria-label="Upload files"
        className="fixed bottom-5 left-5 z-10 rounded-2xl bg-accent p-4 text-accent-ink shadow-lg shadow-accent/30 md:hidden"
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </button>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this file?"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        <span className="font-semibold text-ink">{pendingDelete?.name}</span> will be removed from your drive. This
        can't be undone.
      </ConfirmDialog>

      <TransferPanel
        transfers={allTransfers}
        onPause={(id) => (uploads.current.has(id) ? pauseUpload(id) : pauseDownload(id))}
        onResume={(id) => (uploads.current.has(id) ? resumeUpload(id) : resumeDownload(id))}
        onCancel={(id) => (uploads.current.has(id) ? cancelUpload(id) : cancelDownload(id))}
        onClear={() => {
          setTransfers((all) => all.filter((t) => t.status === "active" || t.status === "queued"));
          dismissFinished();
        }}
      />
    </div>
  );
}
