import { useState, useEffect } from "react";
import { FileText, Plus, Search, Trash2, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DocumentEditor } from "./DocumentEditor";
import { toast } from "sonner";

interface Documento {
  id: string;
  titulo: string;
  created_at: string;
  updated_at: string;
  atividade_id: string | null;
}

interface Atividade {
  id: string;
  titulo: string;
}

interface DocumentosViewProps {
  clienteId: string;
}

export function DocumentosView({ clienteId }: DocumentosViewProps) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [atividades, setAtividades] = useState<Record<string, Atividade>>({});
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [docEditorOpen, setDocEditorOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const carregarDocumentos = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from("documentos")
      .select("id, titulo, created_at, updated_at, atividade_id")
      .eq("cliente_id", clienteId)
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setDocumentos(data);
      
      // Carregar atividades vinculadas
      const atividadeIds = data
        .filter((d) => d.atividade_id)
        .map((d) => d.atividade_id as string);
      
      if (atividadeIds.length > 0) {
        const { data: atividadesData } = await supabase
          .from("atividades")
          .select("id, titulo")
          .in("id", atividadeIds);
        
        if (atividadesData) {
          const map: Record<string, Atividade> = {};
          atividadesData.forEach((a) => {
            map[a.id] = a;
          });
          setAtividades(map);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    carregarDocumentos();
  }, [clienteId]);

  const criarNovoDocumento = async () => {
    const { data, error } = await supabase
      .from("documentos")
      .insert({
        cliente_id: clienteId,
        titulo: "Documento sem título",
      })
      .select()
      .single();

    if (data && !error) {
      setSelectedDocId(data.id);
      setDocEditorOpen(true);
    } else {
      toast.error("Erro ao criar documento");
    }
  };

  const abrirDocumento = (docId: string) => {
    setSelectedDocId(docId);
    setDocEditorOpen(true);
  };

  const excluirDocumento = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja excluir este documento?")) return;

    const { error } = await supabase.from("documentos").delete().eq("id", docId);
    
    if (!error) {
      setDocumentos((prev) => prev.filter((d) => d.id !== docId));
      toast.success("Documento excluído");
    } else {
      toast.error("Erro ao excluir documento");
    }
  };

  const handleCloseEditor = () => {
    setDocEditorOpen(false);
    setSelectedDocId(null);
    carregarDocumentos();
  };

  const documentosFiltrados = documentos.filter((doc) =>
    doc.titulo.toLowerCase().includes(busca.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground">Carregando documentos...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide">
            Documentos
          </h2>
        </div>
        <Button size="sm" onClick={criarNovoDocumento}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Documento
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar documentos..."
          className="pl-9 bg-muted/50 border-muted"
        />
      </div>

      {/* Documents List */}
      {documentosFiltrados.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {busca ? "Nenhum documento encontrado." : "Nenhum documento criado ainda."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documentosFiltrados.map((doc) => (
            <div
              key={doc.id}
              onClick={() => abrirDocumento(doc.id)}
              className={cn(
                "p-4 rounded-lg border border-border bg-card cursor-pointer",
                "hover:border-primary/50 hover:shadow-md transition-all group"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <h3 className="font-medium truncate">{doc.titulo}</h3>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive shrink-0"
                  onClick={(e) => excluirDocumento(e, doc.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground mt-2">
                Atualizado {formatDistanceToNow(new Date(doc.updated_at), {
                  locale: ptBR,
                  addSuffix: true,
                })}
              </p>

              {doc.atividade_id && atividades[doc.atividade_id] && (
                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                  <LinkIcon className="h-3 w-3" />
                  <span className="truncate">
                    {atividades[doc.atividade_id].titulo}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Document Editor Modal */}
      {docEditorOpen && selectedDocId && (
        <DocumentEditor documentoId={selectedDocId} onClose={handleCloseEditor} />
      )}
    </div>
  );
}
