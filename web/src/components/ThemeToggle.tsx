import { useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";

// Must match the key read by the inline script in index.html.
const THEME_KEY = "chunky:theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  // { value: "system", label: "Match system", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(savedTheme);

  const choose = (next: Theme) => {
    setTheme(next);
    // "system" removes the attribute so the CSS falls back to the computer's setting.
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // Blocked storage: the choice works for this visit only.
    }
  };

  return (
    <div className="flex rounded-full bg-raised p-1" role="group" aria-label="Theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => choose(value)}
          aria-label={label}
          aria-pressed={theme === value}
          title={label}
          className={`rounded-full p-1.5 transition ${theme === value ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-ink"}`}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
