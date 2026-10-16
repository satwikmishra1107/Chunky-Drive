// Three stacked blocks: a file split into chunks. `busy` makes them pulse while files are moving.
export default function Logo({ className, busy = false }: { className?: string; busy?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={`${className ?? ""} ${busy ? "logo-busy" : ""}`} aria-hidden="true">
      <rect x="4" y="3.5" width="24" height="7.5" rx="2.75" fill="currentColor" />
      <rect x="4" y="12.25" width="24" height="7.5" rx="2.75" fill="currentColor" opacity="0.7" />
      <rect x="4" y="21" width="24" height="7.5" rx="2.75" fill="currentColor" opacity="0.4" />
    </svg>
  );
}
