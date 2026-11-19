import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronDown, Coins, Copy, ExternalLink, Handshake, Link2, Loader2, Pause, Play, ShoppingCart, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/DialogosGlobais";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { brl, codigoEmbaixador, conviteDoEmbaixador, linkDoEmbaixador, ORIGEM_PUBLICA, urlPublica } from "@/lib/embaixador";

const db = supabase as unknown as SupabaseClient;

interface Embaixador { id: string; nome: string; email: string; codigo: string; comissao_pct: number; ativo: boolean; convite: string | null; auth_user_id: string | null }
interface Resumo { embaixador_id: string; visitas: number; leads: number; vendas: number; bruto: number; reembolsado: number }
interface LinkLiberado { id: string; titulo: string; destino: string; ativo: boolean; embaixador_id: string | null }
interface LeadAdm { nome: string | null; email: string | null; whatsapp: string | null; criada_em: string; status: string }
interface VendaAdm { data: string; tipo: string; produto: string; comprador: string; valor: number; comissao: number }

const PERIODOS: [number, string][] = [[7, "7 dias"], [30, "30 dias"], [90, "90 dias"], [0, "Tudo"]];
const campo = "h-9 rounded-md border border-border bg-background px-3 text-sm";
const iniciais = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
const dia = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function Cartao({ icone: I, titulo, valor, nota }: { icone: typeof Users; titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><I className="h-3.5 w-3.5" />{titulo}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{valor}</div>
      {nota && <div className="mt-0.5 text-xs text-muted-foreground">{nota}</div>}
    </div>
  );
}

