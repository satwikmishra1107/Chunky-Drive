import type { FileSummary } from "../lib/api";
import { fileKind } from "../lib/fileIcon";
import { formatBytes, formatUploaded, formatUploadedFull } from "../lib/format";
import FileActions from "./FileActions";
import FilePreview from "./FilePreview";

type Props = {
  file: FileSummary;
  onDownload: (file: FileSummary) => void;
  onDelete: (file: FileSummary) => void;
};

export default function FileCard({ file, onDownload, onDelete }: Props) {
  const { Icon, color } = fileKind(file.name, file.mime_type);

  return (
    <div
      onDoubleClick={() => onDownload(file)}
      title={`double-click to download ${file.name}`}
      className="group flex select-none flex-col rounded-2xl border border-line bg-surface p-2 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-black/5"
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
    </div>
  );
}
