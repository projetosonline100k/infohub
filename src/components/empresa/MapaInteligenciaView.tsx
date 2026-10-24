import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, FileText, Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isDesktop } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { CORES_PILAR, MODELO_ROTEIRO, lerMapa, type MapaInteligencia, type PilarMapa } from "@/lib/conteudo/mapaInteligencia";
import { PainelNoMapa, type MembroMapa, type OrigemPilar } from "./PainelNoMapa";

// Mapa da inteligência de um funcionário (24/10, Davi: "quero a inteligência de cada carinha: cadastrar as
// informações e visualizar em mapa mental"; depois: "já era para aparecer as info aí, as skills, tudo").
// Centro com o nome; em volta, os pilares que o Davi escreve (editáveis) e os pilares "do cadastro" (manual,
// critérios e formatos de cada etapa, skills e aprendizados), que mostram tudo o que ele já usa.
const db = supabase as unknown as SupabaseClient;

const W = 1600;
const CENTRO = { w: 250, h: 230 };
const PILAR = { w: 300, h: 130 };
const FOLHA = { w: 220, h: 40, passo: 50, distancia: 320 };
const COLUNA_X = { esq: 470, dir: 1130 };
const MAX_ITENS_AUTO = 8;

/** Pilar do cadastro: `origem` diz o que o clique abre; `refs[k]` é o id do item k (ex.: a skill). */
type Pilar = PilarMapa & { auto?: boolean; origem?: OrigemPilar; refs?: (string | undefined)[]; mais?: string };

interface Etapa { nome: string; membro_id: string; criterios?: string | string[] | null; formatos?: { nome?: string; texto?: string }[] | null }

function Texto({ valor, editar, onMudar, className, placeholder, multilinha }: {
  valor: string; editar: boolean; onMudar: (v: string) => void; className?: string; placeholder?: string; multilinha?: boolean;
}) {
  if (!editar) return <span className={cn("whitespace-pre-line", className)}>{valor || <span className="opacity-40">{placeholder}</span>}</span>;
  return multilinha ? (
    <textarea value={valor} onChange={(e) => onMudar(e.target.value)} placeholder={placeholder} rows={2}
      className={cn("w-full resize-none rounded bg-foreground/5 px-1 outline-none ring-1 ring-foreground/10 focus:ring-foreground/40", className)} />
  ) : (
    <input value={valor} onChange={(e) => onMudar(e.target.value)} placeholder={placeholder}
      className={cn("w-full rounded bg-foreground/5 px-1 outline-none ring-1 ring-foreground/10 focus:ring-foreground/40", className)} />
  );
}

