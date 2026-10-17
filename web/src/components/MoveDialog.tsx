import { useEffect, useRef, useState } from "react";
import { ChevronRight, Folder as FolderIcon, HardDrive } from "lucide-react";
import type { Folder } from "../lib/api";

type Props = {
  open: boolean;
  // How many items are being moved, for the title.
  count: number;
  folders: Folder[];
  // Folders being moved, plus everything inside them: they can't be a destination.
  blocked: Set<string>;
  // Where the browser starts (usually the folder that's open now).
  startAt: string | null;
  onMove: (targetFolderId: string | null) => void;
  onCancel: () => void;
};

// A small folder browser: tap into folders, then "Move here". Works the same on phones,
// where dragging isn't an option.
export default function MoveDialog({ open, count, folders, blocked, startAt, onMove, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [at, setAt] = useState<string | null>(startAt);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setAt(startAt && !blocked.has(startAt) ? startAt : null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, startAt, blocked]);

  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];
  for (let f = at ? byId.get(at) : undefined; f && !path.includes(f); f = f.parent_id ? byId.get(f.parent_id) : undefined) {
    path.unshift(f);
  }
  const children = folders.filter((f) => f.parent_id === at);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      className="m-auto w-[min(440px,calc(100%-2rem))] rounded-3xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-6">
        <h2 className="text-lg font-bold tracking-tight">
          Move {count} item{count === 1 ? "" : "s"}
        </h2>

        <nav aria-label="Destination path" className="mt-3 flex flex-wrap items-center gap-0.5 text-sm">
          {[null, ...path.map((f) => f.id)].map((id, i, all) => (
            <span key={id ?? "root"} className="flex items-center gap-0.5">
              {i > 0 && <ChevronRight className="size-4 text-muted" />}
              <button
                onClick={() => setAt(id)}
                disabled={i === all.length - 1}
                className="rounded-lg px-1.5 py-0.5 font-semibold text-muted transition enabled:hover:bg-hover enabled:hover:text-ink disabled:text-ink"
              >
                {id ? byId.get(id)!.name : "My Drive"}
              </button>
            </span>
          ))}
        </nav>

        <ul className="mt-3 h-64 overflow-y-auto rounded-2xl border border-line p-1.5">
          {children.length === 0 && <li className="p-3 text-sm text-muted">No folders here.</li>}
          {children.map((folder) => {
            const isBlocked = blocked.has(folder.id);
            return (
              <li key={folder.id}>
                <button
                  onClick={() => setAt(folder.id)}
                  disabled={isBlocked}
                  title={isBlocked ? "Can't move a folder inside itself" : undefined}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition enabled:hover:bg-hover disabled:opacity-40"
                >
                  <FolderIcon className="size-4 shrink-0 fill-accent/20 text-accent" />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            {at ? <FolderIcon className="size-3.5 shrink-0" /> : <HardDrive className="size-3.5 shrink-0" />}
            <span className="truncate">to {at ? byId.get(at)?.name : "My Drive"}</span>
          </span>
          <div className="flex shrink-0 gap-2">
            <button onClick={onCancel} className="rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-hover">
              Cancel
            </button>
            <button
              onClick={() => onMove(at)}
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:brightness-105 active:scale-[0.98]"
            >
              Move here
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
