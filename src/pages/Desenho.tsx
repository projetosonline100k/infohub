import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, ChevronDown, FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MindMapEditor } from "@/components/documentos/MindMapEditor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useExcluirDesenho } from "@/hooks/useExcluirDesenho";

// Desenho numa guia própria (24/10, Davi: "New drawing… abre uma nova guia de desenho, igual o Obsidian, e lá
// dentro eu consigo selecionar o projeto"). É a mesma lousa Excalidraw dos documentos (tipo "mapa"); sem
// projeto fica solto (aparece em "Desenhos" na lateral), com projeto vai para os Documentos dele.

interface Projeto { id: string; nome_especialista: string }

function SeletorProjeto({ documentoId, clienteId, onMudou }: { documentoId: string; clienteId: string | null; onMudou: (id: string | null) => void }) {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  useEffect(() => {
    void supabase.from("clientes").select("id, nome_especialista").eq("arquivado", false).order("nome_especialista")
      .then(({ data }) => setProjetos((data ?? []) as Projeto[]));
  }, []);
  const atual = projetos.find((p) => p.id === clienteId);
  const escolher = async (id: string | null) => {
    if (id === clienteId) return;
    // Trocar de projeto tira da pasta antiga (as pastas são de cada projeto).
    const { error } = await supabase.from("documentos").update({ cliente_id: id, pasta_id: null }).eq("id", documentoId);
    if (error) { toast.error("Não consegui trocar o projeto"); return; }
    window.dispatchEvent(new CustomEvent("documentos:mudou", { detail: { clienteId: id } }));
    toast.success(id ? `Desenho no projeto ${projetos.find((p) => p.id === id)?.nome_especialista ?? ""}` : "Desenho sem projeto");
    onMudou(id);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("h-7 shrink-0 gap-1 px-2 text-xs", !clienteId && "text-muted-foreground")} title="Projeto do desenho">
          <FolderKanban className="h-3.5 w-3.5" />
          <span className="max-w-[140px] truncate">{atual?.nome_especialista ?? (clienteId ? "Projeto" : "Sem projeto")}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuItem onClick={() => void escolher(null)}>
          <Check className={cn("mr-2 h-4 w-4", clienteId ? "opacity-0" : "")} />Sem projeto
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {projetos.map((p) => (
          <DropdownMenuItem key={p.id} onClick={() => void escolher(p.id)}>
            <Check className={cn("mr-2 h-4 w-4", p.id === clienteId ? "" : "opacity-0")} />
            <span className="truncate">{p.nome_especialista}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Desenho() {
  const { id } = useParams<{ id: string }>();
  const [clienteId, setClienteId] = useState<string | null | undefined>(undefined);
  const excluirDesenho = useExcluirDesenho();
  useEffect(() => {
    if (!id) return;
    void supabase.from("documentos").select("cliente_id").eq("id", id).maybeSingle()
      .then(({ data }) => setClienteId((data?.cliente_id as string | null | undefined) ?? null));
  }, [id]);
  if (!id) return null;
  return (
    <div className="h-full">
      {/* A lousa lê o projeto ao abrir (os cards do Kanban dependem dele): trocar de projeto monta de novo. */}
      <MindMapEditor
        key={`${id}:${clienteId ?? "sem"}`}
        documentoId={id}
        pagina
        onClose={() => undefined}
        onExcluir={() => void excluirDesenho(id)}
        extraTopo={clienteId !== undefined && <SeletorProjeto documentoId={id} clienteId={clienteId} onMudou={setClienteId} />}
      />
    </div>
  );
}