const linhas = (t: string | null | undefined) => (t ?? "").split(/\n+/).map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);
const curto = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Pilares "do cadastro": o que o funcionário já usa em cada pedido (manual, etapas, skills, documentos, aprendizados). */
async function pilaresDoCadastro(membroId: string): Promise<{ pilares: Pilar[]; membro: MembroMapa | null }> {
  const { data: m } = await db.from("membros").select("id, nome, funcao, manual, cliente_id, setor_id, conta_id, eh_ia").eq("id", membroId).maybeSingle();
  const membro = m as MembroMapa | null;
  if (!membro) return { pilares: [], membro: null };
  const agente = membro.nome.trim().toLowerCase();
  const [setores, intel] = await Promise.all([
    membro.cliente_id ? db.from("setores").select("id, nome, esteira").eq("cliente_id", membro.cliente_id) : Promise.resolve({ data: [] }),
    db.from("inteligencia_membros").select("id, nome, tipo, conteudo, status").eq("agente", agente)
      .or(`escopo.eq.geral${membro.cliente_id ? `,cliente_id.eq.${membro.cliente_id}` : ""}`).order("nome"),
  ]);
  const pilares: Pilar[] = [];
  const manual = linhas(membro.manual);
  pilares.push({ titulo: "Manual", descricao: "Como ele trabalha (cadastro do funcionário)", itens: manual.map((l) => curto(l)), auto: true, origem: { tipo: "manual" }, mais: "Escrever no manual" });
  for (const s of (setores.data ?? []) as { id: string; nome: string; esteira: Etapa[] | null }[]) {
    for (const e of (Array.isArray(s.esteira) ? s.esteira : []).filter((x) => x.membro_id === membroId)) {
      const crit = Array.isArray(e.criterios) ? e.criterios.map(String) : linhas(e.criterios as string | null);
      pilares.push({ titulo: `Critérios · ${e.nome}`, descricao: `O que ele confere em ${e.nome} (${s.nome})`, itens: crit.map((c) => curto(c)),
        auto: true, origem: { tipo: "etapa", setorId: s.id, etapa: e.nome, campo: "criterios" }, mais: "Novo critério" });
      const formatos = (e.formatos ?? []).filter((f) => (f.texto ?? "").trim() || (f.nome ?? "").trim());
      pilares.push({ titulo: `Formatos · ${e.nome}`, descricao: "Estruturas de referência que ele segue", itens: formatos.map((f, i) => f.nome?.trim() || `Formato ${i + 1}`),
        auto: true, origem: { tipo: "etapa", setorId: s.id, etapa: e.nome, campo: "formatos" }, mais: "Novo formato" });
    }
  }
  const lista = (intel.data ?? []) as { id: string; nome: string; tipo: string | null; conteudo: string | null; status: string | null }[];
  const skills = lista.filter((i) => i.nome.startsWith("Skill:") && i.status === "pronto");
  pilares.push({ titulo: "Skills", descricao: "Métodos que ele segue em cada pedido (clique para abrir)", itens: skills.map((i) => i.nome.replace(/^Skill:\s*/, "")),
    refs: skills.map((i) => i.id), auto: true, origem: { tipo: "skills" }, mais: "Nova skill" });
  const docs = lista.filter((i) => !i.nome.startsWith("Skill:") && i.tipo !== "aprendizado");
  pilares.push({ titulo: "Documentos", descricao: "PDFs, vídeos, textos e links que ele estudou", itens: docs.map((i) => curto(i.nome, 40) + (i.status !== "pronto" ? " · na fila" : "")),
    auto: true, origem: { tipo: "conhecimento" }, mais: "Conectar documento ou subir arquivo" });
  const aprendizados = lista.filter((i) => i.tipo === "aprendizado" && i.status === "pronto").flatMap((i) => linhas(i.conteudo)).map((l) => curto(l));
  pilares.push({ titulo: "Aprendizados", descricao: "Correções que você já fez com ele", itens: aprendizados, auto: true, origem: { tipo: "aprendizados" }, mais: "Novo aprendizado" });
  return { pilares, membro };
}

