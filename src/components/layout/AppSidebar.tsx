import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity, Archive, Brain, Building2, CalendarDays, CalendarRange, ChevronRight, FileText, Folder, FolderOpen,
  Gauge, Info, Lightbulb, LayoutDashboard, ListChecks, MessageCircle, Moon, ShieldCheck, Sparkles, StickyNote, Target, Users,
  Video, Youtube, Zap, BookOpen, HelpCircle, Workflow, Loader2, Plus, FolderPlus, type LucideIcon,
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { ehAdmin } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useWorkspaceTabs } from "@/components/workspace/WorkspaceTabs";

// Barra lateral em árvore, no jeito do Obsidian (23/10, Davi: "clicar no item e ter subcategorias, com as
// funções e projetos que já temos"). Pastas abrem e fecham (o que fica aberto é lembrado); cada projeto
// é uma pasta com as seções dele, que abrem direto pelo endereço (/clientes/<id>?secao=...).

interface No {
  chave: string;
  titulo: string;
  icone: LucideIcon;
  /** para onde vai ao clicar (pasta com destino abre e também navega) */
  ir?: string;
  filhos?: No[];
  /** quando o item está aberto na tela */
  ativoSe?: (caminho: string, busca: URLSearchParams) => boolean;
  /** filhos carregados só quando a pasta abre (ex.: os documentos de um projeto) */
  carregar?: () => Promise<No[]>;
  /** pasta de documentos: o + cria documento ou pasta dentro dela (24/10) */
  criar?: { clienteId: string; pastaId: string | null };
}

// Documentos do projeto (23/10, Davi: "tudo que tem subcategorias na lateral — os documentos, e dentro
// deles os documentos"): pastas → documentos; os sem pasta ficam soltos. Abre com ?documento=<id>.
async function documentosDoProjeto(clienteId: string): Promise<No[]> {
  const [pastas, docs] = await Promise.all([
    supabase.from("pastas_atividade").select("id, nome, parent_id").eq("cliente_id", clienteId).eq("origem", "documentos").is("deleted_at", null).order("ordem"),
    supabase.from("documentos").select("id, titulo, pasta_id, tipo, fixado").eq("cliente_id", clienteId).is("deleted_at", null).order("fixado", { ascending: false }).order("titulo"),
  ]);
  const base = `/clientes/${clienteId}`;
  const noDoc = (d: { id: string; titulo: string | null; tipo: string | null }): No => ({
    chave: `doc:${d.id}`, titulo: d.titulo || "Sem título", icone: d.tipo === "mapa" ? Workflow : d.tipo === "caderno" ? BookOpen : FileText,
    ir: `${base}?documento=${d.id}`, ativoSe: (caminho, busca) => caminho === base && busca.get("documento") === d.id,
  });
  const lista = (docs.data ?? []) as { id: string; titulo: string | null; pasta_id: string | null; tipo: string | null }[];
  const todas = (pastas.data ?? []) as { id: string; nome: string; parent_id: string | null }[];
  const idsPastas = new Set(todas.map((p) => p.id));
  // 24/10: pasta dentro de pasta; mãe apagada (ou de fora) = pasta de cima.
  const mae = (p: { parent_id: string | null }) => (p.parent_id && idsPastas.has(p.parent_id) ? p.parent_id : null);
  const noPasta = (p: { id: string; nome: string }, fundo = 0): No => ({
    chave: `pasta-doc:${p.id}`, titulo: p.nome, icone: Folder, criar: { clienteId, pastaId: p.id },
    filhos: [...(fundo < 10 ? todas.filter((f) => mae(f) === p.id).map((f) => noPasta(f, fundo + 1)) : []), ...lista.filter((d) => d.pasta_id === p.id).map(noDoc)],
  });
  return [
    ...todas.filter((p) => !mae(p)).map((p) => noPasta(p)),
    ...lista.filter((d) => !d.pasta_id || !idsPastas.has(d.pasta_id)).map(noDoc),
  ];
}

// Seções de um projeto (as mesmas da página do projeto).
const SECOES: { secao: string; titulo: string; icone: LucideIcon }[] = [
  { secao: "conteudo:visao-geral", titulo: "Escritório", icone: Building2 },
  { secao: "atividades", titulo: "Atividades", icone: ListChecks },
  { secao: "documentos", titulo: "Documentos", icone: FileText },
  { secao: "cerebro", titulo: "Cérebro", icone: Brain },
];
// 24/10 (Davi): dentro do Escritório, os mesmos itens das abas de cima, na mesma ordem.
const SECOES_ESCRITORIO: { secao: string; titulo: string; icone: LucideIcon }[] = [
  { secao: "informacoes", titulo: "Informações gerais", icone: Info },
  { secao: "conteudo:vertical", titulo: "Vertical", icone: Video },
  { secao: "conteudo:youtube", titulo: "Youtube", icone: Youtube },
  { secao: "conteudo:brainstorm", titulo: "Brainstorm", icone: Lightbulb },
  { secao: "conteudo:cronograma", titulo: "Cronograma", icone: CalendarRange },
  { secao: "conteudo:conhecimento", titulo: "Fonte de conhecimento", icone: BookOpen },
  { secao: "conteudo:quiz", titulo: "Quiz", icone: HelpCircle },
  { secao: "conteudo:whatsapp", titulo: "WhatsApp", icone: MessageCircle },
];

