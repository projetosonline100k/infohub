import { useState, useEffect } from "react";

type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme") as Theme;
      if (stored) return stored;
      // Redesign visual: dark é a identidade padrão do Infopro Hub agora —
      // não depende mais da preferência do sistema. O toggle continua
      // funcionando normalmente pra quem preferir claro.
      return "dark";
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Mudou em outra janela (Agenda, Notas): acompanha aqui também.
  useEffect(() => {
    const ouvir = (e: StorageEvent) => { if (e.key === "theme" && (e.newValue === "light" || e.newValue === "dark")) setTheme(e.newValue); };
    window.addEventListener("storage", ouvir);
    return () => window.removeEventListener("storage", ouvir);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return { theme, setTheme, toggleTheme };
}