export function MapaInteligenciaView({ membro, aberto, onFechar, onSalvo }: {
  membro: { id: string; nome: string; funcao?: string | null } | null;
  aberto: boolean;
  onFechar: () => void;
  onSalvo?: (mapa: MapaInteligencia) => void;
}) {
  const [mapa, setMapa] = useState<MapaInteligencia | null>(null);
  const [doCadastro, setDoCadastro] = useState<Pilar[]>([]);
  const [membroMapa, setMembroMapa] = useState<MembroMapa | null>(null);
  const [noAberto, setNoAberto] = useState<OrigemPilar | null>(null);
  const recarregarCadastro = async () => {
    if (!membro) return;
    const r = await pilaresDoCadastro(membro.id);
    setDoCadastro(r.pilares); setMembroMapa(r.membro);
  };
  const [editar, setEditar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mudou, setMudou] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const [tamanho, setTamanho] = useState({ w: 1, h: 1 });

  useEffect(() => {
    if (!aberto || !membro) return;
    setMapa(null); setDoCadastro([]); setEditar(false); setMudou(false); setNoAberto(null);
    void (async () => {
      const [{ data }, cadastro] = await Promise.all([
        db.from("membros").select("mapa_inteligencia").eq("id", membro.id).maybeSingle(),
        pilaresDoCadastro(membro.id),
      ]);
      setMapa(lerMapa((data as { mapa_inteligencia?: unknown } | null)?.mapa_inteligencia) ?? { pilares: [] });
      setDoCadastro(cadastro.pilares); setMembroMapa(cadastro.membro);
    })();
  }, [aberto, membro]);

  useLayoutEffect(() => {
    if (!aberto) return;
    const medir = () => { const el = caixa.current; if (el) setTamanho({ w: el.clientWidth, h: el.clientHeight }); };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [aberto, mapa]);

  // Os pilares do Davi primeiro (numerados), depois os do cadastro; divididos entre os dois lados do centro.
  const todos: Pilar[] = useMemo(() => [
    ...(mapa?.pilares ?? []),
    ...doCadastro.map((p) => ({ ...p, itens: p.itens.slice(0, MAX_ITENS_AUTO).concat(p.itens.length > MAX_ITENS_AUTO ? [`+ ${p.itens.length - MAX_ITENS_AUTO} outros (clique)`] : []) })),
  ], [mapa, doCadastro]);
  const layout = useMemo(() => {
    const altura = (p: Pilar) => Math.max(PILAR.h + 30, (p.itens.length + (p.mais ? 1 : 0)) * FOLHA.passo + (editar && !p.auto ? 40 : 0) + (p.exemplo !== undefined ? 90 : 0) + 20);
    const lados: number[][] = [[], []];
    const soma = [0, 0];
    todos.forEach((p, i) => { const k = soma[0] <= soma[1] ? 0 : 1; lados[k].push(i); soma[k] += altura(p); });
    const H = Math.max(900, Math.max(soma[0], soma[1]) + 120);
    const pos: { x: number; y: number; lado: -1 | 1 }[] = [];
    lados.forEach((col, k) => {
      let y = (H - soma[k]) / 2;
      for (const i of col) { const h = altura(todos[i]); pos[i] = { x: k === 0 ? COLUNA_X.esq : COLUNA_X.dir, y: y + h / 2, lado: k === 0 ? -1 : 1 }; y += h; }
    });
    return { H, pos };
  }, [todos, editar]);

  if (!aberto || !membro) return null;
  const nUsuario = mapa?.pilares.length ?? 0;
  const mudar = (f: (m: MapaInteligencia) => MapaInteligencia) => { setMapa((m) => (m ? f(m) : m)); setMudou(true); };
  const mudarPilar = (i: number, patch: Partial<PilarMapa>) => mudar((m) => ({ ...m, pilares: m.pilares.map((p, k) => (k === i ? { ...p, ...patch } : p)) }));
  const salvar = async () => {
    if (!mapa) return;
    setSalvando(true);
    const limpo: MapaInteligencia = {
      titulo: mapa.titulo?.trim() || undefined, subtitulo: mapa.subtitulo?.trim() || undefined,
      pilares: mapa.pilares.map((p) => ({ ...p, titulo: p.titulo.trim(), descricao: p.descricao.trim(), exemplo: p.exemplo?.trim() || undefined, itens: p.itens.map((i) => i.trim()).filter(Boolean) }))
        .filter((p) => p.titulo || p.descricao || p.itens.length),
    };
    const { error } = await db.from("membros").update({ mapa_inteligencia: limpo }).eq("id", membro.id);
    setSalvando(false);
    if (error) { toast.error("Não consegui salvar o mapa"); return; }
    setMapa(limpo); setMudou(false); setEditar(false);
    onSalvo?.(limpo);
    toast.success(`Mapa do ${membro.nome} salvo. Ele já usa nas próximas respostas.`);
  };
  const fechar = () => { if (mudou && !window.confirm("Sair sem salvar as mudanças do mapa?")) return; onFechar(); };

  const { H, pos } = layout;
  const escala = Math.min(tamanho.w / W, tamanho.h / H);
  const centro = { x: W / 2, y: H / 2 };
  const curva = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;

  return createPortal(
    // Acima da barra de abas do app (z-100); no app do Mac, o cabeçalho deixa o lugar dos botões da janela.
    <div className="fixed inset-0 z-[150] flex flex-col bg-background text-foreground" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { if (noAberto) setNoAberto(null); else fechar(); } }}>
      <div className={cn("flex items-center gap-2 border-b border-foreground/10 px-4 py-2.5", isDesktop() && "pl-24 pt-3")}>
        <Sparkles className="h-4 w-4 text-sky-300" />
        <p className="text-sm font-semibold">Inteligência do {membro.nome}</p>
        <p className="hidden text-xs text-foreground/50 md:block">tudo isto vai junto em cada pedido para ele</p>
        <div className="ml-auto flex items-center gap-2">
          {editar && (
            <button type="button" onClick={() => mudar((m) => ({ ...m, pilares: [...m.pilares, { titulo: "", descricao: "", itens: [""] }] }))}
              className="flex items-center gap-1 rounded-md border border-foreground/15 px-2.5 py-1 text-xs hover:bg-foreground/10"><Plus className="h-3.5 w-3.5" />Pilar</button>
          )}
          {editar && !nUsuario && (
            <button type="button" onClick={() => mudar((m) => ({ ...m, subtitulo: m.subtitulo || MODELO_ROTEIRO.subtitulo, pilares: MODELO_ROTEIRO.pilares.map((p) => ({ ...p, itens: [...p.itens] })) }))}
              className="flex items-center gap-1 rounded-md border border-foreground/15 px-2.5 py-1 text-xs hover:bg-foreground/10"><FileText className="h-3.5 w-3.5" />Começar com o modelo do roteiro</button>
          )}
          {editar ? (
            <button type="button" onClick={() => void salvar()} disabled={salvando}
              className="flex items-center gap-1 rounded-md bg-sky-600 px-3 py-1 text-xs font-semibold hover:bg-sky-500 disabled:opacity-50">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Salvar
            </button>
          ) : (
            <button type="button" onClick={() => setEditar(true)} className="flex items-center gap-1 rounded-md border border-foreground/15 px-3 py-1 text-xs hover:bg-foreground/10"><Pencil className="h-3.5 w-3.5" />Editar</button>
          )}
          <button type="button" onClick={fechar} title="Fechar (Esc)" className="rounded-md p-1.5 text-foreground/60 hover:bg-foreground/10 hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div ref={caixa} className="relative min-h-0 flex-1 overflow-hidden"
        style={{ backgroundImage: "radial-gradient(hsl(var(--foreground) / 0.07) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
        {!mapa ? (
          <div className="flex h-full items-center justify-center text-sm text-foreground/60"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando o que ele sabe…</div>
        ) : (
          <div className="absolute left-1/2 top-1/2" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${escala})` }}>
            {/* Linhas: centro → pilar → itens (as do cadastro, tracejadas). */}
            <svg className="pointer-events-none absolute inset-0" width={W} height={H}>
              {todos.map((p, i) => {
                const l = pos[i], cor = p.auto ? "#64748b" : p.cor ?? CORES_PILAR[i % CORES_PILAR.length];
                const xFolha = l.x + l.lado * FOLHA.distancia;
                const y0 = l.y - ((p.itens.length + (p.mais ? 1 : 0) - 1) * FOLHA.passo) / 2;
                return (
                  <g key={i} stroke={cor} strokeWidth={3} fill="none" opacity={p.auto ? 0.6 : 0.85} strokeDasharray={p.auto ? "6 6" : undefined}>
                    <path d={curva(centro.x + l.lado * (CENTRO.w / 2), centro.y, l.x - l.lado * (PILAR.w / 2), l.y)} />
                    {p.itens.map((_, k) => (
                      <path key={k} strokeWidth={2} d={curva(l.x + l.lado * (PILAR.w / 2), l.y, xFolha - l.lado * (FOLHA.w / 2), y0 + k * FOLHA.passo)} />
                    ))}
                    {p.mais && <path strokeWidth={1.5} opacity={0.5} d={curva(l.x + l.lado * (PILAR.w / 2), l.y, xFolha - l.lado * (FOLHA.w / 2), y0 + p.itens.length * FOLHA.passo)} />}
                  </g>
                );
              })}
            </svg>

            {/* Centro. */}
            <div className="absolute flex flex-col items-center justify-center gap-2 rounded-2xl border border-foreground/15 bg-popover p-4 text-center shadow-2xl"
              style={{ left: centro.x - CENTRO.w / 2, top: centro.y - CENTRO.h / 2, width: CENTRO.w, height: CENTRO.h }}>
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15"><FileText className="h-7 w-7 text-primary" /></span>
              <Texto valor={mapa.titulo ?? membro.nome} editar={editar} onMudar={(v) => mudar((m) => ({ ...m, titulo: v }))} className="text-center text-2xl font-extrabold" placeholder={membro.nome} />
              <Texto valor={mapa.subtitulo ?? ""} editar={editar} multilinha onMudar={(v) => mudar((m) => ({ ...m, subtitulo: v }))}
                className="text-center text-sm text-foreground/65" placeholder={membro.funcao ?? "O que ele faz"} />
            </div>

            {todos.map((p, i) => {
              const l = pos[i], cor = p.auto ? "#64748b" : p.cor ?? CORES_PILAR[i % CORES_PILAR.length];
              const ed = editar && !p.auto;
              const xFolha = l.x + l.lado * FOLHA.distancia;
              const y0 = l.y - ((p.itens.length + (p.mais ? 1 : 0) - 1) * FOLHA.passo) / 2;
              // "+ N outros": abre o painel do pilar inteiro; um item: abre o painel já nele (24/10, Davi:
              // "editar cada item, clicar em + e criar mais").
              const extra = p.auto && p.itens.length > 0 && /^\+ \d+ outros/.test(p.itens[p.itens.length - 1]);
              return (
                <div key={i}>
                  <div className={cn("absolute rounded-2xl border-2 bg-card p-3 shadow-xl", !ed && "cursor-pointer transition-transform hover:scale-[1.02]")}
                    onClick={() => { if (p.origem) setNoAberto(p.origem); else if (!editar) setEditar(true); }}
                    title={p.origem ? "Clique para abrir e editar" : editar ? undefined : "Clique para editar"}
                    style={{ left: l.x - PILAR.w / 2, top: l.y - PILAR.h / 2, width: PILAR.w, minHeight: PILAR.h, borderColor: cor, borderStyle: p.auto ? "dashed" : "solid", boxShadow: p.auto ? undefined : `0 0 24px ${cor}33` }}>
                    {p.auto
                      ? <span className="absolute -top-2.5 left-3 rounded-full bg-muted px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ring-1 ring-border">do cadastro</span>
                      : <span className="absolute -left-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold" style={{ background: cor }}>{i + 1}</span>}
                    {ed && (
                      <button type="button" onClick={() => mudar((m) => ({ ...m, pilares: m.pilares.filter((_, k) => k !== i) }))} title="Apagar pilar"
                        className="absolute -right-2 -top-2 rounded-full bg-card p-1 text-foreground/50 ring-1 ring-foreground/20 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                    <Texto valor={p.titulo} editar={ed} onMudar={(v) => mudarPilar(i, { titulo: v })} className="block text-lg font-bold" placeholder="Título do pilar" />
                    <Texto valor={p.descricao} editar={ed} multilinha onMudar={(v) => mudarPilar(i, { descricao: v })} className="mt-1 block text-[13px] leading-snug text-foreground/75" placeholder="O que ele precisa fazer aqui" />
                    {ed && (
                      <div className="mt-2 flex items-center gap-1">
                        {CORES_PILAR.map((c) => (
                          <button key={c} type="button" onClick={() => mudarPilar(i, { cor: c })} className={cn("h-4 w-4 rounded-full ring-offset-1 ring-offset-card", cor === c && "ring-2 ring-foreground")} style={{ background: c }} />
                        ))}
                      </div>
                    )}
                    {p.auto && editar && <p className="mt-2 text-[11px] text-foreground/45">Muda pela engrenagem do funcionário (critérios, formatos, skills) ou no cadastro.</p>}
                  </div>

                  {p.itens.map((it, k) => (
                    <div key={k} className={cn("absolute flex items-center gap-1 rounded-lg border-2 bg-card px-3 text-[13px]", !ed && "cursor-pointer hover:bg-foreground/5")}
                      onClick={() => {
                        if (p.origem?.tipo === "skills") setNoAberto({ tipo: "skills", abrir: p.refs?.[k] });
                        else if (p.origem) setNoAberto(extra && k === p.itens.length - 1 ? p.origem : { ...p.origem, foco: k });
                        else if (!editar) setEditar(true);
                      }}
                      style={{ left: xFolha - FOLHA.w / 2, top: y0 + k * FOLHA.passo - FOLHA.h / 2, width: FOLHA.w, height: FOLHA.h, borderColor: `${cor}aa`, borderStyle: p.auto ? "dashed" : "solid" }}
                      title={p.auto ? `${it}\n(clique para editar)` : it}>
                      {ed
                        ? <Texto valor={it} editar onMudar={(v) => mudarPilar(i, { itens: p.itens.map((x, j) => (j === k ? v : x)) })} className="flex-1" placeholder="item" />
                        : <span className="min-w-0 flex-1 truncate">{it || <span className="opacity-40">item</span>}</span>}
                      {p.auto && <Pencil className="h-3 w-3 shrink-0 text-foreground/30" />}
                      {ed && <button type="button" onClick={() => mudarPilar(i, { itens: p.itens.filter((_, j) => j !== k) })} className="text-foreground/40 hover:text-rose-400"><X className="h-3 w-3" /></button>}
                    </div>
                  ))}
                  {p.mais && p.origem && (
                    <button type="button" onClick={() => setNoAberto({ ...p.origem!, foco: "novo" })}
                      className="absolute flex items-center gap-1.5 rounded-lg border-2 border-dashed border-foreground/20 px-3 text-[13px] text-foreground/60 hover:border-foreground/50 hover:text-foreground"
                      style={{ left: xFolha - FOLHA.w / 2, top: y0 + p.itens.length * FOLHA.passo - FOLHA.h / 2, width: FOLHA.w, height: FOLHA.h }}>
                      <Plus className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{p.mais}</span>
                    </button>
                  )}
                  {ed && (
                    <div className="absolute flex gap-1.5" style={{ left: xFolha - FOLHA.w / 2, top: y0 + p.itens.length * FOLHA.passo - FOLHA.h / 2, width: FOLHA.w }}>
                      <button type="button" onClick={() => mudarPilar(i, { itens: [...p.itens, ""] })}
                        className="flex h-[30px] flex-1 items-center justify-center gap-1 rounded-lg border border-dashed border-foreground/25 text-xs text-foreground/60 hover:text-foreground">
                        <Plus className="h-3 w-3" />item
                      </button>
                      {p.exemplo === undefined && (
                        <button type="button" onClick={() => mudarPilar(i, { exemplo: "" })}
                          className="flex h-[30px] flex-1 items-center justify-center gap-1 rounded-lg border border-dashed border-foreground/25 text-xs text-foreground/60 hover:text-foreground">
                          <Plus className="h-3 w-3" />exemplo
                        </button>
                      )}
                    </div>
                  )}
                  {(p.exemplo || (ed && p.exemplo !== undefined)) && (
                    <div className="absolute rounded-xl border border-dashed border-foreground/25 bg-card/90 p-3 text-[13px]"
                      style={{ left: xFolha - FOLHA.w / 2 - 20, top: y0 + (p.itens.length + (ed ? 0.8 : 0)) * FOLHA.passo - 4, width: FOLHA.w + 60 }}>
                      <p className="mb-1 font-semibold text-foreground/80">Exemplo:</p>
                      <Texto valor={p.exemplo ?? ""} editar={ed} multilinha onMudar={(v) => mudarPilar(i, { exemplo: v })} className="block text-foreground/70" placeholder="(opcional)" />
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        )}
        {noAberto && membroMapa && (
          <PainelNoMapa key={JSON.stringify(noAberto)} membro={membroMapa} origem={noAberto} onFechar={() => setNoAberto(null)} onMudou={() => void recarregarCadastro()} />
        )}
      </div>
    </div>,
    document.body,
  );
}
