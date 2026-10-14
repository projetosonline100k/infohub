import { useEffect, useRef, useState } from "react";

// Desenha uma página do carrossel a partir do molde HTML do Roy (o mesmo que
// vira o PNG), em 1080×1350 reduzido pro tamanho da caixa. Usado na revisão
// pra mostrar na hora o texto que o Davi está editando.
export function PreviaPagina({ html, className }: { html: string; className?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0);
  const [doc, setDoc] = useState(html);

  // Espera uma pausa curta na digitação antes de redesenhar.
  useEffect(() => {
    const t = setTimeout(() => setDoc(html), 250);
    return () => clearTimeout(t);
  }, [html]);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(el.clientWidth / 1080);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={caixa} className={className} style={{ position: "relative", overflow: "hidden" }}>
      {escala > 0 && (
        <iframe title="Prévia da página" srcDoc={doc} sandbox="allow-scripts" scrolling="no"
          style={{ width: 1080, height: 1350, border: 0, transform: `scale(${escala})`, transformOrigin: "0 0", position: "absolute", inset: 0 }} />
      )}
    </div>
  );
}
