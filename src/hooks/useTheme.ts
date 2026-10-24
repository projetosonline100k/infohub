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
    window.dispatchEvent(new CustomEvent<Theme>("infopro-tema", { detail: theme }));
  }, [theme]);

  // Mudou em outra janela (Agenda, Notas): acompanha aqui também.
  useEffect(() => {
    const ouvir = (e: StorageEvent) => { if (e.key === "theme" && (e.newValue === "light" || e.newValue === "dark")) setTheme(e.newValue); };
    window.addEventListener("storage", ouvir);
    return () => window.removeEventListener("storage", ouvir);
  }, []);

  // Mudou nesta mesma janela por outro componente (o botão de tema): sem
  // isso, quem também usa o hook (ex.: o Excalidraw do Desenho) só via a
  // troca depois de recarregar.
  useEffect(() => {
    const ouvir = (e: Event) => { const t = (e as CustomEvent<Theme>).detail; if (t === "light" || t === "dark") setTheme(t); };
    window.addEventListener("infopro-tema", ouvir);
    return () => window.removeEventListener("infopro-tema", ouvir);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return { theme, setTheme, toggleTheme };
}
