import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle, BarChart3, CheckCircle2, ChevronDown, Clapperboard, Clock, Factory, Headphones, Megaphone, Target, type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { tarefaAtrasada, type MembroResumo, type Sinal, type TarefaResumo } from "@/lib/empresa/visaoGeral";
import { CabecaBoneco } from "./BonecoMesa";

// Fábrica de Conteúdo (03/11, Davi: "transformar o Escritório numa fábrica: cada setor uma esteira horizontal, da
// esquerda para a direita, com os bonequinhos trabalhando"). Vertical = setores; horizontal = a produção.
// As estações saem da situação de cada tarefa (na fila → fazendo → aguardando você → concluída), com o nome que faz
// sentido para cada setor. À direita, "Ações para você": só o que depende do Davi; clicar destaca o setor.

export interface AcaoFabrica { chave: string; categoria: string; setorId: string | null; atrasada?: boolean; no: ReactNode }
export interface PessoaFabrica { membro: MembroResumo; sinal: Sinal; atual: string | null }

type Tipo = "audiovisual" | "marketing" | "vendas" | "sac" | "outro";
const tipoDoSetor = (nome: string): Tipo =>
  /audiovisual|v[ií]deo|edi[cç]|est[uú]dio/i.test(nome) ? "audiovisual"
    : /venda|sales|comercial/i.test(nome) ? "vendas"
      : /sucesso|sac|suporte|atendimento|cliente/i.test(nome) ? "sac"
        : /marketing|conte[uú]do|copy|viral|lab|tr[aá]fego/i.test(nome) ? "marketing" : "outro";

const VISUAL: Record<Tipo, { etapas: string[]; Icone: LucideIcon; descricao: string; cor: string; borda: string; fundo: string; texto: string; luz: string }> = {
  audiovisual: { etapas: ["Brutos", "Edição", "Aprovação", "Publicado"], Icone: Clapperboard, descricao: "Edição, design e produção de conteúdos.", cor: "violet", borda: "border-violet-500/40", fundo: "from-violet-950/60", texto: "text-violet-300", luz: "shadow-violet-500/20" },
  marketing: { etapas: ["Ideias", "Produção", "Revisão", "Pronto"], Icone: Megaphone, descricao: "Estratégia, roteiros, copy e campanhas.", cor: "emerald", borda: "border-emerald-500/40", fundo: "from-emerald-950/60", texto: "text-emerald-300", luz: "shadow-emerald-500/20" },
  vendas: { etapas: ["Leads", "Em andamento", "Aguardando", "Fechado"], Icone: BarChart3, descricao: "Prospecção, reuniões e fechamento.", cor: "orange", borda: "border-orange-500/40", fundo: "from-orange-950/60", texto: "text-orange-300", luz: "shadow-orange-500/20" },
  sac: { etapas: ["Chamados", "Em atendimento", "Aguardando", "Resolvido"], Icone: Headphones, descricao: "Atendimento, suporte e relacionamento.", cor: "sky", borda: "border-sky-500/40", fundo: "from-sky-950/60", texto: "text-sky-300", luz: "shadow-sky-500/20" },
  outro: { etapas: ["Na fila", "Fazendo", "Aguardando você", "Concluído"], Icone: Factory, descricao: "Tarefas do setor.", cor: "slate", borda: "border-slate-500/40", fundo: "from-slate-900/70", texto: "text-slate-300", luz: "shadow-slate-500/10" },
};

/** Estação da tarefa: 0 na fila, 1 fazendo, 2 aguardando o Davi, 3 concluída. */
const estacaoDe = (t: TarefaResumo) => (t.concluida ? 3 : t.situacao === "aguardando_aprovacao" ? 2 : t.situacao === "andamento" ? 1 : 0);
const db = supabase as unknown as SupabaseClient;

