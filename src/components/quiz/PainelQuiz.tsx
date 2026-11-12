import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle, BarChart3, CheckCircle2, ChevronDown, Copy, DollarSign, ExternalLink, Eye, Filter, Lightbulb, ListChecks, Loader2, Mail, MessageCircle,
  ImagePlus, Flame, Link2, MoreHorizontal, MousePointerClick, Percent, Play, Plus, ShoppingCart, RefreshCw, Search, Settings, Trash2, TrendingUp, Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { confirmar } from "@/components/DialogosGlobais";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { linkDoQuiz, montarPassos, rotuloDoPasso, type EstruturaQuiz, type QuizResumo } from "@/lib/quiz/quiz";
import { X1Quiz } from "./X1Quiz";
import { AgenteX1 } from "./AgenteX1";
import { VendasUtm } from "./VendasUtm";
import { AfiliadosQuiz } from "./AfiliadosQuiz";
import { RenomearLink } from "./RenomearLink";
import { Funil } from "./FunilConversao";
import type { VendaUtm as VendaCompleta } from "@/lib/quiz/vendasUtm";
import { codigoCurto, enderecoCurto, linkRastreado, normalizarUtm, slugValido, type LinkQuiz } from "@/lib/quiz/utm";
import {
  agruparRespostas, calcularPainel, estadoDosLeads, estatisticaDoLink, etapaDoLead, insightDoPior, leadsParaCsv, origens, porcento, resumoConversao, variacao, vendasDoLink,
  type EstadoCompra, type EventoQuiz, type LeadQuiz, type PassoInfo, type ResumoConversao, type StatusLead, type VendaPlataforma,
} from "@/lib/quiz/painel";

// Painel do quiz (11/11/2026, Davi: "uma visualização desse tipo, até com essas funções"): Métricas (números com
// tendência, funil, maior abandono, insight, leads e visitas por dia), Leads (busca, filtro, status, planilha),
// Respostas (o que as pessoas escolheram em cada pergunta), Funil e Configurações. Sempre escuro, como o editor.
const db = supabase as unknown as SupabaseClient;
type Aba = "metricas" | "leads" | "x1" | "vendas" | "respostas" | "funil" | "links" | "afiliados" | "config";
const ABAS: [Aba, string, typeof BarChart3][] = [["metricas", "Métricas", BarChart3], ["leads", "Leads", Users], ["x1", "X1", MessageCircle], ["vendas", "Vendas", DollarSign], ["respostas", "Respostas", ListChecks], ["funil", "Funil", Filter], ["links", "Links", Link2], ["afiliados", "Afiliados", Users], ["config", "Configurações", Settings]];
const STATUS: Record<StatusLead, { rotulo: string; cor: string }> = {
  novo: { rotulo: "Novo", cor: "border-sky-400/50 bg-sky-500/15 text-sky-200" },
  em_contato: { rotulo: "Em contato", cor: "border-violet-400/50 bg-violet-500/15 text-violet-200" },
  convertido: { rotulo: "Convertido", cor: "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" },
};
const PERIODOS = [["hoje", "Hoje"], [7, "7 dias"], [14, "14 dias"], [30, "30 dias"], [0, "Tudo"]] as const;
/** "Hoje" como fração de dia: da meia-noite (de agora, no fuso do Mac) até este momento. */
const fracaoDeHoje = () => { const i = new Date(); i.setHours(0, 0, 0, 0); return Math.max(0.01, (Date.now() - i.getTime()) / 86_400_000); };
const cartao = "rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-[#0c1b27] to-[#08121c] p-4";

