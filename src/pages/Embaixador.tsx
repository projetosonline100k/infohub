import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Copy, Link2, Loader2, LogOut, ShoppingCart, Users, UserCheck, Eye, Coins, Check, Megaphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { brl, linkDoEmbaixador } from "@/lib/embaixador";
import { agrupar, diasAtras, hojeLocal, type Modo } from "@/lib/embaixadorSerie";

const db = supabase as unknown as SupabaseClient;

interface Eu { nome: string; codigo: string; comissao_pct: number; projeto: string }
interface Painel { visitas: number; leads: number; vendas: number; bruto: number; reembolsado: number; comissao_pct: number; trouxe_total: number; postagens: number; dias: { dia: string; visitas: number; leads: number; vendas: number; receita: number; postagens: number }[] }
interface Lead { nome: string; etapa: string; em: string }
interface Venda { data: string; tipo: string; produto: string; comprador: string; valor: number; comissao: number }
interface Esteira { nome: string; produto: string; data: string; etapa: string }
interface Postagem { id: string; titulo: string; plataforma: string; link: string | null; status: string; postada_em: string }
type Metrica = "vendas" | "leads" | "receita" | "postagens";
const METRICAS: [Metrica, string][] = [["vendas", "Vendas"], ["leads", "Leads"], ["receita", "Receita"], ["postagens", "Postagens"]];
const MODOS: [Modo, string][] = [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]];
interface LinkE { id: string; titulo: string; destino: string; codigo: string }

const dia = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const dataHora = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
      <section className="relative w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">{children}</section>
    </div>
  );
}

/** Entrar com e-mail e senha (ou criar a conta, quando vem de um convite). */
function FormAcesso({ emailFixo, titulo, texto, permiteCriar, onEntrou }: { emailFixo?: string; titulo: string; texto: string; permiteCriar?: boolean; onEntrou: () => void | Promise<void> }) {
  const [modo, setModo] = useState<"entrar" | "criar">(permiteCriar ? "criar" : "entrar");
  const [email, setEmail] = useState(emailFixo ?? "");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro(""); setAviso("");
    if (modo === "criar" && senha.length < 6) { setErro("A senha precisa ter ao menos 6 caracteres."); return; }
    setEnviando(true);
    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) { setEnviando(false); setErro("E-mail ou senha incorretos."); return; }
    } else {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha });
      if (error) { setEnviando(false); setErro(error.message.includes("already registered") ? "Este e-mail já tem conta: use \"Entrar\"." : "Não foi possível criar a conta."); return; }
      if (!data.session) { setEnviando(false); setAviso("Confirme o e-mail que enviamos e depois volte a este link para entrar."); return; }
    }
    try { await onEntrou(); } finally { setEnviando(false); }
  }

  return (
    <Moldura>
      <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
      {permiteCriar && (
        <div className="mt-5 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
          {(["criar", "entrar"] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setModo(m); setErro(""); setAviso(""); }} className={cn("rounded-md py-1.5 font-medium", modo === m ? "bg-background shadow-sm" : "text-muted-foreground")}>
              {m === "criar" ? "Criar minha conta" : "Já tenho conta"}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={enviar} className="mt-5 space-y-4">
        <div className="space-y-1.5"><Label htmlFor="emb-email">E-mail</Label><Input id="emb-email" type="email" required value={email} readOnly={!!emailFixo} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="emb-senha">{modo === "criar" ? "Crie uma senha" : "Senha"}</Label><Input id="emb-senha" type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete={modo === "criar" ? "new-password" : "current-password"} /></div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}
        <Button type="submit" className="w-full" disabled={enviando}>{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : modo === "criar" ? "Criar conta e entrar" : "Entrar"}</Button>
      </form>
    </Moldura>
  );
}

