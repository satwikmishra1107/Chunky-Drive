import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
} from "lucide-react";

type FileKind = { Icon: LucideIcon; color: string; tint: string };

const KINDS = {
  image: { Icon: FileImage, color: "text-rose-500", tint: "bg-rose-500/10" },
  video: { Icon: FileVideo, color: "text-red-600", tint: "bg-red-500/10" },
  audio: { Icon: FileAudio, color: "text-violet-500", tint: "bg-violet-500/10" },
  pdf: { Icon: FileText, color: "text-red-500", tint: "bg-red-500/10" },
  sheet: { Icon: FileSpreadsheet, color: "text-green-600", tint: "bg-green-500/10" },
  archive: { Icon: FileArchive, color: "text-amber-600", tint: "bg-amber-500/10" },
  code: { Icon: FileCode, color: "text-sky-600", tint: "bg-sky-500/10" },
  text: { Icon: FileText, color: "text-blue-600", tint: "bg-blue-500/10" },
  other: { Icon: File, color: "text-slate-500", tint: "bg-slate-500/10" },
} satisfies Record<string, FileKind>;

const BY_EXTENSION: Record<string, keyof typeof KINDS> = {
  pdf: "pdf",
  zip: "archive", rar: "archive", "7z": "archive", tar: "archive", gz: "archive",
  xls: "sheet", xlsx: "sheet", csv: "sheet",
  doc: "text", docx: "text", txt: "text", md: "text",
  js: "code", ts: "code", tsx: "code", py: "code", json: "code", html: "code", css: "code",
};

export function fileKind(name: string, mimeType: string | null): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (BY_EXTENSION[ext]) return KINDS[BY_EXTENSION[ext]];
  if (mimeType?.startsWith("image/")) return KINDS.image;
  if (mimeType?.startsWith("video/")) return KINDS.video;
  if (mimeType?.startsWith("audio/")) return KINDS.audio;
  if (mimeType?.startsWith("text/")) return KINDS.text;
  return KINDS.other;
}
