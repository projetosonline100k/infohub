import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, ExternalLink, Loader2, Megaphone, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/DialogosGlobais";
import { chamarFacebook, type ContaAds } from "@/lib/empresa/adsApi";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { linkDoQuiz } from "@/lib/quiz/quiz";
import { cn } from "@/lib/utils";
import {
  hojeBrasilia, intervalo, montarTabela, ordenar, somarDias,
  type CampoOrdem, type EventoSimples, type InsightDia, type LeadSimples, type LinhaTrafego, type Nivel, type PeriodoId, type Tabela, type VendaTrafego,
} from "@/lib/trafego/atribuicao";
import { FunilAnuncios } from "./FunilAnuncios";
import { GeradorUtm } from "./GeradorUtm";
import { brl, campo, nf, painel, pct } from "./formato";

const db = supabase as unknown as SupabaseClient;
interface Status { conectado: boolean; nome: string | null; expira_em: string | null; configurado: boolean }
type Visao = "painel" | "funil" | "utm";
const PERIODOS: { id: PeriodoId; r: string }[] = [{ id: "hoje", r: "Hoje" }, { id: "ontem", r: "Ontem" }, { id: "7d", r: "7 dias" }, { id: "30d", r: "30 dias" }, { id: "custom", r: "Personalizado" }];
const HISTORICO_DIAS = 90;   // busca 90 dias de uma vez: o filtro de período troca na tela sem nova consulta

interface Base {
  campanhas: { ref: string; nome: string; status: string | null; orcamento: number | null }[];
  conjuntos: { ref: string; nome: string; campanha_ref: string; status: string | null; orcamento: number | null }[];
  anuncios: { ref: string; nome: string; conjunto_ref: string; campanha_ref: string; status: string | null }[];
  insights: Record<Nivel, InsightDia[]>;
  vendas: VendaTrafego[]; eventos: EventoSimples[]; leads: LeadSimples[];
  slugQuiz: string | null;
}