export function PainelQuiz({ quiz }: { quiz: Pick<QuizResumo, "id" | "titulo" | "slug" | "status" | "estrutura"> }) {
  const [aba, setAba] = useState<Aba>("metricas");
  const [periodo, setPeriodo] = useState<number | "hoje">(14);
  const [eventos, setEventos] = useState<EventoQuiz[] | null>(null);
  const [leads, setLeads] = useState<LeadQuiz[] | null>(null);
  const [vendas, setVendas] = useState<VendaCompleta[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [slug, setSlug] = useState(quiz.slug);   // o endereço pode ser trocado na aba Links

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [e, l] = await Promise.all([
      db.from("quiz_eventos").select("sessao, tipo, passo, criado_em, utm").eq("quiz_id", quiz.id).order("criado_em", { ascending: false }).limit(50000),
      db.from("quiz_respostas").select("id, perfil, nome, email, whatsapp, criada_em, respostas, status, utm, sessao").eq("quiz_id", quiz.id).order("criada_em", { ascending: false }).limit(5000),
    ]);
    setEventos((e.data ?? []) as EventoQuiz[]);
    setLeads(((l.data ?? []) as LeadQuiz[]).map((x) => ({ ...x, respostas: x.respostas ?? [], status: x.status ?? "novo" })));
    // Compras do projeto (Eduzz/Kiwify/Hotmart): o elo com o lead é o e-mail que ele deixou no quiz.
    const { data: qz } = await db.from("quizzes").select("cliente_id").eq("id", quiz.id).maybeSingle();
    const cid = (qz as { cliente_id: string } | null)?.cliente_id;
    if (cid) {
      const { data: ps } = await db.from("produtos_cliente").select("id").eq("cliente_id", cid);
      const ids = ((ps ?? []) as { id: string }[]).map((x) => x.id);
      if (ids.length) {
        const { data: v } = await db.from("vendas_plataforma_eventos").select("transacao_id, tipo, comprador_email, valor, data, metodo_pagamento, utm_source, utm_medium, utm_campaign, utm_content").in("produto_id", ids).in("tipo", ["venda", "reembolso"]).limit(10000);
        setVendas((v ?? []) as VendaCompleta[]);
      }
    }
    setCarregando(false);
  }, [quiz.id]);
  useEffect(() => {
    setEventos(null); setLeads(null);
    void carregar();
    const t = window.setInterval(() => void carregar(), 60_000);
    return () => window.clearInterval(t);
  }, [carregar]);

  const [x1Vista, setX1Vista] = useState<"conversas" | "agente">("conversas");
  const estrutura = quiz.estrutura as EstruturaQuiz | null;
  const passos = useMemo<PassoInfo[]>(() => {
    if (!estrutura) return [];
    return montarPassos(estrutura, (estrutura.captura?.ativa !== false) && !!estrutura.captura?.pedir?.length).map((p) => ({ rotulo: rotuloDoPasso(estrutura, p), tipo: p.tipo }));
  }, [estrutura]);
  const perguntas = useMemo(() => (estrutura?.perguntas ?? []).map((q) => q.texto), [estrutura]);
  const dias = useMemo(() => (periodo === "hoje" ? fracaoDeHoje() : periodo), [periodo, eventos]);   // eslint-disable-line react-hooks/exhaustive-deps
  const painel = useMemo(() => (eventos && leads ? calcularPainel({ passos, eventos, leads, dias }) : null), [passos, eventos, leads, dias]);
  const estados = useMemo(() => (eventos && leads ? estadoDosLeads(leads, eventos, vendas) : new Map<string, EstadoCompra>()), [eventos, leads, vendas]);
  const conversao = useMemo(() => (leads ? resumoConversao(leads, estados, dias) : null), [leads, estados, dias]);

  const mudarStatus = async (l: LeadQuiz, status: StatusLead) => {
    const antes = leads;
    setLeads((ls) => (ls ?? []).map((x) => (x.id === l.id ? { ...x, status } : x)));
    const { error } = await db.from("quiz_respostas").update({ status }).eq("id", l.id);
    if (error) { setLeads(antes); toast.error("Não consegui mudar o status"); }
  };

  // Apagar leads (12/11, Davi: "fizemos muito teste, quero limpar"): pede confirmação, apaga do banco (e as abordagens deles do X1, em cascata).
  const apagarLeads = async (ids: string[]) => {
    if (!ids.length) return;
    const ok = await confirmar(`Apagar ${ids.length === 1 ? "este lead" : `${ids.length} leads`}? As mensagens de abordagem deles no X1 também somem. Não dá para desfazer.`, { botao: "Apagar", destrutivo: true });
    if (!ok) return;
    const { error } = await db.from("quiz_respostas").delete().in("id", ids);
    if (error) { toast.error("Não consegui apagar"); return; }
    setLeads((ls) => (ls ?? []).filter((l) => !ids.includes(l.id)));
    toast.success(ids.length === 1 ? "Lead apagado" : `${ids.length} leads apagados`);
  };

  if (!estrutura) return <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">O quiz ainda não foi criado: o painel aparece quando ele estiver pronto.</p>;
  if (!painel || !leads || !conversao) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

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
            {PERIODOS.map(([d, r]) => <button key={d} type="button" onClick={() => setPeriodo(d)} className={cn("rounded-full px-3 py-1", periodo === d ? "bg-cyan-400/15 font-semibold text-cyan-200" : "text-white/55 hover:text-white")}>{r}</button>)}
          </div>
          <button type="button" onClick={() => void carregar()} title="Atualizar agora" className="rounded-full border border-white/10 p-2 text-white/60 hover:text-white"><RefreshCw className={cn("h-3.5 w-3.5", carregando && "animate-spin")} /></button>
        </div>
      </div>

      {quiz.status !== "publicado" && <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">O quiz ainda não está publicado: os números começam a contar quando as pessoas abrirem o link. Seus testes aqui não entram.</p>}

      {aba === "metricas" && <Metricas painel={painel} leads={leads} dias={dias} perguntas={perguntas} conversao={conversao} onFunil={() => setAba("funil")} onLeads={() => setAba("leads")} onQuentes={() => setAba("x1")} onStatus={mudarStatus} />}
      {aba === "leads" && <Leads leads={leads} estados={estados} perguntas={perguntas} perfis={estrutura.perfis.map((p) => ({ id: p.id, nome: p.nome }))} onStatus={mudarStatus} onApagar={apagarLeads} />}
      {aba === "x1" && (
        <div className="space-y-3">
          <div className="flex w-fit gap-1 rounded-2xl border border-white/10 bg-[#0a1520] p-1 text-sm">
            {([["conversas", "Conversas"], ["agente", "Inteligência do agente"]] as const).map(([v, r]) => (
              <button key={v} type="button" onClick={() => setX1Vista(v)} className={cn("rounded-xl px-3.5 py-1.5", x1Vista === v ? "bg-cyan-400/10 font-semibold text-cyan-200" : "text-white/60 hover:text-white")}>{r}</button>
            ))}
          </div>
          {x1Vista === "conversas"
            ? <X1Quiz quizId={quiz.id} leads={leads} estados={estados} perguntas={perguntas} onStatus={mudarStatus} onApagar={apagarLeads} />
            : <AgenteX1 quizId={quiz.id} titulo={quiz.titulo} perfis={(estrutura?.perfis ?? []).map((p) => p.nome)} />}
        </div>
      )}
      {aba === "vendas" && <VendasUtm quizId={quiz.id} eventos={eventos ?? []} leads={leads} vendas={vendas} dias={dias} />}
      {aba === "respostas" && <Respostas leads={leads} />}
      {aba === "funil" && <FunilCompleto painel={painel} />}
      {aba === "afiliados" && <AfiliadosQuiz quizId={quiz.id} slug={slug} estrutura={estrutura} eventos={eventos ?? []} leads={leads} vendas={vendas} />}
      {aba === "links" && <Links quizId={quiz.id} slug={slug} onSlug={setSlug} eventos={eventos ?? []} leads={leads} />}
      {aba === "config" && <Config quiz={{ ...quiz, slug }} total={leads.length} />}
    </div>
  );
}

