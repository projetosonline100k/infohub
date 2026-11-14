import { useWorkspaceTabsOpcional } from "@/components/workspace/WorkspaceTabs";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Activity, StickyNote, ShieldCheck, User, Gauge, CalendarDays, Zap, CheckSquare, FileText, Loader2, Radio, ArrowLeft, ChevronRight, Clapperboard, FolderOpen, Workflow, BookOpen } from "lucide-react";
import { SECOES, SECOES_ESCRITORIO } from "@/lib/projeto/secoes";
import { cn } from "@/lib/utils";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { ehAdmin } from "@/lib/admin";
import { NOTA_PREFIX } from "@/hooks/useAssistantDocumentos";

interface ProjetoBusca {
  id: string;
  nome_especialista: string;
}

interface ItemBusca {
  id: string;
  titulo: string;
  cliente_id: string | null;
}

interface ResultadosBusca {
  atividades: ItemBusca[];
  documentos: ItemBusca[];
  notas: ItemBusca[];
}

// Dentro de um projeto (04/11, Davi: "no ⌘K quero entrar no projeto e acessar tudo: Vertical, Documentos, os
// documentos em si"): escolher um projeto entra nele em vez de abrir — mostra as seções, todos os documentos e
// os vídeos do Vertical. ⌫ com a busca vazia (ou a seta) volta. Fora dele, "core vertical" já acha a seção.
const SECOES_TODAS = [...SECOES, ...SECOES_ESCRITORIO];
interface ConteudoProjeto { documentos: { id: string; titulo: string | null; tipo: string | null; pasta: string | null }[]; videos: { id: string; titulo: string | null; status: string | null }[] }

const SEM_RESULTADOS: ResultadosBusca = { atividades: [], documentos: [], notas: [] };

