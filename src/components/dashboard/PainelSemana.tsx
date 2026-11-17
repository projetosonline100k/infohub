import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, BarChart3, CalendarCheck, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Flag, LayoutGrid, List, Loader2, Plus, SlidersHorizontal, Target, Trash2, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { brl, domingoDe, filtrar, hojeIso, lerMeta, mesDaSemana, ordenar, progresso, saudacao, segundaDe, somarDias, tarefasDaSemana, type FiltroTarefas, type ItemMissao, type TarefaSemana } from "@/lib/dashSemana";

// Visão da semana (17/11/2026, Davi: "no dash geral, quero criar algo parecido com esse dash, e que seja funcional"): faturamento do mês contra a meta do mês,
// Missão da Semana (checklist), e um cartão por projeto com as tarefas da semana (dá para concluir aqui), progresso, Meta Ads, leads e vendas dos últimos 7 dias.
const db = supabase as unknown as SupabaseClient;
interface Projeto { id: string; nome: string }
interface Metricas { leads: number; vendas: number; ads: "ativa" | "pausada" | "conectada" | "sem" }
interface Linha { id: string; meta_faturamento: number | null; missao: ItemMissao[]; projetos: string[] | null }
const CORES = ["#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#22c55e", "#ef4444", "#06b6d4"];
const FILTROS: [FiltroTarefas, string, typeof CalendarDays][] = [["todas", "Todas", LayoutGrid], ["hoje", "Hoje", CalendarDays], ["pendentes", "Pendentes", Clock], ["concluidas", "Concluídas", CheckCircle2]];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const rotuloSemana = (seg: string) => {
  const [, m1, d1] = seg.split("-").map(Number), [, m2, d2] = domingoDe(seg).split("-").map(Number);
  return m1 === m2 ? `${d1} – ${d2} ${MESES[m1 - 1]}` : `${d1} ${MESES[m1 - 1]} – ${d2} ${MESES[m2 - 1]}`;
};
const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export function PainelSemana() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const nome = ((user?.user_metadata?.nome as string | undefined) || user?.email?.split("@")[0]?.split(".")[0] || "").replace(/^./, (c) => c.toUpperCase());
  const hoje = hojeIso();
  const [semana, setSemana] = useState(segundaDe(new Date()));
  const [carregando, setCarregando] = useState(true);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [tarefas, setTarefas] = useState<TarefaSemana[]>([]);
  const [faturMes, setFaturMes] = useState(0);
  const [faturSemana, setFaturSemana] = useState(0);
  const [metaMes, setMetaMes] = useState<{ id: string; valor: number | null } | null>(null);
  const [metaAnterior, setMetaAnterior] = useState<number | null>(null);
  const [metricas, setMetricas] = useState<Record<string, Metricas>>({});
  const [linha, setLinha] = useState<Linha | null>(null);
  const [anterior, setAnterior] = useState<Linha | null>(null);
  const [filtro, setFiltro] = useState<FiltroTarefas>("todas");
  const [lista, setLista] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [editandoMeta, setEditandoMeta] = useState<string | null>(null);
  const [novaMissao, setNovaMissao] = useState("");
  const linhaRef = useRef<Linha | null>(null);
  linhaRef.current = linha;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const fim = domingoDe(semana);
      const mes = mesDaSemana(semana);
      const desde7 = somarDias(hoje, -6);
      const { data: cs } = await supabase.from("clientes").select("id, nome_especialista").eq("arquivado", false).order("nome_especialista");
      const lista = ((cs ?? []) as { id: string; nome_especialista: string }[]).map((c) => ({ id: c.id, nome: c.nome_especialista }));
      const ids = lista.map((c) => c.id);
      const [pl, ant, ts, prods, qr, cl, ca, ct, mm, ma] = await Promise.all([
        db.from("painel_semanal").select("id, meta_faturamento, missao, projetos").eq("semana", semana).maybeSingle(),
        db.from("painel_semanal").select("id, meta_faturamento, missao, projetos").lt("semana", semana).order("semana", { ascending: false }).limit(1).maybeSingle(),
        db.from("atividades").select("id, titulo, cliente_id, concluida, data_vencimento, concluida_em").is("deleted_at", null).in("cliente_id", ids)
          .or(`and(concluida.eq.false,data_vencimento.lte.${fim}),concluida_em.gte.${semana}T00:00:00-03:00`).limit(2000),
        db.from("produtos_cliente").select("id, cliente_id").in("cliente_id", ids),
        db.from("quiz_respostas").select("cliente_id").in("cliente_id", ids).gte("criada_em", `${desde7}T00:00:00-03:00`).limit(5000),
        db.from("chatbot_leads").select("cliente_id").in("cliente_id", ids).gte("criada_em", `${desde7}T00:00:00-03:00`).limit(5000),
        db.from("ads_campanhas").select("cliente_id, status").in("cliente_id", ids),
        db.from("ads_contas").select("cliente_id").in("cliente_id", ids),
        db.from("painel_mensal").select("id, meta_faturamento").eq("mes", mes.inicio).maybeSingle(),
        db.from("painel_mensal").select("meta_faturamento").lt("mes", mes.inicio).order("mes", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const produtoDoCliente = new Map<string, string>(((prods.data ?? []) as { id: string; cliente_id: string }[]).map((p) => [p.id, p.cliente_id]));
      const pids = [...produtoDoCliente.keys()];
      const [diario, vendas] = pids.length ? await Promise.all([
        db.from("produto_financeiro_diario").select("produto_id, data, receita, reembolsos").in("produto_id", pids).gte("data", mes.inicio < semana ? mes.inicio : semana).lte("data", mes.fim > fim ? mes.fim : fim),
        db.from("vendas_plataforma_eventos").select("produto_id").in("produto_id", pids).eq("tipo", "venda").gte("data", desde7),
      ]) : [{ data: [] }, { data: [] }];
      const m: Record<string, Metricas> = {};
      const get = (id: string) => (m[id] ??= { leads: 0, vendas: 0, ads: "sem" });
      for (const r of [...((qr.data ?? []) as { cliente_id: string }[]), ...((cl.data ?? []) as { cliente_id: string }[])]) get(r.cliente_id).leads += 1;
      for (const v of (vendas.data ?? []) as { produto_id: string }[]) { const c = produtoDoCliente.get(v.produto_id); if (c) get(c).vendas += 1; }
      for (const c of (ct.data ?? []) as { cliente_id: string }[]) if (c.cliente_id) get(c.cliente_id).ads = "conectada";
      for (const c of (ca.data ?? []) as { cliente_id: string; status: string | null }[]) { const x = get(c.cliente_id); if (c.status === "ativa") x.ads = "ativa"; else if (x.ads !== "ativa") x.ads = "pausada"; }
      setProjetos(lista);
      setTarefas(tarefasDaSemana((ts.data ?? []) as TarefaSemana[], semana));
      const dias = (diario.data ?? []) as { data: string; receita: number | null; reembolsos: number | null }[];
      const soma = (de: string, ate: string) => dias.filter((d) => d.data >= de && d.data <= ate).reduce((s, d) => s + Number(d.receita ?? 0) - Number(d.reembolsos ?? 0), 0);
      setFaturMes(soma(mes.inicio, mes.fim));
      setFaturSemana(soma(semana, fim));
      const mmd = mm.data as { id: string; meta_faturamento: number | null } | null;
      setMetaMes(mmd ? { id: mmd.id, valor: mmd.meta_faturamento == null ? null : Number(mmd.meta_faturamento) } : null);
      setMetaAnterior(((ma.data as { meta_faturamento: number | null } | null)?.meta_faturamento) ?? null);
      setMetricas(m);
      setLinha((pl.data as Linha | null) ?? null);
      setAnterior((ant.data as Linha | null) ?? null);
    } catch {
      toast.error("Não consegui carregar a visão da semana");
    } finally { setCarregando(false); }
  }, [semana, hoje]);
  useEffect(() => { void carregar(); }, [carregar]);

  // O que a semana mostra: o que está gravado nela, senão herda da anterior (meta, projetos e missão sem os "feito").
  const efetivo: Linha = linha ?? { id: "", meta_faturamento: null, missao: (anterior?.missao ?? []).map((i) => ({ ...i, feito: false })), projetos: anterior?.projetos ?? null };
  const tarefasPorProjeto = useMemo(() => { const mp = new Map<string, TarefaSemana[]>(); tarefas.forEach((t) => { if (t.cliente_id) mp.set(t.cliente_id, [...(mp.get(t.cliente_id) ?? []), t]); }); return mp; }, [tarefas]);
  const selecionados = useMemo(() => {
    if (efetivo.projetos) return projetos.filter((p) => efetivo.projetos!.includes(p.id));
    return projetos.filter((p) => (tarefasPorProjeto.get(p.id)?.length ?? 0) > 0).slice(0, 8);   // sem escolha: os que têm tarefa na semana
  }, [projetos, efetivo.projetos, tarefasPorProjeto]);

  const salvar = async (patch: Partial<Pick<Linha, "meta_faturamento" | "missao" | "projetos">>) => {
    const base = { ...efetivo, ...patch };
    const atual = linhaRef.current;
    setLinha({ id: atual?.id ?? "", meta_faturamento: base.meta_faturamento, missao: base.missao, projetos: base.projetos });
    const dados = { meta_faturamento: base.meta_faturamento, missao: base.missao, projetos: base.projetos };
    if (atual?.id) {
      const { error } = await db.from("painel_semanal").update({ ...dados, atualizado_em: new Date().toISOString() }).eq("id", atual.id);
      if (error) toast.error("Não consegui salvar");
    } else {
      const { data, error } = await db.from("painel_semanal").insert({ semana, ...dados }).select("id").maybeSingle();
      if (error) { toast.error("Não consegui salvar"); return; }
      setLinha((l) => (l ? { ...l, id: (data as { id: string } | null)?.id ?? "" } : l));
    }
  };

  const mes = mesDaSemana(semana);
  const salvarMeta = async (valor: number | null) => {
    const atual = metaMes;
    setMetaMes({ id: atual?.id ?? "", valor });
    if (atual?.id) {
      const { error } = await db.from("painel_mensal").update({ meta_faturamento: valor, atualizado_em: new Date().toISOString() }).eq("id", atual.id);
      if (error) toast.error("Não consegui salvar a meta");
    } else {
      const { data, error } = await db.from("painel_mensal").insert({ mes: mes.inicio, meta_faturamento: valor }).select("id").maybeSingle();
      if (error) { toast.error("Não consegui salvar a meta"); return; }
      setMetaMes({ id: (data as { id: string } | null)?.id ?? "", valor });
    }
  };

  const concluir = async (t: TarefaSemana, concluida: boolean) => {
    const { data: cols } = await db.from("colunas_atividade").select("status_key, eh_conclusao").eq("cliente_id", t.cliente_id);
    const c = (cols ?? []) as { status_key: string; eh_conclusao: boolean }[];
    const status = concluida ? c.find((x) => x.eh_conclusao)?.status_key ?? "finalizado" : (c.find((x) => !x.eh_conclusao) ?? c[0])?.status_key ?? "backlog";
    setTarefas((ts) => ts.map((x) => (x.id === t.id ? { ...x, concluida, concluida_em: concluida ? new Date().toISOString() : null } : x)));
    const { error } = await supabase.from("atividades").update({ concluida, status }).eq("id", t.id);
    if (error) { toast.error("Não consegui atualizar a tarefa"); void carregar(); }
  };

  const meta = metaMes ? metaMes.valor : metaAnterior;   // mês sem meta própria herda a do mês anterior
  const pctMeta = meta && meta > 0 ? Math.min(100, Math.round((faturMes / meta) * 100)) : null;
  const emExecucao = selecionados.filter((p) => { const g = progresso(tarefasPorProjeto.get(p.id) ?? []); return g.total > 0 && g.pct < 100; }).length;
  const contagem = (f: FiltroTarefas) => selecionados.reduce((n, p) => n + filtrar(tarefasPorProjeto.get(p.id) ?? [], f, hoje).length, 0);
  const missao = efetivo.missao;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{saudacao(new Date().getHours())}{nome ? `, ${nome}` : ""} 👋</h1>
          <p className="text-sm text-muted-foreground">Visão da semana · {emExecucao} {emExecucao === 1 ? "projeto" : "projetos"} em execução</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border bg-card px-2 py-1.5 text-sm">
          <CalendarDays className="mx-1 h-4 w-4 text-muted-foreground" />
          <span className="min-w-[110px] text-center font-medium">Semana {rotuloSemana(semana)}</span>
          <button type="button" onClick={() => setSemana(somarDias(semana, -7))} className="rounded-md p-1 hover:bg-muted" aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setSemana(segundaDe(new Date()))} disabled={semana === segundaDe(new Date())} className="rounded-md px-1.5 py-1 text-xs hover:bg-muted disabled:opacity-40">Hoje</button>
          <button type="button" onClick={() => setSemana(somarDias(semana, 7))} className="rounded-md p-1 hover:bg-muted" aria-label="Próxima semana"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Faturamento do mês */}
      <div className="grid items-center gap-4 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-card to-card p-4 shadow-sm sm:grid-cols-[auto_1fr_auto] sm:gap-6 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-emerald-500/60 bg-emerald-500/10 text-emerald-500"><Wallet className="h-7 w-7" /></span>
          <div>
            <p className="text-sm font-semibold text-foreground">Faturamento do Mês · {mes.rotulo}</p>
            <p className="text-3xl font-extrabold tracking-tight text-foreground">{carregando ? "…" : brl(faturMes)}</p>
            <p className="text-[11px] text-muted-foreground">Nesta semana: {carregando ? "…" : brl(faturSemana)}</p>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm text-muted-foreground">{pctMeta === null ? "Defina a meta do mês para acompanhar" : `${pctMeta}% da meta do mês`}</p>
          <div className="h-3.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all" style={{ width: `${pctMeta ?? 0}%` }} /></div>
        </div>
        <div className="flex items-center gap-3">
          <Target className="h-9 w-9 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Meta do Mês</p>
            {editandoMeta !== null ? (
              <input autoFocus value={editandoMeta} onChange={(e) => setEditandoMeta(e.target.value)} placeholder="ex.: 10000 ou 10k"
                onBlur={() => { const v = lerMeta(editandoMeta); setEditandoMeta(null); if (v !== meta) void salvarMeta(v); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditandoMeta(null); }}
                className="w-32 rounded-md border bg-background px-2 py-1 text-lg font-bold outline-none focus:border-primary" />
            ) : (
              <button type="button" onClick={() => setEditandoMeta(meta ? String(meta) : "")} title="Clique para mudar a meta do mês" className="text-xl font-bold text-foreground hover:text-primary">{meta ? brl(meta) : "Definir meta"}</button>
            )}
          </div>
        </div>
      </div>

      {/* Missão da Semana */}
      <div className="grid gap-4 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-amber-500/10 p-4 shadow-sm sm:p-5 lg:grid-cols-[1fr_1.2fr] lg:gap-8">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-primary/50 bg-primary/10 text-primary"><Flag className="h-8 w-8" /></span>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Missão da <span className="text-primary">Semana</span></h2>
            <p className="mt-1 text-sm text-muted-foreground">{missao.length ? `${missao.filter((i) => i.feito).length} de ${missao.length} cumpridas` : "Escreva o que precisa acontecer nesta semana."}</p>
          </div>
        </div>
        <div className="space-y-1.5">
          {missao.map((i) => (
            <div key={i.id} className="group flex items-center gap-2.5">
              <Checkbox checked={i.feito} onCheckedChange={(v) => void salvar({ missao: missao.map((x) => (x.id === i.id ? { ...x, feito: v === true } : x)) })} />
              <input defaultValue={i.texto} onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== i.texto) void salvar({ missao: missao.map((x) => (x.id === i.id ? { ...x, texto: t.slice(0, 160) } : x)) }); }}
                className={cn("min-w-0 flex-1 bg-transparent text-sm outline-none", i.feito && "text-muted-foreground line-through")} />
              <button type="button" onClick={() => void salvar({ missao: missao.filter((x) => x.id !== i.id) })} title="Tirar" className="opacity-0 transition-opacity group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" /></button>
            </div>
          ))}
          {missao.length < 30 && (
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const t = novaMissao.trim(); if (!t) return; setNovaMissao(""); void salvar({ missao: [...missao, { id: novoId(), texto: t.slice(0, 160), feito: false }] }); }}>
              <Plus className="h-4 w-4 text-muted-foreground" />
              <input value={novaMissao} onChange={(e) => setNovaMissao(e.target.value)} placeholder="Adicionar à missão…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </form>
          )}
        </div>
      </div>

      {/* Projetos */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-foreground">Projetos <span className="text-primary">({selecionados.length})</span></h2>
        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map(([v, rotulo, Icone]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)}
              className={cn("inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm", filtro === v ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card text-muted-foreground hover:text-foreground")}>
              <Icone className="h-3.5 w-3.5" />{rotulo} <span className="tabular-nums">({contagem(v)})</span>
            </button>))}
          <Popover>
            <PopoverTrigger asChild><button type="button" className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"><SlidersHorizontal className="h-3.5 w-3.5" />Projetos</button></PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-1 p-2">
              <p className="px-1 pb-1 text-xs text-muted-foreground">Quais projetos aparecem nesta visão:</p>
              {projetos.map((p) => {
                const marcado = selecionados.some((s) => s.id === p.id);
                return (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
                    <Checkbox checked={marcado} onCheckedChange={(v) => { const atuais = selecionados.map((s) => s.id); void salvar({ projetos: v === true ? [...atuais, p.id] : atuais.filter((x) => x !== p.id) }); }} />
                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{tarefasPorProjeto.get(p.id)?.length ?? 0}</span>
                  </label>);
              })}
            </PopoverContent>
          </Popover>
          <div className="flex rounded-xl border bg-card p-0.5">
            <button type="button" onClick={() => setLista(false)} className={cn("rounded-lg p-1.5", !lista && "bg-primary/15 text-primary")} aria-label="Cartões"><LayoutGrid className="h-4 w-4" /></button>
            <button type="button" onClick={() => setLista(true)} className={cn("rounded-lg p-1.5", lista && "bg-primary/15 text-primary")} aria-label="Lista"><List className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {carregando && !projetos.length ? <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-muted-foreground" />
        : selecionados.length === 0 ? <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhum projeto com tarefa nesta semana. Use “Projetos” para escolher quais aparecem aqui.</p>
        : (
        <div className={cn("grid gap-4", lista ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-3")}>
          {selecionados.map((p, idx) => {
            const cor = CORES[idx % CORES.length];
            const todas = ordenar(tarefasPorProjeto.get(p.id) ?? []);
            const g = progresso(todas);
            const visiveis = filtrar(todas, filtro, hoje);
            const aberto = abertos.has(p.id);
            const lim = aberto ? 50 : 5;
            const x = metricas[p.id] ?? { leads: 0, vendas: 0, ads: "sem" as const };
            const status = g.total === 0 ? "Sem tarefas" : g.pct === 100 ? "Concluído" : "Em andamento";
            return (
              <div key={p.id} className="rounded-2xl border bg-card p-4 shadow-sm" style={{ borderColor: `${cor}55` }}>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: cor }}>{p.nome.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => navigate(`/clientes/${p.id}`)} className="block max-w-full truncate text-left text-lg font-bold text-foreground hover:underline">{p.nome}</button>
                    <p className="flex items-center gap-1.5 text-xs"><span className={cn("h-2 w-2 rounded-full", g.total === 0 ? "bg-muted-foreground" : g.pct === 100 ? "bg-emerald-500" : "bg-emerald-400")} /><span className={g.total === 0 ? "text-muted-foreground" : "text-emerald-500"}>{status}</span></p>
                  </div>
                  <span className="text-xl font-bold tabular-nums text-foreground">{g.pct}%</span>
                  <button type="button" onClick={() => setAbertos((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} aria-label="Ver mais"><ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", aberto && "rotate-180")} /></button>
                </div>
                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${g.pct}%`, background: cor }} /></div>
                <ul className="mt-3 divide-y divide-border/60">
                  {visiveis.slice(0, lim).map((t) => {
                    const venc = (t.data_vencimento ?? "").slice(0, 10);
                    const marca = !t.concluida && venc ? (venc < hoje ? { txt: "Atrasada", cls: "bg-destructive/15 text-destructive" } : venc === hoje ? { txt: "Hoje", cls: "bg-primary/15 text-primary" } : null) : null;
                    return (
                      <li key={t.id} className="flex items-center gap-2.5 py-2">
                        <Checkbox checked={t.concluida} onCheckedChange={(v) => void concluir(t, v === true)} />
                        <button type="button" onClick={() => navigate(`/clientes/${p.id}?atividade=${t.id}`)} className={cn("min-w-0 flex-1 truncate text-left text-sm hover:underline", t.concluida && "text-muted-foreground line-through")} title={t.titulo}>{t.titulo}</button>
                        {marca && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", marca.cls)}>{marca.txt}</span>}
                      </li>);
                  })}
                  {visiveis.length === 0 && <li className="py-3 text-sm text-muted-foreground">{g.total === 0 ? "Nada com prazo nesta semana." : "Nenhuma tarefa neste filtro."}</li>}
                </ul>
                {visiveis.length > lim && <button type="button" onClick={() => setAbertos((s) => new Set(s).add(p.id))} className="mt-1 text-xs text-muted-foreground hover:text-foreground">+ {visiveis.length - lim} {visiveis.length - lim === 1 ? "tarefa" : "tarefas"}</button>}
                <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-sm">
                  <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-sky-500" /><div><p className="text-[11px] leading-none text-muted-foreground">Meta Ads</p><p className={cn("font-bold", x.ads === "ativa" ? "text-emerald-500" : x.ads === "sem" ? "text-muted-foreground" : "text-amber-500")}>{{ ativa: "Ativa", pausada: "Pausada", conectada: "Conectada", sem: "Sem dados" }[x.ads]}</p></div></div>
                  <div className="flex items-center gap-2"><Users className="h-5 w-5 text-muted-foreground" /><div><p className="text-[11px] leading-none text-muted-foreground">Leads (7d)</p><p className="text-lg font-bold tabular-nums">{x.leads}</p></div></div>
                  <div className="flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-muted-foreground" /><div><p className="text-[11px] leading-none text-muted-foreground">Vendas (7d)</p><p className="text-lg font-bold tabular-nums">{x.vendas}</p></div></div>
                </div>
              </div>
            );
          })}
        </div>)}
      <p className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground"><ArrowRight className="h-3 w-3" />Faturamento = receita menos reembolsos lançados nos produtos dos projetos, no mês inteiro. Tarefas: as que vencem na semana, as atrasadas e as concluídas nela.</p>
    </div>
  );
}