/** Aba Tráfego do Escritório (20/11/2026, Davi: "UTMify Hub"): gasto da Meta + vendas por UTM + funil por anúncio + gerador de UTM + controles. */
export function TrafegoProjeto({ clienteId }: { clienteId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [erroStatus, setErroStatus] = useState<string | null>(null);
  const [contas, setContas] = useState<ContaAds[]>([]);
  const [todasContas, setTodasContas] = useState<ContaAds[]>([]);
  const [base, setBase] = useState<Base | null>(null);
  const [visao, setVisao] = useState<Visao>("painel");
  const [periodo, setPeriodo] = useState<PeriodoId>("7d");
  const [custom, setCustom] = useState<{ de: string; ate: string }>({ de: somarDias(hojeBrasilia(), -6), ate: hojeBrasilia() });
  const [ordem, setOrdem] = useState<{ campo: CampoOrdem; desc: boolean }>({ campo: "gasto", desc: true });
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [sincronizando, setSincronizando] = useState(false);
  const [linkConexao, setLinkConexao] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const valorVerba = useRef<Record<string, string>>({});
  const [otimista, setOtimista] = useState<Record<string, string>>({});   // status mostrado enquanto a Meta confirma

  const conta = contas[0] ?? null;
  const contaRef = conta?.conta_ref ?? "";
  const moeda = conta?.moeda ?? "BRL";

  const lerContas = useCallback(async () => {
    const [s, c] = await Promise.all([
      chamarFacebook<Status>("status").then((x) => { setErroStatus(null); return x; }).catch((e: Error) => { setErroStatus(e.message); return null; }),
      db.from("ads_contas").select("id, conta_ref, nome, moeda, status, empresa, cliente_id, limite_diario, sincronizada_em").order("nome"),
    ]);
    setStatus(s);
    const lista = (c.data ?? []) as ContaAds[];
    setTodasContas(lista); setContas(lista.filter((x) => x.cliente_id === clienteId));
  }, [clienteId]);
  useEffect(() => { setStatus(null); setBase(null); void lerContas(); }, [lerContas]);

  const lerDados = useCallback(async () => {
    if (!contaRef) { setBase(null); return; }
    const de = somarDias(hojeBrasilia(), -HISTORICO_DIAS);
    const [camp, conj, anu, ins, prods, quizzes] = await Promise.all([
      db.from("ads_campanhas").select("campanha_ref, nome, status, status_efetivo, orcamento_diario").eq("conta", contaRef),
      db.from("ads_conjuntos").select("conjunto_ref, campanha_ref, nome, status, status_efetivo, orcamento_diario").eq("conta_ref", contaRef),
      db.from("ads_anuncios").select("anuncio_ref, conjunto_ref, campanha_ref, nome, status, status_efetivo").eq("conta_ref", contaRef),
      db.from("ads_insights_diarios").select("nivel, ref, dia, gasto, impressoes, cliques, resultados").eq("conta_ref", contaRef).gte("dia", de).limit(50000),
      db.from("produtos_cliente").select("id").eq("cliente_id", clienteId),
      db.from("quizzes").select("id, slug, status, variante_de").eq("cliente_id", clienteId).neq("status", "cancelado"),
    ]);
    const insights: Base["insights"] = { campanha: [], conjunto: [], anuncio: [] };
    for (const x of (ins.data ?? []) as (InsightDia & { nivel: Nivel })[]) insights[x.nivel]?.push({ ref: x.ref, dia: x.dia, gasto: +x.gasto, impressoes: +x.impressoes, cliques: +x.cliques, resultados: +x.resultados });
    const prodIds = ((prods.data ?? []) as { id: string }[]).map((p) => p.id);
    const quizList = (quizzes.data ?? []) as { id: string; slug: string; status: string; variante_de: string | null }[];
    const quizIds = quizList.map((q) => q.id);
    const [vs, ev, ld] = await Promise.all([
      prodIds.length ? db.from("vendas_plataforma_eventos").select("transacao_id, tipo, valor, data, utm_source, utm_medium, utm_campaign, utm_content, utm_term").in("produto_id", prodIds).in("tipo", ["venda", "reembolso"]).gte("data", de).limit(20000) : Promise.resolve({ data: [] }),
      quizIds.length ? db.from("quiz_eventos").select("sessao, tipo, passo, criado_em, utm").in("quiz_id", quizIds).gte("criado_em", `${de}T00:00:00Z`).order("criado_em", { ascending: false }).limit(100000) : Promise.resolve({ data: [] }),
      quizIds.length ? db.from("quiz_respostas").select("criada_em, utm").in("quiz_id", quizIds).gte("criada_em", `${de}T00:00:00Z`).limit(20000) : Promise.resolve({ data: [] }),
    ]);
    const publicado = quizList.find((q) => !q.variante_de && q.status === "publicado") ?? quizList.find((q) => !q.variante_de) ?? null;
    setBase({
      campanhas: ((camp.data ?? []) as { campanha_ref: string; nome: string; status: string | null; status_efetivo: string | null; orcamento_diario: number | string | null }[]).map((x) => ({ ref: x.campanha_ref, nome: x.nome, status: x.status_efetivo ?? x.status, orcamento: x.orcamento_diario != null ? +x.orcamento_diario : null })),
      conjuntos: ((conj.data ?? []) as { conjunto_ref: string; campanha_ref: string; nome: string; status: string | null; status_efetivo: string | null; orcamento_diario: number | string | null }[]).map((x) => ({ ref: x.conjunto_ref, nome: x.nome, campanha_ref: x.campanha_ref, status: x.status, orcamento: x.orcamento_diario != null ? +x.orcamento_diario : null })),
      anuncios: ((anu.data ?? []) as { anuncio_ref: string; conjunto_ref: string; campanha_ref: string; nome: string; status: string | null }[]).map((x) => ({ ref: x.anuncio_ref, nome: x.nome, conjunto_ref: x.conjunto_ref, campanha_ref: x.campanha_ref, status: x.status })),
      insights, vendas: (vs.data ?? []) as VendaTrafego[], eventos: (ev.data ?? []) as EventoSimples[], leads: (ld.data ?? []) as LeadSimples[],
      slugQuiz: publicado?.slug ?? null,
    });
  }, [contaRef, clienteId]);
  useEffect(() => { void lerDados(); }, [lerDados]);

  const sincronizar = useCallback(async () => {
    if (!contaRef || sincronizando) return;
    setSincronizando(true);
    try { const r = await chamarFacebook<{ campanhas: number; conjuntos: number; anuncios: number }>("sync", { conta_ref: contaRef, dias: 30 }); toast.success(`Atualizado: ${r.campanhas} campanhas, ${r.conjuntos} conjuntos, ${r.anuncios} anúncios`); await lerContas(); await lerDados(); }
    catch (e) { toast.error((e as Error).message); } finally { setSincronizando(false); }
  }, [contaRef, sincronizando, lerContas, lerDados]);
  const sincAuto = useRef(false);
  useEffect(() => {   // abre e os números têm mais de 30 min: atualiza sozinho (uma vez)
    if (!conta || sincAuto.current || sincronizando) return;
    sincAuto.current = true;
    if (!conta.sincronizada_em || Date.now() - Date.parse(conta.sincronizada_em) > 30 * 60_000) void sincronizar();
  }, [conta, sincronizando, sincronizar]);

  const conectar = async () => { try { const r = await chamarFacebook<{ url: string }>("link"); setLinkConexao(r.url); } catch (e) { toast.error((e as Error).message); } };
  useEffect(() => {   // esperando a autorização: confere a cada 4 s
    if (!linkConexao) return;
    const t = window.setInterval(async () => { const s = await chamarFacebook<Status>("status").catch(() => null); if (s?.conectado) { setLinkConexao(null); await chamarFacebook("contas").catch(() => null); await lerContas(); toast.success("Facebook conectado"); } }, 4000);
    return () => window.clearInterval(t);
  }, [linkConexao, lerContas]);
  const ligarContaAoProjeto = async (id: string) => {
    const { error } = await db.from("ads_contas").update({ cliente_id: clienteId }).eq("id", id);
    if (error) { toast.error("Não consegui ligar a conta a este projeto"); return; }
    sincAuto.current = false; await lerContas();
  };

  // ---------- números
  const { de, ate } = useMemo(() => intervalo(periodo, hojeBrasilia(), custom), [periodo, custom]);
  const tabela: Tabela | null = useMemo(() => {
    if (!base) return null;
    const statusDe: Record<string, { status: string | null; orcamento: number | null }> = {};
    for (const c of base.campanhas) statusDe[`campanha:${c.ref}`] = { status: c.status, orcamento: c.orcamento };
    for (const c of base.conjuntos) statusDe[`conjunto:${c.ref}`] = { status: c.status, orcamento: c.orcamento };
    for (const a of base.anuncios) statusDe[`anuncio:${a.ref}`] = { status: a.status, orcamento: null };
    return montarTabela({ est: { campanhas: base.campanhas, conjuntos: base.conjuntos, anuncios: base.anuncios, statusDe }, insights: base.insights, vendas: base.vendas, eventos: base.eventos, leads: base.leads, de, ate });
  }, [base, de, ate]);

  // ---------- controles (mesmas regras do dash do Kdu: teto diário da conta, confirmação, registro em ads_acoes feito pela função)
  const statusDe = (l: LinhaTrafego) => otimista[l.chave] ?? l.status;
  const mudarStatus = async (l: LinhaTrafego, ligar: boolean) => {
    const nivel = l.nivel as Nivel;
    if (ligar && !(await confirmar(`Ligar “${l.nome}”?`, { botao: "Ligar", destrutivo: false, descricao: `Isso volta a gastar dinheiro (${l.orcamento != null ? `${brl(l.orcamento, moeda)}/dia` : "a verba do conjunto/campanha"}). Só liga se couber no teto diário da conta (${conta?.limite_diario ? brl(conta.limite_diario, moeda) : "não definido: sem teto a função recusa ligar"}).` }))) return;
    const anterior = statusDe(l);
    setOtimista((o) => ({ ...o, [l.chave]: ligar ? "ACTIVE" : "PAUSED" }));
    try { await chamarFacebook("acao", { conta_ref: contaRef, tipo: "status", nivel, ref: l.ref, status: ligar ? "ACTIVE" : "PAUSED" }); toast.success(ligar ? "Ligado" : "Pausado"); await lerDados(); setOtimista((o) => { const n = { ...o }; delete n[l.chave]; return n; }); }
    catch (e) { setOtimista((o) => ({ ...o, [l.chave]: anterior ?? "PAUSED" })); toast.error((e as Error).message); }
  };
  const mudarVerba = async (l: LinhaTrafego) => {
    const novo = Number(String(valorVerba.current[l.chave] ?? "").replace(",", "."));
    if (!(novo >= 6)) { toast.error("A verba diária mínima é R$ 6,00."); return; }
    if (!(await confirmar(`Mudar a verba de “${l.nome}” para ${brl(novo, moeda)}/dia?`, { botao: "Mudar verba", destrutivo: false, descricao: `Verba atual: ${l.orcamento != null ? `${brl(l.orcamento, moeda)}/dia` : "—"}. Gasta de verdade na sua conta de anúncios, dentro do teto diário (${conta?.limite_diario ? brl(conta.limite_diario, moeda) : "não definido"}).` }))) return;
    try { await chamarFacebook("acao", { conta_ref: contaRef, tipo: "orcamento", nivel: l.nivel, ref: l.ref, valor: novo }); toast.success("Verba mudada"); setEditando(null); await lerDados(); }
    catch (e) { toast.error((e as Error).message); }
  };

  // ---------- telas de estado
  const casca = (filhos: React.ReactNode) => <div className="dark h-full overflow-y-auto bg-[#070b14] p-4 text-white sm:p-6"><div className="mx-auto max-w-[1400px] space-y-4">{filhos}</div></div>;
  const cabeca = (
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30"><Megaphone className="h-6 w-6" /></span>
      <div className="mr-2"><h2 className="text-xl font-bold leading-tight">Tráfego</h2><p className="text-xs text-white/50">{status?.conectado ? `Facebook conectado${status.nome ? ` como ${status.nome}` : ""}${conta ? ` · conta ${conta.nome ?? conta.conta_ref}` : ""}` : "Gasto da Meta, vendas por UTM e funil por anúncio"}</p></div>
      {conta && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void sincronizar()} disabled={sincronizando} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold hover:bg-sky-400 disabled:opacity-60">{sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar</button>
          <button type="button" onClick={() => void abrirLinkExterno("https://adsmanager.facebook.com/adsmanager/manage/campaigns")} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10"><ExternalLink className="h-4 w-4" />Gerenciador</button>
        </div>)}
    </div>
  );
  const aviso = (cor: "rose" | "amber", t: React.ReactNode) => <p className={cn("rounded-xl border p-3 text-sm", cor === "rose" ? "border-rose-400/40 bg-rose-500/10 text-rose-100" : "border-amber-400/40 bg-amber-500/10 text-amber-100")}><AlertTriangle className="mr-1.5 inline h-4 w-4" />{t}</p>;

  if (status === null && !erroStatus) return casca(<Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-white/50" />);
  if (erroStatus || !status) return casca(<>{cabeca}{aviso("rose", <>Não consegui falar com o servidor do Facebook Ads: {erroStatus ?? "sem resposta"}. Confira se a função <b>facebook-ads</b> está no ar e se você entrou com a conta do dono do projeto (só ele vê os anúncios).</>)}<button type="button" onClick={() => void lerContas()} className="rounded-xl border border-white/20 px-4 py-2 text-sm">Tentar de novo</button></>);
  if (!status.conectado) {
    return casca(<>{cabeca}
      <section className="space-y-3 rounded-3xl border border-sky-400/25 bg-gradient-to-br from-[#0d1a35] to-[#101c3f] p-6">
        <h3 className="text-lg font-bold">Conecte o Facebook Ads para ver o gasto e as vendas por anúncio</h3>
        <p className="text-sm text-white/65">Você autoriza uma vez (o login do Facebook que administra a conta de anúncios). O token fica só no servidor. Nada gasta dinheiro sem a sua confirmação e fora do teto diário da conta. Enquanto isso, o gerador de UTM já funciona abaixo.</p>
        {!status.configurado && aviso("rose", <>Falta configurar o app da Meta no servidor: crie os segredos <b>FB_APP_ID</b> e <b>FB_APP_SECRET</b> (Supabase › Edge Functions › Secrets) com o ID e a chave secreta do app (Configurações › Básico no painel da Meta).</>)}
        {linkConexao ? (
          <div className="space-y-2">
            <input readOnly value={linkConexao} onFocus={(e) => e.currentTarget.select()} className={campo} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { void navigator.clipboard.writeText(linkConexao); toast.success("Link copiado"); }} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold"><Copy className="h-4 w-4" />Copiar link</button>
              <button type="button" onClick={() => void abrirLinkExterno(linkConexao)} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm"><ExternalLink className="h-4 w-4" />Abrir neste computador</button>
            </div>
            <p className="flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" />Esperando você aceitar no Facebook… esta tela atualiza sozinha.</p>
          </div>
        ) : <button type="button" onClick={() => void conectar()} disabled={!status.configurado} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold hover:bg-sky-400 disabled:opacity-50"><Megaphone className="h-4 w-4" />Conectar Facebook Ads</button>}
      </section>
      <GeradorUtm urlQuiz={null} nomeCampanha="" /></>);
  }
  if (!conta) {
    const livres = todasContas;
    return casca(<>{cabeca}
      <section className={`${painel} space-y-3 p-5`}>
        <h3 className="text-base font-bold">Nenhuma conta de anúncios ligada a este projeto</h3>
        {livres.length === 0
          ? <p className="text-sm text-white/65">O Facebook está conectado, mas nenhuma conta de anúncios foi trazida. Se você não é o dono da conexão, peça para ele abrir esta aba.</p>
          : <>
            <p className="text-sm text-white/65">Escolha qual conta de anúncios pertence a este projeto:</p>
            <div className="flex flex-wrap gap-2">{livres.map((c) => <button key={c.id} type="button" onClick={() => void ligarContaAoProjeto(c.id)} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10">{c.nome ?? c.conta_ref}{c.empresa ? ` · ${c.empresa}` : ""}</button>)}</div>
          </>}
      </section>
      <GeradorUtm urlQuiz={null} nomeCampanha="" /></>);
  }

  const expiraEm = status.expira_em ? Date.parse(status.expira_em) : null;
  const semDados = !!base && base.campanhas.length === 0 && base.anuncios.length === 0;
  const urlQuiz = base?.slugQuiz ? linkDoQuiz(base.slugQuiz) : null;
  const nomeCampanha = base?.campanhas[0]?.nome ?? "";

  const t = tabela?.total;
  const kpi = (titulo: string, valor: string, destaque?: boolean) => (
    <div key={titulo} className={cn(painel, "p-3.5", destaque && "border-emerald-400/40")}>
      <p className="text-xs font-medium text-white/60">{titulo}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", destaque && t && t.lucro < 0 ? "text-rose-300" : "text-white")}>{valor}</p>
    </div>
  );

  const ordenarPor = (c: CampoOrdem) => setOrdem((o) => ({ campo: c, desc: o.campo === c ? !o.desc : c !== "nome" }));
  const cabecalho = (c: CampoOrdem, r: string) => (
    <th key={c} className={cn("cursor-pointer select-none whitespace-nowrap pb-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-white/40 hover:text-white/70", c === "nome" ? "text-left" : "text-right")} onClick={() => ordenarPor(c)}>
      {r}{ordem.campo === c && (ordem.desc ? <ArrowDown className="ml-0.5 inline h-3 w-3" /> : <ArrowUp className="ml-0.5 inline h-3 w-3" />)}
    </th>
  );
  const alternar = (chave: string) => setFechados((s) => { const n = new Set(s); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });
  const num = (v: string, neg?: boolean) => <td className={cn("py-2 pr-3 text-right tabular-nums", neg && "text-rose-300")}>{v}</td>;
  const linhaTabela = (l: LinhaTrafego, recuo: number, filhos: boolean) => {
    const ativo = statusDe(l) === "ACTIVE";
    const podeVerba = l.nivel !== "anuncio" && l.orcamento != null;
    return (
      <tr key={l.chave} className="border-t border-white/5 text-sm hover:bg-white/[0.03]">
        <td className="py-2 pr-3" style={{ paddingLeft: recuo * 18 }}>
          <div className="flex items-center gap-2">
            {filhos ? <button type="button" onClick={() => alternar(l.chave)} className="text-white/50 hover:text-white">{fechados.has(l.chave) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button> : <span className="w-4" />}
            <button type="button" role="switch" aria-checked={ativo} aria-label={ativo ? `Pausar ${l.nome}` : `Ligar ${l.nome}`} onClick={() => void mudarStatus(l, !ativo)} className={cn("relative h-5 w-9 shrink-0 rounded-full transition", ativo ? "bg-emerald-500" : "bg-white/20")}><span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", ativo ? "left-[18px]" : "left-0.5")} /></button>
            <span className="max-w-[320px] truncate font-medium" title={l.nome}>{l.nome}</span>
          </div>
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">
          {podeVerba ? (editando === l.chave
            ? <span className="inline-flex gap-1"><input autoFocus defaultValue={l.orcamento ?? ""} onChange={(e) => { valorVerba.current[l.chave] = e.target.value; }} className="w-20 rounded border border-white/20 bg-black/40 px-1.5 py-0.5 text-right text-sm" /><button type="button" onClick={() => void mudarVerba(l)} className="rounded bg-sky-500 px-2 text-xs font-semibold">OK</button><button type="button" onClick={() => setEditando(null)} className="text-xs text-white/50">x</button></span>
            : <button type="button" onClick={() => { valorVerba.current[l.chave] = String(l.orcamento ?? ""); setEditando(l.chave); }} className="inline-flex items-center gap-1 text-white/80 hover:text-white">{brl(l.orcamento, moeda)}<Pencil className="h-3 w-3 text-white/40" /></button>) : <span className="text-white/30">—</span>}
        </td>
        {num(brl(l.gasto, moeda))}{num(nf(l.vendas))}{num(brl(l.faturamento, moeda))}{num(brl(l.lucro, moeda), l.lucro < 0)}
        {num(l.roas === null ? "—" : `${nf(l.roas, 2)}x`)}{num(brl(l.custoPorVenda, moeda))}{num(nf(l.leads))}{num(brl(l.custoPorLead, moeda))}{num(nf(l.cliquesOferta))}{num(brl(l.custoPorCliqueOferta, moeda))}
      </tr>
    );
  };
  const linhaExtra = (l: LinhaTrafego) => (
    <tr key={l.chave} className="border-t border-white/5 text-sm text-white/70">
      <td className="py-2 pr-3 pl-6 italic">{l.nome}</td><td className="py-2 pr-3 text-right text-white/30">—</td>
      {num("—")}{num(nf(l.vendas))}{num(brl(l.faturamento, moeda))}{num("—")}{num("—")}{num("—")}{num(nf(l.leads))}{num("—")}{num(nf(l.cliquesOferta))}{num("—")}
    </tr>
  );
  const corpoTabela = () => {
    if (!tabela || !base) return null;
    const ord = (ls: LinhaTrafego[]) => ordenar(ls, ordem.campo, ordem.desc);
    const camps = ord(tabela.linhas.filter((l) => l.nivel === "campanha"));
    const saida: React.ReactNode[] = [];
    for (const c of camps) {
      const conjs = ord(tabela.linhas.filter((l) => l.nivel === "conjunto" && l.pai === c.ref));
      saida.push(linhaTabela(c, 0, conjs.length > 0));
      if (fechados.has(c.chave)) continue;
      for (const j of conjs) {
        const ads = ord(tabela.linhas.filter((l) => l.nivel === "anuncio" && l.pai === j.ref));
        saida.push(linhaTabela(j, 1, ads.length > 0));
        if (fechados.has(j.chave)) continue;
        for (const a of ads) saida.push(linhaTabela(a, 2, false));
      }
    }
    return saida;
  };

  return casca(<>
    {cabeca}
    {expiraEm && expiraEm - Date.now() < 7 * 86_400_000 && aviso("amber", <>A conexão com o Facebook vence em breve. Reconecte no dash do Kdu (aba Contas).</>)}
    <div className="flex flex-wrap items-center gap-2">
      {([["painel", "Painel"], ["funil", "Funil por anúncio"], ["utm", "Gerador de UTM"]] as [Visao, string][]).map(([id, r]) => (
        <button key={id} type="button" onClick={() => setVisao(id)} className={cn("rounded-xl px-4 py-2 text-sm font-semibold", visao === id ? "bg-sky-500 text-white" : "border border-white/15 text-white/70 hover:bg-white/10")}>{r}</button>))}
      {visao !== "utm" && (
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {PERIODOS.map((p) => <button key={p.id} type="button" onClick={() => setPeriodo(p.id)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", periodo === p.id ? "bg-white text-black" : "border border-white/15 text-white/70 hover:bg-white/10")}>{p.r}</button>)}
          {periodo === "custom" && <>
            <input type="date" value={custom.de} max={custom.ate} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, de: e.target.value }))} className="rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-xs" />
            <span className="text-xs text-white/40">até</span>
            <input type="date" value={custom.ate} min={custom.de} max={hojeBrasilia()} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, ate: e.target.value }))} className="rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-xs" />
          </>}
        </div>)}
    </div>

    {visao === "utm" ? <GeradorUtm urlQuiz={urlQuiz} nomeCampanha={nomeCampanha} />
      : !base ? <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin text-white/50" />
      : semDados ? (
        <section className={`${painel} space-y-3 p-6 text-center`}>
          <h3 className="text-base font-bold">Conta conectada, mas ainda sem campanhas aqui</h3>
          <p className="text-sm text-white/60">Clique em <b>Atualizar</b> para trazer campanhas, conjuntos, anúncios e o gasto dos últimos 30 dias da Meta.</p>
          <button type="button" onClick={() => void sincronizar()} disabled={sincronizando} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold hover:bg-sky-400 disabled:opacity-60">{sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Sincronizar agora</button>
        </section>)
      : visao === "funil" ? <FunilAnuncios linhas={tabela?.linhas ?? []} extras={tabela?.extras ?? []} moeda={moeda} />
      : (<>
        {t && <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {kpi("Gasto", brl(t.gasto, moeda))}{kpi("Vendas", nf(t.vendas))}{kpi("Faturamento", brl(t.faturamento, moeda))}{kpi("Lucro", brl(t.lucro, moeda), true)}{kpi("ROAS", t.roas === null ? "—" : `${nf(t.roas, 2)}x`)}
          {kpi("Custo por venda", brl(t.custoPorVenda, moeda))}{kpi("Leads", nf(t.leads))}{kpi("Custo por lead", brl(t.custoPorLead, moeda))}{kpi("Cliques na oferta", nf(t.cliquesOferta))}{kpi("Custo por clique na oferta", brl(t.custoPorCliqueOferta, moeda))}
        </div>}
        {tabela && tabela.total.vendas === 0 && tabela.total.funil.visitas === 0 && aviso("amber", <>Nenhuma venda nem visita do quiz neste período. Se o anúncio já está rodando, confira se o link dele tem os parâmetros de UTM (aba Gerador de UTM).</>)}
        {tabela && tabela.extras.some((x) => x.chave === "ambiguo") && aviso("amber", <>Tem venda “ambígua”: o mesmo nome de anúncio existe em mais de um lugar. Ela não foi somada em nenhum anúncio. Use o formato com IDs nos anúncios novos.</>)}
        <section className={`${painel} overflow-x-auto p-4`}>
          <table className="w-full min-w-[1100px]">
            <thead><tr>
              {cabecalho("nome", "Campanha › conjunto › anúncio")}
              <th className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Verba/dia</th>
              {cabecalho("gasto", "Gasto")}{cabecalho("vendas", "Vendas")}{cabecalho("faturamento", "Faturamento")}{cabecalho("lucro", "Lucro")}{cabecalho("roas", "ROAS")}{cabecalho("custoPorVenda", "Custo/venda")}
              {cabecalho("leads", "Leads")}{cabecalho("custoPorLead", "Custo/lead")}{cabecalho("cliquesOferta", "Cliques oferta")}{cabecalho("custoPorCliqueOferta", "Custo/clique")}
            </tr></thead>
            <tbody>
              {corpoTabela()}
              {tabela?.extras.map(linhaExtra)}
              {tabela && (
                <tr className="border-t-2 border-white/20 text-sm font-bold">
                  <td className="py-2 pr-3">Total</td><td />{num(brl(tabela.total.gasto, moeda))}{num(nf(tabela.total.vendas))}{num(brl(tabela.total.faturamento, moeda))}{num(brl(tabela.total.lucro, moeda), tabela.total.lucro < 0)}
                  {num(tabela.total.roas === null ? "—" : `${nf(tabela.total.roas, 2)}x`)}{num(brl(tabela.total.custoPorVenda, moeda))}{num(nf(tabela.total.leads))}{num(brl(tabela.total.custoPorLead, moeda))}{num(nf(tabela.total.cliquesOferta))}{num(brl(tabela.total.custoPorCliqueOferta, moeda))}
                </tr>)}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-white/40">Gasto e verba vêm da Meta (atualizado {conta.sincronizada_em ? new Date(conta.sincronizada_em).toLocaleString("pt-BR") : "nunca"}). Vendas, leads e cliques na oferta vêm do quiz e das plataformas de venda, casados por UTM (por ID ou por nome). Taxa de clique na oferta: {pct(tabela && tabela.total.funil.visitas ? tabela.total.funil.cliquesOferta / tabela.total.funil.visitas : null)} das visitas.</p>
        </section>
      </>)}
  </>);
}
