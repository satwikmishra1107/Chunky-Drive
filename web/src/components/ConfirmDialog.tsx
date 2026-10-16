import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// A centered pop-up for yes/no questions. Esc or clicking outside cancels.
export default function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      // A click on the dialog element itself (not its content) is a click on the dark backdrop.
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      className="m-auto w-[min(420px,calc(100%-2rem))] rounded-3xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-6">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <div className="mt-2 text-sm text-muted">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            autoFocus
            className="rounded-full px-4 py-2 text-sm font-semibold text-ink transition hover:bg-hover"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
