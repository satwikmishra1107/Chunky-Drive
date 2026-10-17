import { useState, type HTMLAttributes } from "react";
import { Folder as FolderIcon, Trash2 } from "lucide-react";
import type { Folder } from "../lib/api";

type Props = {
  folder: Folder;
  selected: boolean;
  // Click, double-click, long-press and drag handling, from Drive.tsx.
  itemProps: HTMLAttributes<HTMLDivElement>;
  // Called when dragged items are dropped on this folder; absent when it can't take them.
  onDropItems?: () => void;
  // Where the folder lives, shown in search results (e.g. "My Drive › Photos").
  location?: string;
  onDelete: (folder: Folder) => void;
};

// Matches the drag type set in Drive.tsx, so only our own items (not files from the computer) drop here.
export const MOVE_DRAG_TYPE = "application/x-chunky-move";

// A folder tile. Opening and selecting are handled by `itemProps`; the trash button deletes it.
export default function FolderCard({ folder, selected, itemProps, onDropItems, location, onDelete }: Props) {
  const [dropping, setDropping] = useState(false);

  return (
    <div
      {...itemProps}
      title={folder.name}
      onDragOver={(e) => {
        if (!onDropItems || !e.dataTransfer.types.includes(MOVE_DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        if (!onDropItems || !e.dataTransfer.types.includes(MOVE_DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropping(false);
        onDropItems();
      }}
      className={`group flex select-none items-center gap-3 rounded-2xl border px-4 py-3 transition [-webkit-touch-callout:none] ${
        dropping
          ? "border-accent bg-accent-soft ring-4 ring-accent/25"
          : selected
            ? "border-accent bg-accent-soft ring-2 ring-accent/30"
            : "border-line bg-raised hover:border-accent/40 hover:bg-hover"
      }`}
    >
      <FolderIcon className="size-5 shrink-0 fill-accent/20 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{folder.name}</p>
        {location && <p className="truncate text-xs text-muted">in {location}</p>}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(folder);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Delete ${folder.name}`}
        className="shrink-0 rounded-full p-1.5 text-muted opacity-0 transition hover:bg-surface hover:text-danger group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
