import { useCallback, useEffect, useRef, useState } from "react";

// Zoom da folha (24/10, Davi: "segurar ⌘ e girar a rodinha dá zoom no documento igual ao Google Docs: aumenta a
// página, não o app inteiro"). ⌘/Ctrl + rodinha (e a pinça do trackpad, que chega como Ctrl + rodinha) em cima
// da área do documento muda o zoom só da folha; ⌘0 volta para 100%. Fica guardado neste Mac/navegador.
const CHAVE = "documento:zoom";
const MIN = 0.5;
const MAX = 2.5;
const ler = () => { try { const v = Number(localStorage.getItem(CHAVE)); return v >= MIN && v <= MAX ? v : 1; } catch { return 1; } };

export function useZoomDocumento<T extends HTMLElement>() {
  const [zoom, setZoomEstado] = useState(ler);
  const [aviso, setAviso] = useState(false);
  const zoomRef = useRef(zoom);
  const timer = useRef<number>();
  const area = useRef<T | null>(null);

  const setZoom = useCallback((z: number) => {
    const novo = Math.round(Math.min(MAX, Math.max(MIN, z)) * 100) / 100;
    zoomRef.current = novo;
    setZoomEstado(novo);
    try { localStorage.setItem(CHAVE, String(novo)); } catch { /* sem storage */ }
    // Mostra "120%" por um instante, como o Docs.
    setAviso(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAviso(false), 900);
  }, []);

  // Ref de callback: a área do documento pode montar depois (carregando) e trocar.
  const [el, setEl] = useState<T | null>(null);
  const refArea = useCallback((no: T | null) => { area.current = no; setEl(no); }, []);

  useEffect(() => {
    if (!el) return;
    const rodinha = (e: WheelEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      e.preventDefault();   // senão o navegador/app dá zoom em tudo
      // Mouse: passos de ~100 → 10% por passo. Trackpad (pinça): passos pequenos → zoom suave.
      const fator = Math.exp(-e.deltaY * (Math.abs(e.deltaY) >= 50 ? 0.001 : 0.01));
      setZoom(zoomRef.current * fator);
    };
    el.addEventListener("wheel", rodinha, { passive: false });
    return () => el.removeEventListener("wheel", rodinha);
  }, [el, setZoom]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !area.current?.isConnected || area.current.offsetParent === null) return;
      if (e.key === "0") { e.preventDefault(); setZoom(1); }
      else if (e.key === "=" || e.key === "+") { e.preventDefault(); setZoom(zoomRef.current + 0.1); }
      else if (e.key === "-") { e.preventDefault(); setZoom(zoomRef.current - 0.1); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [setZoom]);

  return { zoom, setZoom, refArea, aviso };
}
