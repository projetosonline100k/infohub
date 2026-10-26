import { useEffect, useRef, useState } from "react";
import { FileText, Plus, Folder, MoreHorizontal, Trash2, ExternalLink, Columns2 } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useWorkspaceAcoes } from "@/components/workspace/WorkspaceTabs";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";

interface Guia {
  id: string;
  titulo: string;
}

interface Pasta {
  id: string;
  nome: string;
}

const SEM_PASTA = "__sem_pasta__";

interface DocumentSidebarProps {
  documentoAtualId: string;
  tituloAtual: string;
  clienteId: string | null;
  pastaId: string | null;
  onTrocarDocumento: (novoId: string, titulo?: string) => void;
  onMudarPasta: (novaPastaId: string | null) => void;
  className?: string;
}

// "Guias no documento": os outros documentos que compartilham a mesma
// pasta. Escolher uma pasta aqui reúne tarefas e documentos do mesmo
// projeto no mesmo lugar.
export function DocumentSidebar({
  documentoAtualId,
  tituloAtual,
  clienteId,
  pastaId,
  onTrocarDocumento,
  onMudarPasta,
  className,
}: DocumentSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { openTab, abrirAoLado } = useWorkspaceAcoes();
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [guias, setGuias] = useState<Guia[]>([]);
  const guiaAnteriorRef = useRef<{ id: string; titulo: string } | null>(null);

  // Como a lista não recarrega mais a cada troca (ver efeito abaixo), o
  // título da guia que você acabou de sair fica registrado aqui na mão —
  // senão a lateral mostraria o título antigo dela até a pasta recarregar.
  useEffect(() => {
    if (guiaAnteriorRef.current && guiaAnteriorRef.current.id !== documentoAtualId) {
      const { id, titulo } = guiaAnteriorRef.current;
      setGuias((prev) => prev.map((g) => (g.id === id ? { ...g, titulo } : g)));
    }
    guiaAnteriorRef.current = { id: documentoAtualId, titulo: tituloAtual };
  }, [documentoAtualId, tituloAtual]);

  useEffect(() => {
    let query = supabase.from("pastas_atividade").select("id, nome").eq("origem", "documentos").is("deleted_at", null).order("ordem");
    query = clienteId ? query.eq("cliente_id", clienteId) : query.is("cliente_id", null);
    query.then(({ data, error }) => {
      if (error) {
        console.error("Erro ao carregar pastas:", error);
        return;
      }
      setPastas(data || []);
    });
  }, [clienteId]);

  // Ordem por criação (fixa), não por "atualizado por último": se fosse por
  // updated_at, a guia que você acabou de sair pulava pro topo da lista bem
  // na hora de clicar na próxima, e o clique acertava a guia errada.
  // Recarrega só quando a pasta muda — trocar de guia não deve reordenar a
  // lista embaixo do seu cursor.
  useEffect(() => {
    if (!pastaId) {
      setGuias([]);
      return;
    }
    supabase
      .from("documentos")
      .select("id, titulo")
      .eq("pasta_id", pastaId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("Erro ao carregar guias:", error);
          return;
        }
        setGuias(data || []);
      });
  }, [pastaId]);

  // ⋯ → Mover para a lixeira (24/10, Davi): não apaga de vez; o aviso tem "Desfazer".
  const avisarLateral = () => window.dispatchEvent(new CustomEvent("documentos:mudou", { detail: { clienteId } }));
  const moverParaLixeira = async (guia: Guia) => {
    const { error } = await supabase.from("documentos").update({ deleted_at: new Date().toISOString() }).eq("id", guia.id);
    if (error) { toast.error("Não consegui mover para a lixeira"); return; }
    const resto = guias.filter((g) => g.id !== guia.id);
    setGuias(resto);
    if (guia.id === documentoAtualId && resto.length) onTrocarDocumento(resto[0].id, resto[0].titulo);
    avisarLateral();
    toast.success(`"${guia.titulo || "Sem título"}" foi para a lixeira`, {
      action: {
        label: "Desfazer",
        onClick: async () => {
          const { error: erro } = await supabase.from("documentos").update({ deleted_at: null }).eq("id", guia.id);
          if (erro) { toast.error("Não consegui desfazer"); return; }
          setGuias((l) => (l.some((g) => g.id === guia.id) ? l : [...l, guia]));
          avisarLateral();
        },
      },
    });
  };

  const criarGuia = async () => {
    if (!pastaId) return;
    const { data, error } = await supabase
      .from("documentos")
      .insert({ cliente_id: clienteId, pasta_id: pastaId, titulo: "Documento sem título" })
      .select()
      .single();
    if (error) {
      console.error("Erro ao criar guia:", error);
      return;
    }
    if (data) {
      setGuias((prev) => [...prev, { id: data.id, titulo: data.titulo }]);
      onTrocarDocumento(data.id);
    }
  };

  return (
    <div className={cn("painel-secundario w-64 border-r bg-muted/30 flex flex-col h-full", className)}>
      <div className="flex items-center justify-between p-4 border-b">
        <span className="text-sm font-medium">Guias no documento</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={criarGuia}
          disabled={!pastaId}
          title={pastaId ? "Nova guia (documento)" : "Escolha uma pasta para criar guias"}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3 border-b space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Folder className="h-3.5 w-3.5" />
          Pasta
        </label>
        <Select
          value={pastaId || SEM_PASTA}
          onValueChange={(v) => onMudarPasta(v === SEM_PASTA ? null : v)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_PASTA}>Nenhuma</SelectItem>
            {pastas.map((pasta) => (
              <SelectItem key={pasta.id} value={pasta.id}>
                {pasta.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {guias.map((guia) => (
            <div key={guia.id} className="group/guia relative">
            <ContextMenu>
              <ContextMenuTrigger asChild>
            <button
              onClick={(event) => {
                // ⌘/Ctrl+clique abre o documento numa guia nova do Infopro
                // (a atual continua aqui), igual à lista do Docs.
                if (event.metaKey || event.ctrlKey) {
                  const path = `${location.pathname}?documento=${guia.id}`;
                  openTab(path, guia.titulo || "Documento");
                  navigate(path);
                  return;
                }
                onTrocarDocumento(guia.id, guia.titulo);
              }}
              title="Clique para abrir · ⌘+clique ou botão direito: nova guia / tela dividida"
              className={cn(
                "w-full text-left p-2 pr-8 rounded hover:bg-muted text-sm flex items-center gap-2 transition-colors",
                guia.id === documentoAtualId && "item-ativo bg-muted font-medium"
              )}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {guia.id === documentoAtualId ? tituloAtual || "Sem título" : guia.titulo || "Sem título"}
              </span>
            </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="z-[300]">
                <ContextMenuItem onSelect={() => { const path = `${location.pathname}?documento=${guia.id}`; openTab(path, guia.titulo || "Documento"); navigate(path); }}>
                  Abrir em nova guia
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => navigate(abrirAoLado(`${location.pathname}?documento=${guia.id}`, guia.titulo || "Documento").path)}>
                  Abrir ao lado (tela dividida)
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void moverParaLixeira(guia)} className="text-destructive">
                  Mover para a lixeira
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Opções de ${guia.titulo || "documento"}`}
                  className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus:opacity-100 group-hover/guia:opacity-100 data-[state=open]:opacity-100">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[300] w-48">
                <DropdownMenuItem onSelect={() => { const path = `${location.pathname}?documento=${guia.id}`; openTab(path, guia.titulo || "Documento", { nova: true }); }}>
                  <ExternalLink className="mr-2 h-4 w-4" />Abrir em nova guia
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate(abrirAoLado(`${location.pathname}?documento=${guia.id}`, guia.titulo || "Documento").path)}>
                  <Columns2 className="mr-2 h-4 w-4" />Abrir ao lado
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void moverParaLixeira(guia)} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />Mover para a lixeira
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          ))}

          {!pastaId && (
            <p className="text-xs text-muted-foreground p-2">
              Escolha uma pasta acima para reunir este documento com outros do mesmo projeto.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
