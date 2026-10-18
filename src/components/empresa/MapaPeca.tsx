import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { diferencaPalavras, montarPeca, mudou } from "@/lib/conteudo/trechos";
import { CabecaBoneco } from "./BonecoMesa";

// A peça da esteira em dois jeitos (pedido do Davi, 17/10/2026):
// - Documento: "visualização igual de docs, na pegada de mapa mental, onde os comentários aparecem
//   do lado" — o texto revisado na folha; à direita o porquê do roteirista (verde) e o ajuste do
//   revisor (azul), cada um puxado por uma linha do seu parágrafo.
// - Mapa: "estilo mapa mental, vindo do Junior para o Elias" — os trechos do roteiro à esquerda,
//   os revisados à direita, ligados trecho a trecho (azul quando mudou).
// Clicar em qualquer bloco abre a conversa com quem fez, já sobre aquele trecho.
export interface EtapaMapa { nome: string; membro_id: string }
export interface PecaMapa { id: string; titulo: string; textos: Record<string, unknown>; etapa: number }

interface Linha { grupo: string; d: string; azul: boolean }
type Modo = "documento" | "mapa";

const curva = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};
const setRef = (m: Map<string, HTMLElement>, k: string) => (el: HTMLElement | null) => { if (el) m.set(k, el); else m.delete(k); };

