export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "estimating…";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec left`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min left`;
  return `${(seconds / 3600).toFixed(1)} hr left`;
}

// D1 stores "YYYY-MM-DD HH:MM:SS" in UTC; this turns it into the viewer's local time.
const parseDbTime = (value: string) => new Date(value.replace(" ", "T") + "Z");

// Short form for cards and the list: "Today, 3:42 pm", "Yesterday, 9:05 am" or "12 Oct 2026, 6:30 pm".
export function formatUploaded(value: string): string {
  const date = parseDbTime(value);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startOfToday.getTime() - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;

  const day = date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return `${day}, ${time}`;
}

// Full form for hover tooltips: "Friday, 16 October 2026 at 3:42:07 pm".
export function formatUploadedFull(value: string): string {
  return parseDbTime(value).toLocaleString(undefined, { dateStyle: "full", timeStyle: "medium" });
}
