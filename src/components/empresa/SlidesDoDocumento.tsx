import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { htmlLimpo } from "@/lib/conteudo/htmlLimpo";

// Entrega em slides (22/10, Davi: "sou bem visual; sempre que me trouxer essas coisas em escrito, tenha
// uma versão em slide mostrando as atualizações"). Cada <h2> do documento vira um slide; as imagens da
// seção aparecem grandes, uma por vez, e o texto fica embaixo. Slide que mudou na última versão ganha "novo".
interface Slide { titulo: string; imagens: string[]; html: string; texto: string }

function fatiar(html: string): Slide[] {
  const doc = new DOMParser().parseFromString(`<div>${htmlLimpo(html)}</div>`, "text/html");
  const raiz = doc.body.firstElementChild as HTMLElement;
  const slides: Slide[] = [];
  let atual: { titulo: string; nos: Element[] } = { titulo: "", nos: [] };
  const fechar = () => {
    const box = doc.createElement("div");
    atual.nos.forEach((n) => box.appendChild(n.cloneNode(true)));
    const imagens = [...box.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "").filter(Boolean);
    box.querySelectorAll("img").forEach((i) => { const p = i.closest("p"); (p && !p.textContent?.trim() ? p : i).remove(); });
    const texto = box.textContent?.trim() ?? "";
    if (atual.titulo || imagens.length || texto) slides.push({ titulo: atual.titulo, imagens, html: box.innerHTML, texto });
  };
  for (const no of [...raiz.children]) {
    if (no.tagName === "H1" || no.tagName === "H2") { fechar(); atual = { titulo: no.textContent?.trim() ?? "", nos: [] }; }
    else atual.nos.push(no);
  }
  fechar();
  return slides;
}

export function SlidesDoDocumento({ html, mudou }: { html: string; mudou?: string[] }) {
  const slides = useMemo(() => fatiar(html), [html]);
  const [i, setI] = useState(0);
  const [img, setImg] = useState(0);
  const s = slides[Math.min(i, slides.length - 1)];
  useEffect(() => { setImg(0); }, [i]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.closest("textarea, input, [contenteditable=true]"))) return;
      if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [slides.length]);
  if (!s) return null;
  const novo = (sl: Slide) => !!mudou?.some((t) => t && (sl.texto.includes(t) || sl.titulo.includes(t)));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex min-h-[360px] flex-col overflow-hidden rounded-xl border bg-gradient-to-br from-background to-muted/60 p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{i + 1} / {slides.length}</span>
          {novo(s) && <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white">novo</span>}
          <h3 className="min-w-0 truncate text-lg font-bold">{s.titulo || "Resumo"}</h3>
        </div>
        {s.imagens.length > 0 && (
          <div className="relative mb-3 flex justify-center">
            <img src={s.imagens[img]} alt="" className="max-h-[52vh] w-auto rounded-lg shadow-md" />
            {s.imagens.length > 1 && (
              <>
                <button type="button" aria-label="Imagem anterior" disabled={img === 0} onClick={() => setImg(img - 1)}
                  className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" aria-label="Próxima imagem" disabled={img === s.imagens.length - 1} onClick={() => setImg(img + 1)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                <span className="absolute bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{img + 1} de {s.imagens.length}</span>
              </>
            )}
          </div>
        )}
        {s.texto && (
          <article className={cn("prose prose-sm max-w-none break-words dark:prose-invert prose-a:text-primary", s.imagens.length ? "max-h-40 overflow-y-auto" : "text-[15px]")}
            dangerouslySetInnerHTML={{ __html: s.html }} />
        )}
        <button type="button" aria-label="Slide anterior" disabled={i === 0} onClick={() => setI(i - 1)}
          className="absolute left-0 top-0 h-full w-8 opacity-0 hover:bg-black/5 hover:opacity-100 disabled:hidden"><ChevronLeft className="mx-auto h-5 w-5" /></button>
        <button type="button" aria-label="Próximo slide" disabled={i === slides.length - 1} onClick={() => setI(i + 1)}
          className="absolute right-0 top-0 h-full w-8 opacity-0 hover:bg-black/5 hover:opacity-100 disabled:hidden"><ChevronRight className="mx-auto h-5 w-5" /></button>
      </div>
      {/* Miniaturas dos slides: o título de cada um (e a primeira imagem, se tiver). */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {slides.map((sl, k) => (
          <button key={k} type="button" onClick={() => setI(k)}
            className={cn("flex w-32 shrink-0 flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors",
              k === i ? "border-primary bg-primary/5" : "hover:bg-muted")}>
            {sl.imagens[0]
              ? <img src={sl.imagens[0]} alt="" className="h-16 w-full rounded object-cover" loading="lazy" />
              : <span className="flex h-16 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground line-clamp-3 px-1">{sl.texto.slice(0, 80)}</span>}
            <span className="flex items-center gap-1 text-[10.5px] font-medium leading-tight">
              {novo(sl) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />}
              <span className="line-clamp-2">{k + 1}. {sl.titulo || "Resumo"}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="text-center text-[11px] text-muted-foreground">← → para passar os slides</p>
    </div>
  );
}
