import type { HTMLAttributes } from "react";
import type { FileSummary } from "../lib/api";
import { fileKind } from "../lib/fileIcon";
import { formatBytes, formatUploaded, formatUploadedFull } from "../lib/format";
import FileActions from "./FileActions";
import FilePreview from "./FilePreview";

type Props = {
  file: FileSummary;
  selected: boolean;
  // Click, double-click, long-press and drag handling, from Drive.tsx.
  itemProps: HTMLAttributes<HTMLDivElement>;
  // Where the file lives, shown in search results (e.g. "My Drive › Photos").
  location?: string;
  onDownload: (file: FileSummary) => void;
  onDelete: (file: FileSummary) => void;
};

export default function FileCard({ file, selected, itemProps, location, onDownload, onDelete }: Props) {
  const { Icon, color } = fileKind(file.name, file.mime_type);

  return (
    <div
      {...itemProps}
      title={file.name}
      className={`group flex select-none flex-col rounded-2xl border p-2 transition [-webkit-touch-callout:none] ${
        selected
          ? "border-accent bg-accent-soft ring-2 ring-accent/30"
          : "border-line bg-surface hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-black/5"
      }`}
    >
      <FilePreview file={file} />
      <div className="flex items-center gap-2 px-1.5 pb-0.5 pt-2.5">
        <Icon className={`size-4 shrink-0 ${color}`} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{file.name}</span>
        <FileActions file={file} onDownload={onDownload} onDelete={onDelete} />
      </div>
      <div className="px-1.5 pb-1 text-xs text-muted">
        {formatBytes(file.size)} · <span title={formatUploadedFull(file.created_at)}>{formatUploaded(file.created_at)}</span>
      </div>
      {location && <div className="truncate px-1.5 pb-1 text-xs text-muted">in {location}</div>}
    </div>
  );
}
