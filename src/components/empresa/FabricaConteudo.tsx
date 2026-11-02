import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle, BarChart3, CheckCircle2, ChevronDown, Clapperboard, Clock, DoorOpen, Factory, FileText, Headphones, Image as ImageIcon,
  Inbox, Laptop, Layers, Lightbulb, Mail, Megaphone, Package, PenLine, Radio, Scissors, Search, ShieldCheck, Target, Trophy, Users, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ehCoordenador, tarefaAtrasada, type MembroResumo, type Sinal, type TarefaResumo } from "@/lib/empresa/visaoGeral";
import { BonecoMesa } from "./BonecoMesa";

// Fábrica de Conteúdo (03/11, Davi: "quero enxergar uma linha de produção digital acontecendo, não quatro Kanbans").
// Cada setor é um ambiente só, de fundo único, com uma esteira contínua atravessando as estações:
//   ENTRADA (tarefas na fila) → uma estação por funcionário (o boneco na mesa, com a tarefa atual) →
//   APROVAÇÃO (o que espera o Davi: esteira parada e contorno amarelo) → SAÍDA (concluídas nos últimos 7 dias).
// Cada estação mostra só a tarefa principal e "+N itens" (a lista abre ao clicar). À direita, "Ações para você":
// clicar numa ação destaca o setor, rola até ele, acende a estação e a tarefa (e abre a ação, como antes).

export interface AcaoFabrica {
  chave: string; categoria: string; setorId: string | null; atrasada?: boolean; no: ReactNode;
  /** tarefas da ação (para acender a tarefa na fábrica) */
  tarefaIds?: string[];
  /** a ação é uma aprovação/revisão do Davi: acende a estação de aprovação */
  aprovacao?: boolean;
}
export interface PessoaFabrica { membro: MembroResumo; sinal: Sinal; atual: string | null }

type Tipo = "audiovisual" | "marketing" | "vendas" | "sac" | "diretoria" | "outro";
const tipoDoSetor = (nome: string): Tipo =>
  /diretoria|gest[aã]o|lideran/i.test(nome) ? "diretoria"
  : /audiovisual|v[ií]deo|edi[cç]|est[uú]dio/i.test(nome) ? "audiovisual"
    : /venda|sales|comercial/i.test(nome) ? "vendas"
      : /sucesso|sac|suporte|atendimento|cliente/i.test(nome) ? "sac"
        : /marketing|conte[uú]do|copy|viral|lab|tr[aá]fego/i.test(nome) ? "marketing" : "outro";

interface Visual {
  entrada: [string, LucideIcon]; aprovacao: string; saida: [string, LucideIcon]; Icone: LucideIcon; descricao: string;
  fundo: string; borda: string; texto: string; luz: string; trilho: string;
}
const VISUAL: Record<Tipo, Visual> = {
  audiovisual: { entrada: ["Brutos", Package], aprovacao: "Aprovação", saida: ["Publicado", Radio], Icone: Clapperboard, descricao: "Edição, design e produção de conteúdos.",
    fundo: "from-violet-950/80 via-[#140d24] to-[#0b0816]", borda: "border-violet-500/35", texto: "text-violet-300", luz: "rgba(167,139,250,0.35)", trilho: "#7c3aed" },
  marketing: { entrada: ["Ideias", Lightbulb], aprovacao: "Revisão", saida: ["Pronto", CheckCircle2], Icone: Megaphone, descricao: "Estratégia, roteiros, copy e campanhas.",
    fundo: "from-emerald-950/80 via-[#0b1a14] to-[#07110d]", borda: "border-emerald-500/35", texto: "text-emerald-300", luz: "rgba(52,211,153,0.3)", trilho: "#059669" },
  vendas: { entrada: ["Leads", Users], aprovacao: "Aguardando", saida: ["Fechado", Trophy], Icone: BarChart3, descricao: "Prospecção, reuniões e fechamento.",
    fundo: "from-orange-950/80 via-[#1d1109] to-[#120a05]", borda: "border-orange-500/35", texto: "text-orange-300", luz: "rgba(251,146,60,0.3)", trilho: "#ea580c" },
  sac: { entrada: ["Chamados", Mail], aprovacao: "Aguardando", saida: ["Resolvido", CheckCircle2], Icone: Headphones, descricao: "Atendimento, suporte e relacionamento.",
    fundo: "from-sky-950/80 via-[#0a1622] to-[#060e16]", borda: "border-sky-500/35", texto: "text-sky-300", luz: "rgba(56,189,248,0.3)", trilho: "#0284c7" },
  diretoria: { entrada: ["Na fila", Inbox], aprovacao: "Aprovação", saida: ["Concluído", CheckCircle2], Icone: Layers, descricao: "Prioridades, estratégia e decisões.",
    fundo: "from-[#0f1d33] via-[#0c1524] to-[#080d16]", borda: "border-blue-400/30", texto: "text-blue-300", luz: "rgba(96,165,250,0.25)", trilho: "#3b82f6" },
  outro: { entrada: ["Na fila", Inbox], aprovacao: "Aprovação", saida: ["Concluído", CheckCircle2], Icone: Factory, descricao: "Tarefas do setor.",
    fundo: "from-slate-900/90 via-[#0f141d] to-[#090c12]", borda: "border-slate-500/35", texto: "text-slate-300", luz: "rgba(148,163,184,0.25)", trilho: "#475569" },
};

