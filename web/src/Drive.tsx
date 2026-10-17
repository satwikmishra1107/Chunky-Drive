import { useCallback, useEffect, useRef, useState, type DragEvent, type HTMLAttributes, type MouseEvent as ReactMouseEvent } from "react";
import {
  ChevronRight,
  CloudUpload,
  Download,
  FolderInput,
  HardDrive,
  Info,
  Infinity as InfinityIcon,
  LayoutGrid,
  List,
  Search,
  Trash2,
  X,
} from "lucide-react";
import FileCard from "./components/FileCard";
import ConfirmDialog from "./components/ConfirmDialog";
import FileList from "./components/FileList";
import FolderCard, { MOVE_DRAG_TYPE } from "./components/FolderCard";
import MoveDialog from "./components/MoveDialog";
import NameDialog from "./components/NameDialog";
import NewMenu from "./components/NewMenu";
import Logo from "./components/Logo";
import ThemeToggle from "./components/ThemeToggle";
import UserMenu from "./components/UserMenu";
import type { SessionUser } from "./lib/auth";
import TransferPanel, { type Transfer } from "./components/TransferPanel";
import { useSharedTransfers } from "./lib/sharedTransfers";
import { useMarquee } from "./lib/useMarquee";
import {
  createFolder,
  deleteFile,
  deleteFolder,
  listFiles,
  listFolders,
  moveItems,
  type FileSummary,
  type Folder,
} from "./lib/api";
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

// The open folder lives in the URL (/folder/<id>), so refresh and the back button work.
const folderFromUrl = () => window.location.pathname.match(/^\/folder\/([\w-]+)\/?$/)?.[1] ?? null;

type PendingDelete = { files: FileSummary[]; folders: Folder[] };

// One thing on screen that can be selected. Keys look like "file:<id>" or "folder:<id>".
type Item = { key: string; kind: "file"; file: FileSummary } | { key: string; kind: "folder"; folder: Folder };

const LONG_PRESS_MS = 500;

type Props = { user: SessionUser };

