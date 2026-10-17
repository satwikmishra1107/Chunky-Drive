import { useEffect, useRef, useState } from "react";
import { FileUp, FolderPlus, Plus } from "lucide-react";

type Props = {
  onUpload: () => void;
  onNewFolder: () => void;
  // "sidebar": the big New button; "fab": the floating button on phones.
  variant: "sidebar" | "fab";
};

// The New button and its menu: upload files or create a folder, like Google Drive.
export default function NewMenu({ onUpload, onNewFolder, variant }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-hover";
  const fab = variant === "fab";

  return (
    <div ref={ref} className={fab ? "fixed bottom-5 left-5 z-10 md:hidden" : "relative mb-5"}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={fab ? "New" : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        className={
          fab
            ? "rounded-2xl bg-accent p-4 text-accent-ink shadow-lg shadow-accent/30"
            : "flex w-fit items-center gap-2.5 rounded-2xl bg-accent px-5 py-3.5 font-semibold text-accent-ink shadow-md shadow-accent/25 transition hover:brightness-105 active:scale-[0.98]"
        }
      >
        <Plus className={fab ? "size-6" : "size-5"} strokeWidth={2.5} />
        {!fab && "New"}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-30 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-2xl ${fab ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          <button role="menuitem" onClick={() => choose(onNewFolder)} className={item}>
            <FolderPlus className="size-4 text-accent" />
            New folder
          </button>
          <button role="menuitem" onClick={() => choose(onUpload)} className={item}>
            <FileUp className="size-4 text-accent" />
            File upload
          </button>
        </div>
      )}
    </div>
  );
}
