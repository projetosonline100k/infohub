import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// Prévia de celular de verdade (25/10, Davi: "não aparece dessa forma no celular"). O conteúdo é desenhado
// dentro de um iframe de 375 px (mesma página, via portal), então os tamanhos de tela (sm:, md:, dvh) valem
// para a largura do celular, e não para a do computador — fica igual ao link aberto no iPhone.
// Os estilos do app são copiados para dentro do iframe (e acompanhados, por causa do recarregar do Vite).
export function MolduraCelular({ escuro, children }: { escuro: boolean; children: ReactNode }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [corpo, setCorpo] = useState<HTMLElement | null>(null);
  const fundo = escuro ? "#0a0a0a" : "#ffffff";

  useEffect(() => {
    const doc = iframe.current?.contentDocument;
    if (!doc) return;
    doc.open(); // Sem barra de rolagem ocupando lugar (no celular ela flutua e some): a tela fica com os 375 px inteiros.
    doc.write("<!doctype html><html><head><meta charset='utf-8'><style>html{scrollbar-width:none}::-webkit-scrollbar{display:none}</style></head><body></body></html>"); doc.close();
    const copiar = () => {
      doc.head.querySelectorAll("[data-copiado]").forEach((n) => n.remove());
      document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((n) => {
        const c = n.cloneNode(true) as HTMLElement;
        c.setAttribute("data-copiado", "");
        doc.head.appendChild(c);
      });
    };
    copiar();
    const obs = new MutationObserver(copiar);
    obs.observe(document.head, { childList: true, subtree: true, characterData: true });
    setCorpo(doc.body);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const doc = iframe.current?.contentDocument;
    if (!doc) return;
    doc.documentElement.style.background = fundo;
    doc.documentElement.style.height = "100%";
    Object.assign(doc.body.style, { margin: "0", minHeight: "100%", background: fundo, overscrollBehavior: "none" });
    doc.body.className = cn("antialiased", escuro ? "quiz-escuro text-neutral-100" : "quiz-claro text-neutral-900");
  }, [fundo, escuro, corpo]);

  return (
    <div className="relative mx-auto flex min-h-[420px] w-[395px] max-w-full flex-1 flex-col rounded-[2.6rem] bg-neutral-900 p-[10px] shadow-xl md:max-h-[820px]">
      <div className="pointer-events-none absolute left-1/2 top-[10px] z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-neutral-900" />
      <iframe ref={iframe} title="Prévia no celular" className="min-h-0 w-full flex-1 rounded-[2rem]" style={{ background: fundo }} />
      {corpo && createPortal(
        <div className="flex min-h-screen flex-col px-5 pb-6 pt-7">{children}</div>,
        corpo,
      )}
    </div>
  );
}

// Celular completo na tela (14/11, Davi: "preciso conseguir ver o celular completo, as informações saem cortadas"): a moldura de 395 × 820 é ENCOLHIDA
// para caber no espaço que a caixa tem (altura e largura), em vez de ser cortada ou obrigar a rolar. O que for mais longo que a tela rola dentro dela, como no celular.
export function MolduraCelularEscalada({ escuro, children }: { escuro: boolean; children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.7);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(Math.min(1, Math.max(0.4, Math.min((el.clientHeight - 8) / 820, (el.clientWidth - 4) / 395))));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={caixa} className="flex min-h-[360px] min-w-0 flex-1 justify-center overflow-hidden">
      <div className="shrink-0" style={{ width: 395 * escala, height: 820 * escala }}>
        {/* transform em vez de zoom: no app do Mac o zoom encolhia o iframe duas vezes. */}
        <div className="flex h-[820px] w-[395px] origin-top-left flex-col" style={{ transform: `scale(${escala})` }}>
          <MolduraCelular escuro={escuro}>{children}</MolduraCelular>
        </div>
      </div>
    </div>
  );
}
