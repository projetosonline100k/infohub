import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowUp, ArrowDown, BarChart3, CalendarDays, CheckCircle2, ChevronDown, Coins, Copy, Link2, Loader2, MoreVertical, Percent, Search, ShoppingCart, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { confirmar } from "@/components/DialogosGlobais";
import { RenomearLink } from "./RenomearLink";
import { linkDoQuiz, type EstruturaQuiz } from "@/lib/quiz/quiz";
import { codigoCurto, enderecoCurto, linkRastreado, propagarUtm, type LinkQuiz } from "@/lib/quiz/utm";
import type { EventoQuiz, LeadQuiz } from "@/lib/quiz/painel";
import type { VendaUtm } from "@/lib/quiz/vendasUtm";
import { codigoAfiliado, marcaDoAfiliado, resumirAfiliados, utmDoAfiliado, vendaNaJanela, type AfiliadoBase, type Atribuicao, type Janela, type ResumoAfiliado, type Via } from "@/lib/quiz/afiliados";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Aba Afiliados (12/11/2026, Davi: "crio um link para a pessoa e a venda que sair dela puxa que foi da pessoa, sem perder dado nem cruzar").
// Cada afiliado tem um código único e fixo: o link dele leva utm_content = aff_<código> da visita até o botão de compra. As regras de crédito
// estão em src/lib/quiz/afiliados.ts (cada venda vai para um afiliado só ou para nenhum, e o que for duvidoso aparece em "A conferir").
const db = supabase as unknown as SupabaseClient;
const moeda = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const cartao = "rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1b27] to-[#08121c] p-4";
const OURO = "#f3c98b";
const campo = "rounded-lg border border-white/10 bg-[#0a1520] px-3 py-1.5 text-sm text-white outline-none focus:border-amber-200/60";
const PERIODOS: [number, string][] = [[7, "Últimos 7 dias"], [14, "Últimos 14 dias"], [30, "Últimos 30 dias"], [90, "Últimos 90 dias"], [0, "Todo o período"]];
interface Afiliado extends AfiliadoBase { contato: string | null; criado_em: string }
interface Curto { codigo: string; quiz_link_id: string; cliques: number }
type LinkAfi = LinkQuiz;
const VIA: Record<Via, { texto: string; cor: string }> = {
  checkout: { texto: "marca no checkout", cor: "bg-emerald-500/15 text-emerald-300" },
  lead: { texto: "pelo e-mail do lead", cor: "bg-sky-500/15 text-sky-300" },
  conflito: { texto: "conflito: conferir", cor: "bg-amber-500/20 text-amber-300" },
  codigo_desconhecido: { texto: "código desconhecido", cor: "bg-rose-500/20 text-rose-300" },
  nenhuma: { texto: "sem afiliado", cor: "bg-white/10 text-white/60" },
};

