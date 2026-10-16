import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { thumbnailUrl, type FileSummary } from "../lib/api";
import { fileKind } from "../lib/fileIcon";

// Small square for list rows: a tiny version of the picture, or the type icon at the same size.
export function FileThumb({ file }: { file: FileSummary }) {
  const [broken, setBroken] = useState(false);
  const { Icon, color } = fileKind(file.name, file.mime_type);

  if (file.has_thumbnail && !broken) {
    return (
      <img
        src={thumbnailUrl(file.id)}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setBroken(true)}
        className="size-8 shrink-0 rounded-lg bg-raised object-cover"
      />
    );
  }

  return (
    <span className="flex size-8 shrink-0 items-center justify-center">
      <Icon className={`size-5 ${color}`} />
    </span>
  );
}

// Corner tag on grid cards: how many chunks the file is stored as.
function ChunkTag({ count }: { count: number }) {
  return (
    <span
      title="Every chunk is checked for damage when you download"
      className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-semibold text-muted shadow-sm backdrop-blur"
    >
      <ShieldCheck className="size-3 text-accent" />
      {count} chunk{count === 1 ? "" : "s"}
    </span>
  );
}

// The big preview area of a grid card: the real picture if there is one, otherwise a tinted icon.
export default function FilePreview({ file }: { file: FileSummary }) {
  return (
    <div className="relative">
      <PreviewArea file={file} />
      <ChunkTag count={file.chunk_count} />
    </div>
  );
}

function PreviewArea({ file }: { file: FileSummary }) {
  const [broken, setBroken] = useState(false);
  const { Icon, color, tint } = fileKind(file.name, file.mime_type);

  if (file.has_thumbnail && !broken) {
    return (
      <img
        src={thumbnailUrl(file.id)}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setBroken(true)}
        className="h-40 w-full rounded-xl bg-raised object-cover"
      />
    );
  }

  return (
    <div className={`flex h-40 items-center justify-center rounded-xl ${tint}`}>
      <Icon className={`size-14 ${color}`} strokeWidth={1.25} />
    </div>
  );
}
