import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle, BarChart3, CheckCircle2, ChevronDown, Copy, ExternalLink, Eye, Filter, Lightbulb, ListChecks, Loader2, Mail, MessageCircle,
  MoreHorizontal, MousePointerClick, Play, RefreshCw, Search, Settings, TrendingUp, Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { linkDoQuiz, montarPassos, rotuloDoPasso, type EstruturaQuiz, type QuizResumo } from "@/lib/quiz/quiz";
import {
  agruparRespostas, calcularPainel, etapaDoLead, insightDoPior, leadsParaCsv, porcento, variacao,
  type EventoQuiz, type LeadQuiz, type PassoInfo, type StatusLead,
} from "@/lib/quiz/painel";

// Painel do quiz (11/11/2026, Davi: "uma visualização desse tipo, até com essas funções"): Métricas (números com
// tendência, funil, maior abandono, insight, leads e visitas por dia), Leads (busca, filtro, status, planilha),
// Respostas (o que as pessoas escolheram em cada pergunta), Funil e Configurações. Sempre escuro, como o editor.
const db = supabase as unknown as SupabaseClient;
type Aba = "metricas" | "leads" | "respostas" | "funil" | "config";
const ABAS: [Aba, string, typeof BarChart3][] = [["metricas", "Métricas", BarChart3], ["leads", "Leads", Users], ["respostas", "Respostas", ListChecks], ["funil", "Funil", Filter], ["config", "Configurações", Settings]];
const STATUS: Record<StatusLead, { rotulo: string; cor: string }> = {
  novo: { rotulo: "Novo", cor: "border-sky-400/50 bg-sky-500/15 text-sky-200" },
  em_contato: { rotulo: "Em contato", cor: "border-violet-400/50 bg-violet-500/15 text-violet-200" },
  convertido: { rotulo: "Convertido", cor: "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" },
};
const PERIODOS = [[7, "7 dias"], [14, "14 dias"], [30, "30 dias"], [0, "Tudo"]] as const;
const cartao = "rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-[#0c1b27] to-[#08121c] p-4";

