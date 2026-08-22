"use client";

import { useTheme } from "./ThemeProvider";
import { IconSun, IconMoon } from "@/components/icons";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className={`inline-flex items-center justify-center rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ${className}`}
      title={`Theme: ${theme} (click to toggle)`}
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? (
        <IconMoon size={16} />
      ) : (
        <IconSun size={16} />
      )}
    </button>
  );
}
