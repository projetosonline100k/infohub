import { FormEvent, Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BookOpen, ExternalLink, Play, X, Copy, Link2, Loader2, LogOut, ShoppingCart, Users, UserCheck, Eye, Coins, Check, Megaphone, Trash2, Rocket, Trophy, Target, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { brl, driveEmbed, linkDoEmbaixador } from "@/lib/embaixador";
import { LeitorBloco, SECOES, type Secao } from "@/components/embaixador/BlocosEmbaixador";
import { agrupar, diasAtras, hojeLocal, type Modo } from "@/lib/embaixadorSerie";

const ManyHub = lazy(() => import("@/pages/Automacoes"));
const db = supabase as unknown as SupabaseClient;

interface Eu { nome: string; codigo: string; comissao_pct: number; projeto: string }
interface Painel { visitas: number; leads: number; vendas: number; bruto: number; reembolsado: number; comissao_pct: number; trouxe_total: number; postagens: number; dias: { dia: string; visitas: number; leads: number; vendas: number; receita: number; postagens: number }[] }
interface Lead { nome: string; etapa: string; em: string }
interface Venda { data: string; tipo: string; produto: string; comprador: string; valor: number; comissao: number }
interface Esteira { nome: string; produto: string; data: string; etapa: string }
interface Postagem { id: string; titulo: string; plataforma: string; link: string | null; status: string; postada_em: string }
type Metrica = "vendas" | "leads" | "receita" | "postagens";
const METRICAS: [Metrica, string][] = [["vendas", "Vendas"]];
const MODOS: [Modo, string][] = [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]];
interface Aula { id: string; modulo: string; titulo: string; descricao: string | null; url: string; criado_em: string }
interface BlocoE { id: string; titulo: string; conteudo: string; ordem: number }
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

const ABAS = [["resumo", "Resumo"], ["vendas", "Vendas"], ["esteira", "Esteira"], ["aulas", "Aulas"], ["links", "Links"], ["creator", "Creator"], ["manyhub", "Many Hub"]] as const;

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

const TONS = { azul: "bg-blue-500/12 text-blue-600", verde: "bg-emerald-500/12 text-emerald-600", roxo: "bg-violet-500/12 text-violet-600", ambar: "bg-amber-500/15 text-amber-600", rosa: "bg-pink-500/12 text-pink-600", cinza: "bg-muted text-muted-foreground" } as const;
function Cartao({ icone: I, titulo, valor, nota, tom = "cinza" }: { icone: typeof Users; titulo: string; valor: string; nota?: string; tom?: keyof typeof TONS }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2.5 text-xs font-medium text-muted-foreground"><span className={cn("grid h-8 w-8 place-items-center rounded-xl", TONS[tom])}><I className="h-4 w-4" /></span>{titulo}</div>
      <div className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">{valor}</div>
      {nota && <div className="mt-0.5 text-xs text-muted-foreground">{nota}</div>}
    </div>
  );
}

