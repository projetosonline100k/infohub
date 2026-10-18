import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { diferencaPalavras, lerTrechos, mudou, type Trecho } from "@/lib/conteudo/trechos";
import { CabecaBoneco } from "./BonecoMesa";

// A peça da esteira lida como documento, com as anotações ao lado ligadas por linhas ao trecho
// (pedido do Davi, 17/10/2026: "precisa ser uma visualização igual de docs mesmo, só que na
// pegada de mapa mental, onde os comentários aparecem do lado"). O texto é a versão mais nova
// (o que a revisão mudou aparece riscado/verde); à direita, o porquê do roteirista (verde) e o
// ajuste do revisor (azul), cada um puxado por uma linha do seu parágrafo. Clicar num parágrafo
// ou numa nota abre a conversa com quem fez, já sobre aquele trecho.
export interface EtapaMapa { nome: string; membro_id: string }
export interface PecaMapa { id: string; titulo: string; textos: Record<string, unknown>; etapa: number }

interface Nota { chave: string; k: number; texto: string; quem: string; membroId: string; azul: boolean }
interface Linha { k: number; d: string; azul: boolean }

export function MapaPeca({ peca, etapas, nomeDe, onFalar }: {
  peca: PecaMapa; etapas: EtapaMapa[]; nomeDe: (id: string) => string;
  /** Clicou num trecho/nota: conversa com quem fez, já sobre aquele trecho. */
  onFalar: (membroId: string, texto: string) => void;
}) {
  const textos = peca.textos ?? {};
  const todos = (textos._trechos as Record<string, unknown> | undefined) ?? {};
  // Etapas que já escreveram trechos, na ordem da esteira (ex.: Roteiro · Junior, Revisão · Elias).
  // i: posição na esteira (0 headline, 1 roteiro, 2+ revisão): quem vem depois do roteiro "ajustou" (azul).
  const colunas = etapas.map((e, i) => ({ e, i, trechos: lerTrechos(todos[e.nome]) })).filter((c) => c.trechos.length);
  // Sem trechos: o texto corrido da etapa mais avançada, em parágrafos.
  const corrido = [...etapas].reverse().map((e) => ({ e, t: textos[e.nome] })).find((x) => typeof x.t === "string" && (x.t as string).trim());
  const paragrafos: { k: number; final: Trecho; original?: string; membroId: string }[] = colunas.length
    ? Array.from({ length: Math.max(...colunas.map((c) => c.trechos.length)) }, (_, k) => {
      const ult = [...colunas].reverse().find((c) => c.trechos[k])!;
      return { k, final: ult.trechos[k], original: colunas[0].trechos[k]?.texto, membroId: ult.e.membro_id };
    })
    : corrido
      ? (corrido.t as string).split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((t, k) => ({ k, final: { texto: t }, membroId: corrido.e.membro_id }))
      : [];
  const notas: Nota[] = colunas.flatMap((c, ci) => c.trechos.flatMap((t, k) => (t.nota
    ? [{ chave: `${ci}-${k}`, k, texto: t.nota, quem: nomeDe(c.e.membro_id), membroId: c.e.membro_id, azul: ci > 0 || c.i > 1 }] : [])));
  const ideia = typeof textos.Ideia === "string" ? textos.Ideia : null;
  const assinatura = JSON.stringify([peca.textos, peca.titulo]);

  const [ativo, setAtivo] = useState<number | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const refsP = useRef(new Map<number, HTMLElement>());
  const refsN = useRef(new Map<string, HTMLElement>());
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [alturaSvg, setAlturaSvg] = useState(0);
  const notasRef = useRef(notas);
  notasRef.current = notas;

  // Cada nota fica na altura do seu parágrafo (como comentário do Docs), sem encavalar na de cima;
  // a linha sai do parágrafo e chega na nota (curva).
  const lateral = useRef<HTMLDivElement>(null);
  const [topos, setTopos] = useState<Record<string, number>>({});
  const medir = useCallback(() => {
    const c = caixa.current, a = lateral.current;
    if (!c || !a) return;
    const base = c.getBoundingClientRect(), ra = a.getBoundingClientRect();
    const out: Linha[] = [];
    const novos: Record<string, number> = {};
    let fim = 0;
    for (const n of notasRef.current) {
      const p = refsP.current.get(n.k), el = refsN.current.get(n.chave);
      if (!p || !el) continue;
      const rp = p.getBoundingClientRect();
      const top = Math.max(rp.top - ra.top, fim);
      novos[n.chave] = top;
      fim = top + el.offsetHeight + 10;
      const x1 = rp.right - base.left + 4, y1 = rp.top - base.top + Math.min(rp.height / 2, 20);
      const x2 = ra.left - base.left - 2, y2 = ra.top - base.top + top + 18;
      const mx = (x1 + x2) / 2;
      out.push({ k: n.k, azul: n.azul, d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}` });
    }
    setTopos((t) => (JSON.stringify(t) === JSON.stringify(novos) ? t : novos));
    setAlturaLateral(fim);
    setLinhas(out);
    setAlturaSvg(c.scrollHeight);
  }, []);
  const [alturaLateral, setAlturaLateral] = useState(0);
  useLayoutEffect(() => {
    medir();
    const ro = new ResizeObserver(medir);
    if (caixa.current) ro.observe(caixa.current);
    return () => ro.disconnect();
  }, [medir, assinatura]);

  const falar = (membroId: string, k: number, texto: string) =>
    onFalar(membroId, colunas.length ? `Sobre o trecho ${k + 1} de "${peca.titulo}" ("${texto.slice(0, 80)}${texto.length > 80 ? "…" : ""}"): ` : `Sobre "${peca.titulo}": `);
  const corNota = new Map<number, boolean>();
  for (const n of notas) corNota.set(n.k, (corNota.get(n.k) ?? false) || n.azul);

  return (
    <div className="h-full overflow-y-auto rounded-xl border bg-muted/30">
      <div ref={caixa} className="relative mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_280px] gap-x-14 px-5 py-6">
        <svg className="pointer-events-none absolute left-0 top-0 w-full" style={{ height: alturaSvg }}>
          {linhas.map((l, i) => (
            <path key={i} d={l.d} fill="none" strokeWidth={ativo === l.k ? 2.5 : 1.5}
              className={cn(l.azul ? "stroke-sky-500" : "stroke-emerald-500", "transition-opacity", ativo !== null && ativo !== l.k && "opacity-20")} />
          ))}
        </svg>

        {/* A folha: igual a um documento. */}
        <article className="min-w-0 rounded-lg border bg-card px-10 py-9 shadow-sm">
          {ideia && <p className="mb-2 text-xs text-muted-foreground">Ideia: {ideia}</p>}
          <h1 className="mb-6 text-2xl font-bold leading-tight">{peca.titulo}</h1>
          {!paragrafos.length && <p className="text-sm text-muted-foreground">Ainda sem texto: o roteiro aparece aqui assim que ele escrever.</p>}
          {paragrafos.map((p) => {
            const alterado = p.original !== undefined && mudou(p.original, p.final.texto);
            return (
              <p key={p.k} ref={(el) => { if (el) refsP.current.set(p.k, el); else refsP.current.delete(p.k); }}
                onMouseEnter={() => setAtivo(p.k)} onMouseLeave={() => setAtivo(null)} onClick={() => falar(p.membroId, p.k, p.final.texto)}
                title="Clique para falar sobre este trecho"
                className={cn("-mx-3 mb-3 cursor-pointer rounded-md border-l-[3px] border-transparent px-3 py-1 text-[16px] leading-relaxed transition-colors hover:bg-muted/60",
                  corNota.has(p.k) && (alterado || corNota.get(p.k) ? "border-sky-500" : "border-emerald-500"), ativo === p.k && "bg-muted/60")}>
                {alterado ? diferencaPalavras(p.original!, p.final.texto).map((d, i) => (
                  <span key={i} className={cn(d.tipo === "saiu" && "text-rose-500/80 line-through", d.tipo === "entrou" && "rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300")}>{d.texto}</span>
                )) : p.final.texto}
              </p>
            );
          })}
        </article>

        {/* As anotações ao lado, puxadas por uma linha do parágrafo. */}
        <aside ref={lateral} className="relative" style={{ minHeight: alturaLateral }}>
          {notas.length === 0 && paragrafos.length > 0 && (
            <p className="pt-20 text-xs text-muted-foreground">Sem anotações ainda. Peça no chat: "anota o porquê de cada trecho".</p>
          )}
          {notas.map((n) => (
            <button key={n.chave} type="button" ref={(el) => { if (el) refsN.current.set(n.chave, el); else refsN.current.delete(n.chave); }}
              onMouseEnter={() => setAtivo(n.k)} onMouseLeave={() => setAtivo(null)}
              onClick={() => falar(n.membroId, n.k, paragrafos[n.k]?.final.texto ?? "")}
              style={{ top: topos[n.chave] ?? 0 }}
              className={cn("absolute inset-x-0 rounded-lg border-2 bg-card px-3 py-2 text-left text-[12.5px] leading-snug shadow-sm transition-opacity",
                n.azul ? "border-sky-400/70" : "border-emerald-400/70", ativo !== null && ativo !== n.k && "opacity-40")}>
              <span className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full bg-muted"><CabecaBoneco nome={n.quem} ehIa className="h-full w-full" /></span>
                {n.quem} · trecho {n.k + 1} · {n.azul ? "ajustou" : "pensou"}
              </span>
              {n.texto}
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}