export function PainelQuiz({ quiz }: { quiz: Pick<QuizResumo, "id" | "titulo" | "slug" | "status" | "estrutura"> }) {
  const [aba, setAba] = useState<Aba>("metricas");
  const [dias, setDias] = useState<number>(14);
  const [eventos, setEventos] = useState<EventoQuiz[] | null>(null);
  const [leads, setLeads] = useState<LeadQuiz[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [e, l] = await Promise.all([
      db.from("quiz_eventos").select("sessao, tipo, passo, criado_em").eq("quiz_id", quiz.id).order("criado_em", { ascending: false }).limit(50000),
      db.from("quiz_respostas").select("id, perfil, nome, email, whatsapp, criada_em, respostas, status").eq("quiz_id", quiz.id).order("criada_em", { ascending: false }).limit(5000),
    ]);
    setEventos((e.data ?? []) as EventoQuiz[]);
    setLeads(((l.data ?? []) as LeadQuiz[]).map((x) => ({ ...x, respostas: x.respostas ?? [], status: x.status ?? "novo" })));
    setCarregando(false);
  }, [quiz.id]);
  useEffect(() => {
    setEventos(null); setLeads(null);
    void carregar();
    const t = window.setInterval(() => void carregar(), 60_000);
    return () => window.clearInterval(t);
  }, [carregar]);

  const estrutura = quiz.estrutura as EstruturaQuiz | null;
  const passos = useMemo<PassoInfo[]>(() => {
    if (!estrutura) return [];
    return montarPassos(estrutura, (estrutura.captura?.ativa !== false) && !!estrutura.captura?.pedir?.length).map((p) => ({ rotulo: rotuloDoPasso(estrutura, p), tipo: p.tipo }));
  }, [estrutura]);
  const perguntas = useMemo(() => (estrutura?.perguntas ?? []).map((q) => q.texto), [estrutura]);
  const painel = useMemo(() => (eventos && leads ? calcularPainel({ passos, eventos, leads, dias }) : null), [passos, eventos, leads, dias]);

  const mudarStatus = async (l: LeadQuiz, status: StatusLead) => {
    const antes = leads;
    setLeads((ls) => (ls ?? []).map((x) => (x.id === l.id ? { ...x, status } : x)));
    const { error } = await db.from("quiz_respostas").update({ status }).eq("id", l.id);
    if (error) { setLeads(antes); toast.error("Não consegui mudar o status"); }
  };

  if (!estrutura) return <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">O quiz ainda não foi criado: o painel aparece quando ele estiver pronto.</p>;
  if (!painel || !leads) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="dark space-y-4 rounded-2xl bg-[#060a12] p-3 text-foreground sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-[#0a1520] p-1">
          {ABAS.map(([a, r, Icone]) => (
            <button key={a} type="button" onClick={() => setAba(a)}
              className={cn("flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm", aba === a ? "border border-cyan-400/50 bg-cyan-400/10 font-semibold text-cyan-200" : "text-white/60 hover:text-white")}><Icone className="h-4 w-4" />{r}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex rounded-full border border-white/10 bg-[#0a1520] p-0.5 text-xs">
            {PERIODOS.map(([d, r]) => <button key={d} type="button" onClick={() => setDias(d)} className={cn("rounded-full px-3 py-1", dias === d ? "bg-cyan-400/15 font-semibold text-cyan-200" : "text-white/55 hover:text-white")}>{r}</button>)}
          </div>
          <button type="button" onClick={() => void carregar()} title="Atualizar agora" className="rounded-full border border-white/10 p-2 text-white/60 hover:text-white"><RefreshCw className={cn("h-3.5 w-3.5", carregando && "animate-spin")} /></button>
        </div>
      </div>

      {quiz.status !== "publicado" && <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">O quiz ainda não está publicado: os números começam a contar quando as pessoas abrirem o link. Seus testes aqui não entram.</p>}

      {aba === "metricas" && <Metricas painel={painel} leads={leads} dias={dias} perguntas={perguntas} onFunil={() => setAba("funil")} onLeads={() => setAba("leads")} onStatus={mudarStatus} />}
      {aba === "leads" && <Leads leads={leads} perguntas={perguntas} perfis={estrutura.perfis.map((p) => ({ id: p.id, nome: p.nome }))} onStatus={mudarStatus} />}
      {aba === "respostas" && <Respostas leads={leads} />}
      {aba === "funil" && <FunilCompleto painel={painel} />}
      {aba === "config" && <Config quiz={quiz} total={leads.length} />}
    </div>
  );
}

// ---------------------------------------------------------------- Métricas

function Tendencia({ atual, anterior }: { atual: number; anterior: number | null }) {
  const v = variacao(atual, anterior);
  if (!v) return null;
  return <span className={cn("flex items-center gap-0.5 text-xs font-semibold", v.sobe ? "text-emerald-400" : "text-rose-400")}>{v.sobe ? "▲" : "▼"} {v.texto}</span>;
}

export function Metricas({ painel, leads, dias, perguntas, onFunil, onLeads, onStatus }: {
  painel: ReturnType<typeof calcularPainel>; leads: LeadQuiz[]; dias: number; perguntas: string[]; onFunil: () => void; onLeads: () => void;
  onStatus: (l: LeadQuiz, s: StatusLead) => void;
}) {
  const a = painel.atual, b = painel.anterior;
  const [modo, setModo] = useState<"etapas" | "funil">("etapas");
  const [todas, setTodas] = useState(false);
  const inicio = dias ? Date.now() - dias * 86_400_000 : 0;
  const leadsPeriodo = leads.filter((l) => Date.parse(l.criada_em) >= inicio);
  const comEmail = leadsPeriodo.filter((l) => l.email).length, comZap = leadsPeriodo.filter((l) => l.whatsapp).length;
  const pior = painel.pior > 0 ? painel.funil[painel.pior] : null;
  const perdeu = pior ? painel.funil[painel.pior - 1].n - pior.n : 0;
  const insight = insightDoPior(painel);
  const lista = todas ? painel.funil : painel.funil.slice(0, 9);
  const vs = dias ? `vs. ${dias} dias anteriores` : "desde o início";
  const max = Math.max(1, a.visitas);

  const kpis = [
    { r: "Visitas", v: a.visitas, atual: a.visitas, ant: b?.visitas ?? null, sub: vs, Icone: Eye },
    { r: "Começaram", v: a.comecaram, atual: a.comecaram, ant: b?.comecaram ?? null, sub: `${porcento(a.comecaram, a.visitas)}% das visitas`, Icone: Play },
    { r: "Leads captados", v: a.leads, atual: a.leads, ant: b?.leads ?? null, sub: `${porcento(a.leads, a.visitas)}% de conversão`, Icone: Users, destaque: true },
    { r: "Terminaram", v: a.terminaram, atual: a.terminaram, ant: b?.terminaram ?? null, sub: `${Math.min(100, porcento(a.leads, a.terminaram))}% viraram lead`, Icone: CheckCircle2 },
    { r: "Clicaram na oferta", v: a.cta, atual: a.cta, ant: b?.cta ?? null, sub: `${porcento(a.cta, a.terminaram)}% de quem terminou`, Icone: MousePointerClick },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.r} className={cn(cartao, k.destaque && "border-cyan-300/50 shadow-[0_0_24px_rgba(34,211,238,0.18)]")}>
            <p className="flex items-center gap-2 text-sm font-medium text-white/80"><k.Icone className="h-4 w-4 text-cyan-300" />{k.r}</p>
            <div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-bold tabular-nums text-white">{k.v}</span><Tendencia atual={k.atual} anterior={k.ant} /></div>
            <p className="mt-1 text-xs text-white/50">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className={cartao}>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1"><h3 className="flex items-center gap-2 text-lg font-bold text-white"><Filter className="h-5 w-5 text-cyan-300" />Até onde as pessoas chegam</h3><p className="text-xs text-white/55">Veja o desempenho de cada etapa do quiz e onde as pessoas desistem.</p></div>
            <div className="flex rounded-full border border-white/10 bg-[#0a1520] p-0.5 text-xs">
              {(["etapas", "funil"] as const).map((m) => <button key={m} type="button" onClick={() => setModo(m)} className={cn("rounded-full px-3 py-1", modo === m ? "bg-cyan-400/15 font-semibold text-cyan-200" : "text-white/55")}>{m === "etapas" ? "Etapas" : "Funil"}</button>)}
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {lista.map((p, i) => {
              const ruim = i === painel.pior;
              const larg = Math.max((p.n / max) * 100, p.n ? 1.5 : 0);
              return modo === "etapas" ? (
                <div key={i} className={cn("grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_4.5rem] items-center gap-2 rounded-lg px-2 py-1 text-sm", ruim && "bg-rose-500/15")} title={`${p.rotulo}: ${p.n} (${porcento(p.n, a.visitas)}%)`}>
                  <span className={cn("truncate", ruim ? "text-rose-300" : "text-white/80")}>{p.rotulo}</span>
                  <span className="h-3 overflow-hidden rounded-full bg-white/5"><span className={cn("block h-full rounded-full", ruim ? "bg-rose-500" : "bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.6)]")} style={{ width: `${larg}%` }} /></span>
                  <span className={cn("text-right tabular-nums", ruim ? "text-rose-300" : "text-white/80")}>{p.n} <span className="text-white/45">{porcento(p.n, a.visitas)}%</span></span>
                </div>
              ) : (
                <div key={i} className="flex items-center gap-2 text-xs" title={p.rotulo}>
                  <span className="w-40 shrink-0 truncate text-right text-white/55">{p.rotulo}</span>
                  <span className="flex-1"><span className={cn("mx-auto block h-5 rounded-md", ruim ? "bg-rose-500/80" : "bg-cyan-400/70")} style={{ width: `${Math.max(larg, p.n ? 3 : 0)}%` }} /></span>
                  <span className="w-12 text-right tabular-nums text-white/70">{porcento(p.n, a.visitas)}%</span>
                </div>
              );
            })}
          </div>
          {painel.funil.length > 9 && (
            <button type="button" onClick={() => setTodas((v) => !v)} className="mx-auto mt-3 flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-1.5 text-xs text-white/80 hover:bg-white/5">
              {todas ? "Ver menos" : `Ver todas as etapas (${painel.funil.length})`}<ChevronDown className={cn("h-3.5 w-3.5", todas && "rotate-180")} />
            </button>
          )}
        </section>

        <div className="space-y-4">
          <button type="button" onClick={onFunil} className="block w-full rounded-2xl border border-rose-400/40 bg-gradient-to-br from-[#3a1119] to-[#1e0b11] p-4 text-left">
            <p className="flex items-center gap-2 text-base font-bold text-rose-200"><AlertTriangle className="h-5 w-5" />Maior abandono</p>
            {pior ? <><p className="mt-1 text-xl font-bold text-white">{pior.rotulo}</p><p className="text-sm text-rose-200/80">{porcento(perdeu, painel.funil[painel.pior - 1].n)}% das pessoas param aqui ({perdeu} de {painel.funil[painel.pior - 1].n}).</p></>
              : <p className="mt-1 text-sm text-white/60">Ainda sem visitas suficientes para ver onde as pessoas saem.</p>}
          </button>
          <div className={cartao}>
            <p className="flex items-center gap-2 text-base font-bold text-white"><Lightbulb className="h-5 w-5 text-cyan-300" />Insight</p>
            <p className="mt-1 text-sm text-white/75">{insight ?? "Quando houver mais visitas, a gente aponta aqui o que melhorar."}</p>
          </div>
          <div className={cartao}>
            <button type="button" onClick={onLeads} className="flex w-full items-center gap-2 text-left"><Users className="h-5 w-5 text-cyan-300" /><span className="text-base font-bold text-white">Leads captados</span></button>
            <div className="mt-2 flex items-center gap-2"><span className="text-4xl font-bold tabular-nums text-white">{a.leads}</span><span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2.5 py-0.5 text-xs text-cyan-200">{porcento(a.leads, a.visitas)}% de conversão</span></div>
            <div className="mt-3 space-y-1.5 text-sm text-white/75">
              <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-white/55" />Com e-mail<span className="ml-auto tabular-nums">{comEmail} <span className="text-white/45">{porcento(comEmail, leadsPeriodo.length)}%</span></span></p>
              <p className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-emerald-400" />Com WhatsApp<span className="ml-auto tabular-nums">{comZap} <span className="text-white/45">{porcento(comZap, leadsPeriodo.length)}%</span></span></p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <section className={cartao}>
          <h3 className="flex items-center gap-2 text-lg font-bold text-white"><TrendingUp className="h-5 w-5 text-cyan-300" />Visitas por dia ({painel.porDia.length} dias)</h3>
          <div className="mt-3 flex h-40 items-end gap-1">
            {(() => {
              const m = Math.max(1, ...painel.porDia.map((d) => d.n));
              return painel.porDia.map((d) => (
                <div key={d.dia} className="group flex h-full flex-1 flex-col justify-end" title={`${format(new Date(`${d.dia}T12:00:00`), "EEE, d MMM", { locale: ptBR })}: ${d.n} ${d.n === 1 ? "visita" : "visitas"}`}>
                  <span className="mb-0.5 text-center text-[10px] tabular-nums text-white/60 opacity-0 group-hover:opacity-100">{d.n}</span>
                  <span className="block rounded-t bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.5)] group-hover:opacity-80" style={{ height: `${(d.n / m) * 100}%`, minHeight: d.n ? 3 : 1, opacity: d.n ? 1 : 0.25 }} />
                </div>
              ));
            })()}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-white/45"><span>{format(new Date(`${painel.porDia[0].dia}T12:00:00`), "d MMM", { locale: ptBR })}</span><span>hoje</span></div>
        </section>

        <section className={cartao}>
          <div className="flex items-center gap-2"><h3 className="flex flex-1 items-center gap-2 text-lg font-bold text-white"><Users className="h-5 w-5 text-cyan-300" />Leads recentes</h3>
            <button type="button" onClick={onLeads} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/5">Ver todos os leads →</button></div>
          {leads.length === 0 ? <p className="mt-6 text-center text-sm text-white/45">Nenhum lead ainda.</p> : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-white/50"><tr><th className="py-1.5 font-medium">Nome</th><th className="font-medium">E-mail</th><th className="font-medium">WhatsApp</th><th className="font-medium">Etapa</th><th className="font-medium">Status</th><th /></tr></thead>
                <tbody>{leads.slice(0, 5).map((l) => <LinhaLead key={l.id} l={l} perguntas={perguntas} onStatus={onStatus} />)}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SeletorStatus({ l, onStatus }: { l: LeadQuiz; onStatus: (l: LeadQuiz, s: StatusLead) => void }) {
  return (
    <select value={l.status} onChange={(e) => onStatus(l, e.target.value as StatusLead)} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium outline-none", STATUS[l.status].cor)}>
      {(Object.keys(STATUS) as StatusLead[]).map((s) => <option key={s} value={s} className="bg-[#0b1220] text-white">{STATUS[s].rotulo}</option>)}
    </select>
  );
}

function LinhaLead({ l, perguntas, onStatus }: { l: LeadQuiz; perguntas: string[]; onStatus: (l: LeadQuiz, s: StatusLead) => void }) {
  const [menu, setMenu] = useState(false);
  const zap = l.whatsapp?.replace(/\D/g, "");
  return (
    <tr className="border-t border-white/5">
      <td className="py-2"><span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/25 text-xs font-bold text-cyan-100">{(l.nome || "?").slice(0, 1).toUpperCase()}</span><span className="font-medium text-white">{l.nome || "Sem nome"}</span></span></td>
      <td className="text-white/70">{l.email || "—"}</td>
      <td>{zap ? <button type="button" onClick={() => void abrirLinkExterno(`https://wa.me/${zap.length <= 11 ? `55${zap}` : zap}`)} className="flex items-center gap-1 text-emerald-300 hover:underline"><MessageCircle className="h-3.5 w-3.5" />{l.whatsapp}</button> : <span className="text-white/40">—</span>}</td>
      <td className="max-w-[170px] truncate text-white/70" title={etapaDoLead(l, perguntas)}>{etapaDoLead(l, perguntas)}</td>
      <td><SeletorStatus l={l} onStatus={onStatus} /></td>
      <td className="relative w-8">
        <button type="button" onClick={() => setMenu((v) => !v)} className="rounded p-1 text-white/50 hover:bg-white/10"><MoreHorizontal className="h-4 w-4" /></button>
        {menu && (
          <div className="absolute right-0 top-full z-20 w-44 rounded-lg border border-white/10 bg-[#0b1220] p-1 text-xs text-white shadow-xl" onMouseLeave={() => setMenu(false)}>
            {zap && <button type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/10" onClick={() => { setMenu(false); void abrirLinkExterno(`https://wa.me/${zap.length <= 11 ? `55${zap}` : zap}`); }}>Chamar no WhatsApp</button>}
            {l.email && <button type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/10" onClick={() => { setMenu(false); void navigator.clipboard.writeText(l.email!); toast.success("E-mail copiado"); }}>Copiar e-mail</button>}
            {(Object.keys(STATUS) as StatusLead[]).filter((s) => s !== l.status).map((s) => <button key={s} type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/10" onClick={() => { setMenu(false); onStatus(l, s); }}>Marcar como {STATUS[s].rotulo.toLowerCase()}</button>)}
          </div>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- Leads

export function Leads({ leads, perguntas, perfis, onStatus }: { leads: LeadQuiz[]; perguntas: string[]; perfis: { id: string; nome: string }[]; onStatus: (l: LeadQuiz, s: StatusLead) => void }) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<"" | StatusLead>("");
  const [perfil, setPerfil] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const filtrados = leads.filter((l) => {
    if (status && l.status !== status) return false;
    if (perfil && l.perfil !== perfil) return false;
    const t = busca.trim().toLowerCase();
    return !t || [l.nome, l.email, l.whatsapp].some((x) => (x ?? "").toLowerCase().includes(t));
  });
  const nomePerfil = (id: string | null) => perfis.find((p) => p.id === id)?.nome ?? id ?? "—";
  const campo = "rounded-lg border border-white/10 bg-[#0a1520] px-3 py-1.5 text-sm text-white outline-none focus:border-cyan-400/50";
  return (
    <section className={cartao}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/40" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou WhatsApp" className={cn(campo, "w-full pl-8")} /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value as "" | StatusLead)} className={campo}><option value="">Todos os status</option>{(Object.keys(STATUS) as StatusLead[]).map((s) => <option key={s} value={s}>{STATUS[s].rotulo}</option>)}</select>
        {perfis.length > 0 && <select value={perfil} onChange={(e) => setPerfil(e.target.value)} className={campo}><option value="">Todos os perfis</option>{perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>}
        <button type="button" onClick={() => { void navigator.clipboard.writeText(leadsParaCsv(filtrados, perguntas)); toast.success(`${filtrados.length} leads copiados: cole numa planilha`); }}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/80 hover:bg-white/5"><Copy className="h-4 w-4" />Copiar planilha</button>
      </div>
      <p className="mt-2 text-xs text-white/50">{filtrados.length} de {leads.length} leads</p>
      {filtrados.length === 0 ? <p className="py-10 text-center text-sm text-white/45">Nenhum lead com esse filtro.</p> : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-white/50"><tr><th className="py-1.5 font-medium">Quando</th><th className="font-medium">Nome</th><th className="font-medium">E-mail</th><th className="font-medium">WhatsApp</th><th className="font-medium">Perfil</th><th className="font-medium">Etapa</th><th className="font-medium">Status</th></tr></thead>
            <tbody>
              {filtrados.map((l) => {
                const zap = l.whatsapp?.replace(/\D/g, "");
                return (
                  <>
                    <tr key={l.id} className="cursor-pointer border-t border-white/5 hover:bg-white/[0.03]" onClick={() => setAberto(aberto === l.id ? null : l.id)}>
                      <td className="whitespace-nowrap py-2 text-xs text-white/55">{format(new Date(l.criada_em), "d MMM HH:mm", { locale: ptBR })}</td>
                      <td className="font-medium text-white">{l.nome || "Sem nome"}</td>
                      <td className="text-white/70">{l.email || "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>{zap ? <button type="button" onClick={() => void abrirLinkExterno(`https://wa.me/${zap.length <= 11 ? `55${zap}` : zap}`)} className="flex items-center gap-1 text-emerald-300 hover:underline"><MessageCircle className="h-3.5 w-3.5" />{l.whatsapp}</button> : "—"}</td>
                      <td className="text-white/70">{nomePerfil(l.perfil)}</td>
                      <td className="max-w-[180px] truncate text-white/70">{etapaDoLead(l, perguntas)}</td>
                      <td onClick={(e) => e.stopPropagation()}><SeletorStatus l={l} onStatus={onStatus} /></td>
                    </tr>
                    {aberto === l.id && (
                      <tr key={`${l.id}-r`} className="bg-white/[0.03]"><td colSpan={7} className="px-3 py-2">
                        <ul className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">{l.respostas.map((r, i) => <li key={i}><span className="text-white/50">{r.pergunta}</span> → <b className="text-white">{r.resposta ?? "—"}</b></li>)}</ul>
                        {l.respostas.length === 0 && <p className="text-xs text-white/45">Sem respostas guardadas.</p>}
                      </td></tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Respostas

export function Respostas({ leads }: { leads: LeadQuiz[] }) {
  const grupos = useMemo(() => agruparRespostas(leads), [leads]);
  if (!grupos.length) return <section className={cartao}><p className="py-10 text-center text-sm text-white/45">As respostas aparecem aqui quando as pessoas terminarem o quiz e virarem lead. (Quem sai antes de deixar o contato não entra aqui, só no funil.)</p></section>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {grupos.map((g) => (
        <section key={g.pergunta} className={cartao}>
          <h3 className="text-sm font-bold text-white">{g.pergunta}</h3><p className="text-xs text-white/50">{g.total} {g.total === 1 ? "resposta" : "respostas"}</p>
          <div className="mt-2 space-y-1.5">
            {g.opcoes.map(([r, n]) => (
              <div key={r} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_4rem] items-center gap-2 text-sm" title={`${r}: ${n}`}>
                <span className="truncate text-white/80">{r}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-white/5"><span className="block h-full rounded-full bg-cyan-300" style={{ width: `${porcento(n, g.total)}%` }} /></span>
                <span className="text-right tabular-nums text-white/80">{n} <span className="text-white/45">{porcento(n, g.total)}%</span></span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Funil completo

export function FunilCompleto({ painel }: { painel: ReturnType<typeof calcularPainel> }) {
  const topo = Math.max(1, painel.funil[0]?.n ?? 1);
  return (
    <section className={cartao}>
      <h3 className="text-lg font-bold text-white">Funil completo</h3>
      <p className="text-xs text-white/55">Cada tela do quiz, quantas pessoas chegaram e quantas saíram em relação à tela anterior.</p>
      <div className="mt-3 space-y-1.5">
        {painel.funil.map((p, i) => {
          const antes = i ? painel.funil[i - 1].n : p.n;
          const saiu = antes - p.n;
          const ruim = i === painel.pior;
          return (
            <div key={i} className={cn("grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_5.5rem_6rem] items-center gap-2 rounded-lg px-2 py-1 text-sm", ruim && "bg-rose-500/15")}>
              <span className={cn("truncate", ruim ? "text-rose-300" : "text-white/80")} title={p.rotulo}>{i + 1}. {p.rotulo}</span>
              <span className="h-4 overflow-hidden rounded-md bg-white/5"><span className={cn("mx-auto block h-full rounded-md", ruim ? "bg-rose-500" : "bg-cyan-400/80")} style={{ width: `${Math.max(porcento(p.n, topo), p.n ? 2 : 0)}%` }} /></span>
              <span className="text-right tabular-nums text-white/80">{p.n} <span className="text-white/45">{porcento(p.n, topo)}%</span></span>
              <span className={cn("text-right text-xs tabular-nums", saiu > 0 ? "text-rose-300" : "text-white/35")}>{i && saiu > 0 ? `−${saiu} (${porcento(saiu, antes)}%)` : "—"}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Configurações

export function Config({ quiz, total }: { quiz: Pick<QuizResumo, "slug" | "status" | "titulo">; total: number }) {
  const link = linkDoQuiz(quiz.slug);
  return (
    <section className={cn(cartao, "space-y-3")}>
      <h3 className="text-lg font-bold text-white">Configurações</h3>
      <div><p className="text-xs font-medium text-white/50">Link do quiz</p>
        <div className="mt-1 flex flex-wrap items-center gap-2"><code className="rounded-lg bg-black/40 px-3 py-1.5 text-sm text-cyan-200">{link}</code>
          <button type="button" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copiado"); }} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/80 hover:bg-white/5"><Copy className="h-4 w-4" />Copiar</button>
          <button type="button" onClick={() => void abrirLinkExterno(link)} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/80 hover:bg-white/5"><ExternalLink className="h-4 w-4" />Abrir</button></div></div>
      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-xl bg-black/30 p-3"><p className="text-xs text-white/50">Situação</p><p className="font-semibold text-white">{quiz.status === "publicado" ? "No ar" : quiz.status === "pausado" ? "Pausado" : "Em teste (ainda não publicado)"}</p></div>
        <div className="rounded-xl bg-black/30 p-3"><p className="text-xs text-white/50">Leads guardados</p><p className="font-semibold text-white">{total}</p></div>
        <div className="rounded-xl bg-black/30 p-3"><p className="text-xs text-white/50">Como os números contam</p><p className="text-white/80">Cada aba aberta é uma visita; lead é quem deixou o contato. Seus testes na tela de revisão não entram.</p></div>
      </div>
      <p className="text-xs text-white/50">Para publicar ou levar alterações ao link, use o botão Publicar no topo da edição do quiz. Para pausar o link, use a aba Quiz do projeto.</p>
    </section>
  );
}