const FUNDOS = {
  verde: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-emerald-500/5",
  azul: "border-sky-200/70 bg-gradient-to-br from-sky-50 to-blue-100/50 dark:border-sky-500/20 dark:from-sky-500/10 dark:to-blue-500/5",
  roxo: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-purple-100/50 dark:border-violet-500/20 dark:from-violet-500/10 dark:to-purple-500/5",
} as const;
function Destaque({ icone: I, titulo, valor, nota, tom }: { icone: typeof Users; titulo: string; valor: string; nota?: string; tom: keyof typeof FUNDOS }) {
  const t = tom === "verde" ? TONS.verde : tom === "azul" ? TONS.azul : TONS.roxo;
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border p-5 shadow-sm", FUNDOS[tom])}>
      <div className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-current opacity-[0.06]" />
      <div className="relative flex items-start gap-4">
        <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl", t)}><I className="h-7 w-7" /></span>
        <div className="min-w-0"><div className="text-base font-semibold leading-tight">{titulo}</div>{nota && <div className="text-sm text-muted-foreground">{nota}</div>}<div className="mt-1 text-4xl font-bold tabular-nums tracking-tight">{valor}</div></div>
      </div>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) { return <p className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">{texto}</p>; }

/** previaId: o administrador vendo a área de um embaixador (só leitura, sem registrar nada). */
export function AreaEmbaixador({ eu, previaId, onFechar }: { eu: Eu; previaId?: string; onFechar?: () => void }) {
  const alvo = useMemo(() => (previaId ? { p_embaixador: previaId } : {}), [previaId]);
  const [aba, setAba] = useState<(typeof ABAS)[number][0]>("resumo");
  const dias = 30;
  const [painel, setPainel] = useState<Painel | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [vendas, setVendas] = useState<Venda[] | null>(null);
  const [esteira, setEsteira] = useState<Esteira[] | null>(null);
  const [links, setLinks] = useState<LinkE[] | null>(null);
  const [posts, setPosts] = useState<Postagem[] | null>(null);
  const [aulas, setAulas] = useState<Aula[] | null>(null);
  const [aulaAberta, setAulaAberta] = useState<Aula | null>(null);
  const [blocos, setBlocos] = useState<Record<string, BlocoE[]>>({});
  const [blocoAberto, setBlocoAberto] = useState<BlocoE | null>(null);
  const [mes, setMes] = useState<Painel | null>(null);
  const [metrica, setMetrica] = useState<Metrica>("vendas");
  const [modo, setModo] = useState<Modo>("dia");
  const [np, setNp] = useState({ titulo: "", plataforma: "instagram", link: "", quando: "" });
  const [salvandoPost, setSalvandoPost] = useState(false);
  const [copiado, setCopiado] = useState("");

  useEffect(() => { setPainel(null); void db.rpc("embaixador_painel", { p_dias: dias, ...alvo }).then(({ data }) => setPainel(data as Painel)); }, [dias, alvo]);
  useEffect(() => {
    if (aba === "esteira" && !leads) void db.rpc("embaixador_leads", alvo).then(({ data }) => setLeads((data ?? []) as Lead[]));
    if (aba === "vendas" && !vendas) void db.rpc("embaixador_vendas", alvo).then(({ data }) => setVendas((data ?? []) as Venda[]));
    if (aba === "esteira" && !esteira) void db.rpc("embaixador_esteira", alvo).then(({ data }) => setEsteira((data ?? []) as Esteira[]));
    if ((aba === "creator") && !blocos[aba]) void db.rpc("embaixador_blocos_minhas", { p_secao: aba, ...alvo }).then(({ data }) => setBlocos((b) => ({ ...b, [aba]: (data ?? []) as BlocoE[] })));
    if (aba === "aulas" && !aulas) void db.rpc("embaixador_aulas_minhas", alvo).then(({ data }) => setAulas((data ?? []) as Aula[]));
  }, [aba, leads, vendas, esteira, posts, aulas, blocos, alvo]);

  useEffect(() => { void db.rpc("embaixador_links_meus", alvo).then(({ data }) => setLinks((data ?? []) as LinkE[])); }, [alvo]);
  useEffect(() => { void db.rpc("embaixador_painel", { p_dias: 365, ...alvo }).then(({ data }) => setMes(data as Painel)); }, [alvo]);
  const doMes = useMemo(() => { const m = hojeLocal().slice(0, 7); const ds = (mes?.dias ?? []).filter((d) => d.dia.slice(0, 7) === m); return { leads: ds.reduce((a, d) => a + d.leads, 0), vendas: ds.reduce((a, d) => a + d.vendas, 0), receita: ds.reduce((a, d) => a + d.receita, 0), posts: ds.reduce((a, d) => a + d.postagens, 0) }; }, [mes]);
  const modulos = useMemo(() => { const m = new Map<string, Aula[]>(); (aulas ?? []).forEach((a) => m.set(a.modulo, [...(m.get(a.modulo) ?? []), a])); return [...m.entries()]; }, [aulas]);
  const liquido = painel ? painel.bruto - painel.reembolsado : 0;
  const serie = useMemo(() => agrupar((mes?.dias ?? []).map((d) => ({ ...d, dia: d.dia.slice(0, 10) })) as never, modo, [metrica], diasAtras(modo === "dia" ? 29 : modo === "semana" ? 83 : 364), hojeLocal()), [mes, modo, metrica]);
  const totalVendas = useMemo(() => (mes?.dias ?? []).reduce((a, d) => a + d.vendas, 0), [mes]);
  const totalLeads = Math.max(mes?.trouxe_total ?? 0, painel?.trouxe_total ?? 0);
  const comissaoMes = (doMes.receita * (mes?.comissao_pct ?? eu.comissao_pct)) / 100;
  const meuLink = links?.[0] ? linkDoEmbaixador(links[0].destino, links[0].codigo) : null;
  const etapas = [
    { ok: totalVendas >= 1, rotulo: "1ª venda", icone: ShoppingCart },
    { ok: totalVendas >= 5, rotulo: "5 vendas", icone: Star },
  ];
  const feitos = etapas.filter((e) => e.ok).length;
  const preenchido = feitos >= etapas.length ? 100 : feitos === 0 ? 0 : Math.min(totalVendas / 5, 0.95) * 100;
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
    <div className="min-h-screen bg-muted/30">
      {previaId && <div className="bg-amber-500/15 px-4 py-2 text-center text-xs text-amber-700 dark:text-amber-400">Visão do administrador: é exatamente o que {eu.nome} vê (somente leitura).</div>}
      <header className="bg-gradient-to-br from-[#12103a] via-[#1d1459] to-[#4c1d95] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pb-5 pt-6">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 text-lg font-semibold">{eu.nome.slice(0, 1).toUpperCase()}</div>
            <div><div className="text-xs uppercase tracking-wider text-white/60">Embaixador · {eu.projeto}</div><div className="text-xl font-semibold">Olá, {eu.nome.split(" ")[0]}</div></div>
          </div>
          {previaId ? <Button variant="secondary" size="sm" onClick={onFechar}>Fechar visão</Button> : <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" onClick={() => void supabase.auth.signOut()}><LogOut className="mr-1.5 h-4 w-4" />Sair</Button>}
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-3">
          {ABAS.map(([id, nome]) => <button key={id} onClick={() => { setAba(id); setBlocoAberto(null); }} className={cn("whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors", aba === id ? "bg-white font-medium text-slate-900" : "text-white/70 hover:bg-white/10")}>{nome}</button>)}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        {aba === "resumo" && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Destaque tom="verde" icone={Coins} titulo="Sua comissão" valor={brl(comissaoMes)} />
              <Destaque tom="roxo" icone={ShoppingCart} titulo="Vendas do mês" valor={String(doMes.vendas)} />
            </div>

            <div className="grid gap-4">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500/15 text-amber-500"><Trophy className="h-6 w-6" /></span>
                    <div><div className="text-lg font-semibold leading-tight">Sua jornada</div><div className="text-sm text-muted-foreground">Evolua nas indicações e conquiste suas primeiras vendas.</div></div>
                  </div>
                  {feitos < etapas.length && <span className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-600 sm:flex"><Target className="h-3.5 w-3.5" />Próxima meta</span>}
                </div>
                <div className="relative mt-6 grid grid-cols-2">
                  <div className="absolute left-[25%] right-[25%] top-5 h-1 rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${preenchido}%` }} /></div>
                  {etapas.map((e, i) => { const atual = !e.ok && i === feitos; const I = e.icone; return (
                    <div key={i} className="relative flex flex-col items-center gap-2 text-center">
                      <span className={cn("grid h-10 w-10 place-items-center rounded-full border-2 bg-card", e.ok ? "border-emerald-500 bg-emerald-500 text-white" : atual ? "border-violet-500 text-violet-600" : "border-border text-muted-foreground")}>{e.ok ? <Check className="h-5 w-5" /> : <I className="h-4 w-4" />}</span>
                      <span className={cn("rounded-full px-3 py-1 text-xs font-medium", e.ok ? "bg-emerald-500/15 text-emerald-600" : atual ? "bg-violet-500/15 text-violet-600" : "bg-muted text-muted-foreground")}>{e.rotulo}</span>
                    </div>
                  ); })}
                </div>
              </div>
            </div>

            {!painel ? <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <Cartao tom="cinza" icone={Eye} titulo="Visitas" valor={String(painel.visitas)} nota="Últimos 30 dias" />
                  <Cartao tom="roxo" icone={ShoppingCart} titulo="Vendas" valor={String(painel.vendas)} nota={`${brl(liquido)} líquido`} />
                  <Cartao tom="verde" icone={Coins} titulo="Faturamento do mês" valor={brl(doMes.receita)} nota="Vendas pelo seu link" />
                </div>
              </>
            )}

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-lg font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg text-violet-600"><Rocket className="h-5 w-5" /></span>Evolução dos resultados</div>
                                <div className="ml-auto flex gap-1 rounded-full bg-muted p-1 text-xs">{MODOS.map(([m, n]) => <button key={m} onClick={() => setModo(m)} className={cn("rounded-full px-3.5 py-1.5 font-medium", modo === m ? "bg-violet-600 text-white" : "text-muted-foreground")}>{n}</button>)}</div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serie} margin={{ left: -20, right: 8, top: 8 }}>
                    <defs><linearGradient id="emb-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.03} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [metrica === "receita" ? brl(v) : v, METRICAS.find(([m]) => m === metrica)?.[1] ?? ""]} labelFormatter={(r) => `${modo === "semana" ? "Semana de " : ""}${r}`} />
                    <Area type="monotone" dataKey={metrica} stroke="#7c3aed" strokeWidth={2} fill="url(#emb-area)" dot={{ r: 2.5, fill: "#7c3aed", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {aba === "vendas" && (!vendas ? <Carregar /> : !vendas.length ? <Vazio texto="Suas vendas aparecem aqui assim que a primeira acontecer." /> : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Data</th><th className="px-4 py-2 font-medium">Cliente</th><th className="px-4 py-2 font-medium">Produto</th><th className="px-4 py-2 text-right font-medium">Valor</th><th className="px-4 py-2 text-right font-medium">Sua comissão</th></tr></thead>
              <tbody>{vendas.map((v, i) => <tr key={i} className="border-t border-border"><td className="px-4 py-2 text-muted-foreground">{dia(v.data)}</td><td className="px-4 py-2">{v.comprador}{v.tipo === "reembolso" && <span className="ml-2 rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">reembolso</span>}</td><td className="px-4 py-2">{v.produto}</td><td className="px-4 py-2 text-right tabular-nums">{brl(v.valor)}</td><td className="px-4 py-2 text-right tabular-nums">{brl(v.comissao)}</td></tr>)}</tbody></table>
          </div>
        ))}

        {aba === "esteira" && (!esteira || !leads ? <Carregar /> : (
          <div className="space-y-6">
            <section>
              <h3 className="mb-2 text-sm font-semibold">Leads <span className="font-normal text-muted-foreground">· {leads.length}</span></h3>
              {!leads.length ? <Vazio texto="Quando alguém entrar pelo seu link e se cadastrar, aparece aqui." /> : (
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Nome</th><th className="px-4 py-2 font-medium">Etapa</th><th className="px-4 py-2 font-medium">Chegou em</th></tr></thead>
                    <tbody>{leads.map((l, i) => <tr key={i} className="border-t border-border"><td className="px-4 py-2">{l.nome}</td><td className="px-4 py-2"><span className={cn("rounded-full px-2 py-0.5 text-xs", l.etapa === "Comprou" ? "bg-emerald-500/15 text-emerald-600" : "bg-muted")}>{l.etapa}</span></td><td className="px-4 py-2 text-muted-foreground">{dataHora(l.em)}</td></tr>)}</tbody></table>
                </div>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Clientes que fecharam <span className="font-normal text-muted-foreground">· {esteira.length}</span></h3>
              {!esteira.length ? <Vazio texto="Quem fechar pelo seu link entra na esteira e você acompanha por aqui." /> : (
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Cliente</th><th className="px-4 py-2 font-medium">Produto</th><th className="px-4 py-2 font-medium">Fechou em</th><th className="px-4 py-2 font-medium">Etapa</th></tr></thead>
                    <tbody>{esteira.map((x, i) => <tr key={i} className="border-t border-border"><td className="px-4 py-2">{x.nome}</td><td className="px-4 py-2">{x.produto}</td><td className="px-4 py-2 text-muted-foreground">{dia(x.data)}</td><td className="px-4 py-2"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{x.etapa}</span></td></tr>)}</tbody></table>
                </div>
              )}
            </section>
          </div>
        ))}

        {aba === "aulas" && (!aulas ? <Carregar /> : !aulas.length ? <Vazio texto="As aulas ainda não foram liberadas. Quando chegarem, aparecem aqui." /> : (
          <div className="space-y-6">
            {aulaAberta && (
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><div className="min-w-0"><div className="truncate font-medium">{aulaAberta.titulo}</div>{aulaAberta.descricao && <div className="text-xs text-muted-foreground">{aulaAberta.descricao}</div>}</div>
                  <div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" asChild><a href={aulaAberta.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />Abrir no Drive</a></Button><Button size="sm" variant="ghost" onClick={() => setAulaAberta(null)}><X className="h-4 w-4" /></Button></div></div>
                {driveEmbed(aulaAberta.url) ? <iframe title={aulaAberta.titulo} src={driveEmbed(aulaAberta.url)!} className="aspect-video w-full bg-black" allow="autoplay; fullscreen" allowFullScreen /> : <p className="p-6 text-sm text-muted-foreground">Esta aula abre direto no Drive (botão acima).</p>}
              </div>
            )}
            {modulos.map(([nome, lista]) => (
              <section key={nome}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-muted-foreground" />{nome}<span className="text-xs font-normal text-muted-foreground">{lista.length} {lista.length === 1 ? "aula" : "aulas"}</span></h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {lista.map((a, i) => (
                    <button key={a.id} onClick={() => { setAulaAberta(a); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={cn("group flex flex-col rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md", aulaAberta?.id === a.id ? "border-primary" : "border-border")}>
                      <div className="mb-3 grid h-24 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 text-primary"><Play className="h-8 w-8 transition-transform group-hover:scale-110" /></div>
                      <div className="text-xs text-muted-foreground">Aula {i + 1}</div>
                      <div className="font-medium leading-snug">{a.titulo}</div>
                      {a.descricao && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.descricao}</div>}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ))}

        {(aba === "creator") && (() => {
          const lista = blocos[aba]; const cfg = SECOES[aba as Secao];
          if (!lista) return <Carregar />;
          if (blocoAberto && lista.some((b) => b.id === blocoAberto.id)) return (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setBlocoAberto(null)}>← Voltar</Button>
              <article className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-10"><h2 className="mb-4 text-2xl font-bold tracking-tight">{blocoAberto.titulo}</h2><LeitorBloco html={blocoAberto.conteudo} /></article>
            </div>
          );
          if (!lista.length) return <Vazio texto={`Ainda não há ${cfg.nome === "Creator" ? "blocos" : "materiais"} liberados. Quando chegarem, aparecem aqui.`} />;
          return (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lista.map((b) => (
                <button key={b.id} onClick={() => { setBlocoAberto(b); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="group flex flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition hover:border-violet-500/50 hover:shadow-md">
                  <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-violet-500/12 text-violet-600"><BookOpen className="h-5 w-5" /></span>
                  <div className="font-semibold">{b.titulo}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{b.conteudo.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "—"}</div>
                </button>
              ))}
            </div>
          );
        })()}

        {aba === "manyhub" && (previaId
          ? <Vazio texto="O Many Hub é pessoal: cada embaixador conecta o próprio Instagram e cria as próprias automações. Por isso ele não aparece nesta visão." />
          : <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Conecte o seu Instagram para criar automações (palavra no comentário → DM com o seu link), fluxos de conversa e acompanhar as pessoas que respondem. Tudo aqui é só seu: ninguém mais vê a sua conta.</p>
              <Suspense fallback={<Carregar />}><ManyHub /></Suspense>
            </div>)}

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
