import { useEffect, useRef, useState } from "react";
import { FileText, Plus, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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
  onTrocarDocumento: (novoId: string) => void;
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
    let query = supabase.from("pastas_atividade").select("id, nome").is("deleted_at", null).order("ordem");
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
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("Erro ao carregar guias:", error);
          return;
        }
        setGuias(data || []);
      });
  }, [pastaId]);

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
    <div className={cn("w-64 border-r bg-muted/30 flex flex-col h-full", className)}>
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
            <button
              key={guia.id}
              onClick={() => onTrocarDocumento(guia.id)}
              className={cn(
                "w-full text-left p-2 rounded hover:bg-muted text-sm flex items-center gap-2 transition-colors",
                guia.id === documentoAtualId && "bg-muted font-medium"
              )}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {guia.id === documentoAtualId ? tituloAtual || "Sem título" : guia.titulo || "Sem título"}
              </span>
            </button>
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