/** Escritório → Embaixadores: visão do administrador (19/11/2026). A área deles é /embaixador. */
export function EmbaixadoresProjeto({ clienteId }: { clienteId: string }) {
  const [lista, setLista] = useState<Embaixador[] | null>(null);
  const [resumo, setResumo] = useState<Map<string, Resumo>>(new Map());
  const [links, setLinks] = useState<LinkLiberado[]>([]);
  const [quizzes, setQuizzes] = useState<{ slug: string; titulo: string }[]>([]);
  const [dias, setDias] = useState(30);
  const [novoAberto, setNovoAberto] = useState(false);
  const [f, setF] = useState({ nome: "", email: "", comissao: "30" });
  const [l, setL] = useState({ titulo: "", destino: "", para: "" });
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [ficha, setFicha] = useState<{ leads: LeadAdm[]; vendas: VendaAdm[] } | null>(null);

  const carregar = useCallback(async () => {
    const [{ data: e }, { data: ls }, { data: qz }] = await Promise.all([
      db.from("embaixadores").select("id, nome, email, codigo, comissao_pct, ativo, convite, auth_user_id").eq("cliente_id", clienteId).order("criado_em"),
      db.from("embaixador_links").select("id, titulo, destino, ativo, embaixador_id").eq("cliente_id", clienteId).order("ordem").order("criado_em"),
      db.from("quizzes").select("slug, titulo").eq("cliente_id", clienteId).is("variante_de", null),
    ]);
    setLista(((e ?? []) as Embaixador[]).map((x) => ({ ...x, comissao_pct: Number(x.comissao_pct) })));
    setLinks((ls ?? []) as LinkLiberado[]);
    setQuizzes((qz ?? []) as { slug: string; titulo: string }[]);
  }, [clienteId]);
  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    let vivo = true;
    void db.rpc("embaixadores_resumo", { p_cliente: clienteId, p_dias: dias }).then(({ data }) => {
      if (vivo) setResumo(new Map(((data ?? []) as Resumo[]).map((r) => [r.embaixador_id, { ...r, visitas: Number(r.visitas), leads: Number(r.leads), vendas: Number(r.vendas), bruto: Number(r.bruto), reembolsado: Number(r.reembolsado) }])));
    });
    return () => { vivo = false; };
  }, [clienteId, dias, lista]);

  // ficha do embaixador aberto: leads (com contato, só o administrador vê) e vendas
  useEffect(() => {
    setFicha(null);
    const emb = lista?.find((x) => x.id === aberto);
    if (!emb) return;
    let vivo = true;
    void Promise.all([
      db.from("quiz_respostas").select("nome, email, whatsapp, criada_em, status").eq("cliente_id", clienteId).filter("utm->>utm_content", "eq", `aff_${emb.codigo}`).order("criada_em", { ascending: false }).limit(100),
      db.rpc("embaixador_vendas_admin", { p_embaixador: emb.id }),
    ]).then(([a, b]) => { if (vivo) setFicha({ leads: (a.data ?? []) as LeadAdm[], vendas: ((b.data ?? []) as VendaAdm[]).map((v) => ({ ...v, valor: Number(v.valor), comissao: Number(v.comissao) })) }); });
    return () => { vivo = false; };
  }, [aberto, clienteId, lista]);

  const totais = useMemo(() => {
    let leads = 0, vendas = 0, liquido = 0, comissao = 0;
    for (const x of lista ?? []) {
      const r = resumo.get(x.id); if (!r) continue;
      const liq = r.bruto - r.reembolsado;
      leads += r.leads; vendas += r.vendas; liquido += liq; comissao += (liq * x.comissao_pct) / 100;
    }
    return { leads, vendas, liquido, comissao, ativos: (lista ?? []).filter((x) => x.ativo).length };
  }, [lista, resumo]);

  async function cadastrar(ev: FormEvent) {
    ev.preventDefault();
    if (!codigoEmbaixador(f.nome)) { toast.error("Nome muito curto para gerar o código."); return; }
    setSalvando(true);
    let erro: { code?: string; message: string } | null = null;
    for (const sufixo of ["", "2", "3", String(Math.floor(Math.random() * 900 + 100))]) {
      const { error } = await db.from("embaixadores").insert({ cliente_id: clienteId, nome: f.nome.trim(), email: f.email.trim().toLowerCase(), codigo: codigoEmbaixador(f.nome, sufixo)!, comissao_pct: Number(f.comissao) || 0 });
      erro = error;
      if (!error || error.code !== "23505") break;   // 23505 = código já existe: tenta outro
    }
    setSalvando(false);
    if (erro) { toast.error(erro.message); return; }
    setF({ nome: "", email: "", comissao: f.comissao }); setNovoAberto(false);
    toast.success("Embaixador cadastrado. Abra a ficha dele e copie o convite.");
    void carregar();
  }
  const copiar = async (texto: string, aviso: string) => { await navigator.clipboard.writeText(texto); toast.success(aviso); };
  const alternar = async (x: Embaixador) => { await db.from("embaixadores").update({ ativo: !x.ativo }).eq("id", x.id); void carregar(); };
  async function remover(x: Embaixador) {
    if (!(await confirmar(`Remover ${x.nome}?`, { descricao: "Ele perde o acesso. As vendas e os leads continuam no sistema, mas deixam de aparecer para ele.", botao: "Remover" }))) return;
    await db.from("embaixadores").delete().eq("id", x.id); setAberto(null); void carregar();
  }
  async function novoLink(ev: FormEvent) {
    ev.preventDefault();
    const { error } = await db.from("embaixador_links").insert({ cliente_id: clienteId, titulo: l.titulo.trim(), destino: urlPublica(l.destino.trim()), embaixador_id: l.para || null, ordem: links.length });
    if (error) { toast.error(error.message.includes("check") ? "Use um endereço completo (https://…)." : error.message); return; }
    setL({ titulo: "", destino: "", para: "" }); void carregar();
  }

  if (!lista) return <div className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;
  const linksDele = (x: Embaixador) => links.filter((k) => k.ativo && (!k.embaixador_id || k.embaixador_id === x.id));

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold"><Handshake className="h-5 w-5" />Embaixadores</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">Cada embaixador entra pelo convite e vê só a área dele: vendas, leads (sem contato), quantas pessoas trouxe, esteira e os links que você liberar.</p>
          <button className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline" onClick={() => void copiar(`${ORIGEM_PUBLICA}/embaixador`, "Endereço de acesso copiado")}><ExternalLink className="h-3 w-3" />Copiar o endereço de acesso ({ORIGEM_PUBLICA.replace("https://", "")}/embaixador)</button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">{PERIODOS.map(([d, n]) => <button key={d} onClick={() => setDias(d)} className={cn("rounded-md px-2.5 py-1", dias === d ? "bg-background shadow-sm" : "text-muted-foreground")}>{n}</button>)}</div>
          <Button onClick={() => setNovoAberto((v) => !v)}><UserPlus className="mr-1.5 h-4 w-4" />Novo embaixador</Button>
        </div>
      </div>

      {novoAberto && (
        <form onSubmit={cadastrar} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
          <label className="space-y-1 text-xs text-muted-foreground">Nome<Input className="h-9 w-48" required autoFocus value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
          <label className="space-y-1 text-xs text-muted-foreground">E-mail (o do login dele)<Input className="h-9 w-60" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="space-y-1 text-xs text-muted-foreground">Comissão (%)<Input className="h-9 w-24" type="number" min={0} max={100} step="0.5" value={f.comissao} onChange={(e) => setF({ ...f, comissao: e.target.value })} /></label>
          <Button type="submit" disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cadastrar"}</Button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Cartao icone={Handshake} titulo="Embaixadores ativos" valor={String(totais.ativos)} nota={`${lista.length} cadastrados`} />
        <Cartao icone={Users} titulo="Leads trazidos" valor={String(totais.leads)} />
        <Cartao icone={ShoppingCart} titulo="Vendas" valor={String(totais.vendas)} />
        <Cartao icone={Coins} titulo="Receita líquida" valor={brl(totais.liquido)} />
        <Cartao icone={Coins} titulo="Comissão a pagar" valor={brl(totais.comissao)} nota="sobre o líquido" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {!lista.length ? (
          <div className="space-y-3 p-10 text-center">
            <Handshake className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhum embaixador ainda</p>
            <ol className="mx-auto max-w-sm space-y-1 text-left text-sm text-muted-foreground"><li>1. Clique em "Novo embaixador" e cadastre nome, e-mail e comissão.</li><li>2. Abra a ficha dele e copie o link de convite.</li><li>3. Libere os links (quiz, ofertas) lá embaixo.</li></ol>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>
              <th className="px-4 py-2 font-medium">Embaixador</th><th className="px-3 py-2 text-right font-medium">Visitas</th><th className="px-3 py-2 text-right font-medium">Leads</th><th className="px-3 py-2 text-right font-medium">Vendas</th>
              <th className="px-3 py-2 text-right font-medium">Líquido</th><th className="px-3 py-2 text-right font-medium">Comissão</th><th className="px-3 py-2 font-medium">Acesso</th><th className="w-8" /></tr></thead>
            <tbody>{lista.map((x) => {
              const r = resumo.get(x.id); const liq = r ? r.bruto - r.reembolsado : 0; const aberta = aberto === x.id;
              return (
                <Fragment key={x.id}>
                  <tr className={cn("cursor-pointer border-t border-border hover:bg-muted/30", !x.ativo && "opacity-60")} onClick={() => setAberto(aberta ? null : x.id)}>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{iniciais(x.nome)}</span><div><div className="font-medium">{x.nome}</div><div className="text-xs text-muted-foreground">{x.email} · {x.comissao_pct}%</div></div></div></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r?.visitas ?? "–"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r?.leads ?? "–"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r?.vendas ?? "–"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r ? brl(liq) : "–"}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{r ? brl((liq * x.comissao_pct) / 100) : "–"}</td>
                    <td className="px-3 py-2.5">
                      {!x.ativo ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Pausado</span>
                        : x.auth_user_id ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600">Conta criada</span>
                        : <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600">Convite pendente</span>}
                    </td>
                    <td className="pr-3"><ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", aberta && "rotate-180")} /></td>
                  </tr>
                  {aberta && (
                    <tr className="border-t border-border bg-muted/20"><td colSpan={8} className="space-y-5 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {!x.auth_user_id && x.convite && <Button size="sm" onClick={() => void copiar(conviteDoEmbaixador(ORIGEM_PUBLICA, x.convite!), "Convite copiado: mande para ele")}><Copy className="mr-1.5 h-4 w-4" />Copiar convite</Button>}
                        <Button size="sm" variant="outline" onClick={() => void alternar(x)}>{x.ativo ? <><Pause className="mr-1.5 h-4 w-4" />Pausar</> : <><Play className="mr-1.5 h-4 w-4" />Reativar</>}</Button>
                        <Button size="sm" variant="outline" onClick={() => void remover(x)}><Trash2 className="mr-1.5 h-4 w-4" />Remover</Button>
                        <span className="ml-auto font-mono text-xs text-muted-foreground">marca: aff_{x.codigo}</span>
                      </div>

                      <div>
                        <div className="mb-1.5 text-xs font-medium text-muted-foreground">Links dele (já com a marca)</div>
                        {!linksDele(x).length ? <p className="text-sm text-muted-foreground">Nenhum link liberado para ele ainda.</p> : <div className="space-y-1.5">{linksDele(x).map((k) => { const url = linkDoEmbaixador(k.destino, x.codigo); return (
                          <div key={k.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"><Link2 className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="shrink-0 font-medium">{k.titulo}</span><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{url}</span><Button size="sm" variant="ghost" onClick={() => void copiar(url, "Link copiado")}><Copy className="h-4 w-4" /></Button></div>
                        ); })}</div>}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Leads que trouxe {ficha ? `(${ficha.leads.length})` : ""}</div>
                          {!ficha ? <Loader2 className="h-4 w-4 animate-spin" /> : !ficha.leads.length ? <p className="text-sm text-muted-foreground">Ainda nenhum lead.</p> : (
                            <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-card"><table className="w-full text-xs"><tbody>{ficha.leads.map((ld, i) => <tr key={i} className="border-t border-border first:border-0"><td className="px-3 py-1.5"><div className="font-medium">{ld.nome || "Sem nome"}</div><div className="text-muted-foreground">{ld.email || ld.whatsapp || ""}</div></td><td className="px-3 py-1.5 text-right text-muted-foreground">{dia(ld.criada_em)}<div>{ld.status === "em_contato" ? "em contato" : "novo"}</div></td></tr>)}</tbody></table></div>
                          )}
                        </div>
                        <div>
                          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Vendas dele {ficha ? `(${ficha.vendas.length})` : ""}</div>
                          {!ficha ? <Loader2 className="h-4 w-4 animate-spin" /> : !ficha.vendas.length ? <p className="text-sm text-muted-foreground">Ainda nenhuma venda.</p> : (
                            <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-card"><table className="w-full text-xs"><tbody>{ficha.vendas.map((v, i) => <tr key={i} className="border-t border-border first:border-0"><td className="px-3 py-1.5"><div className="font-medium">{v.comprador}{v.tipo === "reembolso" && <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 text-destructive">reembolso</span>}</div><div className="text-muted-foreground">{v.produto} · {dia(v.data)}</div></td><td className="px-3 py-1.5 text-right tabular-nums"><div>{brl(v.valor)}</div><div className="text-muted-foreground">comissão {brl(v.comissao)}</div></td></tr>)}</tbody></table></div>
                          )}
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}</tbody>
          </table>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" />Links liberados</h3>
        <p className="text-xs text-muted-foreground">O embaixador recebe cada link já com a marca dele. Vale para o quiz, ofertas únicas ou qualquer página. Os endereços usam sempre o site publicado.</p>
        <form onSubmit={novoLink} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
          <label className="space-y-1 text-xs text-muted-foreground">Nome do link<Input className="h-9 w-44" required placeholder="Ex.: Quiz Instalivros" value={l.titulo} onChange={(e) => setL({ ...l, titulo: e.target.value })} /></label>
          <label className="space-y-1 text-xs text-muted-foreground">Endereço<Input className="h-9 w-72" required placeholder="https://…" value={l.destino} onChange={(e) => setL({ ...l, destino: e.target.value })} /></label>
          {!!quizzes.length && (
            <label className="space-y-1 text-xs text-muted-foreground">ou um quiz
              <select className={campo} value="" onChange={(e) => { const q = quizzes.find((z) => z.slug === e.target.value); if (q) setL({ ...l, titulo: l.titulo || q.titulo.split(" — ")[0], destino: `${ORIGEM_PUBLICA}/quiz/${q.slug}` }); }}>
                <option value="">Escolher…</option>{quizzes.map((q) => <option key={q.slug} value={q.slug}>{q.titulo}</option>)}
              </select>
            </label>
          )}
          <label className="space-y-1 text-xs text-muted-foreground">Para
            <select className={campo} value={l.para} onChange={(e) => setL({ ...l, para: e.target.value })}>
              <option value="">Todos os embaixadores</option>{lista.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </label>
          <Button type="submit">Liberar</Button>
        </form>
        {links.map((k) => (
          <div key={k.id} className={cn("flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm", !k.ativo && "opacity-60")}>
            <div className="min-w-0 flex-1"><div className="font-medium">{k.titulo}</div><div className="truncate text-xs text-muted-foreground">{urlPublica(k.destino)}</div></div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{k.embaixador_id ? lista.find((x) => x.id === k.embaixador_id)?.nome ?? "—" : "Todos"}</span>
            <Button variant="ghost" size="icon" title={k.ativo ? "Esconder" : "Mostrar"} onClick={() => void db.from("embaixador_links").update({ ativo: !k.ativo }).eq("id", k.id).then(carregar)}>{k.ativo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
            <Button variant="ghost" size="icon" title="Remover" onClick={() => void db.from("embaixador_links").delete().eq("id", k.id).then(carregar)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