export function AfiliadosQuiz({ quizId, slug, estrutura, eventos, leads, vendas }: { quizId: string; slug: string; estrutura: EstruturaQuiz | null; eventos: EventoQuiz[]; leads: LeadQuiz[]; vendas: VendaUtm[] }) {
  const [afiliados, setAfiliados] = useState<Afiliado[] | null>(null);
  const [links, setLinks] = useState<LinkAfi[]>([]);
  const [curtos, setCurtos] = useState<Curto[]>([]);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [f, setF] = useState({ nome: "", contato: "", comissao: "30" });
  const [criando, setCriando] = useState(false);
  const [novoAberto, setNovoAberto] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [dias, setDias] = useState(30);
  const [filtro, setFiltro] = useState("");   // id do afiliado (vazio = todos)
  const [grafico, setGrafico] = useState<"vendas" | "receita">("vendas");

  const carregar = useCallback(async () => {
    const { data: q } = await db.from("quizzes").select("cliente_id").eq("id", quizId).maybeSingle();
    setClienteId((q as { cliente_id: string } | null)?.cliente_id ?? null);
    const { data: a } = await db.from("quiz_afiliados").select("id, codigo, nome, contato, comissao_pct, ativo, criado_em").eq("quiz_id", quizId).order("criado_em");
    setAfiliados(((a ?? []) as Afiliado[]).map((x) => ({ ...x, comissao_pct: Number(x.comissao_pct) })));
    const { data: l } = await db.from("quiz_links").select("id, nome, utm_source, utm_medium, utm_campaign, utm_content, utm_term, criado_em").eq("quiz_id", quizId).like("utm_content", "aff\\_%");
    setLinks((l ?? []) as LinkAfi[]);
    const ids = ((l ?? []) as { id: string }[]).map((x) => x.id);
    if (ids.length) { const { data: c } = await db.from("links_curtos").select("codigo, quiz_link_id, cliques").in("quiz_link_id", ids); setCurtos((c ?? []) as Curto[]); } else setCurtos([]);
  }, [quizId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const eventosAfi = useMemo(() => eventos.map((e) => ({ sessao: e.sessao, criado_em: e.criado_em, utm: e.utm as Record<string, string> | null })), [eventos]);
  const leadsAfi = useMemo(() => leads.map((l) => ({ id: l.id, email: l.email, criada_em: l.criada_em, utm: l.utm as Record<string, string> | null })), [leads]);
  const vendasAfi = useMemo(() => vendas.map((v) => ({ transacao_id: v.transacao_id ?? "", tipo: v.tipo, comprador_email: v.comprador_email ?? null, valor: v.valor, data: v.data, utm_content: v.utm_content ?? null })), [vendas]);

  // Período atual e o anterior (do mesmo tamanho), para as setinhas de variação.
  const { janela, anterior } = useMemo(() => {
    const hoje = startOfDay(new Date());
    const ate = addDays(hoje, 1).getTime();
    if (!dias) return { janela: { desde: 0, ate } as Janela, anterior: null };
    const desde = addDays(hoje, -(dias - 1)).getTime();
    return { janela: { desde, ate } as Janela, anterior: { desde: addDays(new Date(desde), -dias).getTime(), ate: desde } as Janela };
  }, [dias]);
  const resumo = useMemo(() => resumirAfiliados(afiliados ?? [], eventosAfi, leadsAfi, vendasAfi, janela), [afiliados, eventosAfi, leadsAfi, vendasAfi, janela]);
  const resumoAnt = useMemo(() => (anterior ? resumirAfiliados(afiliados ?? [], eventosAfi, leadsAfi, vendasAfi, anterior) : null), [afiliados, eventosAfi, leadsAfi, vendasAfi, anterior]);
  const totais = (r: typeof resumo | null) => {
    if (!r) return null;
    const codigoFiltro = (afiliados ?? []).find((x) => x.id === filtro)?.codigo.toLowerCase();
    const rs = [...r.porAfiliado.entries()].filter(([c]) => !codigoFiltro || c === codigoFiltro).map(([, x]) => x);
    return { leads: rs.reduce((a, x) => a + x.leads, 0), afiliados: rs.reduce((a, x) => a + x.vendas, 0), receita: rs.reduce((a, x) => a + x.liquido, 0), comissao: rs.reduce((a, x) => a + x.comissao, 0), comVendas: rs.filter((x) => x.vendas > 0).length };
  };
  const tot = totais(resumo)!, totAnt = totais(resumoAnt);

  const serie = useMemo(() => {
    const codigoFiltro = (afiliados ?? []).find((x) => x.id === filtro)?.codigo.toLowerCase();
    const dados = resumo.atribuicoes.filter((a) => a.venda.tipo === "venda" && a.codigo && (!codigoFiltro || a.codigo.toLowerCase() === codigoFiltro)).map((a) => a.venda);
    const inicio = janela.desde || (dados.length ? Math.min(...dados.map((v) => Date.parse(`${v.data}T12:00:00-03:00`))) : addDays(new Date(), -29).getTime());
    const dias = Math.min(365, Math.max(1, Math.round((startOfDay(new Date(janela.ate)).getTime() - startOfDay(new Date(inicio)).getTime()) / 86_400_000)));
    const porDia = new Map<string, { afiliados: number; receitaAfiliados: number }>();
    for (let i = 0; i < dias; i++) porDia.set(format(addDays(startOfDay(new Date(inicio)), i), "yyyy-MM-dd"), { afiliados: 0, receitaAfiliados: 0 });
    for (const v of dados) { const d = porDia.get((v.data ?? "").slice(0, 10)); if (d) { d.afiliados++; d.receitaAfiliados += v.valor ?? 0; } }
    return [...porDia.entries()].map(([dia, v]) => ({ dia, rotulo: format(new Date(`${dia}T12:00:00`), "dd MMM", { locale: ptBR }), ...v }));
  }, [janela, resumo, afiliados, filtro]);

  const criar = async () => {
    const nome = f.nome.trim();
    if (!nome || !clienteId || criando) return;
    const comissao = Math.min(100, Math.max(0, Number(f.comissao.replace(",", ".")) || 0));
    setCriando(true);
    try {
      let criado: Afiliado | null = null;
      for (let i = 0; i < 5 && !criado; i++) {
        const codigo = codigoAfiliado(nome, i === 0 ? "" : Math.random().toString(36).slice(2, 4 + (i > 2 ? 1 : 0)));
        if (!codigo) { toast.error("Use um nome com pelo menos 3 letras ou números"); return; }
        const { data, error } = await db.from("quiz_afiliados").insert({ quiz_id: quizId, cliente_id: clienteId, nome, contato: f.contato.trim() || null, codigo, comissao_pct: comissao }).select("id, codigo, nome, contato, comissao_pct, ativo, criado_em").single();
        if (!error && data) criado = { ...(data as Afiliado), comissao_pct: Number((data as Afiliado).comissao_pct) };
        else if (!/duplicate|unique|23505/i.test(`${error?.message} ${error?.code}`)) { toast.error("Não consegui criar o afiliado"); return; }
      }
      if (!criado) { toast.error("Não achei um código livre. Tente outro nome."); return; }
      const utm = utmDoAfiliado(criado.codigo, slug);
      const { data: lk, error: e2 } = await db.from("quiz_links").insert({ quiz_id: quizId, cliente_id: clienteId, nome: `Afiliado: ${nome}`, ...utm }).select("id, nome, utm_source, utm_medium, utm_campaign, utm_content, utm_term, criado_em").single();
      if (e2 || !lk) { toast.error("Afiliado criado, mas o link não saiu. Apague o afiliado e tente de novo."); void carregar(); return; }
      const destino = linkRastreado(linkDoQuiz(slug), lk as LinkQuiz);
      let curto = false;
      for (let i = 0; i < 4 && !curto; i++) {
        const base = codigoCurto(criado.codigo) ?? "afiliado";
        const { error } = await db.from("links_curtos").insert({ codigo: i === 0 ? base : `${base.slice(0, 33)}-${Math.random().toString(36).slice(2, 5)}`, destino, cliente_id: clienteId, quiz_link_id: (lk as { id: string }).id });
        if (!error) curto = true; else if (!/duplicate|unique|23505/i.test(`${error.message} ${error.code}`)) break;
      }
      setF({ nome: "", contato: "", comissao: f.comissao });
      setNovoAberto(false);
      setAberto(criado.id);
      toast.success(curto ? "Afiliado criado: copie o link dele e mande" : "Afiliado criado (use o link completo; o curto não saiu)");
      await carregar();
    } finally { setCriando(false); }
  };
  const atualizar = async (a: Afiliado, mudanca: Partial<Pick<Afiliado, "ativo" | "comissao_pct" | "nome" | "contato">>) => {
    setAfiliados((l) => (l ?? []).map((x) => (x.id === a.id ? { ...x, ...mudanca } : x)));
    const { error } = await db.from("quiz_afiliados").update(mudanca).eq("id", a.id);
    if (error) { toast.error("Não consegui salvar"); void carregar(); }
  };
  const apagar = async (a: Afiliado) => {
    if (!(await confirmar(`Apagar o afiliado ${a.nome}?`, { descricao: "As vendas dele continuam marcadas com o código, mas passam a aparecer como “código desconhecido” até você recriar um afiliado com o mesmo código. O link curto dele deixa de funcionar.", botao: "Apagar" }))) return;
    const lk = links.find((l) => l.utm_content === marcaDoAfiliado(a.codigo));
    if (lk) await db.from("quiz_links").delete().eq("id", lk.id);   // o link curto sai junto (ON DELETE CASCADE)
    const { error } = await db.from("quiz_afiliados").delete().eq("id", a.id);
    if (error) { toast.error("Não consegui apagar"); return; }
    void carregar();
  };
  const copiar = (t: string, ok: string) => void navigator.clipboard.writeText(t).then(() => toast.success(ok));

  if (!afiliados) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const s = resumo.saude;
  const aConferir = resumo.atribuicoes.filter((a) => a.venda.tipo === "venda" && (a.via === "conflito" || a.via === "codigo_desconhecido"));
  const base = new URL(linkDoQuiz(slug)).origin;   // o endereço público (no app do Mac, window.location é localhost e não abre para ninguém)
  const lista = afiliados.filter((a) => (!filtro || a.id === filtro) && (!busca.trim() || a.nome.toLowerCase().includes(busca.trim().toLowerCase()) || a.codigo.includes(busca.trim().toLowerCase())));
  const linkDe = (a: Afiliado) => links.find((l) => l.utm_content === marcaDoAfiliado(a.codigo));
  const curtoDe = (a: Afiliado) => { const lk = linkDe(a); return lk ? curtos.find((c) => c.quiz_link_id === lk.id) : undefined; };

  const Variacao = ({ atual, antes }: { atual: number; antes: number | undefined }) => {
    if (antes === undefined) return <span className="text-white/35">–</span>;
    if (antes === 0) return atual > 0 ? <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300"><ArrowUp className="h-3 w-3" />+100%</span> : <span className="text-white/35">–</span>;
    const p = Math.round(((atual - antes) / antes) * 100);
    if (p === 0) return <span className="text-white/35">–</span>;
    return <span className={cn("flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold", p > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>{p > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{p > 0 ? "+" : ""}{p}%</span>;
  };
  const KPIS = [
    { rot: "Vendas por afiliados", v: String(tot.afiliados), atual: tot.afiliados, antes: totAnt?.afiliados, sub: dias ? `vs. ${dias} dias anteriores` : "todo o período", Icone: ShoppingCart, tile: "bg-emerald-500/20 text-emerald-300 ring-emerald-400/30" },
    { rot: "Receita total", v: moeda(tot.receita), atual: tot.receita, antes: totAnt?.receita, sub: dias ? `vs. ${dias} dias anteriores` : "líquida, via afiliados", Icone: Coins, tile: "bg-amber-500/20 text-amber-300 ring-amber-400/30" },
    { rot: "Leads por afiliados", v: String(tot.leads), atual: tot.leads, antes: totAnt?.leads, sub: dias ? `vs. ${dias} dias anteriores` : "todo o período", Icone: UserPlus, tile: "bg-blue-500/20 text-blue-300 ring-blue-400/30" },
    { rot: "Comissão a pagar", v: moeda(tot.comissao), atual: tot.comissao, antes: totAnt?.comissao, sub: `${tot.comVendas} ${tot.comVendas === 1 ? "afiliado com vendas" : "afiliados com vendas"}`, Icone: Percent, tile: "bg-violet-500/20 text-violet-300 ring-violet-400/30" },
  ];

  return (
    <div className="space-y-4 text-white">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm text-white/60"><Users className="h-3.5 w-3.5" />Afiliados</p>
          <h3 className="text-3xl font-bold tracking-tight">Programa de Afiliados</h3>
          <p className="text-sm text-white/55">Convide parceiros, acompanhe as vendas e veja o impacto do seu time de afiliados.</p>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-[#0a1520] px-3 py-2 text-sm">
          <Users className="h-4 w-4 text-white/60" />
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="max-w-[11rem] bg-transparent pr-1 outline-none"><option value="" className="bg-[#0a1520]">Todos os afiliados</option>{afiliados.map((a) => <option key={a.id} value={a.id} className="bg-[#0a1520]">{a.nome}</option>)}</select>
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-[#0a1520] px-3 py-2 text-sm">
          <CalendarDays className="h-4 w-4 text-white/60" />
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="bg-transparent pr-1 outline-none">{PERIODOS.map(([d, r]) => <option key={d} value={d} className="bg-[#0a1520]">{r}</option>)}</select>
        </label>
        <button type="button" onClick={() => setNovoAberto(true)} style={{ backgroundColor: OURO }} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-black shadow hover:brightness-105"><UserPlus className="h-4 w-4" />Novo afiliado</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((k) => (
          <div key={k.rot} className={cn(cartao, "flex items-center gap-3")}>
            <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1", k.tile)}><k.Icone className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm text-white/70">{k.rot}</p>
              <div className="flex items-center justify-between gap-2"><p className="truncate text-3xl font-bold tabular-nums">{k.v}</p><Variacao atual={k.atual} antes={k.antes} /></div>
              <p className="text-xs text-white/50">{k.sub}</p></div>
          </div>
        ))}
      </div>

      <div className={cartao}>
        <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-white/60" /><p className="text-lg font-bold">Vendas ao longo do tempo</p>
          <div className="ml-auto flex rounded-full bg-white/5 p-0.5 text-sm">{(["vendas", "receita"] as const).map((g) => <button key={g} type="button" onClick={() => setGrafico(g)} className={cn("rounded-full px-4 py-1", grafico === g ? "font-semibold text-black" : "text-white/70")} style={grafico === g ? { backgroundColor: OURO } : undefined}>{g === "vendas" ? "Vendas" : "Receita"}</button>)}</div></div>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serie} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="afiOuro" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={OURO} stopOpacity={0.45} /><stop offset="100%" stopColor={OURO} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} width={44} tickFormatter={(v: number) => (grafico === "receita" ? `${Math.round(v)}` : String(v))} />
              <Tooltip cursor={{ stroke: "rgba(255,255,255,0.25)" }} content={({ active, payload, label }) => active && payload?.length ? (
                <div className="rounded-xl border border-white/20 bg-[#0a1520] px-3 py-2 text-xs shadow-lg"><p className="text-white/60">{label}</p>
                  {payload.map((p) => <p key={String(p.dataKey)} className="font-semibold" style={{ color: p.color }}>{grafico === "receita" ? moeda(Number(p.value)) : `${p.value} ${Number(p.value) === 1 ? "venda" : "vendas"}`} <span className="font-normal text-white/50">por afiliados</span></p>)}</div>) : null} />
              <Area type="monotone" dataKey={grafico === "vendas" ? "afiliados" : "receitaAfiliados"} stroke={OURO} strokeWidth={2} fill="url(#afiOuro)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {tot.afiliados === 0 && <p className="text-center text-xs text-white/45">Nenhuma venda por afiliado neste período ainda.</p>}
      </div>

      {aConferir.length > 0 && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-200">A conferir ({aConferir.length})</p>
          <div className="mt-2 space-y-1.5">{aConferir.map((a) => <LinhaVenda key={a.venda.transacao_id + a.venda.tipo} a={a} afiliados={afiliados} />)}</div>
          <p className="mt-2 text-[11px] text-amber-200/70">Conflito: o checkout dizia um afiliado e o e-mail do lead outro; foi creditado o do checkout. Código desconhecido: a venda veio com um código que não existe (digitado errado ou afiliado apagado) e não foi creditada a ninguém.</p>
        </div>
      )}

      <div className={cartao}>
        <div className="flex flex-wrap items-center gap-3">
          <Users className="h-5 w-5 text-white/70" /><p className="text-lg font-bold">Meus afiliados ({afiliados.length})</p>
          <div className="relative ml-auto w-full sm:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-white/45" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar afiliado..." className="w-full rounded-xl border border-white/20 bg-transparent py-2 pl-9 pr-3 text-sm outline-none placeholder:text-white/45 focus:border-amber-200/60" /></div>
        </div>
        {afiliados.length === 0 ? <p className="mt-4 rounded-xl bg-white/5 p-8 text-center text-sm text-white/50">Nenhum afiliado ainda. Clique em “Novo afiliado” para criar o primeiro e receber o link dele.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="bg-white/5 text-white/70"><th className="rounded-l-xl px-4 py-3 text-left font-medium">Afiliado</th>{["Visitas", "Leads", "Vendas", "Conversão", "Comissão"].map((h) => <th key={h} className="px-3 py-3 text-center font-medium">{h}</th>)}<th className="w-10 rounded-r-xl" /></tr></thead>
              <tbody>
                {lista.map((a) => {
                  const r = resumo.porAfiliado.get(a.codigo.toLowerCase()) as ResumoAfiliado;
                  const curto = curtoDe(a);
                  const aberta = aberto === a.id;
                  return (
                    <Fragment key={a.id}>
                      <tr onClick={() => setAberto(aberta ? null : a.id)} className={cn("cursor-pointer border-b border-white/5 hover:bg-white/[0.03]", !a.ativo && "opacity-55")}>
                        <td className="px-4 py-3"><span className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-base font-semibold">{a.nome.slice(0, 1).toUpperCase()}</span>
                          <span className="font-semibold">{a.nome}</span>
                          {curto && <button type="button" title="Copiar link curto" onClick={(e) => { e.stopPropagation(); copiar(enderecoCurto(base, curto.codigo), "Link curto copiado"); }} className="text-white/55 hover:text-white"><Link2 className="h-4 w-4" /></button>}
                          {!a.ativo && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">pausado</span>}
                        </span></td>
                        <td className="px-3 py-3 text-center tabular-nums">{r.visitas}</td><td className="px-3 py-3 text-center tabular-nums">{r.leads}</td>
                        <td className="px-3 py-3 text-center tabular-nums">{r.vendas}{r.reembolsos ? <span className="text-rose-300"> (−{r.reembolsos})</span> : null}</td>
                        <td className="px-3 py-3 text-center tabular-nums">{r.visitas ? `${Math.round(r.conversao * 1000) / 10}%` : "0%"}</td>
                        <td className="px-3 py-3 text-center font-semibold tabular-nums">{moeda(r.comissao)}</td>
                        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"><MoreVertical className="h-4 w-4" /></button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="dark">
                              {curto && <DropdownMenuItem onClick={() => copiar(enderecoCurto(base, curto.codigo), "Link curto copiado")}>Copiar link curto</DropdownMenuItem>}
                              {linkDe(a) && <DropdownMenuItem onClick={() => copiar(linkRastreado(linkDoQuiz(slug), linkDe(a)!), "Link completo copiado")}>Copiar link completo</DropdownMenuItem>}
                              <DropdownMenuItem onClick={() => setAberto(a.id)}>Ver detalhes e renomear link</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void atualizar(a, { ativo: !a.ativo })}>{a.ativo ? "Pausar" : "Reativar"}</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-rose-400 focus:text-rose-300" onClick={() => void apagar(a)}>Apagar afiliado</DropdownMenuItem>
                            </DropdownMenuContent></DropdownMenu>
                        </td>
                      </tr>
                      {aberta && <tr><td colSpan={7} className="bg-black/20 px-4 py-4"><DetalheAfiliado a={a} r={r} curto={curto} lk={linkDe(a)} slug={slug} base={base} estrutura={estrutura} atribuicoes={resumo.atribuicoes} afiliados={afiliados} onCopiar={copiar} onAtualizar={atualizar} onRecarregar={() => void carregar()} /></td></tr>}
                    </Fragment>
                  );
                })}
                {lista.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-white/45">Ninguém com esse nome.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <details className={cartao}>
        <summary className="cursor-pointer text-sm font-semibold">Saúde do rastreio <span className="font-normal text-white/50">· como as vendas estão sendo ligadas aos afiliados</span></summary>
        <div className="mt-3 grid gap-2 text-center sm:grid-cols-4">
          {([["Todas as vendas do projeto (diagnóstico)", s.totalVendas, ""], ["Creditadas a afiliados", s.vendasDoQuiz, "text-emerald-300"], ["Com a marca vinda do checkout", s.comMarcaNoCheckout, s.totalVendas > 0 && s.comMarcaNoCheckout === 0 ? "text-amber-300" : ""], ["A conferir", s.conflitos + s.codigoDesconhecido, s.conflitos + s.codigoDesconhecido ? "text-amber-300" : ""]] as const).map(([r, v, cor]) => (
            <div key={r} className="rounded-xl bg-white/5 p-3"><p className="text-[11px] uppercase tracking-wide text-white/50">{r}</p><p className={cn("text-xl font-bold tabular-nums", cor)}>{v}</p></div>
          ))}
        </div>
        <ul className="mt-2 space-y-1 text-xs text-white/60">
          <li>Pelo checkout (a plataforma devolveu a marca): <b className="text-white/80">{s.viaCheckout}</b> · pelo e-mail do lead: <b className="text-white/80">{s.viaLead}</b> · leads do quiz sem afiliado: <b className="text-white/80">{s.semAfiliado}</b> · compras sem relação com o quiz: <b className="text-white/80">{s.foraDoQuiz}</b></li>
          {s.totalVendas > 0 && s.comMarcaNoCheckout === 0 && <li className="flex gap-1.5 text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Nenhuma venda deste período chegou com marca do checkout. Até a plataforma devolver a UTM, o crédito vem só pelo e-mail que a pessoa deixou no quiz: se ela comprar com outro e-mail, a venda não é ligada. Faça uma compra de teste pelo link de um afiliado para confirmar.</li>}
        </ul>
        <p className="mt-2 text-[11px] text-white/40">A marca do afiliado vai na UTM (utm_content = aff_código) do link, da visita, do lead e do botão de compra. O crédito não depende do nome nem das outras UTM, então dois afiliados nunca se misturam. Reembolso desconta do afiliado da venda original.</p>
      </details>

      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent className="dark border-white/10 bg-[#0c1b27] text-white sm:max-w-md">
          <DialogHeader><DialogTitle>Novo afiliado</DialogTitle><DialogDescription className="text-white/55">Ele recebe um link só dele. Tudo que vier por esse link (visita, lead e venda) fica marcado com o código dele.</DialogDescription></DialogHeader>
          <div className="space-y-2.5">
            <input className={cn(campo, "w-full")} placeholder="Nome do afiliado" autoFocus value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void criar(); }} />
            <input className={cn(campo, "w-full")} placeholder="Contato (opcional: WhatsApp ou e-mail)" value={f.contato} onChange={(e) => setF({ ...f, contato: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-white/70">Comissão <input className={cn(campo, "w-24 text-center")} inputMode="decimal" value={f.comissao} onChange={(e) => setF({ ...f, comissao: e.target.value })} /> % sobre a venda líquida</label>
            <button type="button" disabled={!f.nome.trim() || criando} onClick={() => void criar()} style={{ backgroundColor: OURO }} className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-black disabled:opacity-40">{criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Criar afiliado e link</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetalheAfiliado({ a, r, curto, lk, slug, base, estrutura, atribuicoes, afiliados, onCopiar, onAtualizar, onRecarregar }: {
  a: Afiliado; r: ResumoAfiliado; curto: Curto | undefined; lk: LinkAfi | undefined; slug: string; base: string; estrutura: EstruturaQuiz | null; atribuicoes: Atribuicao[]; afiliados: Afiliado[];
  onCopiar: (t: string, ok: string) => void; onAtualizar: (a: Afiliado, m: Partial<Pick<Afiliado, "ativo" | "comissao_pct" | "nome" | "contato">>) => Promise<void>; onRecarregar: () => void;
}) {
  const completo = lk ? linkRastreado(linkDoQuiz(slug), lk) : "";
  const compra = estrutura && lk ? propagarUtm(estrutura, { utm_source: lk.utm_source, ...(lk.utm_medium ? { utm_medium: lk.utm_medium } : {}), ...(lk.utm_campaign ? { utm_campaign: lk.utm_campaign } : {}), utm_content: lk.utm_content ?? "" }).oferta?.cta_url : undefined;
  const vendasDele = atribuicoes.filter((x) => x.codigo?.toLowerCase() === a.codigo.toLowerCase());
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-2.5 text-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Link do afiliado</p>
        {curto ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-black/40 px-2 py-1 text-amber-200">{enderecoCurto(base, curto.codigo)}</code>
            <button type="button" onClick={() => onCopiar(enderecoCurto(base, curto.codigo), "Link curto copiado")} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-black" style={{ backgroundColor: OURO }}><Copy className="h-3.5 w-3.5" />Copiar</button>
            <RenomearLink codigo={curto.codigo} base={base} onRenomeado={onRecarregar} />
            <span className="text-xs text-white/50">{curto.cliques} {curto.cliques === 1 ? "clique" : "cliques"}</span>
          </div>
        ) : <p className="text-xs text-white/50">Sem link curto: use o link completo.</p>}
        {completo && <button type="button" onClick={() => onCopiar(completo, "Link completo copiado")} className="block max-w-full truncate rounded border border-white/10 px-2 py-1 text-left font-mono text-[11px] text-white/55 hover:text-white" title={completo}>{completo}</button>}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-white/60">
          <span>Nome <input defaultValue={a.nome} onBlur={(e) => { const v = e.target.value.trim().slice(0, 80); if (v && v !== a.nome) void onAtualizar(a, { nome: v }); else e.target.value = a.nome; }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className="w-40 rounded bg-white/10 px-2 py-1 text-white outline-none" /></span>
          <span>Comissão <input className="w-14 rounded bg-white/10 px-1.5 py-1 text-center text-white outline-none" defaultValue={String(a.comissao_pct).replace(".", ",")} inputMode="decimal" onBlur={(e) => { const v = Math.min(100, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)); if (v !== a.comissao_pct) void onAtualizar(a, { comissao_pct: v }); }} />%</span>
          <span>Contato <input defaultValue={a.contato ?? ""} onBlur={(e) => { const v = e.target.value.trim().slice(0, 120) || null; if (v !== a.contato) void onAtualizar(a, { contato: v }); }} className="w-40 rounded bg-white/10 px-2 py-1 text-white outline-none" /></span>
        </div>
        {compra && <p className="break-all text-[11px] text-white/45">O botão de compra do quiz vai para: <span className="font-mono text-white/70">{compra}</span> {/utm_content=aff_/.test(compra) ? <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-400" /> : <AlertTriangle className="inline h-3.5 w-3.5 text-amber-400" />}</p>}
        {!a.ativo && <p className="text-[11px] text-white/40">Pausado só marca aqui: o link dele continua rastreando as visitas e vendas.</p>}
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          {([["Receita bruta", moeda(r.bruto)], ["Reembolsos", moeda(r.reembolsado)], ["Líquido", moeda(r.liquido)]] as const).map(([rot, v]) => <div key={rot} className="rounded-xl bg-white/5 p-2"><p className="text-[10px] uppercase tracking-wide text-white/50">{rot}</p><p className="font-bold tabular-nums">{v}</p></div>)}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Vendas e como cada uma foi ligada ({vendasDele.length})</p>
        {vendasDele.length === 0 ? <p className="text-xs text-white/45">Nenhuma venda neste período.</p> : <div className="max-h-56 space-y-1.5 overflow-y-auto">{vendasDele.map((x) => <LinhaVenda key={x.venda.transacao_id + x.venda.tipo} a={x} afiliados={afiliados} />)}</div>}
      </div>
    </div>
  );
}

function LinhaVenda({ a, afiliados }: { a: Atribuicao; afiliados: Afiliado[] }) {
  const nome = (c: string | null) => afiliados.find((x) => x.codigo === c)?.nome ?? c ?? "—";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs">
      <span className="tabular-nums text-white/60">{a.venda.data ? new Date(`${a.venda.data}T12:00:00`).toLocaleDateString("pt-BR") : ""}</span>
      <span className={cn("font-semibold tabular-nums", a.venda.tipo !== "venda" && "text-rose-300")}>{a.venda.tipo === "venda" ? "" : "reembolso "}{moeda(a.venda.valor ?? 0)}</span>
      <span className="min-w-0 flex-1 truncate text-white/55">{a.venda.comprador_email ?? "sem e-mail"}</span>
      <span className={cn("rounded-full px-2 py-0.5", VIA[a.via].cor)}>{VIA[a.via].texto}{a.via === "conflito" ? ` (checkout: ${nome(a.codigo)}; lead: ${nome(a.alternativo)})` : a.via === "codigo_desconhecido" ? ` (${a.alternativo})` : ""}</span>
    </div>
  );
}
