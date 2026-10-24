import { useCallback, useEffect, useState } from "react";
import {
  CHAVES_APARENCIA, EVENTO_APARENCIA, aplicarAparencia, guardarAparencia, lerAparencia, modoDoTema,
  type Aparencia, type Destaque, type TemaVisual,
} from "@/lib/aparencia/aparencia";

type Theme = "light" | "dark";

// Aparência do app (claro/escuro, tema visual e cor de destaque — src/lib/aparencia/aparencia.ts).
// `theme` continua sendo o modo de fato (claro/escuro) para quem só precisa disso (Excalidraw, avisos).
// Toda janela e todo componente que usa o hook acompanha a mudança na hora: na mesma janela pelo evento
// EVENTO_APARENCIA; nas outras janelas pelo "storage".
export function useTheme() {
  const [aparencia, setAparencia] = useState<Aparencia>(lerAparencia);

  const mudar = useCallback((parcial: Partial<Aparencia>) => {
    // Parte do que está salvo (outra instância do hook pode ter mudado algo antes desta saber).
    const nova = { ...lerAparencia(), ...parcial };
    aplicarAparencia(nova);
    guardarAparencia(nova);
    setAparencia(nova);
    window.dispatchEvent(new CustomEvent<Aparencia>(EVENTO_APARENCIA, { detail: nova }));
  }, []);

  useEffect(() => {
    const daOutraJanela = (e: StorageEvent) => {
      if (e.key && CHAVES_APARENCIA.includes(e.key)) { const a = lerAparencia(); aplicarAparencia(a); setAparencia(a); }
    };
    const destaJanela = (e: Event) => setAparencia((e as CustomEvent<Aparencia>).detail);
    window.addEventListener("storage", daOutraJanela);
    window.addEventListener(EVENTO_APARENCIA, destaJanela);
    return () => { window.removeEventListener("storage", daOutraJanela); window.removeEventListener(EVENTO_APARENCIA, destaJanela); };
  }, []);

  const theme: Theme = modoDoTema(aparencia);
  // Sol/lua: no "Atual" alterna claro/escuro; num tema de papel, troca para o papel do outro modo.
  const toggleTheme = () => {
    if (aparencia.tema === "papel-vintage") mudar({ tema: "papel-preto" });
    else if (aparencia.tema === "papel-preto") mudar({ tema: "papel-vintage" });
    else mudar({ modo: aparencia.modo === "dark" ? "light" : "dark" });
  };
  const setTheme = (t: Theme) => mudar(aparencia.tema === "atual" ? { modo: t } : { tema: t === "dark" ? "papel-preto" : "papel-vintage" });

  return {
    theme, setTheme, toggleTheme,
    aparencia,
    setTema: (tema: TemaVisual) => mudar({ tema }),
    setModo: (modo: Theme) => mudar({ modo }),
    setDestaque: (destaque: Destaque, personalizada?: string) => mudar(personalizada ? { destaque, personalizada } : { destaque }),
  };
}