export function MapaPeca({ peca, etapas, nomeDe, onFalar }: {
  peca: PecaMapa; etapas: EtapaMapa[]; nomeDe: (id: string) => string;
  /** Clicou num bloco: conversa com quem fez, já sobre aquele trecho. */
  onFalar: (membroId: string, texto: string) => void;
}) {
  const [modo, setModo] = useState<Modo>(() => {
    try { return (localStorage.getItem("esteira:modo") as Modo) || "documento"; } catch { return "documento"; }
  });
  const trocar = (m: Modo) => { setModo(m); try { localStorage.setItem("esteira:modo", m); } catch { /* sem storage */ } };

  const textos = peca.textos ?? {};
  const { roteiro, revisao, origem } = montarPeca(textos, etapas);
  const ideia = typeof textos.Ideia === "string" ? textos.Ideia : null;
  const assinatura = JSON.stringify([peca.textos, peca.titulo, modo]);

  const falar = (membroId: string, n: number | null, texto: string) =>
    onFalar(membroId, n !== null ? `Sobre o trecho ${n + 1} de "${peca.titulo}" ("${texto.slice(0, 80)}${texto.length > 80 ? "…" : ""}"): ` : `Sobre "${peca.titulo}": `);

  // ------- medição comum: blocos da direita alinhados à altura do que os puxa + linhas curvas -------
  const caixa = useRef<HTMLDivElement>(null);
  const lateral = useRef<HTMLDivElement>(null);
  const esq = useRef(new Map<string, HTMLElement>());
  const dir = useRef(new Map<string, HTMLElement>());
  // Pares (bloco da direita → bloco da esquerda que o puxa), na ordem da coluna da direita.
  const pares = useRef<{ dir: string; esq: string; azul: boolean; grupo: string }[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [topos, setTopos] = useState<Record<string, number>>({});
  const [alturaLateral, setAlturaLateral] = useState(0);
  const [alturaSvg, setAlturaSvg] = useState(0);
  const [ativo, setAtivo] = useState<string | null>(null);

  const medir = useCallback(() => {
    const c = caixa.current, a = lateral.current;
    if (!c || !a) return;
    const base = c.getBoundingClientRect(), ra = a.getBoundingClientRect();
    const out: Linha[] = [];
    const novos: Record<string, number> = {};
    let fim = 0;
    for (const p of pares.current) {
      const el = dir.current.get(p.dir);
      if (!el) continue;
      const alvo = esq.current.get(p.esq);
      const re = alvo?.getBoundingClientRect();
      const top = Math.max(re ? re.top - ra.top : fim, fim);
      novos[p.dir] = top;
      fim = top + el.offsetHeight + 12;
      if (re) out.push({ grupo: p.grupo, azul: p.azul, d: curva(re.right - base.left + 4, re.top - base.top + Math.min(re.height / 2, 22), ra.left - base.left - 2, ra.top - base.top + top + 20) });
    }
    setTopos((t) => (JSON.stringify(t) === JSON.stringify(novos) ? t : novos));
    setAlturaLateral(fim);
    setLinhas(out);
    setAlturaSvg(c.scrollHeight);
  }, []);
  useLayoutEffect(() => {
    medir();
    const ro = new ResizeObserver(medir);
    if (caixa.current) ro.observe(caixa.current);
    return () => ro.disconnect();
  }, [medir, assinatura]);

  const apagado = (g: string) => ativo !== null && ativo !== g;
  const svg = (
    <svg className="pointer-events-none absolute left-0 top-0 w-full" style={{ height: alturaSvg }}>
      {linhas.map((l, i) => (
        <path key={i} d={l.d} fill="none" strokeWidth={ativo === l.grupo ? 2.5 : 1.6}
          className={cn(l.azul ? "stroke-sky-500" : "stroke-emerald-500", "transition-opacity", apagado(l.grupo) && "opacity-15")} />
      ))}
    </svg>
  );
  const seletor = (
    <div className="sticky top-0 z-10 flex justify-end bg-muted/30 px-4 pt-3 backdrop-blur">
      <div className="inline-flex rounded-lg border bg-card p-0.5 text-xs font-medium">
        {(["documento", "mapa"] as Modo[]).map((m) => (
          <button key={m} type="button" onClick={() => trocar(m)}
            className={cn("rounded-md px-3 py-1", modo === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            {m === "documento" ? "Documento" : `Mapa${roteiro && revisao ? ` · ${nomeDe(roteiro.etapa.membro_id)} → ${nomeDe(revisao.etapa.membro_id)}` : ""}`}
          </button>
        ))}
      </div>
    </div>
  );

  // ======================= Mapa: roteiro (esquerda) → revisão (direita) =======================
  if (modo === "mapa") {
    const usados = new Set(origem.filter((x): x is number => x !== null));
    pares.current = revisao ? revisao.trechos.map((t, k) => {
      const j = origem[k];
      const alterou = j === null || mudou(roteiro?.trechos[j]?.texto, t.texto);
      return { dir: `r${k}`, esq: j !== null ? `j${j}` : "", azul: alterou, grupo: j !== null ? `j${j}` : `r${k}` };
    }) : [];
    const cabeca = (membroId: string, nome: string) => (
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="h-7 w-7 overflow-hidden rounded-full bg-muted"><CabecaBoneco nome={nomeDe(membroId)} ehIa className="h-full w-full" /></span>
        {nomeDe(membroId)} <span className="text-xs font-normal text-muted-foreground">· {nome}</span>
      </p>
    );
    return (
      <div className="h-full overflow-y-auto rounded-xl border bg-muted/30">
        {seletor}
        <div className="mx-auto max-w-[1180px] px-5 pt-3">
          {ideia && <p className="text-xs text-muted-foreground">Ideia: {ideia}</p>}
          <p className="inline-block rounded-lg border-2 border-amber-400/70 bg-amber-500/10 px-3 py-1.5 text-sm font-semibold">{peca.titulo}</p>
        </div>
        {!roteiro ? <p className="p-8 text-sm text-muted-foreground">Ainda sem roteiro: o mapa aparece assim que ele escrever.</p> : (
          <div ref={caixa} className="relative mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-24 px-5 py-5">
            {svg}
            <div className="min-w-0">
              {cabeca(roteiro.etapa.membro_id, roteiro.etapa.nome)}
              <div className="flex flex-col gap-3">
                {roteiro.trechos.map((t, j) => {
                  const cortado = !!revisao && !usados.has(j);
                  return (
                    <button key={j} type="button" ref={setRef(esq.current, `j${j}`)} onMouseEnter={() => setAtivo(`j${j}`)} onMouseLeave={() => setAtivo(null)}
                      onClick={() => falar(roteiro.etapa.membro_id, roteiro.anotado ? j : null, t.texto)}
                      className={cn("rounded-xl border-2 bg-card px-3 py-2 text-left text-[13px] leading-relaxed shadow-sm transition-opacity",
                        t.nota ? "border-emerald-400/70" : "border-border", cortado && "border-dashed opacity-60", apagado(`j${j}`) && "opacity-40")}>
                      {t.texto}
                      {t.nota && <span className="mt-1.5 flex gap-1.5 border-t pt-1.5 text-[11.5px] text-muted-foreground"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />{t.nota}</span>}
                      {cortado && <span className="mt-1 block text-[10.5px] font-medium text-rose-500">✂ cortado na revisão</span>}
                    </button>
                  );
                })}
                {roteiro.extras.length > 0 && (
                  <div className="rounded-xl border-2 border-emerald-400/50 bg-emerald-500/5 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                    <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide">Anotações do {nomeDe(roteiro.etapa.membro_id)}</p>
                    {roteiro.extras.map((x, i) => <p key={i} className="mb-1 whitespace-pre-line">{x}</p>)}
                  </div>
                )}
              </div>
            </div>
            <div className="min-w-0">
              {revisao ? cabeca(revisao.etapa.membro_id, revisao.etapa.nome) : <p className="mb-3 text-sm text-muted-foreground">Revisão ainda não feita.</p>}
              <div ref={lateral} className="relative" style={{ minHeight: alturaLateral }}>
                {revisao?.trechos.map((t, k) => {
                  const j = origem[k];
                  const antes = j !== null ? roteiro.trechos[j]?.texto : undefined;
                  const alterou = antes !== undefined && mudou(antes, t.texto);
                  const g = j !== null ? `j${j}` : `r${k}`;
                  return (
                    <button key={k} type="button" ref={setRef(dir.current, `r${k}`)} style={{ top: topos[`r${k}`] ?? 0 }}
                      onMouseEnter={() => setAtivo(g)} onMouseLeave={() => setAtivo(null)}
                      onClick={() => falar(revisao.etapa.membro_id, k, t.texto)}
                      className={cn("absolute inset-x-0 rounded-xl border-2 bg-card px-3 py-2 text-left text-[13px] leading-relaxed shadow-sm transition-opacity",
                        alterou || j === null || t.nota ? "border-sky-400/70" : "border-border", apagado(g) && "opacity-40")}>
                      {j === null && <span className="mb-1 block text-[10.5px] font-semibold text-sky-600 dark:text-sky-400">+ trecho novo</span>}
                      {alterou ? diferencaPalavras(antes!, t.texto).map((d, i) => (
                        <span key={i} className={cn(d.tipo === "saiu" && "text-rose-500/80 line-through", d.tipo === "entrou" && "rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300")}>{d.texto}</span>
                      )) : t.texto}
                      {!alterou && j !== null && !t.nota && <span className="mt-1 block text-[10.5px] text-muted-foreground">✓ manteve</span>}
                      {t.nota && <span className="mt-1.5 flex gap-1.5 border-t pt-1.5 text-[11.5px] text-muted-foreground"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-500" />{t.nota}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ======================= Documento: folha + anotações ao lado =======================
  const folha = revisao ?? roteiro;
  const paragrafos = (folha?.trechos ?? []).map((t, k) => {
    const j = revisao ? origem[k] : k;
    return { k, texto: t.texto, original: revisao && j !== null ? roteiro?.trechos[j]?.texto : undefined, membroId: folha!.etapa.membro_id };
  });
  // Notas: as do revisor no parágrafo dele; as do roteirista no parágrafo que veio daquele trecho.
  const notas = [
    ...(roteiro?.trechos ?? []).flatMap((t, j) => {
      const k = revisao ? origem.indexOf(j) : j;
      return t.nota && k >= 0 ? [{ chave: `nj${j}`, k, texto: t.nota, quem: nomeDe(roteiro!.etapa.membro_id), membroId: roteiro!.etapa.membro_id, azul: false }] : [];
    }),
    ...(revisao?.trechos ?? []).flatMap((t, k) => (t.nota ? [{ chave: `nr${k}`, k, texto: t.nota, quem: nomeDe(revisao!.etapa.membro_id), membroId: revisao!.etapa.membro_id, azul: true }] : [])),
  ].sort((a, b) => a.k - b.k || Number(a.azul) - Number(b.azul));
  pares.current = notas.map((n) => ({ dir: n.chave, esq: `p${n.k}`, azul: n.azul, grupo: `p${n.k}` }));
  const corNota = new Map<number, boolean>();
  for (const n of notas) corNota.set(n.k, (corNota.get(n.k) ?? false) || n.azul);

  return (
    <div className="h-full overflow-y-auto rounded-xl border bg-muted/30">
      {seletor}
      <div ref={caixa} className="relative mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_280px] gap-x-14 px-5 py-4">
        {svg}
        <article className="min-w-0 rounded-lg border bg-card px-10 py-9 shadow-sm">
          {ideia && <p className="mb-2 text-xs text-muted-foreground">Ideia: {ideia}</p>}
          <h1 className="mb-6 text-2xl font-bold leading-tight">{peca.titulo}</h1>
          {!paragrafos.length && <p className="text-sm text-muted-foreground">Ainda sem texto: o roteiro aparece aqui assim que ele escrever.</p>}
          {paragrafos.map((p) => {
            const alterado = p.original !== undefined && mudou(p.original, p.texto);
            return (
              <p key={p.k} ref={setRef(esq.current, `p${p.k}`)}
                onMouseEnter={() => setAtivo(`p${p.k}`)} onMouseLeave={() => setAtivo(null)} onClick={() => falar(p.membroId, p.k, p.texto)}
                title="Clique para falar sobre este trecho"
                className={cn("-mx-3 mb-3 cursor-pointer rounded-md border-l-[3px] border-transparent px-3 py-1 text-[16px] leading-relaxed transition-colors hover:bg-muted/60",
                  corNota.has(p.k) && (corNota.get(p.k) ? "border-sky-500" : "border-emerald-500"), ativo === `p${p.k}` && "bg-muted/60")}>
                {alterado ? diferencaPalavras(p.original!, p.texto).map((d, i) => (
                  <span key={i} className={cn(d.tipo === "saiu" && "text-rose-500/80 line-through", d.tipo === "entrou" && "rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300")}>{d.texto}</span>
                )) : p.texto}
              </p>
            );
          })}
        </article>
        <aside ref={lateral} className="relative" style={{ minHeight: alturaLateral }}>
          {notas.length === 0 && paragrafos.length > 0 && (
            <p className="pt-20 text-xs text-muted-foreground">Sem anotações ainda. Peça no chat: "anota o porquê de cada trecho".</p>
          )}
          {notas.map((n) => (
            <button key={n.chave} type="button" ref={setRef(dir.current, n.chave)} style={{ top: topos[n.chave] ?? 0 }}
              onMouseEnter={() => setAtivo(`p${n.k}`)} onMouseLeave={() => setAtivo(null)}
              onClick={() => falar(n.membroId, n.k, paragrafos[n.k]?.texto ?? "")}
              className={cn("absolute inset-x-0 rounded-lg border-2 bg-card px-3 py-2 text-left text-[12.5px] leading-snug shadow-sm transition-opacity",
                n.azul ? "border-sky-400/70" : "border-emerald-400/70", apagado(`p${n.k}`) && "opacity-40")}>
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