// % e _ são curingas no ilike; escapa pra buscar o texto como foi digitado.
const padraoIlike = (termo: string) => `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

interface GlobalSearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Paleta de busca global (⌘K): navegação pras seções principais, projetos
// por nome e, a partir de 2 letras, tarefas, documentos e notas pelo título
// (ilike, 8 de cada, a RLS já limita ao que a pessoa pode ver). Cada
// resultado abre no lugar certo: tarefa no painel (?atividade=), documento
// na aba Documentos do projeto (?documento=) e nota em /notas (?nota=).
// Estado controlado por quem chama (DashboardLayout) pra tanto o atalho
// ⌘K quanto o clique no campo de busca da topbar abrirem a mesma paleta.
export function GlobalSearchCommand({ open, onOpenChange }: GlobalSearchCommandProps) {
  const [projetos, setProjetos] = useState<ProjetoBusca[]>([]);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ResultadosBusca>(SEM_RESULTADOS);
  const [buscando, setBuscando] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projetoAberto, setProjetoAberto] = useState<ProjetoBusca | null>(null);
  // Dentro do projeto, "Documentos" e "Vertical" abrem a lista aqui mesmo (escolhe o item e ele abre direto).
  const [nivel, setNivel] = useState<"documentos" | "videos" | null>(null);
  const { pathname } = useLocation();
  const [conteudo, setConteudo] = useState<ConteudoProjeto | null>(null);
  useEffect(() => {
    if (!projetoAberto) { setConteudo(null); return; }
    let vivo = true;
    void Promise.all([
      supabase.from("documentos").select("id, titulo, tipo, pasta_id").eq("cliente_id", projetoAberto.id).is("deleted_at", null)
        .or(`conteudo.is.null,conteudo.not.like.${NOTA_PREFIX}*`).order("updated_at", { ascending: false }).limit(500),
      supabase.from("pastas_atividade").select("id, nome").eq("cliente_id", projetoAberto.id).eq("origem", "documentos").is("deleted_at", null),
      supabase.from("videos_vertical").select("id, titulo, status").eq("cliente_id", projetoAberto.id).order("created_at", { ascending: false }).limit(300),
    ]).then(([docs, pastas, videos]) => {
      if (!vivo) return;
      const nomePasta = new Map(((pastas.data ?? []) as { id: string; nome: string }[]).map((x) => [x.id, x.nome]));
      setConteudo({
        documentos: ((docs.data ?? []) as { id: string; titulo: string | null; tipo: string | null; pasta_id: string | null }[])
          .map((d) => ({ id: d.id, titulo: d.titulo, tipo: d.tipo, pasta: d.pasta_id ? nomePasta.get(d.pasta_id) ?? null : null })),
        videos: (videos.data ?? []) as ConteudoProjeto["videos"],
      });
    });
    return () => { vivo = false; };
  }, [projetoAberto]);
  const entrar = (p: ProjetoBusca, n: "documentos" | "videos" | null = null) => { setProjetoAberto(p); setNivel(n); setBusca(""); };
  const voltar = () => { if (nivel) setNivel(null); else setProjetoAberto(null); setBusca(""); };
  // ⌘K aberto de dentro de um projeto já começa nele (04/11, Davi).
  useEffect(() => {
    if (!open) return;
    const id = pathname.match(/^\/clientes\/([0-9a-f-]{36})/)?.[1];
    const p = id ? projetos.find((x) => x.id === id) : undefined;
    if (p) setProjetoAberto((atual) => atual ?? p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projetos.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || projetos.length > 0) return;
    supabase
      .from("clientes")
      .select("id, nome_especialista")
      .eq("arquivado", false)
      .order("nome_especialista")
      .then(({ data }) => setProjetos(data || []));
  }, [open, projetos.length]);

  useEffect(() => {
    if (!open) { setBusca(""); setProjetoAberto(null); setNivel(null); }
  }, [open]);

  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2 || projetoAberto) {
      setResultados(SEM_RESULTADOS);
      setBuscando(false);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const timer = window.setTimeout(async () => {
      const padrao = padraoIlike(termo);
      const [atividades, documentos, notas] = await Promise.all([
        supabase
          .from("atividades")
          .select("id, titulo, cliente_id")
          .is("deleted_at", null)
          .ilike("titulo", padrao)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("documentos")
          .select("id, titulo, cliente_id")
          .is("deleted_at", null)
          .not("cliente_id", "is", null)
          .ilike("titulo", padrao)
          .or(`conteudo.is.null,conteudo.not.like.${NOTA_PREFIX}*`)
          .order("updated_at", { ascending: false })
          .limit(8),
        supabase
          .from("documentos")
          .select("id, titulo, cliente_id")
          .is("deleted_at", null)
          .not("cliente_id", "is", null)
          .ilike("titulo", padrao)
          .like("conteudo", `${NOTA_PREFIX}%`)
          .order("updated_at", { ascending: false })
          .limit(8),
      ]);
      if (cancelado) return;
      for (const r of [atividades, documentos, notas]) if (r.error) console.error("Erro na busca:", r.error);
      setResultados({
        atividades: atividades.data || [],
        documentos: documentos.data || [],
        notas: notas.data || [],
      });
      setBuscando(false);
    }, 250);
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [busca, projetoAberto]);

  const nomeProjeto = (clienteId: string | null) =>
    clienteId ? projetos.find((p) => p.id === clienteId)?.nome_especialista : undefined;

  // O que escolher no ⌘K abre numa guia nova (19/10, Davi). Fora do workspace (sem guias), navega.
  const guias = useWorkspaceTabsOpcional();
  const ir = (rota: string) => {
    onOpenChange(false);
    // Só a guia nova: o layout leva o endereço até ela. Navegar aqui também podia cair na guia que estava aberta e
    // substituí-la (31/10, Davi: "ao clicar no item, a guia atual não seja substituída").
    if (guias) { guias.abrirNovaGuia(rota); return; }
    navigate(rota);
  };

  const paginas = [
    { titulo: "Dash geral", rota: "/", icon: LayoutDashboard },
    { titulo: "Projetos Milionários", rota: "/clientes", icon: Users },
    { titulo: "Atividades", rota: "/atividades", icon: Activity },
    { titulo: "Notas", rota: "/notas", icon: StickyNote },
    { titulo: "Produtividade", rota: "/produtividade", icon: Gauge },
    { titulo: "Agenda", rota: "/agenda", icon: CalendarDays },
    ...(ehAdmin(user?.email)
      ? [
          { titulo: "Many Hub", rota: "/automacoes", icon: Zap },
          { titulo: "Ponte", rota: "/ponte", icon: Radio },
          { titulo: "Administração", rota: "/admin", icon: ShieldCheck },
        ]
      : []),
  ];

  // Grupos de resultados do banco. O value leva o id pra ser único e o termo
  // digitado vai em keywords pra o filtro do cmdk não esconder o que o ilike já achou.
  const grupos = [
    {
      heading: "Tarefas",
      icon: CheckSquare,
      itens: resultados.atividades,
      rota: (a: ItemBusca) => (a.cliente_id ? `/clientes/${a.cliente_id}?atividade=${a.id}` : `/atividades?atividade=${a.id}`),
    },
    {
      heading: "Documentos",
      icon: FileText,
      itens: resultados.documentos,
      rota: (d: ItemBusca) => `/clientes/${d.cliente_id}?documento=${d.id}`,
    },
    {
      heading: "Notas",
      icon: StickyNote,
      itens: resultados.notas,
      rota: (n: ItemBusca) => `/notas?projeto=${n.cliente_id}&nota=${n.id}`,
    },
  ];

  const base = projetoAberto ? `/clientes/${projetoAberto.id}` : "";
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {projetoAberto && (
        <div className="flex items-center gap-1.5 border-b px-3 py-2 text-sm">
          <button type="button" onClick={() => { setProjetoAberto(null); setNivel(null); setBusca(""); }} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />Tudo
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <button type="button" onClick={() => { setNivel(null); setBusca(""); }} className={cn("rounded-md px-1.5 py-0.5", nivel ? "text-muted-foreground hover:bg-muted hover:text-foreground" : "font-semibold")}>{projetoAberto.nome_especialista}</button>
          {nivel && <><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-semibold">{nivel === "documentos" ? "Documentos" : "Vertical"}</span></>}
          <span className="ml-auto text-[11px] text-muted-foreground">⌫ volta</span>
        </div>
      )}
      <CommandInput
        placeholder={!projetoAberto ? "Buscar páginas, projetos, tarefas, documentos e notas..."
          : nivel === "documentos" ? "Buscar um documento..." : nivel === "videos" ? "Buscar um vídeo..." : `Buscar em ${projetoAberto.nome_especialista}: seções, documentos, vídeos...`}
        value={busca} onValueChange={setBusca}
        onKeyDown={(e) => { if (e.key === "Backspace" && !busca && projetoAberto) { e.preventDefault(); voltar(); } }} />
      {projetoAberto ? (
        <CommandList>
          <CommandEmpty>{conteudo ? "Nada encontrado neste projeto." : "Carregando..."}</CommandEmpty>
          {!nivel && (
            <CommandGroup heading="Seções">
              <CommandItem value="Abrir o projeto" onSelect={() => ir(base)}>
                <FolderOpen className="mr-2 h-4 w-4" />Abrir o projeto
              </CommandItem>
              {SECOES_TODAS.map((sc) => {
                const lista = sc.secao === "documentos" ? "documentos" as const : sc.secao === "conteudo:vertical" ? "videos" as const : null;
                const n = lista === "documentos" ? conteudo?.documentos.length : lista === "videos" ? conteudo?.videos.length : undefined;
                return (
                  <CommandItem key={sc.secao} value={`seção ${sc.titulo}`} onSelect={() => (lista ? (setNivel(lista), setBusca("")) : ir(`${base}?secao=${sc.secao}`))}>
                    <sc.icone className="mr-2 h-4 w-4" />{sc.titulo}
                    {lista && <span className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground">{n ?? ""} {lista === "documentos" ? "documentos" : "vídeos"}<ChevronRight className="h-3.5 w-3.5" /></span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          {nivel && (
            <CommandGroup>
              <CommandItem value={`abrir a página ${nivel}`} onSelect={() => ir(`${base}?secao=${nivel === "documentos" ? "documentos" : "conteudo:vertical"}`)}>
                <FolderOpen className="mr-2 h-4 w-4" />Abrir a página {nivel === "documentos" ? "Documentos" : "Vertical"}
              </CommandItem>
            </CommandGroup>
          )}
          {/* Documentos: na lista própria, ou na raiz do projeto quando se digita algo */}
          {conteudo && conteudo.documentos.length > 0 && (nivel === "documentos" || (!nivel && busca.trim().length >= 2)) && (
            <CommandGroup heading={`Documentos (${conteudo.documentos.length})`}>
              {conteudo.documentos.map((d) => {
                const Icone = d.tipo === "mapa" ? Workflow : d.tipo === "caderno" ? BookOpen : FileText;
                return (
                  <CommandItem key={d.id} value={`doc ${d.titulo ?? ""} ${d.pasta ?? ""} ${d.id}`} onSelect={() => ir(`${base}?documento=${d.id}`)}>
                    <Icone className="mr-2 h-4 w-4 shrink-0" /><span className="truncate">{d.titulo || "Sem título"}</span>
                    {d.pasta && <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{d.pasta}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          {conteudo && conteudo.videos.length > 0 && (nivel === "videos" || (!nivel && busca.trim().length >= 2)) && (
            <CommandGroup heading={`Vídeos do Vertical (${conteudo.videos.length})`}>
              {conteudo.videos.map((v) => (
                <CommandItem key={v.id} value={`video ${v.titulo ?? ""} ${v.id}`} onSelect={() => ir(`${base}?secao=conteudo:vertical&video=${v.id}`)}>
                  <Clapperboard className="mr-2 h-4 w-4 shrink-0" /><span className="truncate">{v.titulo || "Sem título"}</span>
                  {v.status && <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{v.status}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      ) : (
      <CommandList>        <CommandEmpty>{buscando ? "Buscando..." : "Nada encontrado."}</CommandEmpty>
        <CommandGroup heading="Navegação">
          {paginas.map((p) => (
            <CommandItem key={p.rota} onSelect={() => ir(p.rota)}>
              <p.icon className="mr-2 h-4 w-4" />
              {p.titulo}
            </CommandItem>
          ))}
        </CommandGroup>
        {projetos.length > 0 && (
          <CommandGroup heading="Projetos">
            {projetos.map((p) => (
              <CommandItem key={p.id} value={`projeto ${p.nome_especialista}`} onSelect={() => entrar(p)}>
                <User className="mr-2 h-4 w-4" />
                {p.nome_especialista}
                <span className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground">entrar<ChevronRight className="h-3.5 w-3.5" /></span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {/* "core vertical", "instalivros documentos": a seção de um projeto direto */}
        {busca.trim().length >= 2 && projetos.length > 0 && (
          <CommandGroup heading="Seções dos projetos">
            {projetos.flatMap((p) => SECOES_TODAS.map((sc) => (
              <CommandItem key={`${p.id}:${sc.secao}`} value={`${p.nome_especialista} ${sc.titulo}`}
                onSelect={() => (sc.secao === "documentos" ? entrar(p, "documentos") : sc.secao === "conteudo:vertical" ? entrar(p, "videos") : ir(`/clientes/${p.id}?secao=${sc.secao}`))}>
                <sc.icone className="mr-2 h-4 w-4" />
                <span className="truncate">{p.nome_especialista} › {sc.titulo}</span>
              </CommandItem>
            )))}
          </CommandGroup>
        )}
        {grupos.map(
          (g) =>
            g.itens.length > 0 && (
              <CommandGroup key={g.heading} heading={g.heading}>
                {g.itens.map((item) => {
                  const projeto = nomeProjeto(item.cliente_id);
                  return (
                    <CommandItem key={item.id} value={`${item.titulo} ${item.id}`} keywords={[busca]} onSelect={() => ir(g.rota(item))}>
                      <g.icon className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">{item.titulo || "Sem título"}</span>
                      {projeto && <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{projeto}</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ),
        )}
        {buscando && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Buscando tarefas, documentos e notas...
          </div>
        )}
      </CommandList>
      )}
    </CommandDialog>
  );
}
