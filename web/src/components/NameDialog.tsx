import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  title: string;
  initialName: string;
  confirmLabel: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
};

// A small pop-up asking for a name, with the suggested name pre-selected so typing replaces it.
export default function NameDialog({ open, title, initialName, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setName(initialName);
      dialog.showModal();
      requestAnimationFrame(() => inputRef.current?.select());
    }
    if (!open && dialog.open) dialog.close();
  }, [open, initialName]);

  const trimmed = name.trim();

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      className="m-auto w-[min(400px,calc(100%-2rem))] rounded-3xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        className="p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) onConfirm(trimmed);
        }}
      >
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={255}
          aria-label="Name"
          className="mt-4 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15 sm:text-sm"
        />
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-hover">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!trimmed}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
