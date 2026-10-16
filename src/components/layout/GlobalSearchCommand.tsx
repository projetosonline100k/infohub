import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Activity, StickyNote, ShieldCheck, User, Gauge, CalendarDays, Zap, CheckSquare, FileText, Loader2 } from "lucide-react";
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
    if (!open) setBusca("");
  }, [open]);

  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) {
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
  }, [busca]);

  const nomeProjeto = (clienteId: string | null) =>
    clienteId ? projetos.find((p) => p.id === clienteId)?.nome_especialista : undefined;

  const ir = (rota: string) => {
    onOpenChange(false);
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
          { titulo: "Automações", rota: "/automacoes", icon: Zap },
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

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar páginas, projetos, tarefas, documentos e notas..." value={busca} onValueChange={setBusca} />
      <CommandList>
        <CommandEmpty>{buscando ? "Buscando..." : "Nada encontrado."}</CommandEmpty>
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
              <CommandItem key={p.id} onSelect={() => ir(`/clientes/${p.id}`)}>
                <User className="mr-2 h-4 w-4" />
                {p.nome_especialista}
              </CommandItem>
            ))}
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
    </CommandDialog>
  );
}
