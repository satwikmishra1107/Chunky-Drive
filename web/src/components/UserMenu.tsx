import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { authClient, type SessionUser } from "../lib/auth";

function Avatar({ user, size }: { user: SessionUser; size: string }) {
  const [broken, setBroken] = useState(false);
  if (user.image && !broken) {
    return (
      <img
        src={user.image}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`${size} rounded-full object-cover`}
      />
    );
  }
  return (
    <span className={`${size} flex items-center justify-center rounded-full bg-accent font-bold text-accent-ink`}>
      {(user.name || user.email).charAt(0).toUpperCase()}
    </span>
  );
}

// Profile picture in the top bar; opens a small card with the account and a sign-out button.
export default function UserMenu({ user }: { user: SessionUser }) {
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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Account"
        aria-expanded={open}
        className="rounded-full ring-accent/40 transition hover:ring-4"
      >
        <Avatar user={user} size="size-9 text-sm" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-72 rounded-3xl border border-line bg-surface p-5 text-center shadow-2xl">
          <div className="flex justify-center">
            <Avatar user={user} size="size-16 text-2xl" />
          </div>
          <p className="mt-3 truncate font-semibold">{user.name}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
          <button
            onClick={() => authClient.signOut()}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-line px-5 py-2 text-sm font-semibold transition hover:bg-hover"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