/** /embaixador/convite/:token — a pessoa cria a conta com o e-mail do convite e cai direto na área dela. */
export function EmbaixadorConvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [info, setInfo] = useState<{ nome: string; email: string; projeto: string } | null | undefined>(undefined);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    void db.rpc("embaixador_convite_info", { p_token: token }).then(({ data }) => { if (vivo) setInfo((data as typeof info) ?? null); });
    return () => { vivo = false; };
  }, [token]);

  const aceitar = useCallback(async () => {
    const { error } = await db.rpc("embaixador_aceitar_convite", { p_token: token });
    if (error) { setErro(error.message); return; }
    navigate("/embaixador", { replace: true });
  }, [token, navigate]);

  if (info === undefined) return <Moldura><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Moldura>;
  if (!info) return <Moldura><h1 className="text-xl font-bold">Convite não encontrado</h1><p className="mt-2 text-sm text-muted-foreground">Ele já foi usado ou foi cancelado. Se já criou sua conta, <Link className="underline" to="/embaixador">entre aqui</Link>.</p></Moldura>;
  if (session) {
    return (
      <Moldura>
        <h1 className="text-xl font-bold">Olá, {info.nome.split(" ")[0]}!</h1>
        <p className="mt-2 text-sm text-muted-foreground">Você já está com uma conta aberta. Vincule o convite a ela para entrar na área de embaixadores de {info.projeto}.</p>
        {erro && <p className="mt-3 text-sm text-destructive">{erro}</p>}
        <Button className="mt-5 w-full" onClick={() => void aceitar()}>Ativar meu acesso</Button>
        <button className="mt-3 w-full text-xs text-muted-foreground underline" onClick={() => void supabase.auth.signOut()}>Usar outro e-mail</button>
      </Moldura>
    );
  }
  return <FormAcesso emailFixo={info.email} permiteCriar titulo={`Olá, ${info.nome.split(" ")[0]}!`} texto={`Você foi convidado(a) para ser embaixador(a) de ${info.projeto}. Crie sua senha para entrar na sua área.`} onEntrou={aceitar} />;
}

const ABAS = [["resumo", "Resumo"], ["postagens", "Postagens"], ["leads", "Leads"], ["vendas", "Vendas"], ["esteira", "Esteira"], ["links", "Links"]] as const;

/** /embaixador — login e a área do embaixador. */
export default function Embaixador() {
  const { session, loading } = useAuth();
  const [eu, setEu] = useState<Eu | null | undefined>(undefined);

  const carregar = useCallback(async () => {
    const { data } = await db.rpc("embaixador_eu");
    setEu((data as Eu | null) ?? null);
  }, []);
  useEffect(() => { if (session) void carregar(); else setEu(undefined); }, [session, carregar]);

  if (loading) return <div className="min-h-screen bg-background" />;
  if (!session) return <FormAcesso titulo="Área do embaixador" texto="Entre com o e-mail e a senha que você criou pelo convite." onEntrou={carregar} />;
  if (eu === undefined) return <Moldura><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Moldura>;
  if (!eu) return <Moldura><h1 className="text-xl font-bold">Esta conta não é de embaixador</h1><p className="mt-2 text-sm text-muted-foreground">Use o link de convite que você recebeu para ativar seu acesso.</p><Button variant="outline" className="mt-5 w-full" onClick={() => void supabase.auth.signOut()}>Sair</Button></Moldura>;
  return <AreaEmbaixador eu={eu} />;
}

/** Visão do administrador: carrega e mostra a área de um embaixador (só leitura). */
export function PreviaEmbaixador({ id, onFechar }: { id: string; onFechar: () => void }) {
  const [eu, setEu] = useState<Eu | null | undefined>(undefined);
  useEffect(() => { void db.rpc("embaixador_eu", { p_embaixador: id }).then(({ data }) => setEu((data as Eu | null) ?? null)); }, [id]);
  if (eu === undefined) return <div className="fixed inset-0 z-50 grid place-items-center bg-background"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!eu) return <div className="fixed inset-0 z-50 grid place-items-center bg-background text-sm"><div className="text-center">Não consegui abrir (embaixador pausado?).<div className="mt-3"><Button variant="outline" onClick={onFechar}>Fechar</Button></div></div></div>;
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-background"><AreaEmbaixador eu={eu} previaId={id} onFechar={onFechar} /></div>;
}

function Cartao({ icone: I, titulo, valor, nota }: { icone: typeof Users; titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><I className="h-3.5 w-3.5" />{titulo}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{valor}</div>
      {nota && <div className="mt-0.5 text-xs text-muted-foreground">{nota}</div>}
    </div>
  );
}

function Vazio({ texto }: { texto: string }) { return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{texto}</p>; }