export default function Drive({ user }: Props) {
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(folderFromUrl);
  const [creatingFolder, setCreatingFolder] = useState(false);
  // A short message at the bottom of the screen, e.g. "named New Folder (1) instead".
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(savedView);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Keys being moved through the Move to… dialog.
  const [moving, setMoving] = useState<string[] | null>(null);
  // Breadcrumb or sidebar entry that dragged items are hovering over.
  const [dropHover, setDropHover] = useState<string | null>(null);
  // Mouse and trackpad can drag; touch screens use long-press and the Move dialog instead.
  const [canDrag] = useState(() => window.matchMedia("(pointer: fine)").matches);
  const inputRef = useRef<HTMLInputElement>(null);
  // Uploads run one file at a time (each file already sends 3 chunks at once).
  const uploadQueue = useRef<Promise<void>>(Promise.resolve());

  const refresh = useCallback(async () => {
    try {
      const [fileList, folderList] = await Promise.all([listFiles(), listFolders()]);
      setFiles(fileList);
      setFolders(folderList);
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

  // Back/forward buttons move between folders.
  useEffect(() => {
    const onPopState = () => setFolderId(folderFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openFolder = (id: string | null) => {
    setQuery("");
    if (id === folderId) return;
    window.history.pushState(null, "", id ? `/folder/${id}` : "/");
    setFolderId(id);
  };

  // A folder that no longer exists (deleted, or a bad link) falls back to My Drive.
  useEffect(() => {
    if (loading || !folderId || folders.some((f) => f.id === folderId)) return;
    window.history.replaceState(null, "", "/");
    setFolderId(null);
  }, [loading, folderId, folders]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

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
  const uploads = useRef(new Map<string, { file: File; folderId: string | null; job?: UploadJob }>());
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
      entry.job ??= await createUploadJob(entry.file, entry.folderId);
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
      // Goes into the folder that was open when the file was added.
      uploads.current.set(id, { file, folderId });
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

  const folderById = new Map(folders.map((f) => [f.id, f]));

  // The folders from the top of My Drive down to `id`.
  const pathTo = (id: string | null): Folder[] => {
    const chain: Folder[] = [];
    for (let f = id ? folderById.get(id) : undefined; f && !chain.includes(f); f = f.parent_id ? folderById.get(f.parent_id) : undefined) {
      chain.unshift(f);
    }
    return chain;
  };
  const locationOf = (id: string | null) => ["My Drive", ...pathTo(id).map((f) => f.name)].join(" › ");

  // Everything inside a folder, at any depth: for the delete warning and for hiding it all at once.
  const contentsOf = (folder: Folder) => {
    const ids = new Set([folder.id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const f of folders) {
        if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
          ids.add(f.id);
          grew = true;
        }
      }
    }
    const inside = files.filter((f) => f.folder_id && ids.has(f.folder_id));
    return { ids, folderCount: ids.size - 1, files: inside, bytes: inside.reduce((sum, f) => sum + f.size, 0) };
  };

  const createNewFolder = async (name: string) => {
    setCreatingFolder(false);
    try {
      const { folder, renamed } = await createFolder(name, folderId);
      setFolders((all) => [...all, folder]);
      if (renamed) setNotice(`“${name}” already exists here, so the new folder is called “${folder.name}”.`);
    } catch (error) {
      setNotice(`Couldn't create the folder: ${(error as Error).message}`);
    }
  };

  // Of the folders being deleted, the ones not inside another one being deleted (deleting a
  // parent already removes its children).
  const topFolders = (list: Folder[]) => {
    const ids = new Set(list.map((f) => f.id));
    return list.filter((f) => !pathTo(f.parent_id).some((above) => ids.has(above.id)));
  };

  // Everything a delete would remove, counting what's inside folders.
  const deleteSummary = (target: PendingDelete) => {
    const folderIds = new Set<string>();
    for (const folder of target.folders) for (const id of contentsOf(folder).ids) folderIds.add(id);
    const all = new Map(target.files.map((f) => [f.id, f]));
    for (const f of files) if (f.folder_id && folderIds.has(f.folder_id)) all.set(f.id, f);
    const removed = [...all.values()];
    return { folderIds, fileCount: removed.length, bytes: removed.reduce((sum, f) => sum + f.size, 0) };
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    setSelected(new Set());
    const { folderIds } = deleteSummary(target);
    const fileIds = new Set(target.files.map((f) => f.id));
    // Standing inside a folder that's going away: step out to where it was.
    const leaving = folderId && folderIds.has(folderId) ? target.folders.find((f) => contentsOf(f).ids.has(folderId)) : null;
    if (leaving) openFolder(leaving.parent_id);
    // Hide it all straight away; put the lists back from the server if a delete fails.
    setFolders((all) => all.filter((f) => !folderIds.has(f.id)));
    setFiles((all) => all.filter((f) => !fileIds.has(f.id) && !(f.folder_id && folderIds.has(f.folder_id))));
    try {
      await Promise.all([
        ...topFolders(target.folders).map((f) => deleteFolder(f.id)),
        ...target.files.filter((f) => !(f.folder_id && folderIds.has(f.folder_id))).map((f) => deleteFile(f.id)),
      ]);
    } catch (error) {
      setNotice(`Couldn't delete everything: ${(error as Error).message}`);
      await refresh();
    }
  };

  const keyOf = (kind: "file" | "folder", id: string) => `${kind}:${id}`;
  const idsOf = (keys: Iterable<string>, kind: "file" | "folder") =>
    [...keys].filter((k) => k.startsWith(`${kind}:`)).map((k) => k.slice(kind.length + 1));

  // Moves items (by key) into a folder, or to My Drive with null.
  const moveTo = async (keys: string[], targetId: string | null) => {
    const fileIds = idsOf(keys, "file").filter((id) => files.find((f) => f.id === id)?.folder_id !== targetId);
    const folderIds = idsOf(keys, "folder").filter((id) => folderById.get(id)?.parent_id !== targetId);
    if (fileIds.length + folderIds.length === 0) return; // Already there.
    if (targetId && [targetId, ...pathTo(targetId).map((f) => f.id)].some((id) => folderIds.includes(id))) {
      setNotice("A folder can't be moved inside itself.");
      return;
    }
    try {
      const { renamed } = await moveItems(fileIds, folderIds, targetId);
      setSelected(new Set());
      await refresh();
      const count = fileIds.length + folderIds.length;
      const where = targetId ? folderById.get(targetId)?.name : "My Drive";
      const renames = renamed.map((r) => `“${r.from}” is now “${r.to}”`).join(", ");
      setNotice(
        `Moved ${count} item${count === 1 ? "" : "s"} to “${where}”.` +
          (renames ? ` ${renames}, because that name was already used there.` : ""),
      );
    } catch (error) {
      setNotice(`Couldn't move: ${(error as Error).message}`);
    }
  };

  // Search covers the whole drive; otherwise show what's directly inside the open folder.
  const search = query.trim().toLowerCase();
  const shownFolders = search
    ? folders.filter((f) => f.name.toLowerCase().includes(search))
    : folders.filter((f) => f.parent_id === folderId);
  const visible = search
    ? files.filter((f) => f.name.toLowerCase().includes(search))
    : files.filter((f) => (f.folder_id ?? null) === folderId);
  const usedBytes = files.reduce((sum, f) => sum + f.size, 0);
  const openPicker = () => inputRef.current?.click();
  const deleting = pendingDelete ? deleteSummary(pendingDelete) : null;

  // ---- Selecting. Mouse: click selects, Ctrl/⌘-click adds, Shift-click selects a range,
  // double-click opens. Touch: tap opens, long-press starts selecting, then taps add/remove.
  const items: Item[] = [
    ...shownFolders.map((folder): Item => ({ key: keyOf("folder", folder.id), kind: "folder", folder })),
    ...visible.map((file): Item => ({ key: keyOf("file", file.id), kind: "file", file })),
  ];
  const selectedFiles = files.filter((f) => selected.has(keyOf("file", f.id)));
  const selectedFolders = folders.filter((f) => selected.has(keyOf("folder", f.id)));
  const anchor = useRef<number | null>(null); // Where a Shift-click range starts.
  const pointerType = useRef("mouse");
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean } | null>(null);
  const dragKeys = useRef<string[]>([]);
  const mainRef = useRef<HTMLElement>(null);
  const marquee = useMarquee(mainRef, selected, setSelected);

  // Moving to another folder or searching starts a fresh selection.
  useEffect(() => {
    setSelected(new Set());
    anchor.current = null;
  }, [folderId, query]);

  const openItem = (item: Item) => (item.kind === "folder" ? openFolder(item.folder.id) : startDownload(item.file));

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const clickItem = (item: Item, index: number, e: ReactMouseEvent) => {
    if (pointerType.current !== "mouse") {
      const held = press.current?.fired;
      press.current = null;
      if (held) return; // The long-press already selected it.
      if (selected.size > 0) toggle(item.key);
      else openItem(item);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      toggle(item.key);
      anchor.current = index;
    } else if (e.shiftKey && anchor.current !== null) {
      const [from, to] = [anchor.current, index].sort((a, b) => a - b);
      setSelected(new Set(items.slice(from, to + 1).map((i) => i.key)));
    } else {
      setSelected(new Set([item.key]));
      anchor.current = index;
    }
  };

  const endPress = () => {
    if (press.current && !press.current.fired) {
      clearTimeout(press.current.timer);
      press.current = null;
    }
  };

  const itemProps = (item: Item, index: number) =>
    ({
      "data-item": "",
      "data-key": item.key, // Found by box selection (lib/useMarquee.ts).
      draggable: canDrag,
      onPointerDown: (e) => {
        pointerType.current = e.pointerType;
        if (e.pointerType === "mouse") return;
        const timer = setTimeout(() => {
          if (!press.current) return;
          press.current.fired = true;
          navigator.vibrate?.(20);
          setSelected((current) => new Set(current).add(item.key));
        }, LONG_PRESS_MS);
        press.current = { timer, x: e.clientX, y: e.clientY, fired: false };
      },
      // Scrolling isn't a long-press.
      onPointerMove: (e) => {
        if (press.current && !press.current.fired && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) endPress();
      },
      onPointerUp: endPress,
      onPointerCancel: endPress,
      onClick: (e) => clickItem(item, index, e),
      onDoubleClick: () => pointerType.current === "mouse" && openItem(item),
      // Stops the phone's own long-press menu from popping up over ours.
      onContextMenu: (e) => pointerType.current !== "mouse" && e.preventDefault(),
      onDragStart: (e) => {
        // Dragging something unselected drags just that; dragging a selected item drags them all.
        dragKeys.current = selected.has(item.key) ? [...selected] : [item.key];
        if (!selected.has(item.key)) setSelected(new Set([item.key]));
        e.dataTransfer.setData(MOVE_DRAG_TYPE, "1");
        e.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: () => {
        dragKeys.current = [];
        setDropHover(null);
      },
    }) as HTMLAttributes<HTMLDivElement>;

  // Breadcrumbs and the sidebar's My Drive accept dragged items too.
  const dropProps = (targetId: string | null) => {
    const key = targetId ?? "root";
    return {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(MOVE_DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropHover(key);
      },
      onDragLeave: () => setDropHover((current) => (current === key ? null : current)),
      onDrop: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(MOVE_DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropHover(null);
        moveTo(dragKeys.current, targetId);
      },
    };
  };

  const askDeleteSelection = () => {
    if (selected.size) setPendingDelete({ files: selectedFiles, folders: selectedFolders });
  };

  const downloadSelection = async () => {
    // One after another, so they don't all fight over the connection.
    for (const file of selectedFiles) await startDownload(file);
  };

  // Keyboard: Esc clears, Ctrl/⌘+A selects all, Delete deletes. Not while typing or in a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea") || document.querySelector("dialog[open]")) return;
      if (e.key === "Escape" && selected.size) setSelected(new Set());
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(items.map((i) => i.key)));
      } else if (e.key === "Delete" && selected.size) askDeleteSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Folders being moved and everything inside them: not valid destinations.
  const movingBlocked = new Set<string>();
  for (const id of idsOf(moving ?? [], "folder")) {
    const folder = folderById.get(id);
    if (folder) for (const inner of contentsOf(folder).ids) movingBlocked.add(inner);
  }

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
        // Only files dragged in from the computer; moving items inside the drive is handled elsewhere.
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        addUploads(e.dataTransfer.files);
      }}
    >
      <header className="flex h-16 shrink-0 items-center gap-4 px-4 md:px-5">
        <div className="flex shrink-0 items-center gap-2.5 md:w-56">
          <Logo className="size-8 text-accent" busy={allTransfers.some((t) => t.status === "active")} />
          <span className="hidden text-xl font-extrabold tracking-tight sm:inline">
            chunky<span className="text-accent">drive</span>
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
          title="How Chunky Drive works"
          className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-2 text-sm font-semibold text-accent transition hover:bg-accent-soft lg:px-3"
        >
          <Info className="size-4" />
          <span className="hidden lg:inline">How Chunky Drive works?</span>
        </a>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <ThemeToggle />
          <UserMenu user={user} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col px-3 pb-4 md:flex">
          <NewMenu variant="sidebar" onUpload={openPicker} onNewFolder={() => setCreatingFolder(true)} />
          <nav>
            <button
              onClick={() => openFolder(null)}
              {...dropProps(null)}
              className={`flex w-full items-center gap-3 rounded-full bg-accent-soft px-4 py-2 text-sm font-semibold text-accent transition hover:brightness-95 ${
                dropHover === "root" ? "ring-2 ring-accent" : ""
              }`}
            >
              <HardDrive className="size-4" />
              My Drive
            </button>
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

        <main
          ref={mainRef}
          {...marquee.handlers}
          onClick={(e) => {
            // A click on empty space clears the selection, unless it ended a selection box.
            if (marquee.consumeClick()) return;
            if (!(e.target as HTMLElement).closest("[data-item], [data-selection-bar]")) setSelected(new Set());
          }}
          className="relative mx-3 mb-3 flex-1 overflow-y-auto rounded-3xl border border-line bg-surface px-4 py-5 md:ml-0 md:mr-4 md:px-6"
        >
          <div className="mb-5 flex items-center gap-3">
            {selected.size > 0 ? (
              <div data-selection-bar className="flex h-11 min-w-0 flex-1 items-center gap-1 rounded-full bg-raised pl-1 pr-2">
                <button onClick={() => setSelected(new Set())} aria-label="Clear selection" title="Clear selection" className="rounded-full p-2 transition hover:bg-hover">
                  <X className="size-4" />
                </button>
                <span className="mr-auto truncate pl-1 text-sm font-semibold">{selected.size} selected</span>
                {selectedFiles.length > 0 && (
                  <button onClick={downloadSelection} aria-label="Download" title="Download" className="rounded-full p-2 text-muted transition hover:bg-hover hover:text-ink">
                    <Download className="size-4" />
                  </button>
                )}
                <button onClick={() => setMoving([...selected])} aria-label="Move to…" title="Move to…" className="rounded-full p-2 text-muted transition hover:bg-hover hover:text-ink">
                  <FolderInput className="size-4" />
                </button>
                <button onClick={askDeleteSelection} aria-label="Delete" title="Delete" className="rounded-full p-2 text-muted transition hover:bg-hover hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ) : search ? (
              <h1 className="flex-1 text-2xl font-bold tracking-tight">Search results</h1>
            ) : (
              <nav aria-label="Folder path" className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-2xl font-bold tracking-tight">
                {[null, ...pathTo(folderId).map((f) => f.id)].map((id, i, all) => {
                  const name = id ? folderById.get(id)!.name : "My Drive";
                  const last = i === all.length - 1;
                  return (
                    <span key={id ?? "root"} className="flex min-w-0 items-center gap-1">
                      {i > 0 && <ChevronRight className="size-5 shrink-0 text-muted" />}
                      {last ? (
                        <h1 className="truncate">{name}</h1>
                      ) : (
                        <button
                          onClick={() => openFolder(id)}
                          {...dropProps(id)}
                          className={`truncate rounded-lg px-1 text-muted transition hover:bg-hover hover:text-ink ${
                            dropHover === (id ?? "root") ? "bg-accent-soft text-accent ring-2 ring-accent" : ""
                          }`}
                        >
                          {name}
                        </button>
                      )}
                    </span>
                  );
                })}
              </nav>
            )}
            <div className="flex rounded-full bg-raised p-1">
              {viewButton("grid", "Grid view", LayoutGrid)}
              {viewButton("list", "List view", List)}
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted">Loading files…</p>
          ) : loadError ? (
            <p className="text-sm text-danger">Couldn't load files: {loadError}. Is the Worker running?</p>
          ) : visible.length === 0 && shownFolders.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-24 text-center text-muted">
              <div className="rounded-3xl bg-accent-soft p-5">
                <CloudUpload className="size-10 text-accent" strokeWidth={1.5} />
              </div>
              {query ? (
                <p>Nothing matches “{query}”.</p>
              ) : (
                <>
                  <p className="font-semibold text-ink">{folderId ? "This folder is empty" : "Nothing here yet"}</p>
                  <p className="text-sm">Drop files anywhere, or use the New button.</p>
                </>
              )}
            </div>
          ) : (
            <>
              {shownFolders.length > 0 && (
                <div className="mb-6 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                  {shownFolders.map((folder, index) => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      selected={selected.has(keyOf("folder", folder.id))}
                      itemProps={itemProps(items[index], index)}
                      onDropItems={canDrag ? () => moveTo(dragKeys.current, folder.id) : undefined}
                      location={search ? locationOf(folder.parent_id) : undefined}
                      onDelete={(f) => setPendingDelete({ files: [], folders: [f] })}
                    />
                  ))}
                </div>
              )}
              {visible.length > 0 &&
                (view === "grid" ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                    {visible.map((file, i) => (
                      <FileCard
                        key={file.id}
                        file={file}
                        selected={selected.has(keyOf("file", file.id))}
                        itemProps={itemProps(items[shownFolders.length + i], shownFolders.length + i)}
                        location={search ? locationOf(file.folder_id) : undefined}
                        onDownload={startDownload}
                        onDelete={(f) => setPendingDelete({ files: [f], folders: [] })}
                      />
                    ))}
                  </div>
                ) : (
                  <FileList
                    files={visible}
                    isSelected={(f) => selected.has(keyOf("file", f.id))}
                    itemProps={(f) => {
                      const index = shownFolders.length + visible.indexOf(f);
                      return itemProps(items[index], index);
                    }}
                    locationOf={search ? (f) => locationOf(f.folder_id) : undefined}
                    onDownload={startDownload}
                    onDelete={(f) => setPendingDelete({ files: [f], folders: [] })}
                  />
                ))}
            </>
          )}

          {marquee.box && (
            <div
              aria-hidden
              className="pointer-events-none absolute z-10 rounded-md border border-accent bg-accent/15"
              style={marquee.box}
            />
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
      <NewMenu variant="fab" onUpload={openPicker} onNewFolder={() => setCreatingFolder(true)} />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete && pendingDelete.files.length + pendingDelete.folders.length > 1
            ? `Delete ${pendingDelete.files.length + pendingDelete.folders.length} items?`
            : pendingDelete?.folders.length
              ? "Delete this folder?"
              : "Delete this file?"
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        {pendingDelete && deleting && (
          <>
            {pendingDelete.folders.length === 0 && pendingDelete.files.length === 1 ? (
              <>
                <span className="font-semibold text-ink">{pendingDelete.files[0].name}</span> will be removed from your drive.
              </>
            ) : pendingDelete.folders.length === 1 && pendingDelete.files.length === 0 && deleting.fileCount + deleting.folderIds.size === 1 ? (
              <>
                <span className="font-semibold text-ink">{pendingDelete.folders[0].name}</span> is empty and will be removed.
              </>
            ) : (
              <>
                {pendingDelete.folders.length === 1 && pendingDelete.files.length === 0 ? (
                  <>
                    <span className="font-semibold text-ink">{pendingDelete.folders[0].name}</span> and everything in it
                  </>
                ) : (
                  "These items and everything in them"
                )}{" "}
                will be removed:{" "}
                <span className="font-semibold text-ink">
                  {deleting.fileCount} file{deleting.fileCount === 1 ? "" : "s"}
                  {deleting.folderIds.size > 0 && `, ${deleting.folderIds.size} folder${deleting.folderIds.size === 1 ? "" : "s"}`}
                </span>{" "}
                ({formatBytes(deleting.bytes)}).
              </>
            )}{" "}
            This can't be undone.
          </>
        )}
      </ConfirmDialog>

      <MoveDialog
        open={moving !== null}
        count={moving?.length ?? 0}
        folders={folders}
        blocked={movingBlocked}
        startAt={folderId}
        onMove={(target) => {
          const keys = moving ?? [];
          setMoving(null);
          moveTo(keys, target);
        }}
        onCancel={() => setMoving(null)}
      />

      <NameDialog
        open={creatingFolder}
        title="New folder"
        initialName="New Folder"
        confirmLabel="Create"
        onConfirm={createNewFolder}
        onCancel={() => setCreatingFolder(false)}
      />

      {notice && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-40 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl bg-ink px-4 py-3 text-sm font-medium text-bg shadow-2xl"
        >
          {notice}
        </div>
      )}

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
