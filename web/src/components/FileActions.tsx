import { Download, Trash2 } from "lucide-react";
import type { FileSummary } from "../lib/api";

type Props = {
  file: FileSummary;
  onDownload: (file: FileSummary) => void;
  onDelete: (file: FileSummary) => void;
};

const button =
  "rounded-full p-1.5 text-muted opacity-0 transition hover:bg-hover group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100";

// Download and delete buttons that appear when hovering a file.
export default function FileActions({ file, onDownload, onDelete }: Props) {
  return (
    // Clicks here must not also select the file or start a long-press.
    <div
      className="flex shrink-0 items-center"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button onClick={() => onDownload(file)} className={`${button} hover:text-ink`} aria-label={`Download ${file.name}`}>
        <Download className="size-4" />
      </button>
      <button onClick={() => onDelete(file)} className={`${button} hover:text-danger`} aria-label={`Delete ${file.name}`}>
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