// ---------------------------------------------------------------- Métricas

function Tendencia({ atual, anterior }: { atual: number; anterior: number | null }) {
  const v = variacao(atual, anterior);
  if (!v) return null;
  return <span className={cn("flex items-center gap-0.5 text-xs font-semibold", v.sobe ? "text-emerald-400" : "text-rose-400")}>{v.sobe ? "▲" : "▼"} {v.texto}</span>;
}

export function Metricas({ painel, leads, dias, perguntas, conversao, onFunil, onLeads, onQuentes, onStatus }: {
  painel: ReturnType<typeof calcularPainel>; leads: LeadQuiz[]; dias: number; perguntas: string[]; conversao: ResumoConversao; onFunil: () => void; onLeads: () => void; onQuentes: () => void;
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
  const vs = dias > 0 && dias < 1 ? "vs. ontem até esta hora" : dias ? `vs. ${dias} dias anteriores` : "desde o início";
  const max = Math.max(1, a.visitas);

  const kpis = [
    { r: "Visitas", v: a.visitas, atual: a.visitas, ant: b?.visitas ?? null, sub: vs, Icone: Eye },
    { r: "Começaram", v: a.comecaram, atual: a.comecaram, ant: b?.comecaram ?? null, sub: `${porcento(a.comecaram, a.visitas)}% das visitas`, Icone: Play },
    { r: "Leads captados", v: a.leads, atual: a.leads, ant: b?.leads ?? null, sub: `${porcento(a.leads, a.visitas)}% de conversão`, Icone: Users, destaque: true },
    { r: "Terminaram", v: a.terminaram, atual: a.terminaram, ant: b?.terminaram ?? null, sub: `${Math.min(100, porcento(a.leads, a.terminaram))}% viraram lead`, Icone: CheckCircle2 },
    { r: "Clicaram na oferta", v: a.cta, atual: a.cta, ant: b?.cta ?? null, sub: `${porcento(a.cta, a.terminaram)}% de quem terminou`, Icone: MousePointerClick },
    { r: "Compraram", v: conversao.compraram, atual: conversao.compraram, ant: null, sub: conversao.compraram ? `${moeda(conversao.receita)} · ${porcento(conversao.compraram, conversao.clicaram)}% de quem clicou` : "ninguém ainda", Icone: ShoppingCart, compra: true },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.r} className={cn(cartao, k.destaque && "border-cyan-300/50 shadow-[0_0_24px_rgba(34,211,238,0.18)]", k.compra && "border-emerald-400/40 shadow-[0_0_24px_rgba(52,211,153,0.15)]")}>
            <p className="flex items-center gap-2 text-sm font-medium text-white/80"><k.Icone className={cn("h-4 w-4", k.compra ? "text-emerald-300" : "text-cyan-300")} />{k.r}</p>
            <div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-bold tabular-nums text-white">{k.v}</span><Tendencia atual={k.atual} anterior={k.ant} /></div>
            <p className="mt-1 text-xs text-white/50">{k.sub}</p>
          </div>
        ))}
      </div>

      <ConversaCard conversao={conversao} visitas={a.visitas} onQuentes={onQuentes} />

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
          <h3 className="flex items-center gap-2 text-lg font-bold text-white"><TrendingUp className="h-5 w-5 text-cyan-300" />{painel.porHora ? "Visitas por hora (hoje)" : `Visitas por dia (${painel.porDia.length} dias)`}</h3>
          <div className="mt-3 flex h-40 items-end gap-1">
            {(() => {
              const barras = painel.porHora
                ? painel.porHora.map((h) => ({ chave: String(h.hora), n: h.n, dica: `${String(h.hora).padStart(2, "0")}h: ${h.n} ${h.n === 1 ? "visita" : "visitas"}` }))
                : painel.porDia.map((d) => ({ chave: d.dia, n: d.n, dica: `${format(new Date(`${d.dia}T12:00:00`), "EEE, d MMM", { locale: ptBR })}: ${d.n} ${d.n === 1 ? "visita" : "visitas"}` }));
              const m = Math.max(1, ...barras.map((d) => d.n));
              return barras.map((d) => (
                <div key={d.chave} className="group flex h-full flex-1 flex-col justify-end" title={d.dica}>
                  <span className="mb-0.5 text-center text-[10px] tabular-nums text-white/60 opacity-0 group-hover:opacity-100">{d.n}</span>
                  <span className="block rounded-t bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.5)] group-hover:opacity-80" style={{ height: `${(d.n / m) * 100}%`, minHeight: d.n ? 3 : 1, opacity: d.n ? 1 : 0.25 }} />
                </div>
              ));
            })()}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-white/45">
            {painel.porHora ? <><span>00h</span><span>agora</span></> : <><span>{format(new Date(`${painel.porDia[0].dia}T12:00:00`), "d MMM", { locale: ptBR })}</span><span>hoje</span></>}
          </div>
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

