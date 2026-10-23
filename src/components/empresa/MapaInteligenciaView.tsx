import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, FileText, Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isDesktop } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { CORES_PILAR, MODELO_ROTEIRO, lerMapa, type MapaInteligencia, type PilarMapa } from "@/lib/conteudo/mapaInteligencia";

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

type Pilar = PilarMapa & { auto?: boolean };

interface Etapa { nome: string; membro_id: string; criterios?: string | string[] | null; formatos?: { nome?: string; texto?: string }[] | null }

function Texto({ valor, editar, onMudar, className, placeholder, multilinha }: {
  valor: string; editar: boolean; onMudar: (v: string) => void; className?: string; placeholder?: string; multilinha?: boolean;
}) {
  if (!editar) return <span className={cn("whitespace-pre-line", className)}>{valor || <span className="opacity-40">{placeholder}</span>}</span>;
  return multilinha ? (
    <textarea value={valor} onChange={(e) => onMudar(e.target.value)} placeholder={placeholder} rows={2}
      className={cn("w-full resize-none rounded bg-white/5 px-1 outline-none ring-1 ring-white/10 focus:ring-white/40", className)} />
  ) : (
    <input value={valor} onChange={(e) => onMudar(e.target.value)} placeholder={placeholder}
      className={cn("w-full rounded bg-white/5 px-1 outline-none ring-1 ring-white/10 focus:ring-white/40", className)} />
  );
}

const linhas = (t: string | null | undefined) => (t ?? "").split(/\n+/).map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);
const curto = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Pilares "do cadastro": o que o funcionário já usa em cada pedido (manual, etapas, skills, aprendizados). */
async function pilaresDoCadastro(membroId: string): Promise<Pilar[]> {
  const { data: m } = await db.from("membros").select("nome, manual, cliente_id").eq("id", membroId).maybeSingle();
  const membro = m as { nome: string; manual: string | null; cliente_id: string | null } | null;
  if (!membro) return [];
  const agente = membro.nome.trim().toLowerCase();
  const [setores, intel] = await Promise.all([
    membro.cliente_id ? db.from("setores").select("nome, esteira").eq("cliente_id", membro.cliente_id) : Promise.resolve({ data: [] }),
    db.from("inteligencia_membros").select("nome, tipo, conteudo").eq("agente", agente).eq("status", "pronto")
      .or(`escopo.eq.geral${membro.cliente_id ? `,cliente_id.eq.${membro.cliente_id}` : ""}`),
  ]);
  const pilares: Pilar[] = [];
  if (linhas(membro.manual).length) pilares.push({ titulo: "Manual", descricao: "Como ele trabalha (cadastro do funcionário)", itens: linhas(membro.manual).map((l) => curto(l)), auto: true });
  for (const s of (setores.data ?? []) as { nome: string; esteira: Etapa[] | null }[]) {
    for (const e of (Array.isArray(s.esteira) ? s.esteira : []).filter((x) => x.membro_id === membroId)) {
      const crit = Array.isArray(e.criterios) ? e.criterios.map(String) : linhas(e.criterios as string | null);
      if (crit.length) pilares.push({ titulo: `Critérios · ${e.nome}`, descricao: `O que ele confere em ${e.nome} (${s.nome})`, itens: crit.map((c) => curto(c)), auto: true });
      const formatos = (e.formatos ?? []).filter((f) => (f.texto ?? "").trim() || (f.nome ?? "").trim());
      if (formatos.length) pilares.push({ titulo: `Formatos · ${e.nome}`, descricao: "Estruturas de referência que ele segue", itens: formatos.map((f, i) => f.nome?.trim() || `Formato ${i + 1}`), auto: true });
    }
  }
  const lista = (intel.data ?? []) as { nome: string; tipo: string | null; conteudo: string | null }[];
  const skills = [...new Set(lista.filter((i) => i.nome.startsWith("Skill:")).map((i) => i.nome.replace(/^Skill:\s*/, "")))];
  if (skills.length) pilares.push({ titulo: "Skills", descricao: "Métodos que ele segue em cada pedido", itens: skills, auto: true });
  const aprendizados = lista.filter((i) => i.tipo === "aprendizado").flatMap((i) => linhas(i.conteudo)).map((l) => curto(l));
  if (aprendizados.length) pilares.push({ titulo: "Aprendizados", descricao: "Correções que você já fez com ele", itens: aprendizados, auto: true });
  return pilares;
}