interface ClienteMenu { id: string; nome_especialista: string; arquivado: boolean | null }

function noDoProjeto(c: ClienteMenu): No {
  const base = `/clientes/${c.id}`;
  const secao = (s: { secao: string; titulo: string; icone: LucideIcon }): No => ({
    chave: `${c.id}:${s.secao}`, titulo: s.titulo, icone: s.icone, ir: `${base}?secao=${s.secao}`,
    ativoSe: (caminho, busca) => caminho === base && busca.get("secao") === s.secao && !busca.get("documento"),
    ...(s.secao === "documentos" ? { carregar: () => documentosDoProjeto(c.id), criar: { clienteId: c.id, pastaId: null } } : {}),
  });
  return {
    chave: `projeto:${c.id}`, titulo: c.nome_especialista, icone: Folder, ir: base,
    ativoSe: (caminho) => caminho === base,
    // O Escritório é uma pasta (clicar abre o Escritório; a setinha mostra as abas dele).
    filhos: SECOES.map((s) => (s.secao === "conteudo:visao-geral" ? { ...secao(s), filhos: SECOES_ESCRITORIO.map(secao) } : secao(s))),
  };
}

const ABERTOS_PADRAO = ["projetos"];
function lerAbertos(): Set<string> {
  try { const s = localStorage.getItem("sidebar:abertos"); return new Set(s ? (JSON.parse(s) as string[]) : ABERTOS_PADRAO); } catch { return new Set(ABERTOS_PADRAO); }
}

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { openTab } = useWorkspaceTabs();
  const { user } = useAuth();
  const { state } = useSidebar();
  const recolhida = state === "collapsed";
  const [abertos, setAbertos] = useState<Set<string>>(lerAbertos);
  const [clientes, setClientes] = useState<ClienteMenu[]>([]);
  const [carregados, setCarregados] = useState<Record<string, No[] | "carregando">>({});
  // Pastas e documentos criados/movidos na página (ou ao voltar para o app): busca de novo o que já foi
  // carregado, trocando só quando chega (sem a árvore piscar).
  const carregadores = useRef(new Map<string, () => Promise<No[]>>());
  useEffect(() => {
    const recarregar = () => {
      for (const [chave, carregar] of carregadores.current) {
        void carregar().then((f) => setCarregados((c) => ({ ...c, [chave]: f }))).catch(() => undefined);
      }
    };
    window.addEventListener("documentos:mudou", recarregar);
    window.addEventListener("focus", recarregar);
    return () => { window.removeEventListener("documentos:mudou", recarregar); window.removeEventListener("focus", recarregar); };
  }, []);
  const carregarFilhos = (no: No) => {
    if (no.carregar) carregadores.current.set(no.chave, no.carregar);
    if (!no.carregar || carregados[no.chave]) return;
    setCarregados((c) => ({ ...c, [no.chave]: "carregando" }));
    no.carregar().then((f) => setCarregados((c) => ({ ...c, [no.chave]: f }))).catch(() => setCarregados((c) => { const n = { ...c }; delete n[no.chave]; return n; }));
  };

  // Projetos que o usuário enxerga (a RLS já filtra); recarrega quando a janela volta ao foco.
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    const carregar = () => void supabase.from("clientes").select("id, nome_especialista, arquivado").order("nome_especialista")
      .then(({ data }) => { if (vivo && data) setClientes(data as ClienteMenu[]); });
    carregar();
    window.addEventListener("focus", carregar);
    return () => { vivo = false; window.removeEventListener("focus", carregar); };
  }, [user]);

  const alternar = (chave: string, abrir?: boolean) => setAbertos((atual) => {
    const novo = new Set(atual);
    if (abrir ?? !novo.has(chave)) novo.add(chave); else novo.delete(chave);
    try { localStorage.setItem("sidebar:abertos", JSON.stringify([...novo])); } catch { /* sem storage */ }
    return novo;
  });

  const arvore = useMemo<No[]>(() => {
    const ativos = clientes.filter((c) => !c.arquivado), arquivados = clientes.filter((c) => c.arquivado);
    const itens: No[] = [
      { chave: "dash", titulo: "Dash geral", icone: LayoutDashboard, ir: "/", ativoSe: (c) => c === "/" },
      { chave: "agenda", titulo: "Agenda", icone: CalendarDays, ir: "/agenda" },
      {
        chave: "projetos", titulo: "Projetos Milionários", icone: Users, ir: "/clientes", ativoSe: (c) => c === "/clientes",
        filhos: [
          ...ativos.map(noDoProjeto),
          ...(arquivados.length ? [{ chave: "arquivados", titulo: "Arquivados", icone: Archive, filhos: arquivados.map(noDoProjeto) }] : []),
        ],
      },
      { chave: "atividades", titulo: "Atividades", icone: Activity, ir: "/atividades" },
      { chave: "notas", titulo: "Notas", icone: StickyNote, ir: "/notas" },
      {
        chave: "produtividade", titulo: "Produtividade", icone: Gauge, ir: "/produtividade",
        filhos: [
          { chave: "prod:relatorios", titulo: "Relatórios de foco", icone: FileText, ir: "/produtividade?aba=relatorios" },
          { chave: "prod:performance", titulo: "Performance e sono", icone: Target, ir: "/produtividade?aba=performance" },
          { chave: "prod:bloqueador", titulo: "Bloqueador", icone: ShieldCheck, ir: "/produtividade?aba=bloqueador" },
        ],
      },
    ];
    if (ehAdmin(user?.email)) itens.push(
      { chave: "automacoes", titulo: "Automações", icone: Zap, ir: "/automacoes" },
      { chave: "admin", titulo: "Administração", icone: ShieldCheck, ir: "/admin" },
    );
    return itens;
  }, [clientes, user?.email]);

  // Pastas abertas que carregam os filhos sob demanda (documentos): carrega depois do desenho.
  useEffect(() => {
    const visitar = (nos: No[]) => nos.forEach((n) => {
      if (!abertos.has(n.chave)) return;
      if (n.carregar) { carregarFilhos(n); const f = carregados[n.chave]; if (Array.isArray(f)) visitar(f); }
      else if (n.filhos) visitar(n.filhos);
    });
    visitar(arvore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abertos, arvore, carregados]);

  // Documento aberto: abre também a pasta dele (quando os documentos já carregaram).
  useEffect(() => {
    const doc = new URLSearchParams(location.search).get("documento");
    if (!doc) return;
    for (const filhos of Object.values(carregados)) {
      if (!Array.isArray(filhos)) continue;
      const pasta = filhos.find((f) => f.filhos?.some((d) => d.chave === `doc:${doc}`));
      if (pasta && !abertos.has(pasta.chave)) alternar(pasta.chave, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, carregados]);

  const busca = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const ativo = (n: No) => (n.ativoSe ? n.ativoSe(location.pathname, busca)
    : n.ir ? (n.ir.includes("?") ? `${location.pathname}${location.search}` === n.ir : location.pathname === n.ir || location.pathname.startsWith(`${n.ir}/`)) : false);
  // Abre sozinho o caminho até o que está na tela (ex.: entrou num projeto pela lista).
  useEffect(() => {
    const m = location.pathname.match(/^\/clientes\/([^/]+)/);
    if (!m) return;
    const c = clientes.find((x) => x.id === m[1]);
    if (!c) return;
    const precisa = ["projetos", ...(c.arquivado ? ["arquivados"] : []), `projeto:${c.id}`, ...(location.search.includes("documento=") ? [`${c.id}:documentos`] : [])];
    if (precisa.some((k) => !abertos.has(k))) precisa.forEach((k) => alternar(k, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, clientes]);

  const ir = (destino: string, titulo: string, e: React.MouseEvent) => {
    e.preventDefault();
    // ⌘+clique (24/10, Davi): sempre numa guia nova, mesmo que o item já esteja aberto em outra.
    if (e.metaKey || e.ctrlKey) { openTab(destino, titulo, { nova: true }); return; }
    navigate(destino);
  };

  // + numa pasta de documentos (24/10, Davi): cria um documento (e abre) ou uma pasta dentro dela.
  const novoDocumento = async ({ clienteId, pastaId }: { clienteId: string; pastaId: string | null }, chavePasta: string) => {
    const { data, error } = await supabase.from("documentos")
      .insert({ cliente_id: clienteId, pasta_id: pastaId, titulo: "Documento sem título" }).select("id").single();
    if (error || !data) { toast.error("Não consegui criar o documento"); return; }
    alternar(chavePasta, true);
    window.dispatchEvent(new CustomEvent("documentos:mudou", { detail: { clienteId } }));
    navigate(`/clientes/${clienteId}?documento=${data.id}`);
  };
  const novaPasta = async ({ clienteId, pastaId }: { clienteId: string; pastaId: string | null }, chavePasta: string) => {
    const nome = window.prompt(pastaId ? "Nome da nova pasta (dentro desta):" : "Nome da nova pasta:")?.trim();
    if (!nome) return;
    const { error } = await supabase.from("pastas_atividade")
      .insert({ cliente_id: clienteId, nome, origem: "documentos", ordem: 999, parent_id: pastaId });
    if (error) { toast.error("Não consegui criar a pasta"); return; }
    alternar(chavePasta, true);
    window.dispatchEvent(new CustomEvent("documentos:mudou", { detail: { clienteId } }));
  };

  const Linha = ({ no, nivel }: { no: No; nivel: number }) => {
    const aberto = abertos.has(no.chave);
    const lazy = carregados[no.chave];
    const filhos = no.carregar ? (Array.isArray(lazy) ? lazy : []) : no.filhos ?? [];
    const temFilhos = !!no.carregar || filhos.length > 0;
    const eAtivo = ativo(no);
    const Icone = temFilhos && no.icone === Folder ? (aberto ? FolderOpen : Folder) : no.icone;
    return (
      <li>
        <div className={cn("group/linha flex h-7 items-center rounded-md pr-1 text-[13px] transition-colors",
          eAtivo ? "bg-primary/15 font-medium text-sidebar-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground")}
          style={{ paddingLeft: 6 + nivel * 12 }}>
          <button type="button" aria-label={aberto ? "Fechar" : "Abrir"} onClick={() => temFilhos && alternar(no.chave)}
            className={cn("flex h-5 w-4 shrink-0 items-center justify-center rounded text-sidebar-foreground/50", temFilhos ? "hover:text-sidebar-foreground" : "pointer-events-none opacity-0")}>
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", aberto && "rotate-90")} />
          </button>
          <a href={no.ir ?? "#"} onClick={(e) => { if (no.ir) ir(no.ir, no.titulo, e); else { e.preventDefault(); alternar(no.chave); } if (temFilhos && no.ir && !aberto) alternar(no.chave, true); }}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-0.5" title={no.titulo}>
            <Icone className={cn("h-3.5 w-3.5 shrink-0", eAtivo ? "text-primary" : no.icone === Folder ? "text-sky-400/80" : "text-sidebar-foreground/60")} />
            <span className="truncate">{no.titulo}</span>
          </a>
          {no.criar && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Criar em ${no.titulo}`} title="Novo documento ou pasta aqui"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-sidebar-foreground/60 opacity-0 hover:bg-sidebar-accent hover:text-sidebar-foreground focus:opacity-100 group-hover/linha:opacity-100 data-[state=open]:opacity-100">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onClick={() => void novoDocumento(no.criar!, no.chave)}><FileText className="mr-2 h-4 w-4" />Novo documento</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void novaPasta(no.criar!, no.chave)}><FolderPlus className="mr-2 h-4 w-4" />Nova pasta {no.criar.pastaId ? "aqui dentro" : ""}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {aberto && lazy === "carregando" && (
          <div className="flex h-6 items-center gap-1.5 text-[11.5px] text-sidebar-foreground/50" style={{ paddingLeft: 30 + nivel * 12 }}><Loader2 className="h-3 w-3 animate-spin" />Carregando…</div>
        )}
        {aberto && no.carregar && Array.isArray(lazy) && lazy.length === 0 && (
          <div className="h-6 text-[11.5px] leading-6 text-sidebar-foreground/40" style={{ paddingLeft: 30 + nivel * 12 }}>Vazio</div>
        )}
        {temFilhos && aberto && filhos.length > 0 && (
          // Linha-guia vertical (como no Obsidian) ligando os filhos à pasta.
          <ul className="relative">
            <span className="pointer-events-none absolute bottom-1 top-0 w-px bg-sidebar-border" style={{ left: 13 + nivel * 12 }} />
            {filhos.map((f) => <Linha key={f.chave} no={f} nivel={nivel + 1} />)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2 overflow-hidden">
          <Sparkles className="h-5 w-5 shrink-0 text-primary" />
          <span className="truncate text-base font-bold text-sidebar-foreground group-data-[collapsible=icon]:hidden">Infopro Hub</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2 py-2">
        {recolhida ? (
          // Recolhida: só os ícones do primeiro nível.
          <div className="flex flex-col items-center gap-1">
            {arvore.map((n) => {
              const Icone = n.icone;
              return (
                <a key={n.chave} href={n.ir ?? "#"} title={n.titulo} onClick={(e) => n.ir && ir(n.ir, n.titulo, e)}
                  className={cn("flex h-8 w-8 items-center justify-center rounded-md", ativo(n) || (n.chave === "projetos" && location.pathname.startsWith("/clientes")) ? "bg-primary/15 text-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent")}>
                  <Icone className="h-4 w-4" />
                </a>
              );
            })}
          </div>
        ) : (
          <ul className="space-y-px">{arvore.map((n) => <Linha key={n.chave} no={n} nivel={0} />)}</ul>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
