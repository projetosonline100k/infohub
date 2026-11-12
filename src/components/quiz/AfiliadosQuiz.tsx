import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { confirmar } from "@/components/DialogosGlobais";
import { linkDoQuiz, type EstruturaQuiz } from "@/lib/quiz/quiz";
import { codigoCurto, enderecoCurto, linkRastreado, propagarUtm, type LinkQuiz } from "@/lib/quiz/utm";
import type { EventoQuiz, LeadQuiz } from "@/lib/quiz/painel";
import type { VendaUtm } from "@/lib/quiz/vendasUtm";
import { codigoAfiliado, marcaDoAfiliado, resumirAfiliados, utmDoAfiliado, type AfiliadoBase, type Atribuicao, type Via } from "@/lib/quiz/afiliados";

// Aba Afiliados (12/11/2026, Davi: "crio um link para a pessoa e a venda que sair dela puxa que foi da pessoa, sem perder dado nem cruzar").
// Cada afiliado tem um código único e fixo: o link dele leva utm_content = aff_<código> da visita até o botão de compra. As regras de crédito
// estão em src/lib/quiz/afiliados.ts (cada venda vai para um afiliado só ou para nenhum, e o que for duvidoso aparece em "A conferir").
const db = supabase as unknown as SupabaseClient;
const moeda = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const cartao = "rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-[#0c1b27] to-[#08121c] p-4";
const campo = "rounded-lg border border-white/10 bg-[#0a1520] px-3 py-1.5 text-sm text-white outline-none focus:border-cyan-400/50";
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
  const [aberto, setAberto] = useState<string | null>(null);

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

  const resumo = useMemo(() => resumirAfiliados(
    afiliados ?? [],
    eventos.map((e) => ({ sessao: e.sessao, criado_em: e.criado_em, utm: e.utm as Record<string, string> | null })),
    leads.map((l) => ({ id: l.id, email: l.email, criada_em: l.criada_em, utm: l.utm as Record<string, string> | null })),
    vendas.map((v) => ({ transacao_id: v.transacao_id ?? "", tipo: v.tipo, comprador_email: v.comprador_email ?? null, valor: v.valor, data: v.data, utm_content: v.utm_content ?? null })),
  ), [afiliados, eventos, leads, vendas]);

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

  return (
    <div className="space-y-4 text-white">
      <div className={cartao}>
        <h3 className="text-lg font-bold">Afiliados</h3>
        <p className="text-xs text-white/55">Cada afiliado tem um link só dele. Visita, lead e venda saem marcados com o código dele, então nada se mistura com os outros links nem entre afiliados. Cada venda é creditada a um afiliado só (ou a nenhum).</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_110px_auto]">
          <input className={campo} placeholder="Nome do afiliado" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void criar(); }} />
          <input className={campo} placeholder="Contato (opcional)" value={f.contato} onChange={(e) => setF({ ...f, contato: e.target.value })} />
          <input className={campo} placeholder="Comissão %" inputMode="decimal" value={f.comissao} onChange={(e) => setF({ ...f, comissao: e.target.value })} />
          <button type="button" disabled={!f.nome.trim() || criando} onClick={() => void criar()} className="flex items-center justify-center gap-1.5 rounded-lg bg-cyan-500/90 px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-40">{criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Criar</button>
        </div>
      </div>

      <div className={cartao}>
        <p className="text-sm font-semibold">Saúde do rastreio</p>
        <div className="mt-2 grid gap-2 text-center sm:grid-cols-4">
          {([["Vendas totais do projeto", s.totalVendas, ""], ["Creditadas a afiliados", s.vendasDoQuiz, "text-emerald-300"], ["Com a marca vinda do checkout", s.comMarcaNoCheckout, s.totalVendas > 0 && s.comMarcaNoCheckout === 0 ? "text-amber-300" : ""], ["A conferir", s.conflitos + s.codigoDesconhecido, s.conflitos + s.codigoDesconhecido ? "text-amber-300" : ""]] as const).map(([r, v, cor]) => (
            <div key={r} className="rounded-xl bg-white/5 p-3"><p className="text-[11px] uppercase tracking-wide text-white/50">{r}</p><p className={cn("text-xl font-bold tabular-nums", cor)}>{v}</p></div>
          ))}
        </div>
        <ul className="mt-2 space-y-1 text-xs text-white/60">
          <li>Pelo checkout (a plataforma devolveu a marca): <b className="text-white/80">{s.viaCheckout}</b> · pelo e-mail do lead: <b className="text-white/80">{s.viaLead}</b> · leads do quiz sem afiliado: <b className="text-white/80">{s.semAfiliado}</b> · compras sem relação com o quiz: <b className="text-white/80">{s.foraDoQuiz}</b></li>
          {s.totalVendas > 0 && s.comMarcaNoCheckout === 0 && <li className="flex gap-1.5 text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Nenhuma venda recebida chegou com marca do checkout ainda. Até a plataforma devolver a UTM, o crédito vem só pelo e-mail que a pessoa deixou no quiz: se ela comprar com outro e-mail, a venda não é ligada. Faça uma compra de teste pelo link de um afiliado para confirmar.</li>}
        </ul>
      </div>

      {aConferir.length > 0 && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-200">A conferir ({aConferir.length})</p>
          <div className="mt-2 space-y-1.5">{aConferir.map((a) => <LinhaVenda key={a.venda.transacao_id + a.venda.tipo} a={a} afiliados={afiliados} />)}</div>
          <p className="mt-2 text-[11px] text-amber-200/70">Conflito: o checkout dizia um afiliado e o e-mail do lead outro; foi creditado o do checkout. Código desconhecido: a venda veio com um código que não existe (digitado errado ou afiliado apagado) e não foi creditada a ninguém.</p>
        </div>
      )}

      {afiliados.length === 0 ? <p className="rounded-xl bg-white/5 p-6 text-center text-sm text-white/50">Nenhum afiliado ainda. Crie o primeiro acima.</p> : afiliados.map((a) => {
        const r = resumo.porAfiliado.get(a.codigo.toLowerCase())!;
        const lk = links.find((l) => l.utm_content === marcaDoAfiliado(a.codigo));
        const curto = lk ? curtos.find((c) => c.quiz_link_id === lk.id) : undefined;
        const completo = lk ? linkRastreado(linkDoQuiz(slug), lk) : "";
        const compra = estrutura && lk ? propagarUtm(estrutura, { utm_source: lk.utm_source, ...(lk.utm_medium ? { utm_medium: lk.utm_medium } : {}), ...(lk.utm_campaign ? { utm_campaign: lk.utm_campaign } : {}), utm_content: lk.utm_content ?? "" }).oferta?.cta_url : undefined;
        const vendasDele = resumo.atribuicoes.filter((x) => x.codigo?.toLowerCase() === a.codigo.toLowerCase());
        return (
          <div key={a.id} className={cn(cartao, !a.ativo && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-bold">{a.nome}</p>
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] text-white/70">{a.codigo}</span>
              {!a.ativo && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">pausado</span>}
              <div className="ml-auto flex items-center gap-1.5">
                {curto && <button type="button" onClick={() => copiar(enderecoCurto(base, curto.codigo), "Link curto copiado")} className="flex items-center gap-1.5 rounded-full bg-cyan-500 px-3 py-1 text-xs font-semibold text-black"><Copy className="h-3.5 w-3.5" />Copiar link curto</button>}
                {completo && <button type="button" onClick={() => copiar(completo, "Link completo copiado")} className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 hover:text-white">Link completo</button>}
                <button type="button" onClick={() => void atualizar(a, { ativo: !a.ativo })} className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 hover:text-white">{a.ativo ? "Pausar" : "Reativar"}</button>
                <button type="button" onClick={() => void apagar(a)} title="Apagar afiliado" className="rounded-full border border-white/15 p-1.5 text-white/50 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <p className="mt-1 text-xs text-white/50">{a.contato ? `${a.contato} · ` : ""}comissão <input className="w-14 rounded bg-white/10 px-1.5 py-0.5 text-center text-white outline-none" defaultValue={String(a.comissao_pct).replace(".", ",")} inputMode="decimal"
              onBlur={(e) => { const v = Math.min(100, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)); if (v !== a.comissao_pct) void atualizar(a, { comissao_pct: v }); }} />% · {curto ? `${curto.cliques} cliques no link curto` : "sem link curto"}</p>
            {a.ativo === false && <p className="mt-1 text-[11px] text-white/40">Pausado só marca aqui: o link dele continua rastreando as visitas e vendas.</p>}
            <div className="mt-3 grid gap-2 sm:grid-cols-5">
              {([["Visitas", String(r.visitas)], ["Leads", String(r.leads)], ["Vendas", String(r.vendas) + (r.reembolsos ? ` (−${r.reembolsos} reemb.)` : "")], ["Líquido", moeda(r.liquido)], ["Comissão a pagar", moeda(r.comissao)]] as const).map(([rot, v]) => (
                <div key={rot} className="rounded-xl bg-white/5 p-2.5 text-center"><p className="text-[11px] uppercase tracking-wide text-white/50">{rot}</p><p className="text-lg font-bold tabular-nums">{v}</p></div>
              ))}
            </div>
            {compra && <p className="mt-2 break-all text-[11px] text-white/45">O botão de compra do quiz vai para: <span className="font-mono text-white/70">{compra}</span> {/utm_content=aff_/.test(compra) ? <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-400" /> : <AlertTriangle className="inline h-3.5 w-3.5 text-amber-400" />}</p>}
            {vendasDele.length > 0 && (
              <>
                <button type="button" onClick={() => setAberto(aberto === a.id ? null : a.id)} className="mt-2 flex items-center gap-1 text-xs text-cyan-300 hover:underline"><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", aberto === a.id && "rotate-180")} />Ver as {vendasDele.length} vendas e como cada uma foi ligada</button>
                {aberto === a.id && <div className="mt-2 space-y-1.5">{vendasDele.map((x) => <LinhaVenda key={x.venda.transacao_id + x.venda.tipo} a={x} afiliados={afiliados} />)}</div>}
              </>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-white/40">A marca do afiliado vai na UTM (utm_content = aff_código) do link, da visita, do lead e do botão de compra. O crédito não depende do nome nem das outras UTM, então dois afiliados nunca se misturam. Reembolso desconta do afiliado da venda original.</p>
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
