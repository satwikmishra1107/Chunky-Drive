import type { FileSummary } from "../lib/api";
import { formatBytes, formatUploaded, formatUploadedFull } from "../lib/format";
import FileActions from "./FileActions";
import { FileThumb } from "./FilePreview";

type Props = {
  files: FileSummary[];
  onDownload: (file: FileSummary) => void;
  onDelete: (file: FileSummary) => void;
};

const columns = "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_6rem_11rem_4.5rem] items-center gap-4";

// Compact table view: name, size, upload date.
export default function FileList({ files, onDownload, onDelete }: Props) {
  return (
    <div>
      <div className={`${columns} border-b border-line px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted`}>
        <span>Name</span>
        <span className="hidden sm:block">Size</span>
        <span className="hidden sm:block">Uploaded</span>
        <span />
      </div>
      {files.map((file) => (
        <div
          key={file.id}
          onDoubleClick={() => onDownload(file)}
          title={`double-click to download ${file.name}`}
          className={`${columns} group select-none rounded-xl px-3 py-1.5 transition hover:bg-raised`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <FileThumb file={file} />
            <span className="truncate text-sm font-medium">{file.name}</span>
          </span>
          <span className="hidden text-sm text-muted sm:block">{formatBytes(file.size)}</span>
          <span className="hidden text-sm text-muted sm:block" title={formatUploadedFull(file.created_at)}>
            {formatUploaded(file.created_at)}
          </span>
          <FileActions file={file} onDownload={onDownload} onDelete={onDelete} />
        </div>
      ))}
    </div>
  );
}
