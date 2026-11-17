import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Check, Copy, ExternalLink, FolderOpen, Image as ImageIcon, Loader2, Megaphone, MessageCircle, Pencil, Plus, RefreshCw, Trash2, Upload, Video, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirmar } from "@/components/DialogosGlobais";
import { cpm, ctr, custoPorResultado, desdeDia, retorno, totais, type MetricaDia, type Totais } from "@/lib/empresa/ads";
import { UTMS_RECOMENDADOS, chamarFacebook, lucro, roi, vendasPorId, type ContaAds, type Nivel, type Venda } from "@/lib/empresa/adsApi";
import type { MembroResumo } from "@/lib/empresa/visaoGeral";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { cn } from "@/lib/utils";
import { KduChromeCorpo } from "./KduChrome";

const db = supabase as unknown as SupabaseClient;
const hojeBrasilia = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const brl = (v: number | null, moeda = "BRL") => (v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: moeda }));
const nf = (v: number | null, c = 0) => (v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: c }));
const painel = "rounded-2xl border border-white/10 bg-[#0c1320]";
const campo = "w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-sky-400/60";
const PERIODOS = [{ dias: 1, r: "Hoje" }, { dias: 7, r: "7 dias" }, { dias: 14, r: "14 dias" }, { dias: 30, r: "30 dias" }];
type Aba = "campanhas" | "conjuntos" | "anuncios" | "criativos" | "contas" | "historico";
const ABAS: [Aba, string][] = [["campanhas", "Campanhas"], ["conjuntos", "Conjuntos"], ["anuncios", "Anúncios"], ["criativos", "Criativos"], ["contas", "Contas"], ["historico", "Histórico"]];
interface LinhaDb { campanha_ref?: string; conjunto_ref?: string; anuncio_ref?: string; nome: string; status: string | null; status_efetivo: string | null; orcamento_diario?: number | string | null; miniatura?: string | null }
interface Linha { ref: string; nome: string; status: string | null; efetivo: string | null; orcamento: number | null; pai?: string; conjunto?: string; miniatura?: string | null }
interface Criativo { id: string; conta_ref: string; tipo: "imagem" | "video"; nome: string; arquivo_url: string; miniatura: string | null; pasta: string | null; criado_em: string }
interface Acao { id: string; conta_ref: string | null; acao: string; alvo: string | null; ok: boolean; erro: string | null; detalhe: Record<string, unknown> | null; criado_em: string }
interface Status { conectado: boolean; nome: string | null; expira_em: string | null; configurado: boolean }
interface Recursos { paginas: { id: string; nome: string; instagram_id: string | null; instagram: string | null }[]; pixels: { id: string; name: string }[]; ctas: string[] }
const ROTULO_ACAO: Record<string, string> = { conectar: "Conectou o Facebook", ligar: "Ligou", pausar: "Pausou", verba: "Mudou a verba", ligar_recusado: "Recusou ligar (teto)", verba_recusada: "Recusou a verba (teto)", criar_campanha: "Criou campanha", criar_conjunto: "Criou conjunto", criar_anuncio: "Criou anúncio", criativo: "Enviou criativo" };