/** Nome curto da estação a partir da função do funcionário ("Editor de vídeos (IA)" → "Edição"). */
function estacaoDaFuncao(funcao: string | null, nome: string): [string, LucideIcon] {
  const f = (funcao ?? "").toLowerCase();
  if (/edi[tç]/.test(f)) return ["Edição", Scissors];
  if (/carross|design|p[aá]gina/.test(f)) return ["Design", ImageIcon];
  if (/social|publica|programa/.test(f)) return ["Publicação", Radio];
  if (/cop[yw]/.test(f)) return ["Copy", PenLine];
  if (/roteir/.test(f)) return ["Roteiro", FileText];
  if (/estudo|pesquisa/.test(f)) return ["Pesquisa", Search];
  if (/melhoria|m[eé]trica/.test(f)) return ["Melhorias", Wrench];
  if (/revis/.test(f)) return ["Revisão", Search];
  if (/vend/.test(f)) return ["Contato", Users];
  if (/\bcs\b|atendimento|suporte/.test(f)) return ["Atendimento", Headphones];
  if (/planej|decis/.test(f)) return ["Decisões", Layers];
  const curto = (funcao ?? "").split(/[(,·]/)[0].trim();
  return [curto && curto.length <= 16 ? curto : nome, Laptop];
}

const db = supabase as unknown as SupabaseClient;
type Feita = TarefaResumo & { concluida_em?: string | null };
interface Estacao {
  chave: string; nome: string; Icone: LucideIcon; tipo: "entrada" | "pessoa" | "aprovacao" | "saida";
  itens: TarefaResumo[]; pessoa?: PessoaFabrica; textoAtual?: string | null; extra?: TarefaResumo[];
}
interface Foco { setorId: string; tarefaIds: string[]; aprovacao: boolean }

export function FabricaConteudo({ clienteId, setores, membros, tarefas, pessoas, acoes, categorias, rotuloCategoria, hoje, onTarefa, onPessoa, topo }: {
  clienteId: string;
  setores: { id: string; nome: string; descricao: string | null }[];
  membros: MembroResumo[]; tarefas: TarefaResumo[]; pessoas: PessoaFabrica[]; acoes: AcaoFabrica[];
  categorias: string[]; rotuloCategoria: Record<string, string>; hoje: string;
  onTarefa: (t: TarefaResumo) => void; onPessoa: (m: MembroResumo) => void;
  /** botões do topo (+ Setor, + Funcionário) */
  topo?: ReactNode;
}) {
  // Concluídas dos últimos 7 dias: a saída de cada setor e o "concluídas hoje".
  const [feitas, setFeitas] = useState<Feita[]>([]);
  useEffect(() => {
    const desde = new Date(Date.now() - 7 * 86400000).toISOString();
    void db.from("atividades").select("id, titulo, responsavel_id, setor_id, situacao, tipo, data_vencimento, concluida, progresso, concluida_em")
      .eq("cliente_id", clienteId).eq("concluida", true).is("deleted_at", null).gte("concluida_em", desde).order("concluida_em", { ascending: false }).limit(300)
      .then(({ data }) => setFeitas((data ?? []) as Feita[]));
  }, [clienteId, tarefas.length]);

  const setorDoMembro = useMemo(() => new Map(membros.map((m) => [m.id, m.setor_id])), [membros]);
  const setorDa = (t: TarefaResumo) => t.setor_id ?? (t.responsavel_id ? setorDoMembro.get(t.responsavel_id) ?? null : null);
  const nomeDe = useMemo(() => new Map(membros.map((m) => [m.id, m.nome])), [membros]);
  const abertas = tarefas.filter((t) => !t.concluida);
  const hojeFeitas = feitas.filter((t) => (t.concluida_em ?? "").slice(0, 10) === hoje).length;

  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [foco, setFoco] = useState<Foco | null>(null);
  const [filtro, setFiltro] = useState("todos");
  const faixas = useRef(new Map<string, HTMLDivElement>());
  const focar = (a: AcaoFabrica) => {
    if (!a.setorId) { setFoco(null); return; }
    const setorId = a.setorId;
    setFoco({ setorId, tarefaIds: a.tarefaIds ?? [], aprovacao: !!a.aprovacao });
    setRecolhidos((r) => { const n = new Set(r); n.delete(setorId); return n; });
    window.setTimeout(() => faixas.current.get(setorId)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  };

  const indicadores = [
    { rotulo: "Total na produção", valor: abertas.filter((t) => t.situacao !== "aguardando_aprovacao").length, Icone: Factory, cor: "text-sky-400 bg-sky-500/15" },
    { rotulo: "Concluídas hoje", valor: hojeFeitas, Icone: CheckCircle2, cor: "text-emerald-400 bg-emerald-500/15" },
    { rotulo: "Aguardando você", valor: acoes.length, Icone: AlertTriangle, cor: "text-amber-400 bg-amber-500/15" },
    { rotulo: "Atrasadas", valor: abertas.filter((t) => tarefaAtrasada(t, hoje)).length, Icone: AlertTriangle, cor: "text-rose-400 bg-rose-500/15" },
    { rotulo: "Concluídas na semana", valor: feitas.length, Icone: BarChart3, cor: "text-violet-400 bg-violet-500/15" },
  ];

  return (
    <div className="dark space-y-3 rounded-2xl bg-[#060910] p-3 text-white">
      <style>{`
        @keyframes fab-rolo { from { background-position: 0 0, 0 0 } to { background-position: 24px 0, 0 0 } }
        @keyframes fab-caixa { from { left: -10% } to { left: 100% } }
        @keyframes fab-seta { 0%,100% { transform: translateX(0); opacity: .7 } 50% { transform: translateX(3px); opacity: 1 } }
        @keyframes fab-alerta { 0%,100% { box-shadow: 0 0 0 0 rgba(251,191,36,0) } 50% { box-shadow: 0 0 22px 2px rgba(251,191,36,.35) } }
        @keyframes fab-foco { 0%,100% { box-shadow: 0 0 0 2px rgba(103,232,249,.9) } 50% { box-shadow: 0 0 0 4px rgba(103,232,249,.45) } }
        @media (prefers-reduced-motion: reduce) { .fab-anima, .fab-anima * { animation: none !important } }
      `}</style>

      {/* Indicadores */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5">
          {indicadores.map(({ rotulo, valor, Icone, cor }) => (
            <div key={rotulo} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", cor)}><Icone className="h-5 w-5" /></span>
              <div><p className="text-[11px] text-white/55">{rotulo}</p><p className="text-xl font-bold leading-tight tabular-nums">{valor}</p></div>
            </div>
          ))}
        </div>
        {topo}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* A fábrica: um ambiente por setor */}
        <div className="fab-anima min-w-0 space-y-3">
          {/* 04/11 (Davi): a Diretoria não entra na fábrica (as pendências dela seguem em "Ações para você"). */}
          {setores.filter((s) => tipoDoSetor(s.nome) !== "diretoria").map((s) => {
            const v = VISUAL[tipoDoSetor(s.nome)];
            const equipe = pessoas.filter((p) => p.membro.setor_id === s.id && !ehCoordenador(p.membro));
            const doSetor = abertas.filter((t) => setorDa(t) === s.id);
            const naFila = doSetor.filter((t) => t.situacao !== "andamento" && t.situacao !== "aguardando_aprovacao");
            const fazendo = doSetor.filter((t) => t.situacao === "andamento");
            const esperando = doSetor.filter((t) => t.situacao === "aguardando_aprovacao");
            const saiu = feitas.filter((t) => setorDa(t) === s.id);
            const atrasadas = doSetor.filter((t) => tarefaAtrasada(t, hoje)).length;
            const idsEquipe = new Set(equipe.map((p) => p.membro.id));
            const semEstacao = fazendo.filter((t) => !t.responsavel_id || !idsEquipe.has(t.responsavel_id));
            const estacoes: Estacao[] = [
              { chave: "entrada", nome: v.entrada[0], Icone: v.entrada[1], tipo: "entrada", itens: naFila },
              ...equipe.map((p): Estacao => {
                const [nome, Icone] = estacaoDaFuncao(p.membro.funcao, p.membro.nome);
                return { chave: p.membro.id, nome, Icone, tipo: "pessoa", pessoa: p, textoAtual: p.atual,
                  itens: fazendo.filter((t) => t.responsavel_id === p.membro.id),
                  extra: naFila.filter((t) => t.responsavel_id === p.membro.id) };
              }),
              ...(semEstacao.length ? [{ chave: "producao", nome: "Em produção", Icone: Zap, tipo: "pessoa" as const, itens: semEstacao }] : []),
              { chave: "aprovacao", nome: v.aprovacao, Icone: ShieldCheck, tipo: "aprovacao", itens: esperando },
              { chave: "saida", nome: v.saida[0], Icone: v.saida[1], tipo: "saida", itens: saiu },
            ];
            const recolhido = recolhidos.has(s.id);
            const focado = foco?.setorId === s.id;
            const alternar = () => setRecolhidos((r) => { const n = new Set(r); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; });
            return (
              <div key={s.id} ref={(el) => { if (el) faixas.current.set(s.id, el); }}
                className={cn("relative flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-r", v.fundo, v.borda)}
                style={focado ? { animation: "fab-foco 1.6s ease-in-out infinite" } : undefined}>
                {/* Iluminação do teto */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24" style={{ background: `radial-gradient(60% 100% at 50% 0%, ${v.luz}, transparent)` }} />

                {/* Cabeçalho do setor: nome forte, descrição ao lado, situação à direita (04/11: sem a coluna lateral) */}
                <button type="button" onClick={alternar}
                  className={cn("relative z-10 flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-left hover:bg-white/[0.03]", !recolhido && "border-b border-white/[0.06]")}>
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/10", v.texto)}><v.Icone className="h-[18px] w-[18px]" /></span>
                  <span className="text-lg font-bold leading-none tracking-tight">{s.nome}</span>
                  <ChevronDown className={cn("-ml-1.5 h-4 w-4 shrink-0 text-white/40 transition-transform", recolhido && "-rotate-90")} />
                  {!recolhido && <span className="hidden min-w-0 flex-1 truncate text-xs text-white/50 md:block">{s.descricao || v.descricao}</span>}
                  {recolhido && <span className="flex-1" />}
                  <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs">
                    <span className="rounded-lg bg-black/30 px-2 py-1"><b className="tabular-nums">{naFila.length + fazendo.length}</b> <span className="text-white/55">em produção</span></span>
                    <span className={cn("rounded-lg px-2 py-1", esperando.length ? "bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/40" : "bg-black/30 text-white/45")}>
                      <b className="tabular-nums">{esperando.length}</b> aguardando você</span>
                    <span className={cn("rounded-lg px-2 py-1", atrasadas ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/40" : "bg-black/30 text-white/45")}>
                      <b className="tabular-nums">{atrasadas}</b> {atrasadas === 1 ? "atrasada" : "atrasadas"}</span>
                  </span>
                </button>

                {recolhido ? null : (
                  <div className="relative min-w-0 overflow-x-auto [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,.15)_transparent]">
                    <div className="relative flex px-1 pb-2 pt-2.5">
                      {estacoes.map((e, i) => (
                        <EstacaoFabrica key={e.chave} e={e} v={v} ultima={i === estacoes.length - 1} hoje={hoje} nomeDe={nomeDe}
                          acesa={focado && (foco.aprovacao ? e.tipo === "aprovacao"
                            : [...e.itens, ...(e.extra ?? [])].some((t) => foco.tarefaIds.includes(t.id)))}
                          tarefasAcesas={focado ? foco.tarefaIds : []}
                          onTarefa={onTarefa} onPessoa={onPessoa} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Ações para você: a caixa de entrada da operação */}
        <aside className="flex max-h-[calc(100svh-180px)] min-h-[400px] flex-col self-start rounded-2xl border border-rose-500/30 bg-gradient-to-b from-rose-950/40 to-[#0b0710] p-3 xl:sticky xl:top-4">
          <div className="flex items-start gap-2">
            <Target className="mt-0.5 h-7 w-7 shrink-0 text-rose-400" />
            <div className="min-w-0 flex-1"><h2 className="text-lg font-bold leading-tight">Ações para você</h2><p className="text-xs text-white/55">O que depende da sua decisão.</p></div>
            <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-sm font-bold">{acoes.length}</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-black/30 p-2"><Zap className="mx-auto h-4 w-4 text-rose-400" /><b className="block text-xl tabular-nums">{acoes.filter((a) => a.aprovacao).length}</b><span className="text-[10px] text-rose-300">Aprovações</span></div>
            <div className="rounded-xl bg-black/30 p-2"><Clock className="mx-auto h-4 w-4 text-amber-400" /><b className="block text-xl tabular-nums">{acoes.filter((a) => a.atrasada).length}</b><span className="text-[10px] text-amber-300">Atrasadas</span></div>
            <div className="rounded-xl bg-black/30 p-2"><Layers className="mx-auto h-4 w-4 text-white/70" /><b className="block text-xl tabular-nums">{acoes.filter((a) => !a.atrasada && !a.aprovacao).length}</b><span className="text-[10px] text-white/60">Pendentes</span></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["todos", ...categorias.filter((c) => acoes.some((a) => a.categoria === c))].map((c) => {
              const n = c === "todos" ? acoes.length : acoes.filter((a) => a.categoria === c).length;
              return (
                <button key={c} type="button" onClick={() => setFiltro(c)}
                  className={cn("rounded-full px-2.5 py-0.5 text-xs", filtro === c ? "bg-rose-500 text-white" : "bg-white/[0.06] text-white/70 hover:bg-white/10")}>
                  {rotuloCategoria[c] ?? c} <span className="opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {acoes.length === 0 && <p className="py-8 text-center text-sm text-white/55">Nada esperando por você agora. 🎉</p>}
            {acoes.filter((a) => filtro === "todos" || a.categoria === filtro).map((a) => (
              // Clicar numa ação acende o setor/estação/tarefa na fábrica e abre a ação, como antes.
              <div key={a.chave} onClickCapture={() => focar(a)}>{a.no}</div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function EstacaoFabrica({ e, v, ultima, hoje, nomeDe, acesa, tarefasAcesas, onTarefa, onPessoa }: {
  e: Estacao; v: Visual; ultima: boolean; hoje: string; nomeDe: Map<string, string>; acesa: boolean; tarefasAcesas: string[];
  onTarefa: (t: TarefaResumo) => void; onPessoa: (m: MembroResumo) => void;
}) {
  const todas = [...e.itens, ...(e.extra ?? [])];
  const principal = todas.find((t) => tarefasAcesas.includes(t.id)) ?? todas[0];
  const resto = todas.filter((t) => t !== principal);
  const esperando = e.tipo === "aprovacao" && e.itens.length > 0;
  const trabalhando = e.tipo === "pessoa" && (e.pessoa ? e.pessoa.sinal === "trabalhando" : e.itens.length > 0);
  // Esteira parada: esperando o Davi, funcionário sem trabalhar ou estação vazia.
  const parada = esperando || (e.tipo === "pessoa" && !trabalhando) || ((e.tipo === "entrada" || e.tipo === "saida") && e.itens.length === 0);
  const sinal = e.pessoa?.sinal;
  return (
    <div className="relative flex min-w-[138px] flex-1 basis-0 flex-col items-center px-1.5"
      style={esperando ? { animation: "fab-alerta 2s ease-in-out infinite", borderRadius: 16 } : undefined}>
      {esperando && <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-amber-400/70 bg-amber-400/[0.06]" />}
      {acesa && <div className="pointer-events-none absolute inset-0 z-20 rounded-2xl border-2 border-cyan-300" style={{ animation: "fab-foco 1.2s ease-in-out infinite" }} />}

      {/* Plaquinha da estação */}
      <div className={cn("relative z-10 flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold",
        esperando ? "bg-amber-400/20 text-amber-200" : "bg-black/45 text-white")}>
        <e.Icone className={cn("h-3.5 w-3.5", esperando ? "text-amber-300" : v.texto)} />
        <span className="max-w-[100px] truncate">{e.nome}</span>
        <span className="text-white/50">({e.itens.length})</span>
        {esperando && <AlertTriangle className="h-3.5 w-3.5 animate-pulse text-amber-300" />}
      </div>

      {/* A cena da estação */}
      <div className="relative flex h-[104px] w-full items-end justify-center">
        {e.tipo === "pessoa" && e.pessoa && (
          <button type="button" onClick={() => onPessoa(e.pessoa!.membro)} title={`${e.pessoa.membro.nome}${e.textoAtual ? ` · ${e.textoAtual}` : ""}`}
            className="relative flex flex-col items-center">
            <BonecoMesa nome={e.pessoa.membro.nome} ehIa={e.pessoa.membro.eh_ia} sinal={sinal ?? "parado"} descansando className="h-[92px] w-[104px]" />
            {sinal === "problema" && <span className="absolute -right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[11px] font-black">!</span>}
            {sinal === "esperando" && <span className="absolute -right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[11px] font-black text-black">!</span>}
            <span className="absolute -bottom-1 rounded-md bg-black/70 px-1.5 text-[11px] font-semibold">{e.pessoa.membro.nome}</span>
          </button>
        )}
        {e.tipo === "pessoa" && !e.pessoa && <Laptop className={cn("mb-4 h-12 w-12", v.texto)} />}
        {e.tipo === "entrada" && <Pilha n={e.itens.length} cor={v.trilho} />}
        {e.tipo === "aprovacao" && (
          <div className="mb-2 flex flex-col items-center gap-1">
            <span className={cn("flex h-14 w-14 items-center justify-center rounded-2xl ring-1", esperando ? "bg-amber-400/20 ring-amber-400/60" : "bg-white/5 ring-white/10")}>
              <ShieldCheck className={cn("h-8 w-8", esperando ? "text-amber-300" : "text-white/35")} />
            </span>
            {esperando && <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-black">Esperando sua aprovação</span>}
          </div>
        )}
        {e.tipo === "saida" && (
          <div className="mb-2 flex items-end gap-2">
            <Pilha n={e.itens.length} cor="#10b981" feita />
            <DoorOpen className="h-10 w-10 text-white/25" />
          </div>
        )}
      </div>

      {/* Trecho da esteira (os trechos encostam e formam uma esteira contínua) */}
      <div className="relative -mx-1.5 h-4 self-stretch overflow-hidden border-y border-black/60"
        style={{
          background: esperando
            ? "repeating-linear-gradient(135deg, #4a4420 0 8px, #2a2614 8px 16px)"
            : "repeating-linear-gradient(90deg, rgba(255,255,255,.16) 0 3px, transparent 3px 12px), linear-gradient(#2a2f3a, #161a22)",
          backgroundSize: esperando ? undefined : "24px 100%, 100% 100%",
          animation: parada ? undefined : "fab-rolo .9s linear infinite",
        }}>
        {!parada && todas.length > 0 && (
          <span className="absolute top-0.5 h-3 w-4 rounded-sm" style={{ background: v.trilho, animation: "fab-caixa 3.2s linear infinite" }} />
        )}
      </div>
      {!ultima && (
        <span className={cn("absolute -right-2 top-[118px] z-10 text-xl font-black leading-none", v.texto)} style={{ animation: "fab-seta 1.2s ease-in-out infinite" }}>›</span>
      )}

      {/* Tarefa principal + "+N itens" */}
      <div className="relative mt-1.5 min-h-[48px] w-full">
        {principal ? (
          <button type="button" onClick={() => onTarefa(principal)} title={principal.titulo}
            className={cn("w-full rounded-lg px-2 py-1 text-left text-[11px] hover:bg-white/10",
              tarefasAcesas.includes(principal.id) ? "bg-cyan-400/15 ring-1 ring-cyan-300" : "bg-black/25",
              tarefaAtrasada(principal, hoje) && "text-rose-200")}>
            <span className="block truncate font-medium">{principal.titulo}</span>
            <span className="flex items-center gap-1 text-[10px] text-white/50">
              <span className="truncate">{e.tipo === "saida" ? "concluída" : principal.responsavel_id ? nomeDe.get(principal.responsavel_id) : "sem responsável"}</span>
              {e.tipo !== "saida" && (principal.progresso ?? 0) > 0 && <span className="ml-auto tabular-nums text-sky-300">{principal.progresso}%</span>}
            </span>
            {e.tipo !== "saida" && (principal.progresso ?? 0) > 0 && (
              <span className="mt-0.5 block h-0.5 overflow-hidden rounded bg-white/10"><span className="block h-full bg-sky-400" style={{ width: `${principal.progresso}%` }} /></span>
            )}
          </button>
        ) : (
          <p className="px-2 py-1 text-center text-[11px] text-white/35">
            {e.tipo === "pessoa" ? (e.textoAtual ? <span className="line-clamp-2 text-white/60">{e.textoAtual}</span> : "Livre") : "Vazio"}
          </p>
        )}
        {resto.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="mt-0.5 w-full text-center text-[10px] font-medium text-white/50 hover:text-white">+{resto.length} {resto.length === 1 ? "item" : "itens"}</button>
            </PopoverTrigger>
            <PopoverContent className="max-h-80 w-72 overflow-y-auto p-1.5">
              <p className="px-2 pb-1 pt-0.5 text-xs font-semibold">{e.nome}{e.pessoa ? ` · ${e.pessoa.membro.nome}` : ""} · {todas.length}</p>
              {todas.map((t) => (
                <button key={t.id} type="button" onClick={() => onTarefa(t)}
                  className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted", tarefasAcesas.includes(t.id) && "bg-cyan-500/10")}>
                  <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                  {e.extra?.includes(t) && <span className="shrink-0 text-[10px] text-muted-foreground">na fila</span>}
                  {tarefaAtrasada(t, hoje) && <span className="shrink-0 text-[10px] text-rose-500">atrasada</span>}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

/** Caixas empilhadas (entrada) ou conteúdos prontos saindo (saída): mais itens, pilha maior. */
function Pilha({ n, cor, feita }: { n: number; cor: string; feita?: boolean }) {
  const caixas = Math.min(n, 6);
  if (!caixas) return <Package className="mb-4 h-10 w-10 text-white/15" />;
  const pos = [[0, 0], [22, 0], [44, 0], [11, -18], [33, -18], [22, -36]].slice(0, caixas);
  return (
    <svg viewBox="-2 -40 68 60" className={cn("mb-1", feita ? "h-[64px] w-[74px]" : "h-[78px] w-[90px]")} aria-hidden="true">
      {pos.map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <rect width="20" height="17" rx="2.5" fill={cor} opacity={0.85} />
          <rect width="20" height="5" rx="2" fill="#fff" opacity=".18" />
          {feita
            ? <path d="M5.5 10 l3 3 l6 -6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            : <rect x="8" y="0" width="4" height="17" fill="#000" opacity=".18" />}
        </g>
      ))}
    </svg>
  );
}