export function MapaInteligenciaView({ membro, aberto, onFechar, onSalvo }: {
  membro: { id: string; nome: string; funcao?: string | null } | null;
  aberto: boolean;
  onFechar: () => void;
  onSalvo?: (mapa: MapaInteligencia) => void;
}) {
  const [mapa, setMapa] = useState<MapaInteligencia | null>(null);
  const [doCadastro, setDoCadastro] = useState<Pilar[]>([]);
  const [editar, setEditar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mudou, setMudou] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const [tamanho, setTamanho] = useState({ w: 1, h: 1 });

  useEffect(() => {
    if (!aberto || !membro) return;
    setMapa(null); setDoCadastro([]); setEditar(false); setMudou(false);
    void (async () => {
      const [{ data }, cadastro] = await Promise.all([
        db.from("membros").select("mapa_inteligencia").eq("id", membro.id).maybeSingle(),
        pilaresDoCadastro(membro.id),
      ]);
      setMapa(lerMapa((data as { mapa_inteligencia?: unknown } | null)?.mapa_inteligencia) ?? { pilares: [] });
      setDoCadastro(cadastro);
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
    ...doCadastro.map((p) => ({ ...p, itens: p.itens.slice(0, MAX_ITENS_AUTO).concat(p.itens.length > MAX_ITENS_AUTO ? [`+ ${p.itens.length - MAX_ITENS_AUTO} outros`] : []) })),
  ], [mapa, doCadastro]);
  const layout = useMemo(() => {
    const altura = (p: Pilar) => Math.max(PILAR.h + 30, p.itens.length * FOLHA.passo + (editar && !p.auto ? 40 : 0) + (p.exemplo !== undefined ? 90 : 0) + 20);
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
    <div className="fixed inset-0 z-[150] flex flex-col bg-[#0a0f1a] text-white" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") fechar(); }}>
      <div className={cn("flex items-center gap-2 border-b border-white/10 px-4 py-2.5", isDesktop() && "pl-24 pt-3")}>
        <Sparkles className="h-4 w-4 text-sky-300" />
        <p className="text-sm font-semibold">Inteligência do {membro.nome}</p>
        <p className="hidden text-xs text-white/50 md:block">tudo isto vai junto em cada pedido para ele</p>
        <div className="ml-auto flex items-center gap-2">
          {editar && (
            <button type="button" onClick={() => mudar((m) => ({ ...m, pilares: [...m.pilares, { titulo: "", descricao: "", itens: [""] }] }))}
              className="flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10"><Plus className="h-3.5 w-3.5" />Pilar</button>
          )}
          {editar && !nUsuario && (
            <button type="button" onClick={() => mudar((m) => ({ ...m, subtitulo: m.subtitulo || MODELO_ROTEIRO.subtitulo, pilares: MODELO_ROTEIRO.pilares.map((p) => ({ ...p, itens: [...p.itens] })) }))}
              className="flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10"><FileText className="h-3.5 w-3.5" />Começar com o modelo do roteiro</button>
          )}
          {editar ? (
            <button type="button" onClick={() => void salvar()} disabled={salvando}
              className="flex items-center gap-1 rounded-md bg-sky-600 px-3 py-1 text-xs font-semibold hover:bg-sky-500 disabled:opacity-50">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Salvar
            </button>
          ) : (
            <button type="button" onClick={() => setEditar(true)} className="flex items-center gap-1 rounded-md border border-white/15 px-3 py-1 text-xs hover:bg-white/10"><Pencil className="h-3.5 w-3.5" />Editar</button>
          )}
          <button type="button" onClick={fechar} title="Fechar (Esc)" className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div ref={caixa} className="relative min-h-0 flex-1 overflow-hidden"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
        {!mapa ? (
          <div className="flex h-full items-center justify-center text-sm text-white/60"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando o que ele sabe…</div>
        ) : (
          <div className="absolute left-1/2 top-1/2" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${escala})` }}>
            {/* Linhas: centro → pilar → itens (as do cadastro, tracejadas). */}
            <svg className="pointer-events-none absolute inset-0" width={W} height={H}>
              {todos.map((p, i) => {
                const l = pos[i], cor = p.auto ? "#64748b" : p.cor ?? CORES_PILAR[i % CORES_PILAR.length];
                const xFolha = l.x + l.lado * FOLHA.distancia;
                const y0 = l.y - ((p.itens.length - 1) * FOLHA.passo) / 2;
                return (
                  <g key={i} stroke={cor} strokeWidth={3} fill="none" opacity={p.auto ? 0.6 : 0.85} strokeDasharray={p.auto ? "6 6" : undefined}>
                    <path d={curva(centro.x + l.lado * (CENTRO.w / 2), centro.y, l.x - l.lado * (PILAR.w / 2), l.y)} />
                    {p.itens.map((_, k) => (
                      <path key={k} strokeWidth={2} d={curva(l.x + l.lado * (PILAR.w / 2), l.y, xFolha - l.lado * (FOLHA.w / 2), y0 + k * FOLHA.passo)} />
                    ))}
                  </g>
                );
              })}
            </svg>

            {/* Centro. */}
            <div className="absolute flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/15 bg-[#121a2b] p-4 text-center shadow-2xl"
              style={{ left: centro.x - CENTRO.w / 2, top: centro.y - CENTRO.h / 2, width: CENTRO.w, height: CENTRO.h }}>
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-sky-600/30"><FileText className="h-7 w-7 text-sky-200" /></span>
              <Texto valor={mapa.titulo ?? membro.nome} editar={editar} onMudar={(v) => mudar((m) => ({ ...m, titulo: v }))} className="text-center text-2xl font-extrabold" placeholder={membro.nome} />
              <Texto valor={mapa.subtitulo ?? ""} editar={editar} multilinha onMudar={(v) => mudar((m) => ({ ...m, subtitulo: v }))}
                className="text-center text-sm text-white/65" placeholder={membro.funcao ?? "O que ele faz"} />
            </div>

            {todos.map((p, i) => {
              const l = pos[i], cor = p.auto ? "#64748b" : p.cor ?? CORES_PILAR[i % CORES_PILAR.length];
              const ed = editar && !p.auto;
              const xFolha = l.x + l.lado * FOLHA.distancia;
              const y0 = l.y - ((p.itens.length - 1) * FOLHA.passo) / 2;
              return (
                <div key={i}>
                  <div className="absolute rounded-2xl border-2 bg-[#0f1625] p-3 shadow-xl"
                    style={{ left: l.x - PILAR.w / 2, top: l.y - PILAR.h / 2, width: PILAR.w, minHeight: PILAR.h, borderColor: cor, borderStyle: p.auto ? "dashed" : "solid", boxShadow: p.auto ? undefined : `0 0 24px ${cor}33` }}>
                    {p.auto
                      ? <span className="absolute -top-2.5 left-3 rounded-full bg-slate-600 px-2 text-[10px] font-semibold uppercase tracking-wide">do cadastro</span>
                      : <span className="absolute -left-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold" style={{ background: cor }}>{i + 1}</span>}
                    {ed && (
                      <button type="button" onClick={() => mudar((m) => ({ ...m, pilares: m.pilares.filter((_, k) => k !== i) }))} title="Apagar pilar"
                        className="absolute -right-2 -top-2 rounded-full bg-[#0f1625] p-1 text-white/50 ring-1 ring-white/20 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                    <Texto valor={p.titulo} editar={ed} onMudar={(v) => mudarPilar(i, { titulo: v })} className="block text-lg font-bold" placeholder="Título do pilar" />
                    <Texto valor={p.descricao} editar={ed} multilinha onMudar={(v) => mudarPilar(i, { descricao: v })} className="mt-1 block text-[13px] leading-snug text-white/75" placeholder="O que ele precisa fazer aqui" />
                    {ed && (
                      <div className="mt-2 flex items-center gap-1">
                        {CORES_PILAR.map((c) => (
                          <button key={c} type="button" onClick={() => mudarPilar(i, { cor: c })} className={cn("h-4 w-4 rounded-full ring-offset-1 ring-offset-[#0f1625]", cor === c && "ring-2 ring-white")} style={{ background: c }} />
                        ))}
                      </div>
                    )}
                    {p.auto && editar && <p className="mt-2 text-[11px] text-white/45">Muda pela engrenagem do funcionário (critérios, formatos, skills) ou no cadastro.</p>}
                  </div>

                  {p.itens.map((it, k) => (
                    <div key={k} className="absolute flex items-center gap-1 rounded-lg border-2 bg-[#0f1625] px-3 text-[13px]"
                      style={{ left: xFolha - FOLHA.w / 2, top: y0 + k * FOLHA.passo - FOLHA.h / 2, width: FOLHA.w, height: FOLHA.h, borderColor: `${cor}aa`, borderStyle: p.auto ? "dashed" : "solid" }}
                      title={it}>
                      <Texto valor={it} editar={ed} onMudar={(v) => mudarPilar(i, { itens: p.itens.map((x, j) => (j === k ? v : x)) })} className="flex-1 truncate" placeholder="item" />
                      {ed && <button type="button" onClick={() => mudarPilar(i, { itens: p.itens.filter((_, j) => j !== k) })} className="text-white/40 hover:text-rose-400"><X className="h-3 w-3" /></button>}
                    </div>
                  ))}
                  {ed && (
                    <div className="absolute flex gap-1.5" style={{ left: xFolha - FOLHA.w / 2, top: y0 + p.itens.length * FOLHA.passo - FOLHA.h / 2, width: FOLHA.w }}>
                      <button type="button" onClick={() => mudarPilar(i, { itens: [...p.itens, ""] })}
                        className="flex h-[30px] flex-1 items-center justify-center gap-1 rounded-lg border border-dashed border-white/25 text-xs text-white/60 hover:text-white">
                        <Plus className="h-3 w-3" />item
                      </button>
                      {p.exemplo === undefined && (
                        <button type="button" onClick={() => mudarPilar(i, { exemplo: "" })}
                          className="flex h-[30px] flex-1 items-center justify-center gap-1 rounded-lg border border-dashed border-white/25 text-xs text-white/60 hover:text-white">
                          <Plus className="h-3 w-3" />exemplo
                        </button>
                      )}
                    </div>
                  )}
                  {(p.exemplo || (ed && p.exemplo !== undefined)) && (
                    <div className="absolute rounded-xl border border-dashed border-white/25 bg-[#0f1625]/90 p-3 text-[13px]"
                      style={{ left: xFolha - FOLHA.w / 2 - 20, top: y0 + (p.itens.length + (ed ? 0.8 : 0)) * FOLHA.passo - 4, width: FOLHA.w + 60 }}>
                      <p className="mb-1 font-semibold text-white/80">Exemplo:</p>
                      <Texto valor={p.exemplo ?? ""} editar={ed} multilinha onMudar={(v) => mudarPilar(i, { exemplo: v })} className="block text-white/70" placeholder="(opcional)" />
                    </div>
                  )}
                </div>
              );
            })}

            {!todos.length && (
              <p className="absolute w-full text-center text-sm text-white/50" style={{ top: centro.y + CENTRO.h / 2 + 30 }}>
                Ele ainda não tem nada cadastrado. Clique em <b>Editar</b> e comece pelo modelo do roteiro ou crie os pilares.
              </p>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