export function FabricaConteudo({ clienteId, setores, membros, tarefas, pessoas, acoes, categorias, rotuloCategoria, hoje, onTarefa, onPessoa, topo }: {
  clienteId: string;
  setores: { id: string; nome: string; descricao: string | null }[];
  membros: MembroResumo[]; tarefas: TarefaResumo[]; pessoas: PessoaFabrica[]; acoes: AcaoFabrica[];
  categorias: string[]; rotuloCategoria: Record<string, string>; hoje: string;
  onTarefa: (t: TarefaResumo) => void; onPessoa: (m: MembroResumo) => void;
  /** botões do topo (+ Escritório, + Funcionário, trocar para o mapa) */
  topo?: ReactNode;
}) {
  // Concluídas dos últimos 7 dias: a última estação e o "concluídas hoje".
  const [feitas, setFeitas] = useState<TarefaResumo[]>([]);
  useEffect(() => {
    const desde = new Date(Date.now() - 7 * 86400000).toISOString();
    void db.from("atividades").select("id, titulo, responsavel_id, setor_id, situacao, tipo, data_vencimento, concluida, progresso, concluida_em")
      .eq("cliente_id", clienteId).eq("concluida", true).is("deleted_at", null).gte("concluida_em", desde).order("concluida_em", { ascending: false }).limit(300)
      .then(({ data }) => setFeitas((data ?? []) as TarefaResumo[]));
  }, [clienteId, tarefas.length]);

  const setorDoMembro = useMemo(() => new Map(membros.map((m) => [m.id, m.setor_id])), [membros]);
  const setorDa = (t: TarefaResumo) => t.setor_id ?? (t.responsavel_id ? setorDoMembro.get(t.responsavel_id) ?? null : null);
  const nomeDe = useMemo(() => new Map(membros.map((m) => [m.id, m.nome])), [membros]);
  const todas = useMemo(() => [...tarefas.filter((t) => !t.concluida), ...feitas], [tarefas, feitas]);
  const hojeFeitas = feitas.filter((t) => ((t as TarefaResumo & { concluida_em?: string }).concluida_em ?? "").slice(0, 10) === hoje).length;
  const abertas = tarefas.filter((t) => !t.concluida);

  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);     // setor expandido (mais tarefas por estação)
  const [foco, setFoco] = useState<string | null>(null);         // setor destacado pela ação clicada
  const [filtro, setFiltro] = useState("todos");
  const faixas = useRef(new Map<string, HTMLDivElement>());
  const focar = (setorId: string | null) => {
    if (!setorId) return;
    setFoco(setorId);
    setRecolhidos((r) => { const n = new Set(r); n.delete(setorId); return n; });
    faixas.current.get(setorId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setFoco((f) => (f === setorId ? null : f)), 4000);
  };

  const indicadores = [
    { rotulo: "Na produção", valor: abertas.filter((t) => t.situacao !== "aguardando_aprovacao").length, Icone: Factory, cor: "text-sky-400" },
    { rotulo: "Concluídas hoje", valor: hojeFeitas, Icone: CheckCircle2, cor: "text-emerald-400" },
    { rotulo: "Aguardando você", valor: acoes.length, Icone: Target, cor: "text-amber-400" },
    { rotulo: "Atrasadas", valor: abertas.filter((t) => tarefaAtrasada(t, hoje)).length, Icone: AlertTriangle, cor: "text-rose-400" },
    { rotulo: "Concluídas na semana", valor: feitas.length, Icone: BarChart3, cor: "text-violet-400" },
  ];

  return (
    <div className="dark space-y-3 rounded-2xl bg-[#070b12] p-3 text-white">
      <style>{`
        @keyframes fabrica-esteira { from { background-position: 0 0 } to { background-position: 40px 0 } }
        @keyframes fabrica-trabalho { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-2px) } }
        @keyframes fabrica-luz { 0%,100% { opacity: .35 } 50% { opacity: .9 } }
      `}</style>
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5">
          {indicadores.map(({ rotulo, valor, Icone, cor }) => (
            <div key={rotulo} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <Icone className={cn("h-5 w-5 shrink-0", cor)} />
              <div><p className="text-[11px] text-white/55">{rotulo}</p><p className="text-lg font-bold leading-tight tabular-nums">{valor}</p></div>
            </div>
          ))}
        </div>
        {topo}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Esteiras */}
        <div className="min-w-0 space-y-3">
          {setores.map((s) => {
            const v = VISUAL[tipoDoSetor(s.nome)];
            const dele = todas.filter((t) => setorDa(t) === s.id);
            const porEstacao = [0, 1, 2, 3].map((i) => dele.filter((t) => estacaoDe(t) === i));
            const atrasadas = dele.filter((t) => tarefaAtrasada(t, hoje)).length;
            const recolhido = recolhidos.has(s.id);
            const expandido = aberto === s.id;
            const equipe = pessoas.filter((p) => p.membro.setor_id === s.id);
            // Cada pessoa na estação da tarefa atual dela (livre: na primeira, parada).
            const estacaoDaPessoa = (p: PessoaFabrica) => {
              const t = abertas.find((x) => x.responsavel_id === p.membro.id && x.situacao === "andamento")
                ?? abertas.find((x) => x.responsavel_id === p.membro.id && x.situacao === "aguardando_aprovacao");
              return t ? estacaoDe(t) : 0;
            };
            const estado = porEstacao[2].length ? "aguardando" : atrasadas ? "atraso" : porEstacao[0].length > 4 ? "fila" : "normal";
            return (
              <div key={s.id} ref={(el) => { if (el) faixas.current.set(s.id, el); }}
                className={cn("overflow-hidden rounded-2xl border bg-gradient-to-r to-transparent shadow-lg transition-all", v.borda, v.fundo, v.luz,
                  foco === s.id && "ring-2 ring-cyan-300 ring-offset-2 ring-offset-[#070b12]")}>
                <div className="flex">
                  {/* Cabeçalho do setor */}
                  <button type="button" onClick={() => setRecolhidos((r) => { const n = new Set(r); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                    className="flex w-48 shrink-0 flex-col gap-2 border-r border-white/10 p-3 text-left hover:bg-white/[0.03]">
                    <span className="flex items-center gap-2">
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-white/10", v.texto)}><v.Icone className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate font-bold">{s.nome}</span>
                        {!recolhido && <span className="block text-[11px] leading-snug text-white/55">{s.descricao || v.descricao}</span>}</span>
                      <ChevronDown className={cn("h-4 w-4 shrink-0 text-white/40 transition-transform", recolhido && "-rotate-90")} />
                    </span>
                    <span className="grid grid-cols-3 gap-1 text-center">
                      <span><b className="block text-lg leading-tight tabular-nums">{porEstacao[0].length + porEstacao[1].length}</b><span className="text-[10px] text-white/55">em produção</span></span>
                      <span><b className="block text-lg leading-tight tabular-nums text-amber-300">{porEstacao[2].length}</b><span className="text-[10px] text-white/55">aguardando</span></span>
                      <span><b className={cn("block text-lg leading-tight tabular-nums", atrasadas ? "text-rose-400" : "text-white/40")}>{atrasadas}</b><span className="text-[10px] text-white/55">atrasadas</span></span>
                    </span>
                  </button>

                  {/* Esteira */}
                  {!recolhido && (
                    <div className="relative min-w-0 flex-1 p-3">
                      <div className="flex items-start gap-1">
                        {v.etapas.map((nome, i) => {
                          const itens = porEstacao[i];
                          const aqui = equipe.filter((p) => estacaoDaPessoa(p) === i);
                          const final = i === 3;
                          return (
                            <div key={nome} className="flex min-w-0 flex-1 items-start">
                              <div className={cn("min-w-0 flex-1 rounded-xl border p-2", i === 2 && itens.length ? "border-amber-400/50 bg-amber-400/[0.06]" : "border-white/10 bg-black/30")}>
                                <p className="flex items-center gap-1 text-xs font-semibold">
                                  <span className="truncate">{nome}</span><span className="text-white/45">({itens.length})</span>
                                  {i === 2 && itens.length > 0 && <AlertTriangle className="ml-auto h-3.5 w-3.5 shrink-0 animate-pulse text-amber-400" />}
                                </p>
                                {/* Quem está nesta estação */}
                                <div className="mt-1.5 flex min-h-[44px] flex-wrap items-end gap-1.5">
                                  {aqui.map((p) => {
                                    const ativo = p.sinal === "trabalhando";
                                    return (
                                      <button key={p.membro.id} type="button" onClick={() => onPessoa(p.membro)} title={`${p.membro.nome}${p.atual ? ` · ${p.atual}` : ""}`}
                                        className="flex flex-col items-center gap-0.5">
                                        <span className={cn("relative h-9 w-9 overflow-hidden rounded-full bg-slate-700", ativo && "shadow-[0_0_12px_rgba(56,189,248,0.55)]",
                                          p.sinal === "esperando" && "ring-2 ring-amber-400", p.sinal === "problema" && "ring-2 ring-rose-500")}
                                          style={ativo ? { animation: "fabrica-trabalho 1.2s ease-in-out infinite" } : undefined}>
                                          <CabecaBoneco nome={p.membro.nome} ehIa={p.membro.eh_ia} className={cn("h-full w-full", !ativo && "opacity-70 grayscale-[40%]")} />
                                        </span>
                                        <span className="max-w-[64px] truncate rounded bg-black/50 px-1 text-[10px] font-medium">{p.membro.nome.split(" ")[0]}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                                {/* Caixas: as tarefas desta estação */}
                                <div className="mt-1.5 space-y-1">
                                  {itens.slice(0, expandido ? 30 : final ? 2 : 3).map((t) => (
                                    <button key={t.id} type="button" onClick={() => onTarefa(t)} title={t.titulo}
                                      className={cn("block w-full rounded-lg border px-2 py-1 text-left text-[11px] transition-colors hover:border-white/40",
                                        final ? "border-emerald-500/30 bg-emerald-500/10" : tarefaAtrasada(t, hoje) ? "border-rose-500/40 bg-rose-500/10" : "border-white/10 bg-white/[0.04]")}>
                                      <span className="flex items-center gap-1">
                                        {final && <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />}
                                        <span className="truncate">{t.titulo}</span>
                                      </span>
                                      {!final && (
                                        <span className="mt-0.5 flex items-center gap-1 text-[10px] text-white/50">
                                          <span className="truncate">{t.responsavel_id ? nomeDe.get(t.responsavel_id) : "sem responsável"}</span>
                                          {t.progresso ? <span className="ml-auto tabular-nums text-sky-300">{t.progresso}%</span> : null}
                                        </span>
                                      )}
                                      {!final && (t.progresso ?? 0) > 0 && <span className="mt-0.5 block h-0.5 overflow-hidden rounded bg-white/10"><span className="block h-full bg-sky-400" style={{ width: `${t.progresso}%` }} /></span>}
                                    </button>
                                  ))}
                                  {itens.length > (expandido ? 30 : final ? 2 : 3) && (
                                    <button type="button" onClick={() => setAberto(s.id)} className="w-full text-center text-[10px] text-white/45 hover:text-white">+{itens.length - (expandido ? 30 : final ? 2 : 3)} na estação</button>
                                  )}
                                </div>
                              </div>
                              {i < 3 && <span className={cn("mt-3 shrink-0 px-0.5 text-sm", v.texto)}>→</span>}
                            </div>
                          );
                        })}
                      </div>
                      {/* A esteira andando, embaixo das estações */}
                      <div className="mt-2 h-2 rounded-full border border-white/10"
                        style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 6px, transparent 6px 20px)", backgroundSize: "40px 100%",
                          animation: `fabrica-esteira ${estado === "normal" ? 2.5 : 1.6}s linear infinite` }} />
                      <div className="mt-1 flex items-center justify-between text-[10px] text-white/45">
                        <span className="flex items-center gap-1">
                          <span className={cn("h-1.5 w-1.5 rounded-full", estado === "aguardando" ? "bg-amber-400" : estado === "atraso" ? "bg-rose-500" : estado === "fila" ? "bg-sky-400" : "bg-emerald-400")}
                            style={{ animation: "fabrica-luz 1.8s ease-in-out infinite" }} />
                          {estado === "aguardando" ? "Item esperando sua aprovação" : estado === "atraso" ? "Com atraso" : estado === "fila" ? "Com fila" : "Normal"}
                        </span>
                        <button type="button" onClick={() => setAberto(expandido ? null : s.id)} className="hover:text-white">{expandido ? "Ver menos" : "Expandir setor"}</button>
                      </div>
                    </div>
                  )}
                  {recolhido && (
                    <p className="flex flex-1 items-center px-4 text-xs text-white/55">
                      {porEstacao[0].length + porEstacao[1].length} em produção · {porEstacao[2].length} aguardando · {atrasadas} atrasadas
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Ações para você */}
        <aside className="flex self-start xl:sticky xl:top-4 max-h-[calc(100svh-180px)] min-h-[400px] flex-col rounded-2xl border border-rose-500/30 bg-rose-950/20 p-3">
          <div className="flex items-start gap-2">
            <Target className="mt-0.5 h-6 w-6 shrink-0 text-rose-400" />
            <div className="min-w-0 flex-1"><h2 className="text-lg font-bold leading-tight">Ações para você</h2><p className="text-xs text-white/55">O que depende da sua decisão.</p></div>
            <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-sm font-bold">{acoes.length}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-black/30 p-2 text-center"><Clock className="mx-auto h-4 w-4 text-amber-400" /><b className="block text-xl tabular-nums">{acoes.filter((a) => a.atrasada).length}</b><span className="text-[10px] text-white/55">com problema / atrasadas</span></div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-2 text-center"><CheckCircle2 className="mx-auto h-4 w-4 text-sky-400" /><b className="block text-xl tabular-nums">{acoes.filter((a) => !a.atrasada).length}</b><span className="text-[10px] text-white/55">pendentes</span></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["todos", ...categorias.filter((c) => acoes.some((a) => a.categoria === c))].map((c) => {
              const n = c === "todos" ? acoes.length : acoes.filter((a) => a.categoria === c).length;
              return (
                <button key={c} type="button" onClick={() => setFiltro(c)}
                  className={cn("rounded-full border px-2.5 py-0.5 text-xs", filtro === c ? "border-rose-500 bg-rose-500 text-white" : "border-rose-500/30 text-white/70 hover:bg-rose-500/10")}>
                  {rotuloCategoria[c] ?? c} <span className="opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {acoes.length === 0 && <p className="py-8 text-center text-sm text-white/55">Nada esperando por você agora. 🎉</p>}
            {acoes.filter((a) => filtro === "todos" || a.categoria === filtro).map((a) => (
              // Clicar numa ação também mostra o setor dela na fábrica (e abre, como antes).
              <div key={a.chave} onClickCapture={() => focar(a.setorId)}>{a.no}</div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