/** previaId: o administrador vendo a área de um embaixador (só leitura, sem registrar nada). */
export function AreaEmbaixador({ eu, previaId, onFechar }: { eu: Eu; previaId?: string; onFechar?: () => void }) {
  const alvo = useMemo(() => (previaId ? { p_embaixador: previaId } : {}), [previaId]);
  const [aba, setAba] = useState<(typeof ABAS)[number][0]>("resumo");
  const [dias, setDias] = useState(30);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [vendas, setVendas] = useState<Venda[] | null>(null);
  const [esteira, setEsteira] = useState<Esteira[] | null>(null);
  const [links, setLinks] = useState<LinkE[] | null>(null);
  const [posts, setPosts] = useState<Postagem[] | null>(null);
  const [metrica, setMetrica] = useState<Metrica>("vendas");
  const [modo, setModo] = useState<Modo>("dia");
  const [np, setNp] = useState({ titulo: "", plataforma: "instagram", link: "", quando: "" });
  const [salvandoPost, setSalvandoPost] = useState(false);
  const [copiado, setCopiado] = useState("");

  useEffect(() => { setPainel(null); void db.rpc("embaixador_painel", { p_dias: dias, ...alvo }).then(({ data }) => setPainel(data as Painel)); }, [dias, alvo]);
  useEffect(() => {
    if (aba === "postagens" && !posts) void db.rpc("embaixador_postagens_minhas", alvo).then(({ data }) => setPosts((data ?? []) as Postagem[]));
    if (aba === "leads" && !leads) void db.rpc("embaixador_leads", alvo).then(({ data }) => setLeads((data ?? []) as Lead[]));
    if (aba === "vendas" && !vendas) void db.rpc("embaixador_vendas", alvo).then(({ data }) => setVendas((data ?? []) as Venda[]));
    if (aba === "esteira" && !esteira) void db.rpc("embaixador_esteira", alvo).then(({ data }) => setEsteira((data ?? []) as Esteira[]));
    if (aba === "links" && !links) void db.rpc("embaixador_links_meus", alvo).then(({ data }) => setLinks((data ?? []) as LinkE[]));
  }, [aba, leads, vendas, esteira, links, posts, alvo]);

  const liquido = painel ? painel.bruto - painel.reembolsado : 0;
  const serie = useMemo(() => agrupar((painel?.dias ?? []).map((d) => ({ ...d, dia: d.dia.slice(0, 10) })) as never, modo, [metrica], diasAtras(dias - 1), hojeLocal()), [painel, modo, metrica, dias]);
  const postsSemana = useMemo(() => { const lim = new Date(); lim.setDate(lim.getDate() - ((lim.getDay() + 6) % 7)); lim.setHours(0, 0, 0, 0); return (posts ?? []).filter((x) => x.status === "postada" && new Date(x.postada_em) >= lim).length; }, [posts]);
  const postsMes = useMemo(() => { const m = hojeLocal().slice(0, 7); return (posts ?? []).filter((x) => x.status === "postada" && new Date(x.postada_em).toLocaleDateString("sv-SE").startsWith(m)).length; }, [posts]);
  async function registrarPost(e: FormEvent) {
    e.preventDefault(); setSalvandoPost(true);
    const { error } = await db.rpc("embaixador_postagem_registrar", { p_titulo: np.titulo, p_plataforma: np.plataforma, p_link: np.link || null, p_quando: np.quando ? new Date(np.quando).toISOString() : new Date().toISOString() });
    setSalvandoPost(false);
    if (error) { toast.error(error.message.includes("check") ? "Confira o link (https://…) e o título." : error.message); return; }
    setNp({ titulo: "", plataforma: np.plataforma, link: "", quando: "" }); setPosts(null); void db.rpc("embaixador_painel", { p_dias: dias, ...alvo }).then(({ data }) => setPainel(data as Painel)); toast.success("Postagem registrada");
  }
  const apagarPost = async (id: string) => { await db.rpc("embaixador_postagem_apagar", { p_id: id }); setPosts(null); void db.rpc("embaixador_painel", { p_dias: dias, ...alvo }).then(({ data }) => setPainel(data as Painel)); };
  const copiar = async (id: string, url: string) => { await navigator.clipboard.writeText(url); setCopiado(id); toast.success("Link copiado"); setTimeout(() => setCopiado(""), 1500); };

  return (
    <div className="min-h-screen bg-background">
      {previaId && <div className="bg-amber-500/15 px-4 py-2 text-center text-xs text-amber-700 dark:text-amber-400">Visão do administrador: é exatamente o que {eu.nome} vê (somente leitura).</div>}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div><div className="text-xs text-muted-foreground">Embaixador · {eu.projeto}</div><div className="text-lg font-semibold">{eu.nome}</div></div>
          {previaId ? <Button variant="outline" size="sm" onClick={onFechar}>Fechar visão</Button> : <Button variant="ghost" size="sm" onClick={() => void supabase.auth.signOut()}><LogOut className="mr-1.5 h-4 w-4" />Sair</Button>}
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
          {ABAS.map(([id, nome]) => <button key={id} onClick={() => setAba(id)} className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm", aba === id ? "border-primary font-medium" : "border-transparent text-muted-foreground")}>{nome}</button>)}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        {aba === "resumo" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">Seus números</h2>
              <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">{[[7, "7 dias"], [30, "30 dias"], [90, "90 dias"], [365, "1 ano"]].map(([d, n]) => <button key={d} onClick={() => setDias(d as number)} className={cn("rounded-md px-2.5 py-1", dias === d ? "bg-background shadow-sm" : "text-muted-foreground")}>{n}</button>)}</div>
            </div>
            {!painel ? <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                  <Cartao icone={Users} titulo="Pessoas que trouxe" valor={String(painel.trouxe_total)} nota="desde o começo" />
                  <Cartao icone={Eye} titulo="Visitas" valor={String(painel.visitas)} nota={`últimos ${dias} dias`} />
                  <Cartao icone={UserCheck} titulo="Leads" valor={String(painel.leads)} nota={`últimos ${dias} dias`} />
                  <Cartao icone={Megaphone} titulo="Postagens" valor={String(painel.postagens)} nota={`últimos ${dias} dias`} />
                  <Cartao icone={ShoppingCart} titulo="Vendas" valor={String(painel.vendas)} nota={brl(liquido) + " líquido"} />
                  <Cartao icone={Coins} titulo="Sua comissão" valor={brl((liquido * painel.comissao_pct) / 100)} nota={`${painel.comissao_pct}% do líquido`} />
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium">Evolução</div>
                    <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">{METRICAS.map(([m, n]) => <button key={m} onClick={() => setMetrica(m)} className={cn("rounded-md px-2.5 py-1", metrica === m ? "bg-background shadow-sm" : "text-muted-foreground")}>{n}</button>)}</div>
                    <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">{MODOS.map(([m, n]) => <button key={m} onClick={() => setModo(m)} className={cn("rounded-md px-2.5 py-1", modo === m ? "bg-background shadow-sm" : "text-muted-foreground")}>{n}</button>)}</div>
                  </div>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={serie} margin={{ left: -20, right: 8, top: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => [metrica === "receita" ? brl(v) : v, METRICAS.find(([m]) => m === metrica)?.[1] ?? ""]} labelFormatter={(r) => `${modo === "semana" ? "Semana de " : ""}${r}`} />
                        <Bar dataKey={metrica} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {aba === "postagens" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Cartao icone={Megaphone} titulo="Postagens na semana" valor={String(postsSemana)} nota="desde segunda-feira" />
              <Cartao icone={Megaphone} titulo="Postagens no mês" valor={String(postsMes)} />
              <Cartao icone={Megaphone} titulo="Total registrado" valor={String((posts ?? []).filter((x) => x.status === "postada").length)} />
            </div>
            {!previaId && <form onSubmit={registrarPost} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
              <label className="space-y-1 text-xs text-muted-foreground">O que você postou<Input className="h-9 w-56" required placeholder="Ex.: Reel dos 3 livros" value={np.titulo} onChange={(e) => setNp({ ...np, titulo: e.target.value })} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Onde
                <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={np.plataforma} onChange={(e) => setNp({ ...np, plataforma: e.target.value })}><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="youtube">YouTube</option><option value="outra">Outra</option></select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">Link (opcional)<Input className="h-9 w-56" placeholder="https://…" value={np.link} onChange={(e) => setNp({ ...np, link: e.target.value })} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Quando (vazio = agora)<Input className="h-9 w-48" type="datetime-local" value={np.quando} onChange={(e) => setNp({ ...np, quando: e.target.value })} /></label>
              <Button type="submit" disabled={salvandoPost}>{salvandoPost ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar"}</Button>
            </form>}
            {!posts ? <Carregar /> : !posts.length ? <Vazio texto="Registre aqui cada conteúdo que você postar: a contagem da semana e do mês fica por conta do sistema." /> : (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <table className="w-full text-sm"><tbody>{posts.map((x) => (
                  <tr key={x.id} className="border-t border-border first:border-0">
                    <td className="px-4 py-2.5"><div className="font-medium">{x.titulo}</div><div className="text-xs text-muted-foreground">{x.plataforma}{x.link && <> · <a className="underline" href={x.link} target="_blank" rel="noreferrer">abrir</a></>}</div></td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{dataHora(x.postada_em)}<div>{x.status === "programada" ? "programada" : "postada"}</div></td>
                    <td className="w-10 pr-3 text-right">{!previaId && <button title="Apagar" className="text-muted-foreground hover:text-destructive" onClick={() => void apagarPost(x.id)}><Trash2 className="h-4 w-4" /></button>}</td>
                  </tr>))}</tbody></table>
              </div>
            )}
          </div>
        )}

        {aba === "leads" && (!leads ? <Carregar /> : !leads.length ? <Vazio texto="Quando alguém entrar pelo seu link e se cadastrar, aparece aqui." /> : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Nome</th><th className="px-4 py-2 font-medium">Etapa</th><th className="px-4 py-2 font-medium">Chegou em</th></tr></thead>
              <tbody>{leads.map((l, i) => <tr key={i} className="border-t border-border"><td className="px-4 py-2">{l.nome}</td><td className="px-4 py-2"><span className={cn("rounded-full px-2 py-0.5 text-xs", l.etapa === "Comprou" ? "bg-emerald-500/15 text-emerald-600" : "bg-muted")}>{l.etapa}</span></td><td className="px-4 py-2 text-muted-foreground">{dataHora(l.em)}</td></tr>)}</tbody></table>
          </div>
        ))}

        {aba === "vendas" && (!vendas ? <Carregar /> : !vendas.length ? <Vazio texto="Suas vendas aparecem aqui assim que a primeira acontecer." /> : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Data</th><th className="px-4 py-2 font-medium">Cliente</th><th className="px-4 py-2 font-medium">Produto</th><th className="px-4 py-2 text-right font-medium">Valor</th><th className="px-4 py-2 text-right font-medium">Sua comissão</th></tr></thead>
              <tbody>{vendas.map((v, i) => <tr key={i} className="border-t border-border"><td className="px-4 py-2 text-muted-foreground">{dia(v.data)}</td><td className="px-4 py-2">{v.comprador}{v.tipo === "reembolso" && <span className="ml-2 rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">reembolso</span>}</td><td className="px-4 py-2">{v.produto}</td><td className="px-4 py-2 text-right tabular-nums">{brl(v.valor)}</td><td className="px-4 py-2 text-right tabular-nums">{brl(v.comissao)}</td></tr>)}</tbody></table>
          </div>
        ))}

        {aba === "esteira" && (!esteira ? <Carregar /> : !esteira.length ? <Vazio texto="Quem fechar pelo seu link entra na esteira e você acompanha por aqui." /> : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Cliente</th><th className="px-4 py-2 font-medium">Produto</th><th className="px-4 py-2 font-medium">Fechou em</th><th className="px-4 py-2 font-medium">Etapa</th></tr></thead>
              <tbody>{esteira.map((x, i) => <tr key={i} className="border-t border-border"><td className="px-4 py-2">{x.nome}</td><td className="px-4 py-2">{x.produto}</td><td className="px-4 py-2 text-muted-foreground">{dia(x.data)}</td><td className="px-4 py-2"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{x.etapa}</span></td></tr>)}</tbody></table>
          </div>
        ))}

        {aba === "links" && (!links ? <Carregar /> : !links.length ? <Vazio texto="Seus links ainda não foram liberados." /> : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Divulgue só estes links: cada um já leva a sua marca, e é assim que as visitas, os leads e as vendas ficam no seu nome.</p>
            {links.map((l) => { const url = linkDoEmbaixador(l.destino, l.codigo); return (
              <div key={l.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{l.titulo}</div><div className="truncate text-xs text-muted-foreground">{url}</div></div>
                <Button size="sm" variant="outline" onClick={() => void copiar(l.id, url)}>{copiado === l.id ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}Copiar</Button>
              </div>
            ); })}
          </div>
        ))}
      </main>
    </div>
  );
}
const Carregar = () => <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;