/** Dash do Kdu no estilo UTMify (17/11/2026): campanhas, conjuntos e anúncios com chave liga/desliga, verba, vendas e lucro pelos UTMs; criar e subir criativo. Dados pela API da Meta (edge facebook-ads). */
export function DashKdu({ membro, aberto, onFechar, onConversar, escritorioId }: {
  membro: MembroResumo | null; aberto: boolean; onFechar: () => void; onConversar: () => void; escritorioId: string | null;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [contas, setContas] = useState<ContaAds[]>([]);
  const [contaRef, setContaRef] = useState<string>("");
  const [aba, setAba] = useState<Aba>("campanhas");
  const [dias, setDias] = useState(7);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [insights, setInsights] = useState<(MetricaDia & { ref: string })[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [criativos, setCriativos] = useState<Criativo[]>([]);
  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [paiFiltro, setPaiFiltro] = useState<{ nivel: "campanha" | "conjunto"; ref: string; nome: string } | null>(null);
  const [criando, setCriando] = useState(false);
  const [clientes, setClientes] = useState<{ id: string; nome_especialista: string }[]>([]);

  const conta = contas.find((c) => c.conta_ref === contaRef) ?? null;
  const moeda = conta?.moeda ?? "BRL";
  const nivel: Nivel = aba === "conjuntos" ? "conjunto" : aba === "anuncios" ? "anuncio" : "campanha";

  const lerBase = useCallback(async () => {
    const [s, c, cl] = await Promise.all([
      chamarFacebook<Status>("status").catch(() => null),
      db.from("ads_contas").select("id, conta_ref, nome, moeda, status, empresa, cliente_id, limite_diario, sincronizada_em").order("nome"),
      db.from("clientes").select("id, nome_especialista").eq("arquivado", false).order("nome_especialista"),
    ]);
    setStatus(s);
    const lista = (c.data || []) as ContaAds[];
    setContas(lista); setClientes((cl.data || []) as { id: string; nome_especialista: string }[]);
    setContaRef((atual) => (atual && lista.some((x) => x.conta_ref === atual) ? atual : (lista.find((x) => x.cliente_id === escritorioId) ?? lista[0])?.conta_ref ?? ""));
  }, [escritorioId]);
  useEffect(() => { if (aberto) { setStatus(null); void lerBase(); } }, [aberto, lerBase]);

  const lerDados = useCallback(async () => {
    if (!contaRef) { setLinhas([]); return; }
    setCarregando(true);
    const de = desdeDia(hojeBrasilia(), 60);
    const c = contas.find((x) => x.conta_ref === contaRef);
    const consultaLinhas = aba === "conjuntos"
      ? db.from("ads_conjuntos").select("conjunto_ref, campanha_ref, nome, status, status_efetivo, orcamento_diario").eq("conta_ref", contaRef)
      : aba === "anuncios"
        ? db.from("ads_anuncios").select("anuncio_ref, conjunto_ref, campanha_ref, nome, status, status_efetivo, miniatura").eq("conta_ref", contaRef)
        : db.from("ads_campanhas").select("campanha_ref, nome, status_efetivo, status, orcamento_diario").eq("conta", contaRef);
    const [l, ins, ac, cr] = await Promise.all([
      consultaLinhas,
      db.from("ads_insights_diarios").select("ref, dia, gasto, impressoes, cliques, resultados, valor_conversao").eq("conta_ref", contaRef).eq("nivel", nivel).gte("dia", de).limit(30000),
      db.from("ads_acoes").select("id, conta_ref, acao, alvo, ok, erro, detalhe, criado_em").order("criado_em", { ascending: false }).limit(60),
      db.from("ads_criativos").select("id, conta_ref, tipo, nome, arquivo_url, miniatura, pasta, criado_em").eq("conta_ref", contaRef).order("criado_em", { ascending: false }),
    ]);
    setLinhas(((l.data || []) as LinhaDb[]).map((x) => ({ ref: (aba === "campanhas" ? x.campanha_ref : aba === "conjuntos" ? x.conjunto_ref : x.anuncio_ref) ?? "", nome: x.nome, status: aba === "campanhas" ? (x.status_efetivo ?? null) : x.status, efetivo: x.status_efetivo, orcamento: x.orcamento_diario != null ? +x.orcamento_diario : null, pai: x.campanha_ref, conjunto: x.conjunto_ref, miniatura: x.miniatura })));
    setInsights(((ins.data || []) as (MetricaDia & { ref: string })[]).map((x) => ({ ...x, campanha_ref: x.ref, gasto: +x.gasto, impressoes: +x.impressoes, cliques: +x.cliques, resultados: +x.resultados, valor_conversao: +x.valor_conversao })));
    setAcoes((ac.data || []) as Acao[]); setCriativos((cr.data || []) as Criativo[]);
    // Vendas pelos UTMs (iguais aos da UTMify): as dos produtos do projeto desta conta.
    if (c?.cliente_id) {
      const { data: prods } = await db.from("produtos_cliente").select("id").eq("cliente_id", c.cliente_id);
      const ids = ((prods || []) as { id: string }[]).map((p) => p.id);
      if (ids.length) {
        const { data: vs } = await db.from("vendas_plataforma_eventos").select("utm_campaign, utm_medium, utm_content, utm_term, tipo, valor, data").in("produto_id", ids).gte("data", de).not("utm_campaign", "is", null).limit(20000);
        setVendas(((vs || []) as (Venda & { data: string })[]));
      } else setVendas([]);
    } else setVendas([]);
    setCarregando(false);
  }, [contaRef, aba, nivel, contas]);
  useEffect(() => { if (aberto && contaRef) void lerDados(); }, [aberto, contaRef, aba, lerDados]);

  const sincronizar = async () => {
    if (!contaRef || sincronizando) return;
    if (!conta?.cliente_id) { toast.error("Escolha o projeto desta conta na aba Contas antes de sincronizar."); setAba("contas"); return; }
    setSincronizando(true);
    try { const r = await chamarFacebook<{ campanhas: number; conjuntos: number; anuncios: number }>("sync", { conta_ref: contaRef, dias: 30 }); toast.success(`Sincronizado: ${r.campanhas} campanhas, ${r.conjuntos} conjuntos, ${r.anuncios} anúncios`); await lerBase(); await lerDados(); }
    catch (e) { toast.error((e as Error).message); } finally { setSincronizando(false); }
  };
  useEffect(() => {   // sincroniza sozinho ao abrir se os números têm mais de 30 min
    if (!aberto || !conta?.cliente_id || sincronizando) return;
    if (!conta.sincronizada_em || Date.now() - Date.parse(conta.sincronizada_em) > 30 * 60_000) void sincronizar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, conta?.conta_ref, conta?.cliente_id]);

  // ---------- números do período por linha
  const hoje = hojeBrasilia();
  const de = desdeDia(hoje, dias);
  const porRef = useMemo(() => {
    const m = new Map<string, Totais>();
    for (const x of insights.filter((i) => i.dia >= de)) { const t = m.get(x.ref) ?? { gasto: 0, impressoes: 0, cliques: 0, resultados: 0, valor: 0 }; t.gasto += x.gasto; t.impressoes += x.impressoes; t.cliques += x.cliques; t.resultados += x.resultados; t.valor += x.valor_conversao; m.set(x.ref, t); }
    return m;
  }, [insights, de]);
  const vendasNivel = useMemo(() => vendasPorId(vendas.filter((v) => (v as Venda & { data?: string }).data ? (v as Venda & { data: string }).data >= de : true), nivel), [vendas, nivel, de]);
  const visiveis = useMemo(() => linhas.filter((l) => !paiFiltro || (paiFiltro.nivel === "campanha" ? l.pai === paiFiltro.ref : l.conjunto === paiFiltro.ref)).sort((a, b) => (porRef.get(b.ref)?.gasto ?? 0) - (porRef.get(a.ref)?.gasto ?? 0)), [linhas, paiFiltro, porRef]);
  const soma = useMemo(() => { const t = totais(insights.filter((i) => i.dia >= de)); const v = [...vendasNivel.values()].reduce((s, x) => ({ vendas: s.vendas + x.vendas, faturamento: s.faturamento + x.faturamento }), { vendas: 0, faturamento: 0 }); return { t, ...v }; }, [insights, de, vendasNivel]);

  const mudarStatus = async (l: Linha, ligar: boolean) => {
    if (ligar && !(await confirmar(`Ligar “${l.nome}”?`, { botao: "Ligar", destrutivo: false, descricao: `Isso volta a gastar a verba (${l.orcamento != null ? `${brl(l.orcamento, moeda)}/dia` : "a do conjunto"}). Só liga se couber no teto diário da conta (${conta?.limite_diario ? brl(conta.limite_diario, moeda) : "não definido"}).` }))) return;
    const anterior = linhas;
    setLinhas((x) => x.map((i) => (i.ref === l.ref ? { ...i, status: ligar ? "ACTIVE" : "PAUSED" } : i)));
    try { await chamarFacebook("acao", { conta_ref: contaRef, tipo: "status", nivel, ref: l.ref, status: ligar ? "ACTIVE" : "PAUSED" }); toast.success(ligar ? "Ligado" : "Pausado"); }
    catch (e) { setLinhas(anterior); toast.error((e as Error).message); }
  };
  const mudarVerba = async (l: Linha) => {
    const txt = valorVerba.current[l.ref];
    const novo = Number(String(txt ?? "").replace(",", "."));
    if (!(novo >= 6)) { toast.error("A verba diária mínima é R$ 6,00."); return; }
    if (!(await confirmar(`Mudar a verba de “${l.nome}” para ${brl(novo, moeda)}/dia?`, { botao: "Mudar verba", destrutivo: false }))) return;
    try { await chamarFacebook("acao", { conta_ref: contaRef, tipo: "orcamento", nivel, ref: l.ref, valor: novo }); toast.success("Verba mudada"); setEditando(null); await lerDados(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const valorVerba = useRef<Record<string, string>>({});
  const [editando, setEditando] = useState<string | null>(null);

  const [linkConexao, setLinkConexao] = useState<string | null>(null);
  const conectar = async () => {
    try { const r = await chamarFacebook<{ url: string }>("link"); setLinkConexao(r.url); } catch (e) { toast.error((e as Error).message); }
  };
  useEffect(() => {   // esperando a autorização: confere a cada 4 s
    if (!linkConexao || !aberto) return;
    const t = window.setInterval(async () => { const s = await chamarFacebook<Status>("status").catch(() => null); if (s?.conectado) { setLinkConexao(null); await chamarFacebook("contas").catch(() => null); await lerBase(); toast.success("Facebook conectado"); } }, 4000);
    return () => window.clearInterval(t);
  }, [linkConexao, aberto, lerBase]);

  const th = "pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40";
  const conectado = !!status?.conectado && contas.length > 0;
  const expiraEm = status?.expira_em ? Date.parse(status.expira_em) : null;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="dark max-h-[94vh] w-[97vw] max-w-[1400px] overflow-y-auto border-white/10 bg-[#070b14] p-5 text-white sm:p-6 [&>button]:text-white/70">
        <DialogDescription className="sr-only">Facebook Ads: campanhas, conjuntos, anúncios, criativos e contas</DialogDescription>
        <DialogHeader className="space-y-0"><DialogTitle className="sr-only">Facebook Ads</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30"><Megaphone className="h-6 w-6" /></span>
            <div className="mr-2"><h2 className="text-xl font-bold leading-tight">Facebook Ads · {membro?.nome}</h2><p className="text-xs text-white/50">{conectado ? `Conectado como ${status?.nome ?? "—"}` : "Gestor de tráfego"}</p></div>
            {conectado && (
              <select value={contaRef} onChange={(e) => { setContaRef(e.target.value); setPaiFiltro(null); }} className="max-w-[280px] rounded-xl border border-white/15 bg-[#0c1320] px-3 py-2 text-sm">
                {contas.map((c) => <option key={c.conta_ref} value={c.conta_ref}>{c.nome ?? c.conta_ref}{c.empresa ? ` · ${c.empresa}` : ""}</option>)}
              </select>)}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {conectado && <button type="button" onClick={() => void sincronizar()} disabled={sincronizando} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold hover:bg-sky-400 disabled:opacity-60">{sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar</button>}
              {conectado && <button type="button" onClick={() => setCriando(true)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20"><Plus className="h-4 w-4" />Criar</button>}
              <button type="button" onClick={() => void abrirLinkExterno("https://adsmanager.facebook.com/adsmanager/manage/campaigns")} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10"><ExternalLink className="h-4 w-4" />Gerenciador</button>
              <button type="button" onClick={onConversar} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10"><MessageCircle className="h-4 w-4" />Conversar</button>
            </div>
          </div>
          {conectado && expiraEm && expiraEm - Date.now() < 7 * 86400_000 && <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-2.5 text-sm text-amber-100"><AlertTriangle className="mr-1.5 inline h-4 w-4" />A conexão com o Facebook vence {formatDistanceToNowStrict(expiraEm, { locale: ptBR, addSuffix: true })}. Reconecte na aba Contas.</p>}

          {status === null ? <Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-white/50" />
            : !conectado ? (
              <div className="space-y-4">
                <section className="space-y-3 rounded-3xl border border-sky-400/25 bg-gradient-to-br from-[#0d1a35] to-[#101c3f] p-6">
                  <h3 className="text-lg font-bold">Conecte o Facebook Ads para ligar, pausar, criar e subir criativos por aqui</h3>
                  <p className="text-sm text-white/65">Você autoriza uma vez (o login do Facebook que administra as contas de anúncios, de qualquer empresa/BM). O token fica só no servidor. Tudo que gasta dinheiro nasce <b>pausado</b> e só liga com a sua confirmação e dentro do teto diário que você define.</p>
                  {status && !status.configurado && <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-100">Falta configurar o app da Meta no servidor: crie os segredos <b>FB_APP_ID</b> e <b>FB_APP_SECRET</b> (Supabase › Edge Functions › Secrets) com o ID e a chave secreta do app (Configurações › Básico no painel da Meta).</p>}
                  {linkConexao ? (
                    <div className="space-y-2">
                      <input readOnly value={linkConexao} onFocus={(e) => e.currentTarget.select()} className={campo} />
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => { void navigator.clipboard.writeText(linkConexao); toast.success("Link copiado"); }} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold"><Copy className="h-4 w-4" />Copiar link</button>
                        <button type="button" onClick={() => void abrirLinkExterno(linkConexao)} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm"><ExternalLink className="h-4 w-4" />Abrir neste computador</button>
                      </div>
                      <p className="flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" />Esperando você aceitar no Facebook… esta tela atualiza sozinha.</p>
                    </div>
                  ) : <button type="button" onClick={() => void conectar()} disabled={!status?.configurado} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold hover:bg-sky-400 disabled:opacity-50"><Megaphone className="h-4 w-4" />Conectar Facebook Ads</button>}
                </section>
                <details className={cn(painel, "p-4")}>
                  <summary className="cursor-pointer text-sm font-semibold text-white/70">Enquanto isso: números lidos pelo Chrome (somente leitura)</summary>
                  <div className="mt-4"><KduChromeCorpo membro={membro} aberto={aberto} onConversar={onConversar} escritorioId={escritorioId} /></div>
                </details>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded-xl border border-white/10 bg-[#0c1320] p-0.5 text-sm">
                    {ABAS.map(([v, r]) => <button key={v} type="button" onClick={() => { setAba(v); if (v === "campanhas") setPaiFiltro(null); }} className={cn("rounded-lg px-3.5 py-1.5", aba === v ? "bg-sky-500 font-semibold text-white" : "text-white/60 hover:text-white")}>{r}</button>)}
                  </div>
                  {["campanhas", "conjuntos", "anuncios"].includes(aba) && (
                    <div className="ml-auto flex rounded-xl border border-white/10 bg-[#0c1320] p-0.5 text-sm">
                      {PERIODOS.map((p) => <button key={p.dias} type="button" onClick={() => setDias(p.dias)} className={cn("rounded-lg px-3 py-1.5", dias === p.dias ? "bg-white/15 font-semibold" : "text-white/55")}>{p.r}</button>)}
                    </div>)}
                </div>

                {["campanhas", "conjuntos", "anuncios"].includes(aba) && (
                  <section className={cn(painel, "p-3")}>
                    {paiFiltro && <p className="mb-2 flex items-center gap-2 px-1 text-xs text-white/60">Filtrando por {paiFiltro.nivel === "campanha" ? "campanha" : "conjunto"}: <b className="text-white">{paiFiltro.nome}</b><button type="button" onClick={() => setPaiFiltro(null)} className="rounded border border-white/20 px-1.5 hover:bg-white/10">tirar</button></p>}
                    {carregando && linhas.length === 0 ? <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin text-white/50" /> : visiveis.length === 0 ? (
                      <p className="rounded-xl bg-white/5 p-8 text-center text-sm text-white/50">{conta?.sincronizada_em ? "Nada por aqui neste nível." : "Ainda sem dados: clique em Atualizar para o Kdu trazer as campanhas desta conta."}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1100px] text-sm">
                          <thead><tr><th className="w-14 pb-2 pl-1 text-left text-[11px] font-semibold uppercase text-white/40">Liga</th><th className="pb-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">{nivel === "campanha" ? "Campanha" : nivel === "conjunto" ? "Conjunto" : "Anúncio"}</th>
                            {nivel !== "anuncio" && <th className={th}>Verba/dia</th>}<th className={th}>Gasto</th><th className={th}>Result.</th><th className={th}>Custo/res.</th><th className={th}>Vendas</th><th className={th}>Faturamento</th><th className={th}>Lucro</th><th className={th}>ROAS</th><th className={th}>ROI</th><th className={th}>CTR</th><th className={th}>CPM</th></tr></thead>
                          <tbody>
                            {visiveis.map((l) => {
                              const t = porRef.get(l.ref) ?? { gasto: 0, impressoes: 0, cliques: 0, resultados: 0, valor: 0 };
                              const v = vendasNivel.get(l.ref);
                              const fat = v?.faturamento ?? 0;
                              const ligado = l.status === "ACTIVE" || l.status === "ativa";
                              const arquivada = l.status === "ARCHIVED" || l.status === "DELETED";
                              return (
                                <tr key={l.ref} className="border-t border-white/5 hover:bg-white/[0.03]">
                                  <td className="py-2 pl-1"><button type="button" disabled={arquivada} role="switch" aria-checked={ligado} onClick={() => void mudarStatus(l, !ligado)} title={ligado ? "Pausar" : "Ligar"} className={cn("relative h-5 w-9 rounded-full transition-colors disabled:opacity-30", ligado ? "bg-emerald-500" : "bg-white/20")}><span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", ligado ? "left-[18px]" : "left-0.5")} /></button></td>
                                  <td className="max-w-[340px] py-2 pr-3">
                                    <button type="button" disabled={nivel === "anuncio"} onClick={() => { if (nivel === "campanha") { setPaiFiltro({ nivel: "campanha", ref: l.ref, nome: l.nome }); setAba("conjuntos"); } else if (nivel === "conjunto") { setPaiFiltro({ nivel: "conjunto", ref: l.ref, nome: l.nome }); setAba("anuncios"); } }}
                                      className="flex max-w-full items-center gap-2 text-left font-medium hover:text-sky-300 disabled:hover:text-white">
                                      {l.miniatura && <img src={l.miniatura} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />}<span className="truncate" title={l.nome}>{l.nome}</span></button></td>
                                  {nivel !== "anuncio" && <td className="py-2 pr-3 text-right tabular-nums">
                                    {editando === l.ref ? (
                                      <span className="inline-flex items-center gap-1"><input autoFocus defaultValue={l.orcamento ?? ""} onChange={(e) => { valorVerba.current[l.ref] = e.target.value; }} onKeyDown={(e) => { if (e.key === "Enter") void mudarVerba(l); if (e.key === "Escape") setEditando(null); }} className="w-20 rounded border border-white/20 bg-black/30 px-1.5 py-0.5 text-right" /><button type="button" onClick={() => void mudarVerba(l)} className="rounded bg-sky-500 p-1"><Check className="h-3 w-3" /></button></span>
                                    ) : l.orcamento != null ? <button type="button" onClick={() => { valorVerba.current[l.ref] = String(l.orcamento); setEditando(l.ref); }} title="Mudar a verba diária" className="inline-flex items-center gap-1 hover:text-sky-300">{brl(l.orcamento, moeda)}<Pencil className="h-3 w-3 opacity-40" /></button> : <span className="text-white/30" title="Verba definida no conjunto">—</span>}</td>}
                                  <td className="py-2 pr-3 text-right tabular-nums">{brl(t.gasto, moeda)}</td>
                                  <td className={cn("py-2 pr-3 text-right tabular-nums", t.gasto >= 20 && t.resultados === 0 && "font-semibold text-rose-300")}>{nf(t.resultados)}</td>
                                  <td className="py-2 pr-3 text-right tabular-nums">{brl(custoPorResultado(t), moeda)}</td>
                                  <td className="py-2 pr-3 text-right tabular-nums">{v ? nf(v.vendas) : "—"}</td>
                                  <td className="py-2 pr-3 text-right tabular-nums">{v ? brl(fat, moeda) : "—"}</td>
                                  <td className={cn("py-2 pr-3 text-right tabular-nums", v && (lucro(fat, t.gasto) >= 0 ? "text-emerald-300" : "text-rose-300"))}>{v ? brl(lucro(fat, t.gasto), moeda) : "—"}</td>
                                  <td className="py-2 pr-3 text-right tabular-nums">{v && t.gasto > 0 ? `${nf(fat / t.gasto, 2)}x` : (retorno(t) === null ? "—" : `${nf(retorno(t), 2)}x`)}</td>
                                  <td className="py-2 pr-3 text-right tabular-nums">{v && roi(fat, t.gasto) !== null ? `${nf(roi(fat, t.gasto), 0)}%` : "—"}</td>
                                  <td className="py-2 pr-3 text-right tabular-nums">{ctr(t) === null ? "—" : `${nf(ctr(t), 2)}%`}</td>
                                  <td className="py-2 pr-3 text-right tabular-nums">{brl(cpm(t), moeda)}</td>
                                </tr>);
                            })}
                          </tbody>
                          <tfoot><tr className="border-t border-white/15 text-sm font-semibold">
                            <td /><td className="py-2.5 pr-3">Total ({visiveis.length})</td>{nivel !== "anuncio" && <td />}
                            <td className="py-2.5 pr-3 text-right tabular-nums">{brl(soma.t.gasto, moeda)}</td><td className="py-2.5 pr-3 text-right tabular-nums">{nf(soma.t.resultados)}</td><td className="py-2.5 pr-3 text-right tabular-nums">{brl(custoPorResultado(soma.t), moeda)}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">{nf(soma.vendas)}</td><td className="py-2.5 pr-3 text-right tabular-nums">{brl(soma.faturamento, moeda)}</td>
                            <td className={cn("py-2.5 pr-3 text-right tabular-nums", lucro(soma.faturamento, soma.t.gasto) >= 0 ? "text-emerald-300" : "text-rose-300")}>{brl(lucro(soma.faturamento, soma.t.gasto), moeda)}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">{soma.t.gasto > 0 && soma.faturamento > 0 ? `${nf(soma.faturamento / soma.t.gasto, 2)}x` : "—"}</td><td className="py-2.5 pr-3 text-right tabular-nums">{roi(soma.faturamento, soma.t.gasto) !== null && soma.faturamento > 0 ? `${nf(roi(soma.faturamento, soma.t.gasto), 0)}%` : "—"}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">{ctr(soma.t) === null ? "—" : `${nf(ctr(soma.t), 2)}%`}</td><td className="py-2.5 pr-3 text-right tabular-nums">{brl(cpm(soma.t), moeda)}</td></tr></tfoot>
                        </table>
                      </div>)}
                    <details className="mt-3 rounded-xl bg-white/[0.03] p-3 text-xs text-white/55">
                      <summary className="cursor-pointer font-semibold text-white/70">Vendas, faturamento e lucro: como aparecem aqui</summary>
                      <p className="mt-2">Vêm das suas vendas (Kiwify, Hotmart, Eduzz) casadas pelos UTMs do link do anúncio, igual à UTMify. Em cada anúncio, em <i>Parâmetros de URL</i>, cole:</p>
                      <div className="mt-1.5 flex items-start gap-2"><code className="flex-1 break-all rounded bg-black/40 p-2 text-[11px] text-sky-200">{UTMS_RECOMENDADOS}</code><button type="button" onClick={() => { void navigator.clipboard.writeText(UTMS_RECOMENDADOS); toast.success("UTMs copiados"); }} className="shrink-0 rounded-lg border border-white/20 p-2 hover:bg-white/10"><Copy className="h-3.5 w-3.5" /></button></div>
                      <p className="mt-2">Venda sem UTM não entra (aparece “—”). Lucro = faturamento − gasto; ROI = lucro ÷ gasto.</p>
                    </details>
                  </section>)}

                {aba === "criativos" && <AbaCriativos contaRef={contaRef} criativos={criativos} aoMudar={lerDados} />}
                {aba === "contas" && <AbaContas contas={contas} clientes={clientes} status={status} aoMudar={lerBase} conectar={conectar} linkConexao={linkConexao} />}
                {aba === "historico" && (
                  <section className={cn(painel, "p-4")}>
                    <h3 className="mb-3 text-lg font-bold">O que foi feito nas contas</h3>
                    {acoes.length === 0 ? <p className="text-sm text-white/50">Nada ainda.</p> : <ul className="space-y-1.5">{acoes.map((a) => (
                      <li key={a.id} className={cn("flex flex-wrap items-baseline gap-2 rounded-lg px-3 py-2 text-sm", a.ok ? "bg-white/[0.03]" : "bg-rose-500/10")}>
                        <span className="font-medium">{ROTULO_ACAO[a.acao] ?? a.acao}</span>{a.alvo && <span className="text-xs text-white/45">{a.alvo}</span>}{a.erro && <span className="text-xs text-rose-300">{a.erro}</span>}
                        <span className="ml-auto text-xs text-white/40">{formatDistanceToNowStrict(new Date(a.criado_em), { locale: ptBR, addSuffix: true })}</span></li>))}</ul>}
                  </section>)}
              </>)}
        </div>
        {criando && conta && <CriarDialog conta={conta} criativos={criativos} campanhas={linhas} aoFechar={() => { setCriando(false); void lerDados(); }} />}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ criativos
function AbaCriativos({ contaRef, criativos, aoMudar }: { contaRef: string; criativos: Criativo[]; aoMudar: () => Promise<void> | void }) {
  const [subindo, setSubindo] = useState(0);
  const [pasta, setPasta] = useState("");
  const seletor = useRef<HTMLInputElement>(null);
  const pastas = useMemo(() => [...new Set(criativos.map((c) => c.pasta ?? ""))].sort(), [criativos]);
  const subir = async (arquivos: File[]) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    for (const a of arquivos) {
      const video = a.type.startsWith("video/");
      if (!video && !a.type.startsWith("image/")) { toast.error(`${a.name}: só imagem ou vídeo`); continue; }
      setSubindo((n) => n + 1);
      try {
        const ext = (a.name.split(".").pop() || (video ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
        const caminho = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
        const bytes = await a.arrayBuffer();
        const { error } = await supabase.storage.from("ads-criativos").upload(caminho, new Blob([bytes], { type: a.type }), { contentType: a.type });
        if (error) throw error;
        const url = supabase.storage.from("ads-criativos").getPublicUrl(caminho).data.publicUrl;
        await chamarFacebook("criativo", { conta_ref: contaRef, tipo: video ? "video" : "imagem", nome: a.name.replace(/\.[^.]+$/, ""), arquivo_url: url, pasta: pasta.trim() || null });
        toast.success(`${a.name} enviado à Meta`);
      } catch (e) { toast.error(`${a.name}: ${(e as Error).message}`); }
      finally { setSubindo((n) => n - 1); }
    }
    await aoMudar();
  };
  const [arrastando, setArrastando] = useState(false);
  return (
    <section className={cn(painel, "space-y-4 p-4")} onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={(e) => { e.preventDefault(); setArrastando(false); void subir([...e.dataTransfer.files]); }}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-bold">Criativos</h3>
        <input list="pastas-ads" value={pasta} onChange={(e) => setPasta(e.target.value)} placeholder="Pasta para os próximos envios (ex.: Black Friday)" className="ml-auto w-72 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" />
        <datalist id="pastas-ads">{pastas.filter(Boolean).map((p) => <option key={p} value={p} />)}</datalist>
        <button type="button" onClick={() => seletor.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold hover:bg-sky-400"><Upload className="h-4 w-4" />Subir imagem ou vídeo</button>
        <input ref={seletor} type="file" hidden multiple accept="image/*,video/*" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void subir(fs); }} />
      </div>
      <div className={cn("rounded-xl border-2 border-dashed p-4 text-center text-sm", arrastando ? "border-sky-400 bg-sky-500/10 text-sky-100" : "border-white/10 text-white/45")}>{subindo > 0 ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Enviando {subindo}…</span> : "Arraste imagens e vídeos aqui. Eles vão para a Meta e ficam na biblioteca para usar nos anúncios."}</div>
      {criativos.length === 0 ? null : pastas.map((p) => (
        <div key={p || "sem"} className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-white/70"><FolderOpen className="h-4 w-4" />{p || "Sem pasta"} <span className="text-xs font-normal text-white/35">{criativos.filter((c) => (c.pasta ?? "") === p).length}</span></h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {criativos.filter((c) => (c.pasta ?? "") === p).map((c) => (
              <div key={c.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
                <div className="aspect-square bg-black/50">{c.tipo === "imagem" ? <img src={c.arquivo_url} alt={c.nome} className="h-full w-full object-cover" /> : <video src={`${c.arquivo_url}#t=1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />}</div>
                <div className="flex items-center gap-1.5 p-2 text-xs">{c.tipo === "video" ? <Video className="h-3.5 w-3.5 shrink-0 text-violet-300" /> : <ImageIcon className="h-3.5 w-3.5 shrink-0 text-sky-300" />}<span className="truncate" title={c.nome}>{c.nome}</span></div>
                <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                  <button type="button" title="Mudar de pasta" onClick={async () => { const nova = await pedirPasta(c.pasta); if (nova === undefined) return; await db.from("ads_criativos").update({ pasta: nova || null }).eq("id", c.id); await aoMudar(); }} className="rounded bg-black/70 p-1 hover:bg-black"><FolderOpen className="h-3.5 w-3.5" /></button>
                  <button type="button" title="Tirar da biblioteca" onClick={async () => { if (!(await confirmar(`Tirar “${c.nome}” da biblioteca?`, { botao: "Tirar", destrutivo: true, descricao: "O arquivo continua na Meta; só some daqui." }))) return; await db.from("ads_criativos").delete().eq("id", c.id); await aoMudar(); }} className="rounded bg-black/70 p-1 hover:bg-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>))}
          </div>
        </div>))}
    </section>
  );
}
/** window.prompt não funciona no app do Mac: um diálogo próprio simples. */
function pedirPasta(atual: string | null): Promise<string | undefined> {
  return new Promise((resolve) => {
    const caixa = document.createElement("div");
    caixa.className = "fixed inset-0 z-[300] flex items-center justify-center bg-black/60";
    caixa.innerHTML = `<form class="w-80 space-y-3 rounded-2xl border border-white/15 bg-[#0c1320] p-4 text-white"><p class="text-sm font-semibold">Nome da pasta</p><input class="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm" /><div class="flex justify-end gap-2"><button type="button" class="rounded-lg border border-white/20 px-3 py-1.5 text-sm" data-c>Cancelar</button><button class="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-semibold">Mover</button></div></form>`;
    const input = caixa.querySelector("input")!; input.value = atual ?? "";
    const fim = (v: string | undefined) => { caixa.remove(); resolve(v); };
    caixa.querySelector("form")!.addEventListener("submit", (e) => { e.preventDefault(); fim(input.value.trim()); });
    caixa.querySelector("[data-c]")!.addEventListener("click", () => fim(undefined));
    document.body.appendChild(caixa); input.focus();
  });
}

// ------------------------------------------------------------------ contas
function AbaContas({ contas, clientes, status, aoMudar, conectar, linkConexao }: { contas: ContaAds[]; clientes: { id: string; nome_especialista: string }[]; status: Status | null; aoMudar: () => Promise<void> | void; conectar: () => Promise<void>; linkConexao: string | null }) {
  const salvar = async (c: ContaAds, campos: Partial<Pick<ContaAds, "cliente_id" | "limite_diario">>) => {
    const { error } = await db.from("ads_contas").update(campos).eq("id", c.id);
    if (error) { toast.error("Não consegui salvar"); return; }
    await aoMudar();
  };
  return (
    <section className={cn(painel, "space-y-3 p-4")}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-bold">Contas de anúncios</h3>
        <button type="button" onClick={() => void chamarFacebook("contas").then(aoMudar).catch((e) => toast.error((e as Error).message))} className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10"><RefreshCw className="h-4 w-4" />Buscar contas</button>
        <button type="button" onClick={() => void conectar()} className="inline-flex items-center gap-2 rounded-xl border border-sky-400/40 px-3 py-2 text-sm text-sky-200 hover:bg-sky-500/10"><Plus className="h-4 w-4" />Conectar outro Facebook / reconectar</button>
      </div>
      {linkConexao && <div className="flex items-center gap-2 rounded-xl bg-sky-500/10 p-3 text-xs"><input readOnly value={linkConexao} onFocus={(e) => e.currentTarget.select()} className={campo} /><button type="button" onClick={() => void abrirLinkExterno(linkConexao)} className="shrink-0 rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold">Abrir</button></div>}
      <p className="text-xs text-white/50">Mostra as contas de todas as empresas (BMs) que o seu login do Facebook acessa. Escolha o <b>projeto</b> de cada uma (o Kdu daquele escritório abre a conta certa) e o <b>teto de verba diária</b>: o Kdu não liga nada que passe disso. {status?.nome && `Login: ${status.nome}.`}</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-white/40"><th className="pb-2 pr-3">Conta</th><th className="pb-2 pr-3">Empresa (BM)</th><th className="pb-2 pr-3">Status</th><th className="pb-2 pr-3">Projeto</th><th className="pb-2 pr-3">Teto diário</th><th className="pb-2">Sincronizada</th></tr></thead>
        <tbody>{contas.map((c) => (
          <tr key={c.id} className="border-t border-white/5">
            <td className="py-2 pr-3 font-medium">{c.nome ?? c.conta_ref}<span className="block text-[11px] font-normal text-white/35">{c.conta_ref} · {c.moeda}</span></td>
            <td className="py-2 pr-3 text-white/70">{c.empresa ?? "—"}</td><td className="py-2 pr-3 text-white/70">{c.status ?? "—"}</td>
            <td className="py-2 pr-3"><select value={c.cliente_id ?? ""} onChange={(e) => void salvar(c, { cliente_id: e.target.value || null })} className="rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-sm"><option value="">Escolher projeto…</option>{clientes.map((x) => <option key={x.id} value={x.id}>{x.nome_especialista}</option>)}</select></td>
            <td className="py-2 pr-3"><span className="inline-flex items-center gap-1"><Wallet className="h-3.5 w-3.5 text-white/40" /><input type="number" min={0} step={10} defaultValue={c.limite_diario ?? ""} placeholder="sem teto" onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== c.limite_diario) void salvar(c, { limite_diario: v }); }} className="w-24 rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-right text-sm" /><span className="text-xs text-white/40">/dia</span></span></td>
            <td className="py-2 text-xs text-white/50">{c.sincronizada_em ? formatDistanceToNowStrict(new Date(c.sincronizada_em), { locale: ptBR, addSuffix: true }) : "nunca"}</td>
          </tr>))}</tbody></table></div>
    </section>
  );
}

// ------------------------------------------------------------------ criar campanha + conjunto + anúncio
const OBJETIVOS = [["trafego", "Tráfego para o site (visitas à página)"], ["cliques", "Cliques no link"], ["leads", "Leads no site (pixel)"], ["vendas", "Vendas no site (pixel)"]] as const;
function CriarDialog({ conta, criativos, campanhas, aoFechar }: { conta: ContaAds; criativos: Criativo[]; campanhas: Linha[]; aoFechar: () => void }) {
  const [rec, setRec] = useState<Recursos | null>(null);
  const [f, setF] = useState({ nome: "", preset: "trafego", orcamento: "30", idade_min: "18", idade_max: "65", pixel_id: "", pagina_id: "", criativo_id: "", texto: "", titulo: "", link: "", cta: "LEARN_MORE", anuncio: true });
  const [etapa, setEtapa] = useState<string | null>(null);
  const [feito, setFeito] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { void chamarFacebook<Recursos>("recursos", { conta_ref: conta.conta_ref }).then((r) => { setRec(r); setF((x) => ({ ...x, pagina_id: x.pagina_id || r.paginas[0]?.id || "", pixel_id: x.pixel_id || r.pixels[0]?.id || "" })); }).catch((e) => setErro((e as Error).message)); }, [conta.conta_ref]);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const pagina = rec?.paginas.find((p) => p.id === f.pagina_id);
  const criar = async () => {
    setErro(null); setFeito([]);
    if (!(await confirmar(`Criar “${f.nome}” (campanha, conjunto${f.anuncio ? " e anúncio" : ""}) PAUSADOS?`, { botao: "Criar pausado", destrutivo: false, descricao: `Nada gasta até você ligar. Verba diária configurada: R$ ${f.orcamento}.` }))) return;
    try {
      setEtapa("Criando a campanha…");
      const c = await chamarFacebook<{ id: string }>("acao", { conta_ref: conta.conta_ref, tipo: "criar_campanha", nome: f.nome, preset: f.preset });
      setFeito((x) => [...x, "Campanha criada"]);
      setEtapa("Criando o conjunto…");
      const j = await chamarFacebook<{ id: string }>("acao", { conta_ref: conta.conta_ref, tipo: "criar_conjunto", nome: `${f.nome} · conjunto`, campanha_ref: c.id, preset: f.preset, orcamento_diario: Number(f.orcamento), idade_min: Number(f.idade_min), idade_max: Number(f.idade_max), pixel_id: f.pixel_id || undefined, pagina_id: f.pagina_id });
      setFeito((x) => [...x, "Conjunto criado"]);
      if (f.anuncio) {
        setEtapa("Criando o anúncio…");
        await chamarFacebook("acao", { conta_ref: conta.conta_ref, tipo: "criar_anuncio", nome: `${f.nome} · anúncio`, conjunto_ref: j.id, campanha_ref: c.id, criativo_id: f.criativo_id, pagina_id: f.pagina_id, instagram_id: pagina?.instagram_id ?? undefined, texto: f.texto, titulo: f.titulo, link: f.link, cta: f.cta });
        setFeito((x) => [...x, "Anúncio criado"]);
      }
      toast.success("Criado e pausado. Para começar a gastar, ligue na tabela.");
      aoFechar();
    } catch (e) { setErro((e as Error).message); } finally { setEtapa(null); }
  };
  const precisaPixel = f.preset === "leads" || f.preset === "vendas";
  const pronto = f.nome.trim() && Number(f.orcamento) >= 6 && (!precisaPixel || f.pixel_id) && (!f.anuncio || (f.criativo_id && f.pagina_id && /^https?:\/\//.test(f.link)));
  return (
    <Dialog open onOpenChange={(o) => !o && !etapa && aoFechar()}>
      <DialogContent className="dark max-h-[92vh] max-w-2xl overflow-y-auto border-white/10 bg-[#0c1320] text-white">
        <DialogHeader><DialogTitle>Criar campanha · {conta.nome}</DialogTitle><DialogDescription className="text-white/55">Cria campanha, conjunto e anúncio de uma vez, tudo <b>pausado</b>. Você liga depois na tabela.</DialogDescription></DialogHeader>
        {!rec && !erro ? <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin" /> : (
          <div className="space-y-3 text-sm">
            <label className="block space-y-1"><span className="text-white/60">Nome</span><input className={campo} value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="ex.: Quiz Instalivros · Black Friday" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1"><span className="text-white/60">Objetivo</span><select className={campo} value={f.preset} onChange={(e) => set("preset", e.target.value)}>{OBJETIVOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
              <label className="block space-y-1"><span className="text-white/60">Verba diária (R$)</span><input type="number" min={6} className={campo} value={f.orcamento} onChange={(e) => set("orcamento", e.target.value)} /></label>
              <label className="block space-y-1"><span className="text-white/60">Idade mínima</span><input type="number" min={18} max={65} className={campo} value={f.idade_min} onChange={(e) => set("idade_min", e.target.value)} /></label>
              <label className="block space-y-1"><span className="text-white/60">Idade máxima</span><input type="number" min={18} max={65} className={campo} value={f.idade_max} onChange={(e) => set("idade_max", e.target.value)} /></label>
            </div>
            {precisaPixel && <label className="block space-y-1"><span className="text-white/60">Pixel</span><select className={campo} value={f.pixel_id} onChange={(e) => set("pixel_id", e.target.value)}><option value="">Escolher…</option>{rec?.pixels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
            <label className="flex items-center gap-2 pt-1"><input type="checkbox" checked={f.anuncio} onChange={(e) => set("anuncio", e.target.checked)} />Já criar o anúncio (precisa de um criativo da biblioteca)</label>
            {f.anuncio && (
              <div className="space-y-3 rounded-xl border border-white/10 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1"><span className="text-white/60">Página do Facebook</span><select className={campo} value={f.pagina_id} onChange={(e) => set("pagina_id", e.target.value)}>{rec?.paginas.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.instagram ? ` (@${p.instagram})` : ""}</option>)}</select></label>
                  <label className="block space-y-1"><span className="text-white/60">Botão</span><select className={campo} value={f.cta} onChange={(e) => set("cta", e.target.value)}>{rec?.ctas.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ").toLowerCase()}</option>)}</select></label>
                </div>
                <div><span className="text-white/60">Criativo</span>
                  {criativos.length === 0 ? <p className="mt-1 text-xs text-amber-200">Suba imagens ou vídeos na aba Criativos primeiro.</p> : (
                    <div className="mt-1 grid max-h-40 grid-cols-6 gap-2 overflow-y-auto">{criativos.map((c) => (
                      <button key={c.id} type="button" onClick={() => set("criativo_id", c.id)} title={c.nome} className={cn("aspect-square overflow-hidden rounded-lg border-2", f.criativo_id === c.id ? "border-sky-400" : "border-transparent")}>
                        {c.tipo === "imagem" ? <img src={c.arquivo_url} alt="" className="h-full w-full object-cover" /> : <video src={`${c.arquivo_url}#t=1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />}</button>))}</div>)}
                </div>
                <label className="block space-y-1"><span className="text-white/60">Link de destino</span><input className={campo} value={f.link} onChange={(e) => set("link", e.target.value)} placeholder="https://…" /></label>
                <label className="block space-y-1"><span className="text-white/60">Texto do anúncio</span><textarea rows={3} className={campo} value={f.texto} onChange={(e) => set("texto", e.target.value)} /></label>
                <label className="block space-y-1"><span className="text-white/60">Título (opcional)</span><input className={campo} value={f.titulo} onChange={(e) => set("titulo", e.target.value)} /></label>
              </div>)}
            {feito.length > 0 && <p className="text-xs text-emerald-300">{feito.join(" · ")}</p>}
            {erro && <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-2.5 text-rose-100">{erro}{feito.length > 0 ? " (o que já foi criado ficou pausado na conta)" : ""}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={!!etapa} onClick={aoFechar} className="rounded-xl border border-white/20 px-4 py-2">Cancelar</button>
              <button type="button" disabled={!pronto || !!etapa} onClick={() => void criar()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-black disabled:opacity-40">{etapa ? <><Loader2 className="h-4 w-4 animate-spin" />{etapa}</> : "Criar pausado"}</button>
            </div>
          </div>)}
      </DialogContent>
    </Dialog>
  );
}
