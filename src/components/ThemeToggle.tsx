import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "dark" | "light";

const ADMIN_STORAGE_KEY = "zailom:admin:theme";
const CLIENT_STORAGE_KEY = "zailom:client:theme";

export function getInitialTheme(scope: "admin" | "client" = "admin"): Theme {
  if (typeof window === "undefined") return "dark";
  const key = scope === "admin" ? ADMIN_STORAGE_KEY : CLIENT_STORAGE_KEY;
  const saved = localStorage.getItem(key);
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}

interface ThemeToggleProps {
  scope?: "admin" | "client";
}

export function ThemeToggle({ scope = "admin" }: ThemeToggleProps) {
  const storageKey = scope === "admin" ? ADMIN_STORAGE_KEY : CLIENT_STORAGE_KEY;
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme(scope));

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(storageKey, theme); } catch {}
  }, [theme, storageKey]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
      className="text-foreground hover:bg-primary/10"
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
