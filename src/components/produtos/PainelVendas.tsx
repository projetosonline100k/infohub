import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { format, parseISO, subDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// Painel de vendas do projeto (07/11/2026, Davi: "conectar com a Eduzz, ver as vendas e de onde estão vindo").
// Junta os eventos que as plataformas (Kiwify, Hotmart, Eduzz) mandam para os produtos do projeto
// (edge vendas-webhook → vendas_plataforma_eventos): números do período, receita por dia, funil, origem
// das vendas (UTMs) e a lista de eventos com filtros.

type Tipo = "venda" | "reembolso" | "pendente" | "recusada" | "cancelada" | "abandono";
interface Evento {
  id: string; produto_id: string; plataforma: string; transacao_id: string; tipo: Tipo; valor: number; data: string;
  produto_plataforma: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  utm_content: string | null; comprador_nome: string | null; comprador_email: string | null; metodo_pagamento: string | null; recebido_em: string;
}
const ROTULO: Record<Tipo, string> = {
  venda: "Venda aprovada", reembolso: "Reembolso", pendente: "Pix/boleto gerado", recusada: "Recusada", cancelada: "Cancelada", abandono: "Carrinho abandonado",
};
const COR: Record<Tipo, string> = {
  venda: "text-emerald-600 bg-emerald-500/10", reembolso: "text-rose-600 bg-rose-500/10", pendente: "text-amber-600 bg-amber-500/10",
  recusada: "text-rose-600 bg-rose-500/10", cancelada: "text-muted-foreground bg-muted", abandono: "text-orange-600 bg-orange-500/10",
};
const moeda = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const db = supabase as unknown as SupabaseClient;

export function PainelVendas({ clienteId }: { clienteId: string }) {
  const [produtos, setProdutos] = useState<{ id: string; nome_produto: string }[]>([]);
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [dias, setDias] = useState(30);
  const [filtroTipo, setFiltroTipo] = useState<Tipo | "todos">("todos");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data: ps } = await supabase.from("produtos_cliente").select("id, nome_produto").eq("cliente_id", clienteId);
      const lista = (ps ?? []) as { id: string; nome_produto: string }[];
      if (!vivo) return;
      setProdutos(lista);
      if (!lista.length) { setEventos([]); return; }
      const desde = format(subDays(new Date(), 90), "yyyy-MM-dd");
      const { data } = await db.from("vendas_plataforma_eventos")
        .select("id, produto_id, plataforma, transacao_id, tipo, valor, data, produto_plataforma, utm_source, utm_medium, utm_campaign, utm_content, comprador_nome, comprador_email, metodo_pagamento, recebido_em")
        .in("produto_id", lista.map((p) => p.id)).gte("data", desde).order("recebido_em", { ascending: false }).limit(3000);
      if (vivo) setEventos((data ?? []) as unknown as Evento[]);
    })();
    return () => { vivo = false; };
  }, [clienteId]);

  const nomeProduto = useMemo(() => new Map(produtos.map((p) => [p.id, p.nome_produto])), [produtos]);
  const corte = format(subDays(new Date(), dias - 1), "yyyy-MM-dd");
  const doPeriodo = useMemo(() => (eventos ?? []).filter((e) => e.data >= corte), [eventos, corte]);
  const vendas = doPeriodo.filter((e) => e.tipo === "venda");
  const reembolsos = doPeriodo.filter((e) => e.tipo === "reembolso");
  const receita = vendas.reduce((s, e) => s + Number(e.valor), 0);
  const devolvido = reembolsos.reduce((s, e) => s + Number(e.valor), 0);
  const pendentes = doPeriodo.filter((e) => e.tipo === "pendente");
  const pagosDosPendentes = new Set(vendas.map((v) => v.transacao_id));
  const funil = [
    { rotulo: "Carrinhos abandonados", n: doPeriodo.filter((e) => e.tipo === "abandono").length },
    { rotulo: "Pix / boletos gerados", n: pendentes.length },
    { rotulo: "…desses, pagos", n: pendentes.filter((p) => pagosDosPendentes.has(p.transacao_id)).length },
    { rotulo: "Compras aprovadas (todas as formas)", n: vendas.length },
    { rotulo: "Compras recusadas", n: doPeriodo.filter((e) => e.tipo === "recusada").length },
  ];
  const maxFunil = Math.max(1, ...funil.map((f) => f.n));

  const porDia = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = dias - 1; i >= 0; i--) m.set(format(subDays(new Date(), i), "yyyy-MM-dd"), 0);
    for (const v of vendas) if (m.has(v.data)) m.set(v.data, (m.get(v.data) ?? 0) + Number(v.valor));
    return [...m.entries()].map(([dia, valor]) => ({ dia: format(parseISO(dia), "dd/MM"), valor }));
  }, [vendas, dias]);

  const agrupar = (chave: (e: Evento) => string) => {
    const m = new Map<string, { n: number; valor: number }>();
    for (const v of vendas) { const k = chave(v); const a = m.get(k) ?? { n: 0, valor: 0 }; a.n++; a.valor += Number(v.valor); m.set(k, a); }
    return [...m.entries()].sort((a, b) => b[1].valor - a[1].valor);
  };
  const porOrigem = agrupar((e) => e.utm_source || "Sem origem (link sem UTM)");
  const porCampanha = agrupar((e) => [e.utm_campaign, e.utm_content].filter(Boolean).join(" · ") || "—").filter(([k]) => k !== "—");
  const porProduto = agrupar((e) => e.produto_plataforma || nomeProduto.get(e.produto_id) || "Produto");

  const lista = doPeriodo.filter((e) => (filtroTipo === "todos" || e.tipo === filtroTipo) && (!busca.trim() ||
    [e.comprador_email, e.comprador_nome, e.produto_plataforma, e.transacao_id, e.utm_source, e.utm_campaign].some((x) => x?.toLowerCase().includes(busca.trim().toLowerCase()))));

  if (eventos === null) return <p className="text-sm text-muted-foreground">Carregando vendas…</p>;
  const cartao = (rotulo: string, valor: string, sub?: string) => (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-bold tabular-nums">{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" onClick={() => setDias(d)}
            className={cn("rounded-lg border px-3 py-1 text-sm", dias === d ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{d} dias</button>
        ))}
        {eventos.length === 0 && (
          <p className="ml-2 text-sm text-muted-foreground">
            Nenhuma venda chegou ainda. Para conectar: abra o produto na Esteira de produtos → Financeiro → <b>Vendas automáticas</b>,
            copie o link e cole no webhook da Eduzz (ou Kiwify/Hotmart).
          </p>
        )}
      </div>

      <GeradorUtm />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cartao("Caixa (vendas − reembolsos)", moeda(receita - devolvido), `${vendas.length} vendas · ${reembolsos.length} reembolsos`)}
        {cartao("Receita do período", moeda(receita), `${vendas.length} vendas aprovadas`)}
        {cartao("Ticket médio", moeda(vendas.length ? receita / vendas.length : 0))}
        {cartao("Reembolsos", moeda(devolvido), `${reembolsos.length} pedidos`)}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-xl border bg-card p-4">
          <p className="font-semibold">Receita por dia</p>
          <p className="text-xs text-muted-foreground">{moeda(receita)} em {vendas.length} vendas nos últimos {dias} dias</p>
          <div className="mt-3 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porDia}>
                <XAxis dataKey="dia" tick={{ fontSize: 10 }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => moeda(v)} cursor={{ fill: "hsl(var(--muted))" }} />
                <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="font-semibold">Funil de vendas</p>
          <p className="text-xs text-muted-foreground">Últimos {dias} dias · pedidos únicos</p>
          <div className="mt-3 space-y-2.5">
            {funil.map((f) => (
              <div key={f.rotulo}>
                <div className="flex justify-between text-sm"><span>{f.rotulo}</span><b className="tabular-nums">{f.n}</b></div>
                <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(f.n / maxFunil) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {([["De onde vêm as vendas", porOrigem], ["Campanhas / criativos", porCampanha], ["Por produto", porProduto]] as const).map(([titulo, linhas]) => (
          <div key={titulo} className="rounded-xl border bg-card p-4">
            <p className="font-semibold">{titulo}</p>
            {linhas.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Sem vendas no período{titulo === "Campanhas / criativos" ? " com campanha na UTM" : ""}.</p> : (
              <div className="mt-2 space-y-1.5">
                {linhas.slice(0, 8).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{k}</span>
                    <span className="text-xs text-muted-foreground">{v.n}×</span>
                    <b className="tabular-nums">{moeda(v.valor)}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="font-semibold">Atividade das plataformas</p>
        <p className="text-xs text-muted-foreground">{lista.length} eventos · do mais recente ao mais antigo</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as Tipo | "todos")} className="rounded-lg border bg-background px-2 py-1.5 text-sm">
            <option value="todos">Todos os tipos</option>
            {(Object.keys(ROTULO) as Tipo[]).map((t) => <option key={t} value={t}>{ROTULO[t]}</option>)}
          </select>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, e-mail, produto, pedido ou origem"
            className="min-w-[220px] flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="mt-3 max-h-96 divide-y overflow-y-auto">
          {lista.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nenhum evento recebido no período.</p>}
          {lista.slice(0, 300).map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
              <span className="w-12 text-muted-foreground">{format(parseISO(e.data), "dd/MM")}</span>
              <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", COR[e.tipo])}>{ROTULO[e.tipo]}</span>
              <b className="w-24 tabular-nums">{moeda(Number(e.valor))}</b>
              <span className="min-w-0 flex-1 truncate">{e.comprador_nome || e.comprador_email || "—"}<span className="text-muted-foreground"> · {e.produto_plataforma || nomeProduto.get(e.produto_id)}</span></span>
              <span className="text-xs text-muted-foreground">{e.utm_source ? `${e.utm_source}${e.utm_campaign ? ` / ${e.utm_campaign}` : ""}` : "sem origem"}</span>
              <span className="text-xs capitalize text-muted-foreground">{e.plataforma}{e.metodo_pagamento ? ` · ${e.metodo_pagamento}` : ""}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Link de checkout com UTM: sem isso a venda chega como "sem origem". Um link por lugar onde é divulgado.
const ORIGENS = [
  { rotulo: "Bio do Instagram", source: "instagram", medium: "bio" },
  { rotulo: "Stories", source: "instagram", medium: "stories" },
  { rotulo: "Reels / post", source: "instagram", medium: "post" },
  { rotulo: "Anúncio Meta", source: "meta", medium: "ads" },
  { rotulo: "YouTube", source: "youtube", medium: "video" },
  { rotulo: "WhatsApp", source: "whatsapp", medium: "mensagem" },
  { rotulo: "E-mail", source: "email", medium: "newsletter" },
];
function GeradorUtm() {
  const [aberto, setAberto] = useState(false);
  const [link, setLink] = useState("");
  const [origem, setOrigem] = useState(0);
  const [campanha, setCampanha] = useState("");
  const [conteudo, setConteudo] = useState("");
  let pronto = "";
  try {
    if (link.trim()) {
      const u = new URL(link.trim());
      const o = ORIGENS[origem];
      u.searchParams.set("utm_source", o.source);
      u.searchParams.set("utm_medium", o.medium);
      if (campanha.trim()) u.searchParams.set("utm_campaign", campanha.trim().toLowerCase().replace(/\s+/g, "-"));
      if (conteudo.trim()) u.searchParams.set("utm_content", conteudo.trim().toLowerCase().replace(/\s+/g, "-"));
      pronto = u.toString();
    }
  } catch { pronto = ""; }
  if (!aberto) {
    return <button type="button" onClick={() => setAberto(true)} className="text-sm font-medium text-primary hover:underline">+ Gerar link de checkout com origem (UTM)</button>;
  }
  return (
    <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
      <p className="text-sm font-semibold">Link com origem (UTM)</p>
      <p className="text-xs text-muted-foreground">Use um link destes em cada lugar onde divulgar: a venda chega dizendo de onde veio.</p>
      <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Cole o link do checkout (ex.: https://chk.eduzz.com/...)"
        className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm" />
      <div className="flex flex-wrap gap-2">
        <select value={origem} onChange={(e) => setOrigem(Number(e.target.value))} className="rounded-lg border bg-background px-2 py-1.5 text-sm">
          {ORIGENS.map((o, i) => <option key={o.rotulo} value={i}>{o.rotulo}</option>)}
        </select>
        <input value={campanha} onChange={(e) => setCampanha(e.target.value)} placeholder="Campanha (ex.: black-friday)" className="min-w-[160px] flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm" />
        <input value={conteudo} onChange={(e) => setConteudo(e.target.value)} placeholder="Criativo/post (opcional)" className="min-w-[160px] flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm" />
      </div>
      {pronto && (
        <div className="flex gap-2">
          <input readOnly value={pronto} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-1.5 font-mono text-xs" />
          <button type="button" onClick={() => void navigator.clipboard.writeText(pronto)} className="rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">Copiar</button>
        </div>
      )}
      {link.trim() && !pronto && <p className="text-xs text-rose-600">Esse link não parece válido (precisa começar com https://).</p>}
    </div>
  );
}
