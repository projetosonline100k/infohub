import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, BarChart3, CalendarCheck, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Flag, ImagePlus, LayoutGrid, List, Loader2, Plus, Settings, Target, Trash2, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { FaturamentoGeral } from "@/components/dashboard/FaturamentoGeral";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { useWorkspaceAcoes } from "@/components/workspace/WorkspaceTabs";
import { comConclusaoDaEquipe } from "@/lib/atividades/concluidaEquipe";
import { criarAtividade } from "@/lib/atividades/criarAtividade";
import { brl, domingoDe, faltaParaMeta, filtrar, metaDoMes, hojeIso, lerMeta, mesDaSemana, ordenar, progresso, segundaDe, somarDias, tarefasDaSemana, type FiltroTarefas, type ItemMissao, type TarefaSemana } from "@/lib/dashSemana";

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
  const { openTab } = useWorkspaceAcoes();
  const { user } = useAuth();
  const [fundos, setFundos] = useState<Record<string, string>>({});   // imagem de fundo do cabeçalho de cada projeto
  const [subindoFundo, setSubindoFundo] = useState<string | null>(null);
  const hoje = hojeIso();
  const [semana, setSemana] = useState(segundaDe(new Date()));
  const [carregando, setCarregando] = useState(true);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [tarefas, setTarefas] = useState<TarefaSemana[]>([]);
  const [faturMes, setFaturMes] = useState(0);
  const [faturSemana, setFaturSemana] = useState(0);
  const [metaMes, setMetaMes] = useState<{ id: string; valor: number | null } | null>(null);
  const [metaAnterior, setMetaAnterior] = useState<number | null>(null);
  const [diarioMes, setDiarioMes] = useState<{ dia: string; cliente_id: string; valor: number }[]>([]);
  const [metasProj, setMetasProj] = useState<Record<string, { id: string; valor: number }>>({});
  const [editandoProj, setEditandoProj] = useState<{ id: string; texto: string } | null>(null);
  const [novaTarefa, setNovaTarefa] = useState<Record<string, string>>({});
  const [metricas, setMetricas] = useState<Record<string, Metricas>>({});
  const [linha, setLinha] = useState<Linha | null>(null);
  const [anterior, setAnterior] = useState<Linha | null>(null);
  const [filtro, setFiltro] = useState<FiltroTarefas>("todas");
  const [slotProdutos, setSlotProdutos] = useState<HTMLDivElement | null>(null);   // onde o seletor de produtos do gráfico aparece (dentro da engrenagem)
  const [lista, setLista] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [editandoMeta, setEditandoMeta] = useState<string | null>(null);
  const [novaMissao, setNovaMissao] = useState<Record<string, string>>({});   // texto digitado em cada projeto
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
      const [pl, ant, ts, prods, qr, cl, ca, ct, mm, ma, mp, fd] = await Promise.all([
        db.from("painel_semanal").select("id, meta_faturamento, missao, projetos").eq("semana", semana).maybeSingle(),
        db.from("painel_semanal").select("id, meta_faturamento, missao, projetos").lt("semana", semana).order("semana", { ascending: false }).limit(1).maybeSingle(),
        db.from("atividades").select("id, titulo, cliente_id, concluida, data_atividade, data_vencimento, concluida_em, situacao").is("deleted_at", null).in("cliente_id", ids)
          .gte("data_atividade", semana).lte("data_atividade", fim).limit(2000),
        db.from("produtos_cliente").select("id, cliente_id").in("cliente_id", ids),
        db.from("quiz_respostas").select("cliente_id").in("cliente_id", ids).gte("criada_em", `${mes.inicio}T00:00:00-03:00`).lte("criada_em", `${mes.fim}T23:59:59-03:00`).limit(10000),
        db.from("chatbot_leads").select("cliente_id").in("cliente_id", ids).gte("criada_em", `${mes.inicio}T00:00:00-03:00`).lte("criada_em", `${mes.fim}T23:59:59-03:00`).limit(10000),
        db.from("ads_campanhas").select("cliente_id, status").in("cliente_id", ids),
        db.from("ads_contas").select("cliente_id").in("cliente_id", ids),
        db.from("painel_mensal").select("id, meta_faturamento").eq("mes", mes.inicio).maybeSingle(),
        db.from("painel_mensal").select("meta_faturamento").lt("mes", mes.inicio).order("mes", { ascending: false }).limit(1).maybeSingle(),
        db.from("painel_mensal_projeto").select("id, cliente_id, meta_faturamento").eq("mes", mes.inicio),
        db.from("painel_fundos").select("cliente_id, url"),
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
      setTarefas(tarefasDaSemana(comConclusaoDaEquipe((ts.data ?? []) as (TarefaSemana & { situacao?: string | null })[]), semana));
      const dias = (diario.data ?? []) as { data: string; receita: number | null; reembolsos: number | null }[];
      const soma = (de: string, ate: string) => dias.filter((d) => d.data >= de && d.data <= ate).reduce((s, d) => s + Number(d.receita ?? 0) - Number(d.reembolsos ?? 0), 0);
      setDiarioMes(dias.filter((d) => d.data >= mes.inicio && d.data <= mes.fim).map((d) => ({ dia: d.data, cliente_id: produtoDoCliente.get((d as unknown as { produto_id: string }).produto_id) ?? "", valor: Number(d.receita ?? 0) - Number(d.reembolsos ?? 0) })));
      setFundos(Object.fromEntries(((fd.data ?? []) as { cliente_id: string; url: string }[]).map((r) => [r.cliente_id, r.url])));
      setMetasProj(Object.fromEntries(((mp.data ?? []) as { id: string; cliente_id: string; meta_faturamento: number }[]).map((r) => [r.cliente_id, { id: r.id, valor: Number(r.meta_faturamento) }])));
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
    const comMissao = new Set(efetivo.missao.map((i) => i.cliente_id));
    return projetos.filter((p) => (tarefasPorProjeto.get(p.id)?.length ?? 0) > 0 || comMissao.has(p.id)).slice(0, 8);   // sem escolha: os que têm tarefa na semana
  }, [projetos, efetivo.projetos, efetivo.missao, tarefasPorProjeto]);

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

  const missaoDe = (id: string) => missao.filter((i) => i.cliente_id === id);
  const adicionarMissao = (id: string) => {
    const t = (novaMissao[id] ?? "").trim();
    if (!t) return;
    setNovaMissao((n) => ({ ...n, [id]: "" }));
    void salvar({ missao: [...missao, { id: novoId(), texto: t.slice(0, 160), feito: false, cliente_id: id }] });
  };
  // Fundo do cabeçalho do projeto: reduz a imagem (máx. 1400 px) para ficar leve e guarda no bucket painel-fundos.
  const trocarFundo = async (clienteId: string, arquivo: File) => {
    if (!user || !/^image\/(jpeg|png|webp)$/.test(arquivo.type)) { toast.error("Escolha uma imagem JPG, PNG ou WebP"); return; }
    setSubindoFundo(clienteId);
    try {
      const bmp = await createImageBitmap(arquivo);
      const k = Math.min(1, 1400 / bmp.width);
      const cv = document.createElement("canvas");
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob: Blob = await new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error("imagem"))), "image/jpeg", 0.85));
      const caminho = `${user.id}/${clienteId}-${Date.now()}.jpg`;
      const { error: e1 } = await supabase.storage.from("painel-fundos").upload(caminho, blob, { contentType: "image/jpeg" });
      if (e1) throw e1;
      const url = supabase.storage.from("painel-fundos").getPublicUrl(caminho).data.publicUrl;
      const antigo = fundos[clienteId];
      const { error: e2 } = antigo
        ? await db.from("painel_fundos").update({ url, atualizado_em: new Date().toISOString() }).eq("cliente_id", clienteId)
        : await db.from("painel_fundos").insert({ cliente_id: clienteId, url });
      if (e2) throw e2;
      if (antigo) { const velho = antigo.split("/painel-fundos/")[1]; if (velho) void supabase.storage.from("painel-fundos").remove([decodeURIComponent(velho)]); }
      setFundos((f) => ({ ...f, [clienteId]: url }));
    } catch { toast.error("Não consegui trocar a imagem de fundo"); }
    finally { setSubindoFundo(null); }
  };
  const tirarFundo = async (clienteId: string) => {
    const antigo = fundos[clienteId];
    setFundos((f) => { const n = { ...f }; delete n[clienteId]; return n; });
    await db.from("painel_fundos").delete().eq("cliente_id", clienteId);
    const velho = antigo?.split("/painel-fundos/")[1];
    if (velho) void supabase.storage.from("painel-fundos").remove([decodeURIComponent(velho)]);
  };
  const salvarMetaProjeto = async (clienteId: string, valor: number | null) => {
    const atual = metasProj[clienteId];
    if (valor == null || valor <= 0) {
      if (!atual) return;
      setMetasProj((m) => { const n = { ...m }; delete n[clienteId]; return n; });
      const { error } = await db.from("painel_mensal_projeto").delete().eq("id", atual.id);
      if (error) { toast.error("Não consegui tirar a meta"); void carregar(); }
      return;
    }
    if (atual?.id) {
      setMetasProj((m) => ({ ...m, [clienteId]: { id: atual.id, valor } }));
      const { error } = await db.from("painel_mensal_projeto").update({ meta_faturamento: valor, atualizado_em: new Date().toISOString() }).eq("id", atual.id);
      if (error) toast.error("Não consegui salvar a meta");
    } else {
      const { data, error } = await db.from("painel_mensal_projeto").insert({ mes: mes.inicio, cliente_id: clienteId, meta_faturamento: valor }).select("id").maybeSingle();
      if (error) { toast.error("Não consegui salvar a meta"); return; }
      setMetasProj((m) => ({ ...m, [clienteId]: { id: (data as { id: string } | null)?.id ?? "", valor } }));
    }
  };
  // Tarefa criada aqui entra na atividade do projeto (mesma função do resto do app) e já aparece no cartão: vence hoje, ou na segunda da semana vista se ela for futura.
  const adicionarTarefa = async (clienteId: string) => {
    const titulo = (novaTarefa[clienteId] ?? "").trim();
    if (!titulo) return;
    setNovaTarefa((n) => ({ ...n, [clienteId]: "" }));
    try {
      const venc = hoje >= semana && hoje <= domingoDe(semana) ? hoje : semana;
      await criarAtividade({ titulo: titulo.slice(0, 200), clienteId, pastaId: null, dataAtividade: venc, dataVencimento: venc, statusKey: "backlog", concluida: false, ordem: Date.now() % 1_000_000 });
      toast.success("Tarefa criada no projeto");
      void carregar();
    } catch (e) { toast.error(`Não consegui criar a tarefa: ${e instanceof Error ? e.message : ""}`); }
  };

  const metaTotalManual = metaMes ? metaMes.valor : metaAnterior;   // mês sem meta própria herda a do mês anterior
  const metasDosSelecionados = selecionados.map((p) => metasProj[p.id]?.valor ?? 0);
  const meta = metaDoMes(metasDosSelecionados, metaTotalManual);
  const somaDasMetas = metasDosSelecionados.some((v) => v > 0);
  const faltaMeta = faltaParaMeta(faturMes, meta);
  const fatPorProjeto = useMemo(() => { const m = new Map<string, number>(); diarioMes.forEach((d) => m.set(d.cliente_id, (m.get(d.cliente_id) ?? 0) + d.valor)); return m; }, [diarioMes]);
  const pctMeta = meta && meta > 0 ? Math.min(100, Math.round((faturMes / meta) * 100)) : null;

  const contagem = (f: FiltroTarefas) => selecionados.reduce((n, p) => n + filtrar(tarefasPorProjeto.get(p.id) ?? [], f, hoje).length, 0);
  const missao = efetivo.missao;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Semana {rotuloSemana(semana)}</span>
        <Popover>
          <PopoverTrigger asChild><button type="button" title="Semana, filtros e projetos" aria-label="Ajustes da visão" className="grid h-9 w-9 place-items-center rounded-xl border bg-card text-muted-foreground hover:text-foreground"><Settings className="h-4.5 w-4.5" /></button></PopoverTrigger>
          <PopoverContent align="end" className="max-h-[80vh] w-80 space-y-4 overflow-y-auto p-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Semana</p>
              <div className="flex items-center gap-1 rounded-xl border px-2 py-1.5 text-sm">
                <CalendarDays className="mx-1 h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-center font-medium">{rotuloSemana(semana)}</span>
                <button type="button" onClick={() => setSemana(somarDias(semana, -7))} className="rounded-md p-1 hover:bg-muted" aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => setSemana(segundaDe(new Date()))} disabled={semana === segundaDe(new Date())} className="rounded-md px-1.5 py-1 text-xs hover:bg-muted disabled:opacity-40">Hoje</button>
                <button type="button" onClick={() => setSemana(somarDias(semana, 7))} className="rounded-md p-1 hover:bg-muted" aria-label="Próxima semana"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tarefas nos cartões</p>
              <div className="grid grid-cols-2 gap-1.5">
                {FILTROS.map(([v, rotulo, Icone]) => (
                  <button key={v} type="button" onClick={() => setFiltro(v)}
                    className={cn("inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm", filtro === v ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:text-foreground")}>
                    <Icone className="h-3.5 w-3.5" />{rotulo} <span className="tabular-nums">({contagem(v)})</span>
                  </button>))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visual</p>
              <div className="flex w-fit rounded-xl border p-0.5">
                <button type="button" onClick={() => setLista(false)} className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm", !lista && "bg-primary/15 text-primary")}><LayoutGrid className="h-4 w-4" />Cartões</button>
                <button type="button" onClick={() => setLista(true)} className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm", lista && "bg-primary/15 text-primary")}><List className="h-4 w-4" />Lista</button>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Projetos ({selecionados.length})</p>
              {projetos.map((p) => {
                const marcado = selecionados.some((s) => s.id === p.id);
                return (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
                    <Checkbox checked={marcado} onCheckedChange={(v) => { const atuais = selecionados.map((s) => s.id); void salvar({ projetos: v === true ? [...atuais, p.id] : atuais.filter((x) => x !== p.id) }); }} />
                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{tarefasPorProjeto.get(p.id)?.length ?? 0}</span>
                  </label>);
              })}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Produtos no gráfico</p>
              <div ref={setSlotProdutos} />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Meta de faturamento e gráfico de vendas lado a lado */}
      <div className="grid items-stretch gap-5 xl:grid-cols-2">
      {/* Faturamento do mês: valor, meta (soma das metas dos projetos) e quanto falta */}
      <div className="flex flex-col justify-center space-y-5 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-card to-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-emerald-500/60 bg-emerald-500/10 text-emerald-500"><Wallet className="h-7 w-7" /></span>
            <div>
              <p className="text-sm font-semibold text-foreground">Faturamento do Mês · {mes.rotulo}</p>
              <p className="text-3xl font-extrabold tracking-tight text-foreground">{carregando ? "…" : brl(faturMes)}</p>
              <p className="text-[11px] text-muted-foreground">Nesta semana: {carregando ? "…" : brl(faturSemana)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Target className="h-9 w-9 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Meta do Mês{somaDasMetas ? " · soma dos projetos" : ""}</p>
              {editandoMeta !== null && !somaDasMetas ? (
                <input autoFocus value={editandoMeta} onChange={(e) => setEditandoMeta(e.target.value)} placeholder="ex.: 10000 ou 10k"
                  onBlur={() => { const v = lerMeta(editandoMeta); setEditandoMeta(null); if (v !== metaTotalManual) void salvarMeta(v); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditandoMeta(null); }}
                  className="w-32 rounded-md border bg-background px-2 py-1 text-lg font-bold outline-none focus:border-primary" />
              ) : somaDasMetas ? (
                <p className="text-xl font-bold text-foreground" title="Soma das metas dos projetos: mude a meta em cada cartão">{meta ? brl(meta) : "—"}</p>
              ) : (
                <button type="button" onClick={() => setEditandoMeta(meta ? String(meta) : "")} title="Clique para mudar a meta do mês (ou defina a meta em cada projeto)" className="text-xl font-bold text-foreground hover:text-primary">{meta ? brl(meta) : "Definir meta"}</button>
              )}
            </div>
          </div>
          </div>
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="text-muted-foreground">{pctMeta === null ? "Defina a meta do mês (ou a de cada projeto) para acompanhar" : `${pctMeta}% da meta do mês`}</span>
              {faltaMeta && (faltaMeta.falta > 0
                ? <span className="font-semibold text-foreground">Faltam <span className="text-lg text-emerald-500">{brl(faltaMeta.falta)}</span> para bater a meta</span>
                : <span className="font-semibold text-emerald-500">Meta batida! +{brl(faltaMeta.passou)} acima</span>)}
            </div>
            <div className="h-6 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all" style={{ width: `${pctMeta ?? 0}%` }} /></div>
          </div>
        </div>
      </div>

      {/* Faturamento por produto: o gráfico do Dash detalhado, sem as abas de período e sem os três números */}
      <FaturamentoGeral soGrafico slotProdutos={slotProdutos} />
      </div>

      {/* Projetos */}
      {carregando && !projetos.length ? <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-muted-foreground" />
        : selecionados.length === 0 ? <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhum projeto com tarefa nesta semana. Use “Projetos” para escolher quais aparecem aqui.</p>
        : (
        <div className={cn("grid gap-4", lista || selecionados.length === 1 ? "grid-cols-1" : selecionados.length === 2 ? "md:grid-cols-2" : selecionados.length === 3 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4")}>
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
              <div key={p.id} className="group/card overflow-hidden rounded-2xl border bg-card shadow-sm" style={{ borderColor: `${cor}55` }}>
                <div className={cn("relative p-4", fundos[p.id] && "dark text-foreground")} style={fundos[p.id] ? { backgroundImage: `linear-gradient(90deg, rgba(8,12,20,0.88) 0%, rgba(8,12,20,0.55) 55%, rgba(8,12,20,0.25) 100%), url(${fundos[p.id]})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
                <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover/card:opacity-100">
                  <label title="Imagem de fundo deste projeto" className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg bg-black/55 text-white hover:bg-black/75">{subindoFundo === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void trocarFundo(p.id, f); }} /></label>
                  {fundos[p.id] && <button type="button" onClick={() => void tirarFundo(p.id)} title="Tirar a imagem de fundo" className="grid h-7 w-7 place-items-center rounded-lg bg-black/55 text-white hover:bg-black/75"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: cor }}>{p.nome.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => openTab(`/clientes/${p.id}?secao=atividades`, `${p.nome} · Atividades`, { nova: true })} title="Abrir as atividades do projeto numa guia nova" className="block max-w-full truncate text-left text-lg font-bold text-foreground hover:underline">{p.nome}</button>
                    <p className="flex items-center gap-1.5 text-xs"><span className={cn("h-2 w-2 rounded-full", g.total === 0 ? "bg-muted-foreground" : g.pct === 100 ? "bg-emerald-500" : "bg-emerald-400")} /><span className={g.total === 0 ? "text-muted-foreground" : "text-emerald-500"}>{status}</span></p>
                  </div>
                  <span className="text-xl font-bold tabular-nums text-foreground">{g.pct}%</span>
                  <button type="button" onClick={() => setAbertos((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} aria-label="Ver mais"><ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", aberto && "rotate-180")} /></button>
                </div>
                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${g.pct}%`, background: cor }} /></div>
                </div>
                <div className="px-4 pb-4 pt-0">
                <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/[0.07] p-2.5">
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-500"><Flag className="h-3.5 w-3.5" />Missão da Semana{missaoDe(p.id).length > 0 && <span className="font-normal normal-case tracking-normal text-amber-500/70">· {missaoDe(p.id).filter((i) => i.feito).length}/{missaoDe(p.id).length}</span>}</p>
                  {missaoDe(p.id).map((i) => (
                    <div key={i.id} className="group flex items-center gap-2 py-0.5">
                      <Checkbox checked={i.feito} onCheckedChange={(v) => void salvar({ missao: missao.map((x) => (x.id === i.id ? { ...x, feito: v === true } : x)) })} className="border-amber-400 data-[state=checked]:border-amber-400 data-[state=checked]:bg-amber-400 data-[state=checked]:text-black" />
                      <input defaultValue={i.texto} onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== i.texto) void salvar({ missao: missao.map((x) => (x.id === i.id ? { ...x, texto: t.slice(0, 160) } : x)) }); }}
                        className={cn("min-w-0 flex-1 bg-transparent text-sm font-medium outline-none", i.feito ? "text-amber-500/50 line-through" : "text-amber-500")} />
                      <button type="button" onClick={() => void salvar({ missao: missao.filter((x) => x.id !== i.id) })} title="Tirar" className="opacity-0 transition-opacity group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" /></button>
                    </div>
                  ))}
                  <form className="flex items-center gap-2 pt-0.5" onSubmit={(e) => { e.preventDefault(); adicionarMissao(p.id); }}>
                    <Plus className="h-3.5 w-3.5 text-amber-500/60" />
                    <input value={novaMissao[p.id] ?? ""} onChange={(e) => setNovaMissao((n) => ({ ...n, [p.id]: e.target.value }))} placeholder="Adicionar à missão…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-amber-500/40" />
                  </form>
                </div>
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
                <form className="mt-2 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void adicionarTarefa(p.id); }}>
                  <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input value={novaTarefa[p.id] ?? ""} onChange={(e) => setNovaTarefa((n) => ({ ...n, [p.id]: e.target.value }))} placeholder="Adicionar tarefa ao projeto…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                </form>
                <div className="mt-3 rounded-xl bg-muted/40 p-2.5">
                  {(() => {
                    const fp = fatPorProjeto.get(p.id) ?? 0, mp = metasProj[p.id]?.valor ?? 0;
                    const pp = mp > 0 ? Math.min(100, Math.round((fp / mp) * 100)) : 0;
                    return (
                      <>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">Faturado no mês</span>
                          <span className="font-bold tabular-nums">{brl(fp)}{mp > 0 && <span className="font-normal text-muted-foreground"> / {" "}</span>}
                            {editandoProj?.id === p.id ? (
                              <input autoFocus value={editandoProj.texto} onChange={(e) => setEditandoProj({ id: p.id, texto: e.target.value })} placeholder="meta" className="w-20 rounded border bg-background px-1 text-right text-xs outline-none"
                                onBlur={() => { const v = lerMeta(editandoProj.texto); setEditandoProj(null); if (v !== (metasProj[p.id]?.valor ?? null)) void salvarMetaProjeto(p.id, v); }}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditandoProj(null); }} />
                            ) : (
                              <button type="button" onClick={() => setEditandoProj({ id: p.id, texto: mp ? String(mp) : "" })} title="Meta deste projeto no mês (soma na meta do mês)" className="text-primary hover:underline">{mp > 0 ? brl(mp) : "definir meta"}</button>
                            )}
                          </span>
                        </div>
                        {mp > 0 && (
                          <>
                            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${pp}%`, background: cor }} /></div>
                            <p className="mt-1 text-[11px] text-muted-foreground">{fp >= mp ? `Meta batida (+${brl(fp - mp)})` : `Faltam ${brl(mp - fp)} · ${pp}%`}</p>
                          </>)}
                      </>);
                  })()}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-sm">
                  <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-sky-500" /><div><p className="text-[11px] leading-none text-muted-foreground">Meta Ads</p><p className={cn("font-bold", x.ads === "ativa" ? "text-emerald-500" : x.ads === "sem" ? "text-muted-foreground" : "text-amber-500")}>{{ ativa: "Ativa", pausada: "Pausada", conectada: "Conectada", sem: "Sem dados" }[x.ads]}</p></div></div>
                  <div className="flex items-center gap-2"><Users className="h-5 w-5 text-muted-foreground" /><div><p className="text-[11px] leading-none text-muted-foreground">Leads (mês)</p><p className="text-lg font-bold tabular-nums">{x.leads}</p></div></div>
                  <div className="flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-muted-foreground" /><div><p className="text-[11px] leading-none text-muted-foreground">Vendas (7d)</p><p className="text-lg font-bold tabular-nums">{x.vendas}</p></div></div>
                </div>
                </div>
              </div>
            );
          })}
        </div>)}
      <p className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground"><ArrowRight className="h-3 w-3" />Faturamento = receita menos reembolsos lançados nos produtos dos projetos, no mês inteiro. Tarefas: as mesmas do filtro “Esta semana” do quadro de Atividades de cada projeto.</p>
    </div>
  );
}