export function Leads({ leads, estados, perguntas, perfis, onApagar, onStatus }: { leads: LeadQuiz[]; estados: Map<string, EstadoCompra>; perguntas: string[]; perfis: { id: string; nome: string }[]; onApagar: (ids: string[]) => Promise<void>; onStatus: (l: LeadQuiz, s: StatusLead) => void }) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<"" | StatusLead>("");
  const [perfil, setPerfil] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const filtrados = leads.filter((l) => {
    if (status && l.status !== status) return false;
    if (perfil && l.perfil !== perfil) return false;
    const t = busca.trim().toLowerCase();
    return !t || [l.nome, l.email, l.whatsapp].some((x) => (x ?? "").toLowerCase().includes(t));
  });
  const idsFiltrados = filtrados.map((l) => l.id);
  const todosMarcados = idsFiltrados.length > 0 && idsFiltrados.every((id) => marcados.has(id));
  const alternar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcadosValidos = [...marcados].filter((id) => leads.some((l) => l.id === id));
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
        <button type="button" disabled={!marcadosValidos.length} onClick={() => void onApagar(marcadosValidos).then(() => setMarcados(new Set()))}
          className="flex items-center gap-1.5 rounded-lg border border-rose-400/40 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-30"><Trash2 className="h-4 w-4" />Apagar{marcadosValidos.length ? ` (${marcadosValidos.length})` : ""}</button>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/50">{filtrados.length} de {leads.length} leads{marcadosValidos.length > 0 && <span className="text-rose-300">· {marcadosValidos.length} marcado{marcadosValidos.length > 1 ? "s" : ""}</span>}
        {filtrados.length > 0 && <button type="button" onClick={() => setMarcados(todosMarcados ? new Set() : new Set(idsFiltrados))} className="text-cyan-300 hover:underline">{todosMarcados ? "Desmarcar todos" : `Marcar todos${filtrados.length !== leads.length ? " do filtro" : ""} (${filtrados.length})`}</button>}</p>
      {filtrados.length === 0 ? <p className="py-10 text-center text-sm text-white/45">Nenhum lead com esse filtro.</p> : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-white/50"><tr><th className="w-8 py-1.5"><input type="checkbox" checked={todosMarcados} onChange={() => setMarcados(todosMarcados ? new Set() : new Set(idsFiltrados))} title="Marcar todos" /></th><th className="py-1.5 font-medium">Quando</th><th className="font-medium">Nome</th><th className="font-medium">E-mail</th><th className="font-medium">WhatsApp</th><th className="font-medium">Perfil</th><th className="font-medium">Etapa</th><th className="font-medium">Compra</th><th className="font-medium">Status</th></tr></thead>
            <tbody>
              {filtrados.map((l) => {
                const zap = l.whatsapp?.replace(/\D/g, "");
                return (
                  <>
                    <tr key={l.id} className={cn("cursor-pointer border-t border-white/5 hover:bg-white/[0.03]", marcados.has(l.id) && "bg-rose-500/[0.06]")} onClick={() => setAberto(aberto === l.id ? null : l.id)}>
                      <td className="w-8 py-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={marcados.has(l.id)} onChange={() => alternar(l.id)} /></td>
                      <td className="whitespace-nowrap py-2 text-xs text-white/55">{format(new Date(l.criada_em), "d MMM HH:mm", { locale: ptBR })}</td>
                      <td className="font-medium text-white">{l.nome || "Sem nome"}</td>
                      <td className="text-white/70">{l.email || "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>{zap ? <button type="button" onClick={() => void abrirLinkExterno(`https://wa.me/${zap.length <= 11 ? `55${zap}` : zap}`)} className="flex items-center gap-1 text-emerald-300 hover:underline"><MessageCircle className="h-3.5 w-3.5" />{l.whatsapp}</button> : "—"}</td>
                      <td className="text-white/70">{nomePerfil(l.perfil)}</td>
                      <td className="max-w-[180px] truncate text-white/70">{etapaDoLead(l, perguntas)}</td>
                      <td><BadgeCompra estado={estados.get(l.id)} /></td>
                      <td onClick={(e) => e.stopPropagation()}><SeletorStatus l={l} onStatus={onStatus} /></td>
                    </tr>
                    {aberto === l.id && (
                      <tr key={`${l.id}-r`} className="bg-white/[0.03]"><td colSpan={9} className="px-3 py-2">
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


// ---------------------------------------------------------------- Links rastreados

const ORIGENS = ["instagram", "tiktok", "youtube", "whatsapp", "facebook", "google", "email", "site"];
const MEIOS = ["bio", "story", "reels", "post", "anuncio", "direct", "grupo", "email", "link"];
const moeda = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
interface Curto { codigo: string; quiz_link_id: string; cliques: number }
interface VendaUtm { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; valor: number | null }

export function Links({ quizId, slug, onSlug, eventos, leads }: { quizId: string; slug: string; onSlug: (s: string) => void; eventos: EventoQuiz[]; leads: LeadQuiz[] }) {
  const [links, setLinks] = useState<LinkQuiz[] | null>(null);
  const [vendas, setVendas] = useState<VendaUtm[]>([]);
  const [curtos, setCurtos] = useState<Curto[]>([]);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [novoSlug, setNovoSlug] = useState(slug);
  const [salvandoSlug, setSalvandoSlug] = useState(false);
  const [f, setF] = useState({ nome: "", origem: "instagram", meio: "bio", campanha: "", conteudo: "", curto: "" });
  const base = linkDoQuiz(slug);
  const campo = "rounded-lg border border-white/10 bg-[#0a1520] px-3 py-1.5 text-sm text-white outline-none focus:border-cyan-400/50";

  const carregar = useCallback(async () => {
    const { data: q } = await db.from("quizzes").select("cliente_id").eq("id", quizId).maybeSingle();
    const cid = (q as { cliente_id: string } | null)?.cliente_id ?? null;
    setClienteId(cid);
    const { data: l } = await db.from("quiz_links").select("id, nome, utm_source, utm_medium, utm_campaign, utm_content, utm_term, criado_em").eq("quiz_id", quizId).order("criado_em");
    setLinks((l ?? []) as LinkQuiz[]);
    const ids = ((l ?? []) as { id: string }[]).map((x) => x.id);
    if (ids.length) {
      const { data: c } = await db.from("links_curtos").select("codigo, quiz_link_id, cliques").in("quiz_link_id", ids);
      setCurtos((c ?? []) as Curto[]);
    } else setCurtos([]);
    if (cid) {
      const { data: ps } = await db.from("produtos_cliente").select("id").eq("cliente_id", cid);
      const ids = ((ps ?? []) as { id: string }[]).map((x) => x.id);
      if (ids.length) {
        const { data: v } = await db.from("vendas_plataforma_eventos").select("utm_source, utm_medium, utm_campaign, utm_content, valor").in("produto_id", ids).eq("tipo", "venda").limit(5000);
        setVendas((v ?? []) as VendaUtm[]);
      }
    }
  }, [quizId]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => setNovoSlug(slug), [slug]);

  const linhas = useMemo(() => origens(eventos, leads), [eventos, leads]);

  const salvarSlug = async () => {
    const v = slugValido(novoSlug);
    if (!v) { toast.error("Use de 4 a 60 letras, números ou hífen."); return; }
    if (v === slug) return;
    setSalvandoSlug(true);
    const { error } = await db.from("quizzes").update({ slug: v }).eq("id", quizId);
    setSalvandoSlug(false);
    if (error) { toast.error(/em uso/.test(error.message) ? "Esse endereço já está em uso. Escolha outro." : "Não consegui trocar o endereço"); return; }
    onSlug(v);
    toast.success("Endereço trocado. O link antigo continua funcionando.");
  };
  const criar = async () => {
    if (!f.nome.trim() || !clienteId) return;
    const origem = normalizarUtm(f.origem);
    if (!origem) { toast.error("Escolha a origem (instagram, tiktok…)"); return; }
    // Dois links com a mesma origem/meio/campanha/conteúdo contariam as MESMAS visitas e vendas (e cada um mostraria o total dos dois).
    const igual = (links ?? []).find((x) => x.utm_source === origem && (x.utm_medium ?? "") === (normalizarUtm(f.meio) || "") && (x.utm_campaign ?? "") === (normalizarUtm(f.campanha || f.nome) || "") && (x.utm_content ?? "") === (normalizarUtm(f.conteudo) || ""));
    if (igual) { toast.error(`Já existe o link “${igual.nome}” com a mesma origem, meio e campanha: os números dos dois se misturariam. Mude a campanha ou o conteúdo.`); return; }
    const { data: criado, error } = await db.from("quiz_links").insert({
      quiz_id: quizId, cliente_id: clienteId, nome: f.nome.trim(), utm_source: origem, utm_medium: normalizarUtm(f.meio) || null,
      utm_campaign: normalizarUtm(f.campanha || f.nome) || null, utm_content: normalizarUtm(f.conteudo) || null,
    }).select("id, nome, utm_source, utm_medium, utm_campaign, utm_content, utm_term, criado_em").single();
    if (error || !criado) { toast.error("Não consegui criar o link"); return; }
    const curto = await criarCurto(criado as LinkQuiz, f.curto || f.nome);
    setF({ ...f, nome: "", campanha: "", conteudo: "", curto: "" });
    toast.success(curto ? "Link criado: copie o link curto e use onde quiser divulgar" : "Link criado (o link curto não saiu: tente criar de novo na lista)");
    void carregar();
  };
  // Link curto bonito para divulgar (infopro-hub.vercel.app/r/<código>): leva ao endereço completo com UTM e conta os cliques.
  const criarCurto = async (l: LinkQuiz, desejado: string): Promise<boolean> => {
    if (!clienteId) return false;
    const base = codigoCurto(desejado) ?? codigoCurto(l.nome) ?? "link";
    const destino = linkRastreado(linkDoQuiz(slug), l);
    for (let i = 0; i < 4; i++) {
      const codigo = i === 0 ? base : `${base.slice(0, 35)}-${Math.random().toString(36).slice(2, 5)}`;
      const { error } = await db.from("links_curtos").insert({ codigo, destino, cliente_id: clienteId, quiz_link_id: l.id });
      if (!error) return true;
      if (!/duplicate|unique|23505/i.test(error.message + (error.code ?? ""))) return false;
    }
    return false;
  };
  const apagar = async (l: LinkQuiz) => {
    const { error } = await db.from("quiz_links").delete().eq("id", l.id);
    if (error) { toast.error("Não consegui apagar"); return; }
    setLinks((ls) => (ls ?? []).filter((x) => x.id !== l.id));
  };

  return (
    <div className="space-y-4">
      <section className={cn(cartao, "space-y-2")}>
        <h3 className="text-lg font-bold text-white">Endereço do quiz</h3>
        <p className="text-xs text-white/55">É o que aparece no link que as pessoas veem. Se você trocar, o endereço antigo continua abrindo o quiz (links já divulgados não quebram).</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-black/40 px-3 py-1.5 text-sm text-white/60">{base.replace(slug, "")}</span>
          <input value={novoSlug} onChange={(e) => setNovoSlug(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void salvarSlug(); }} className={cn(campo, "min-w-[200px] flex-1")} placeholder="meu-quiz" />
          <button type="button" disabled={salvandoSlug || !slugValido(novoSlug) || slugValido(novoSlug) === slug} onClick={() => void salvarSlug()} className="rounded-lg bg-cyan-500 px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-40">{salvandoSlug ? "Salvando…" : "Salvar endereço"}</button>
        </div>
        {novoSlug && slugValido(novoSlug) && slugValido(novoSlug) !== novoSlug && <p className="text-xs text-white/50">Vai ficar: <b className="text-cyan-200">{slugValido(novoSlug)}</b></p>}
      </section>

      <PreviaDoLink quizId={quizId} slug={slug} />

      <section className={cn(cartao, "space-y-3")}>
        <div><h3 className="text-lg font-bold text-white">Links com nome (UTM)</h3><p className="text-xs text-white/55">Crie um link para cada lugar onde você divulga (bio, story, anúncio…). Quem entrar por ele fica marcado, e você vê aqui de onde vêm as visitas, os leads e as vendas.</p></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr_1fr_1.1fr_auto]">
          <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Nome do link (ex.: Bio do Instagram)" className={campo} />
          <label className="block"><input list="origens-quiz" value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })} placeholder="Origem" title="Origem (utm_source)" className={cn(campo, "w-full")} /><datalist id="origens-quiz">{ORIGENS.map((o) => <option key={o} value={o} />)}</datalist></label>
          <label className="block"><input list="meios-quiz" value={f.meio} onChange={(e) => setF({ ...f, meio: e.target.value })} placeholder="Meio" title="Meio (utm_medium)" className={cn(campo, "w-full")} /><datalist id="meios-quiz">{MEIOS.map((o) => <option key={o} value={o} />)}</datalist></label>
          <input value={f.campanha} onChange={(e) => setF({ ...f, campanha: e.target.value })} placeholder={`Campanha (padrão: ${normalizarUtm(f.nome) || "o nome"})`} title="Campanha (utm_campaign)" className={campo} />
          <input value={f.conteudo} onChange={(e) => setF({ ...f, conteudo: e.target.value })} placeholder="Conteúdo (opcional)" title="Conteúdo (utm_content): ex. o vídeo ou o criativo" className={campo} />
          <input value={f.curto} onChange={(e) => setF({ ...f, curto: e.target.value })} placeholder={`Link curto (padrão: ${codigoCurto(f.nome) ?? "o nome"})`} title="Fim do link curto: infopro-hub.vercel.app/r/…" className={campo} />
          <button type="button" disabled={!f.nome.trim() || !clienteId} onClick={() => void criar()} className="flex items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-40"><Plus className="h-4 w-4" />Criar</button>
        </div>
        {links === null ? <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-white/50" /></div>
          : links.length === 0 ? <p className="py-4 text-center text-sm text-white/45">Nenhum link ainda. Crie o primeiro acima.</p>
          : (
            <div className="space-y-2">
              {links.map((l) => {
                const url = linkRastreado(base, l);
                const curto = curtos.find((c) => c.quiz_link_id === l.id);
                const urlCurta = curto ? enderecoCurto(new URL(base).origin, curto.codigo) : null;
                const e = estatisticaDoLink(l, linhas), v = vendasDoLink(l, vendas);
                return (
                  <div key={l.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 truncate font-semibold text-white">{l.nome}</p>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/60">{[l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content].filter(Boolean).join(" · ")}</span>
                      <button type="button" onClick={() => { void navigator.clipboard.writeText(urlCurta ?? url); toast.success(urlCurta ? "Link curto copiado" : "Link copiado"); }} className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-2.5 py-1 text-xs font-semibold text-black hover:bg-cyan-400"><Copy className="h-3.5 w-3.5" />{urlCurta ? "Copiar link curto" : "Copiar link"}</button>
                      <button type="button" onClick={() => void abrirLinkExterno(url)} title="Abrir" className="rounded-lg border border-white/10 p-1.5 text-white/70 hover:bg-white/5"><ExternalLink className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => void apagar(l)} title="Apagar este link (os números já contados ficam)" className="rounded-lg p-1.5 text-white/40 hover:bg-rose-500/15 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {urlCurta
                      ? <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm"><code className="rounded bg-black/40 px-2 py-0.5 text-cyan-200">{urlCurta}</code><span className="text-xs text-white/50">{curto!.cliques} {curto!.cliques === 1 ? "clique" : "cliques"}</span><RenomearLink codigo={curto!.codigo} base={new URL(base).origin} onRenomeado={() => void carregar()} /></p>
                      : <button type="button" onClick={() => void criarCurto(l, l.nome).then((ok) => { toast[ok ? "success" : "error"](ok ? "Link curto criado" : "Não consegui criar o link curto"); void carregar(); })} className="mt-1.5 rounded-lg border border-cyan-400/40 px-2.5 py-1 text-xs text-cyan-200 hover:bg-cyan-400/10">Criar link curto (bonito para divulgar)</button>}
                    <code className="mt-1.5 block truncate text-[11px] text-white/35" title={url}>{url}</code>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                      {[["Visitas", String(e.visitas)], ["Leads", String(e.leads)], ["Conversão", `${e.conversao}%`], ["Vendas", v.n ? `${v.n} · ${moeda(v.total)}` : "0"]].map(([r, n]) => (
                        <div key={r} className="rounded-lg bg-white/5 px-2 py-1.5"><p className="text-[10px] uppercase tracking-wide text-white/45">{r}</p><p className="text-sm font-bold tabular-nums text-white">{n}</p></div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        <p className="text-[11px] text-white/45">As vendas só aparecem se o botão de compra do quiz levar a UTM adiante (o quiz já faz isso sozinho) e a plataforma (Eduzz, Kiwify, Hotmart) estiver ligada ao produto.</p>
      </section>

      <section className={cartao}>
        <h3 className="text-lg font-bold text-white">De onde vem o tráfego</h3>
        <p className="text-xs text-white/55">Todas as origens que já entraram, mesmo de links que você não criou aqui. “Sem origem” é quem abriu o endereço puro.</p>
        {linhas.length === 0 ? <p className="py-6 text-center text-sm text-white/45">Ainda sem visitas.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-white/50"><tr><th className="py-1.5 font-medium">Origem</th><th className="font-medium">Meio</th><th className="font-medium">Campanha</th><th className="text-right font-medium">Visitas</th><th className="text-right font-medium">Leads</th><th className="text-right font-medium">Conversão</th></tr></thead>
              <tbody>
                {linhas.map((o, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-1.5 font-medium text-white">{o.source || <span className="text-white/45">Sem origem (direto)</span>}</td>
                    <td className="text-white/70">{o.medium || "—"}</td>
                    <td className="text-white/70">{[o.campaign, o.content].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="text-right tabular-nums text-white/80">{o.visitas}</td>
                    <td className="text-right tabular-nums text-white/80">{o.leads}</td>
                    <td className="text-right tabular-nums text-white/60">{porcento(o.leads, o.visitas)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}


// ---------------------------------------------------------------- Prévia do link (imagem do cartão no Instagram/WhatsApp)

function PreviaDoLink({ quizId, slug }: { quizId: string; slug: string }) {
  const [v, setV] = useState({ titulo: "", descricao: "", imagem: "" });
  const [carregou, setCarregou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const campo = "w-full rounded-lg border border-white/10 bg-[#0a1520] px-3 py-1.5 text-sm text-white outline-none focus:border-cyan-400/50";
  useEffect(() => {
    void db.from("quizzes").select("compartilhar").eq("id", quizId).maybeSingle().then(({ data }) => {
      const c = (data as { compartilhar: { titulo?: string; descricao?: string; imagem?: string } | null } | null)?.compartilhar;
      setV({ titulo: c?.titulo ?? "", descricao: c?.descricao ?? "", imagem: c?.imagem ?? "" });
      setCarregou(true);
    });
  }, [quizId]);
  const enviarImagem = async (arquivo: File) => {
    setEnviando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const ext = (arquivo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const caminho = `${u.user?.id}/${quizId}/previa-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("quiz-imagens").upload(caminho, arquivo, { contentType: arquivo.type || undefined });
      if (error) throw error;
      setV((x) => ({ ...x, imagem: supabase.storage.from("quiz-imagens").getPublicUrl(caminho).data.publicUrl }));
      toast.success("Imagem enviada: clique em Salvar prévia");
    } catch { toast.error("Não consegui enviar a imagem (até 20 MB)"); } finally { setEnviando(false); }
  };
  const salvar = async () => {
    setSalvando(true);
    const limpo = { titulo: v.titulo.trim(), descricao: v.descricao.trim(), imagem: v.imagem.trim() };
    const { error } = await db.from("quizzes").update({ compartilhar: limpo.titulo || limpo.descricao || limpo.imagem ? limpo : null }).eq("id", quizId);
    setSalvando(false);
    if (error) { toast.error("Não consegui salvar"); return; }
    toast.success("Prévia salva. Vale para os links novos que você mandar (o Instagram guarda a prévia dos que já mandou).");
  };
  const dominio = new URL(linkDoQuiz(slug)).host;
  return (
    <section className={cn(cartao, "space-y-3")}>
      <div><h3 className="text-lg font-bold text-white">Prévia do link (a imagem que aparece na DM)</h3>
        <p className="text-xs text-white/55">É o cartão que o Instagram e o WhatsApp montam quando você manda o link curto. Sem escolher nada, usa o título e a imagem de abertura do quiz. Vale sem precisar publicar o quiz de novo.</p></div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-2">
          <input value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} placeholder="Título do cartão" className={campo} disabled={!carregou} />
          <input value={v.descricao} onChange={(e) => setV({ ...v, descricao: e.target.value })} placeholder="Descrição (opcional)" className={campo} disabled={!carregou} />
          <div className="flex flex-wrap items-center gap-2">
            <label className={cn("flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-400/40 px-3 py-1.5 text-sm text-cyan-200 hover:bg-cyan-400/10", enviando && "opacity-50")}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}Enviar imagem
              <input type="file" accept="image/*" className="hidden" disabled={enviando} onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarImagem(f); e.target.value = ""; }} />
            </label>
            <input value={v.imagem} onChange={(e) => setV({ ...v, imagem: e.target.value })} placeholder="ou cole o link de uma imagem (https://…)" className={cn(campo, "min-w-[200px] flex-1")} disabled={!carregou} />
          </div>
          <p className="text-[11px] text-white/45">Melhor tamanho: <b>1200 × 630</b> (retangular, mais larga que alta). Formatos JPG ou PNG, até 5 MB. Aparece como foto grande em cima do título.</p>
          <div className="flex gap-2">
            <button type="button" disabled={salvando || !carregou} onClick={() => void salvar()} className="rounded-lg bg-cyan-500 px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-40">{salvando ? "Salvando…" : "Salvar prévia"}</button>
            {v.imagem && <button type="button" onClick={() => setV({ ...v, imagem: "" })} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/5">Tirar a imagem</button>}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-white/50">Como aparece (aproximado)</p>
          <div className="max-w-[300px] overflow-hidden rounded-2xl bg-[#1f2630] text-white">
            {v.imagem ? <img src={v.imagem} alt="" className="aspect-[1.91/1] w-full object-cover" /> : <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-black/30 text-xs text-white/35">sem imagem</div>}
            <div className="space-y-0.5 p-3"><p className="line-clamp-2 text-sm font-semibold">{v.titulo || "Título do quiz"}</p>{v.descricao && <p className="line-clamp-2 text-xs text-white/65">{v.descricao}</p>}<p className="text-xs text-white/45">{dominio}</p></div>
          </div>
        </div>
      </div>
    </section>
  );
}


// ---------------------------------------------------------------- Conversão (checkout e compra)

export function BadgeCompra({ estado }: { estado: EstadoCompra | undefined }) {
  if (estado?.compra) return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-200" title={`Comprou em ${format(new Date(`${estado.compra.data.slice(0, 10)}T12:00:00`), "d MMM", { locale: ptBR })}`}><ShoppingCart className="h-3 w-3" />Comprou {moeda(estado.compra.valor)}</span>;
  if (estado?.clicouCheckout) return <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-200" title="Clicou no botão de compra e ainda não comprou"><Flame className="h-3 w-3" />Foi ao checkout</span>;
  return <span className="text-white/35">—</span>;
}

function ConversaCard({ conversao: c, visitas, onQuentes }: { conversao: ResumoConversao; visitas: number; onQuentes: () => void }) {
  const caixa = (titulo: string, valor: string, sub: string, cor: string, Icone: typeof Users) => (
    <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-white/60"><Icone className={cn("h-3.5 w-3.5", cor)} />{titulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-white">{valor}</p>
      <p className="text-[11px] text-white/45">{sub}</p>
    </div>
  );
  const seta = (txt: string) => <div className="flex shrink-0 flex-col items-center justify-center px-1 text-center text-[11px] font-semibold text-cyan-300"><span>{txt}</span><span className="text-white/30">→</span></div>;
  return (
    <section className={cn(cartao, "space-y-3")}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 text-lg font-bold text-white"><ShoppingCart className="h-5 w-5 text-emerald-300" />Funil de conversão do quiz</h3>
        {c.quentes > 0 && (
          <button type="button" onClick={onQuentes} className="flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/25">
            <Flame className="h-3.5 w-3.5" />{c.quentes} {c.quentes === 1 ? "pessoa foi" : "pessoas foram"} ao checkout e não {c.quentes === 1 ? "comprou" : "compraram"}: abordar no X1
          </button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Funil etapas={[
          { rotulo: "Visitas", n: visitas, Icone: Eye }, { rotulo: "Leads", n: c.leads, Icone: Users },
          { rotulo: "Foram ao checkout", n: c.clicaram, Icone: MousePointerClick }, { rotulo: "Compraram", n: c.compraram, Icone: ShoppingCart },
        ]} />
        <div className="grid grid-cols-2 content-center gap-2 lg:grid-cols-1">
          {caixa("Receita do quiz", moeda(c.receita), c.compraram ? `${moeda(c.receita / c.compraram)} por compra` : "nenhuma compra ainda", "text-emerald-300", TrendingUp)}
          {caixa("Conversão em compra", `${porcento(c.compraram, c.leads)}%`, `${c.compraram} de ${c.leads} leads · ${porcento(c.compraram, visitas)}% das visitas`, "text-cyan-300", Percent)}
        </div>
      </div>
      <p className="text-[11px] text-white/40">A compra é ligada ao lead pelo <b>e-mail</b> que ele deixou no quiz (vendas da Eduzz, Kiwify ou Hotmart do projeto; reembolso não conta). “Foi ao checkout” = clicou no botão de comprar do quiz.</p>
    </section>
  );
}
