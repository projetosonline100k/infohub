import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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
export interface EtapaMapa { nome: string; membro_id: string; criterios?: string | string[] }
export interface PecaMapa { id: string; titulo: string; textos: Record<string, unknown>; etapa: number }

interface Linha { grupo: string; d: string; azul: boolean }
type Modo = "documento" | "mapa";
type Filtro = "todas" | "roteiro" | "revisao" | "nenhuma";

const curva = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};
const setRef = (m: Map<string, HTMLElement>, k: string) => (el: HTMLElement | null) => { if (el) m.set(k, el); else m.delete(k); };

/** Peça sendo feita agora: a tarefa de quem é a vez (progresso e o passo atual). */
export interface AoVivo { situacao: "fila" | "fazendo"; tarefa: { progresso: number | null; observacao: string | null; situacao: string | null } | null }

// Ao vivo (18/10, Davi: "vai aparecer aqui o Junior escrevendo, o que está pensando, quais critérios
// usou?"): quem está fazendo, o progresso, e o que ele vai registrando (esteira.py pensando).
function PainelAoVivo({ quem, etapa, aoVivo, pensamentos }: {
  quem: string; etapa: string; aoVivo: AoVivo; pensamentos: { em: string; texto: string }[];
}) {
  const fazendo = aoVivo.situacao === "fazendo" && aoVivo.tarefa?.situacao === "andamento";
  const pct = Math.max(5, aoVivo.tarefa?.progresso ?? 5);
  // O pensamento mais novo à vista (rola só a lista, não a página).
  const lista = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (lista.current) lista.current.scrollTop = lista.current.scrollHeight; }, [pensamentos.length]);
  return (
    <div className="mx-auto mt-3 max-w-[1180px] px-5">
      <div className="rounded-xl border-2 border-sky-400/50 bg-sky-500/5 p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted"><CabecaBoneco nome={quem} ehIa className="h-full w-full" /></span>
          <span className="relative flex h-2.5 w-2.5">
            {fazendo && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />}
            <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", fazendo ? "bg-sky-500" : "bg-amber-500")} />
          </span>
          <p className="font-semibold">{fazendo ? `${quem} está fazendo o ${etapa.toLowerCase()}` : `Na fila do ${quem}`}</p>
          {fazendo && <span className="text-xs text-muted-foreground">· {aoVivo.tarefa?.progresso ?? 0}%</span>}
        </div>
        {fazendo ? (
          <>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} /></div>
            {aoVivo.tarefa?.observacao && <p className="mt-1.5 text-xs text-muted-foreground">Agora: {aoVivo.tarefa.observacao}</p>}
          </>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Ele começa assim que terminar o que está fazendo. Daqui você acompanha tudo ao vivo: o que ele pensa, os trechos e os critérios.</p>
        )}
        {pensamentos.length > 0 && (
          <div ref={lista} className="mt-2 max-h-48 space-y-1.5 overflow-y-auto border-t pt-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">O que o {quem} está pensando</p>
            {pensamentos.map((p, i) => (
              <p key={i} className={cn("flex gap-2 text-[12.5px] leading-snug", i === pensamentos.length - 1 && fazendo ? "text-foreground" : "text-muted-foreground")}>
                <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">{new Date(p.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                <span>💭 {p.texto}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MapaPeca({ peca, etapas, nomeDe, onFalar, aoVivo = null }: {
  peca: PecaMapa; etapas: EtapaMapa[]; nomeDe: (id: string) => string; aoVivo?: AoVivo | null;
  /** Clicou num bloco: conversa com quem fez, já sobre aquele trecho. */
  onFalar: (membroId: string, texto: string) => void;
}) {
  const [modo, setModo] = useState<Modo>(() => {
    try { return localStorage.getItem("esteira:modo") === "mapa" ? "mapa" : "documento"; } catch { return "documento"; }
  });
  const trocar = (m: Modo) => { setModo(m); try { localStorage.setItem("esteira:modo", m); } catch { /* sem storage */ } };
  // Olho (18/10: "em vez de uma opção de ler, queria apenas um olho, onde eu marco ou desmarco"):
  // aberto = mudanças e anotações à vista; fechado = o roteiro final limpo, para ler.
  const [marcas, setMarcas] = useState(() => { try { return localStorage.getItem("esteira:marcas") !== "nao"; } catch { return true; } });
  const alternarMarcas = () => setMarcas((v) => { try { localStorage.setItem("esteira:marcas", v ? "nao" : "sim"); } catch { /* sem storage */ } return !v; });
  // Filtro das anotações (18/10: "tem muita info, quero ver somente o que o Elias está trazendo").
  // Começa no revisor: o Davi revisa só o fim da esteira.
  const [filtroSalvo, setFiltroSalvo] = useState<Filtro>(() => {
    try { return (localStorage.getItem("esteira:filtro") as Filtro) || "revisao"; } catch { return "revisao"; }
  });
  const filtrar = (f: Filtro) => { setFiltroSalvo(f); try { localStorage.setItem("esteira:filtro", f); } catch { /* sem storage */ } };

  const textos = peca.textos ?? {};
  const { roteiro, revisao, origem } = montarPeca(textos, etapas);
  const ideia = typeof textos.Ideia === "string" ? textos.Ideia : null;
  // Sem revisão ainda, "só o revisor" mostra as do roteirista (senão a tela fica vazia).
  const filtro: Filtro = filtroSalvo === "revisao" && !revisao ? "todas" : filtroSalvo;
  const verRoteiro = filtro === "todas" || filtro === "roteiro";
  const verRevisao = filtro === "todas" || filtro === "revisao";
  const assinatura = JSON.stringify([peca.textos, peca.titulo, modo, filtro]);

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
  const [copiado, setCopiado] = useState(false);

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
  // Conferência dos critérios de cada etapa (esteira.py checagem): número a número, ✓ ou ✗.
  const checagem = (textos._checagem as Record<string, { n: number; ok: boolean; obs?: string }[]> | undefined) ?? {};
  const criteriosDe = (e: EtapaMapa) => (Array.isArray(e.criterios) ? e.criterios : (e.criterios ?? "").split("\n").map((l) => l.replace(/^\s*\d+[.)-]\s*/, "")))
    .map((x) => String(x).trim()).filter(Boolean);
  const conferencias = etapas.filter((e) => checagem[e.nome]?.length)
    .filter((e) => (e.nome === roteiro?.etapa.nome ? verRoteiro : e.nome === revisao?.etapa.nome ? verRevisao : filtro !== "nenhuma"))
    .map((e) => ({ e, itens: checagem[e.nome], crit: criteriosDe(e) }));
  const opcoesFiltro: [Filtro, string][] = [["todas", "Todas"], ...(roteiro ? [["roteiro", nomeDe(roteiro.etapa.membro_id)] as [Filtro, string]] : []),
    ...(revisao ? [["revisao", nomeDe(revisao.etapa.membro_id)] as [Filtro, string]] : []), ["nenhuma", "Nenhuma"]];
  const seletor = (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 bg-muted/30 px-4 pt-3 backdrop-blur">
      {conferencias.map(({ e, itens, crit }) => (
        <div key={e.nome} className="mr-auto flex flex-wrap items-center gap-1 text-[11px]">
          <span className="font-semibold text-muted-foreground">Critérios do {nomeDe(e.membro_id)}:</span>
          {itens.map((c) => (
            <span key={c.n} title={`${c.n}. ${crit[c.n - 1] ?? ""}${c.obs ? `\n→ ${c.obs}` : ""}`}
              className={cn("cursor-help rounded-full px-1.5 py-0.5 font-semibold", c.ok ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/15 text-rose-700 dark:text-rose-300")}>
              {c.n} {c.ok ? "✓" : "✗"}
            </span>
          ))}
        </div>
      ))}
      {marcas && <div className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Anotações:</span>
        <div className="inline-flex rounded-lg border bg-card p-0.5 font-medium">
          {opcoesFiltro.map(([f, rotulo]) => (
            <button key={f} type="button" onClick={() => filtrar(f)}
              className={cn("rounded-md px-2.5 py-1", filtro === f ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60")}>{rotulo}</button>
          ))}
        </div>
      </div>}
      <button type="button" onClick={alternarMarcas} title={marcas ? "Esconder mudanças e anotações (só o texto final)" : "Mostrar mudanças e anotações"}
        className={cn("flex h-8 w-8 items-center justify-center rounded-lg border bg-card", marcas ? "text-foreground" : "text-muted-foreground")}>
        {marcas ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
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

  const etapaAtual = etapas[Math.min(peca.etapa, etapas.length - 1)];
  const pensamentos = ((textos._pensamento as Record<string, { em: string; texto: string }[]> | undefined) ?? {})[etapaAtual?.nome ?? ""] ?? [];
  const painel = aoVivo && etapaAtual && peca.etapa < etapas.length
    ? <PainelAoVivo quem={nomeDe(etapaAtual.membro_id)} etapa={etapaAtual.nome} aoVivo={aoVivo} pensamentos={pensamentos} /> : null;

  // ======================= Mapa: roteiro (esquerda) → revisão (direita) =======================
  if (modo === "mapa" && marcas) {
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
        {painel}
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
                      {t.nota && verRoteiro && <span className="mt-1.5 flex gap-1.5 border-t pt-1.5 text-[11.5px] text-muted-foreground"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />{t.nota}</span>}
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
                      {t.nota && verRevisao && <span className="mt-1.5 flex gap-1.5 border-t pt-1.5 text-[11.5px] text-muted-foreground"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-500" />{t.nota}</span>}
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

  // ======================= Ler: o roteiro final, limpo (18/10: "ver o roteiro completo, sem os vermelhos, para ler mesmo") =======================
  if (!marcas) {
    const final = (revisao ?? roteiro)?.trechos.map((t) => t.texto) ?? [];
    const corrido = final.join("\n\n");
    return (
      <div className="h-full overflow-y-auto rounded-xl border bg-muted/30">
        {seletor}
        {painel}
        <article className="mx-auto my-4 max-w-[760px] rounded-lg border bg-card px-12 py-10 shadow-sm">
          <h1 className="mb-6 text-2xl font-bold leading-tight">{peca.titulo}</h1>
          {final.length ? final.map((t, i) => <p key={i} className="mb-4 whitespace-pre-line text-[17px] leading-relaxed">{t}</p>)
            : <p className="text-sm text-muted-foreground">Ainda sem texto: o roteiro aparece aqui assim que ele escrever.</p>}
          {final.length > 0 && (
            <div className="mt-6 flex items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
              <span>{corrido.length.toLocaleString("pt-BR")} caracteres · versão {revisao ? `revisada pelo ${nomeDe(revisao.etapa.membro_id)}` : `do ${nomeDe(roteiro!.etapa.membro_id)}`}</span>
              <button type="button" className="ml-auto rounded-md border px-2 py-1 font-medium hover:bg-muted"
                onClick={() => { void navigator.clipboard.writeText(`${peca.titulo}\n\n${corrido}`); setCopiado(true); window.setTimeout(() => setCopiado(false), 1500); }}>
                {copiado ? "Copiado ✓" : "Copiar texto"}
              </button>
            </div>
          )}
        </article>
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
  ].filter((n) => (n.azul ? verRevisao : verRoteiro)).sort((a, b) => a.k - b.k || Number(a.azul) - Number(b.azul));
  pares.current = notas.map((n) => ({ dir: n.chave, esq: `p${n.k}`, azul: n.azul, grupo: `p${n.k}` }));
  const corNota = new Map<number, boolean>();
  for (const n of notas) corNota.set(n.k, (corNota.get(n.k) ?? false) || n.azul);

  return (
    <div className="h-full overflow-y-auto rounded-xl border bg-muted/30">
      {seletor}
      {painel}
      <div ref={caixa} className="relative mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_280px] gap-x-14 px-5 py-4">
        {svg}
        <article className="min-w-0 rounded-lg border bg-card px-10 py-9 shadow-sm">
          {ideia && <p className="mb-2 text-xs text-muted-foreground">Ideia: {ideia}</p>}
          <h1 className="mb-6 text-2xl font-bold leading-tight">{peca.titulo}</h1>
          {!paragrafos.length && <p className="text-sm text-muted-foreground">{aoVivo ? "O texto vai aparecendo aqui, trecho por trecho, conforme ele escreve." : "Ainda sem texto: o roteiro aparece aqui assim que ele escrever."}</p>}
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
          {notas.length === 0 && paragrafos.length > 0 && filtro === "todas" && (
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
