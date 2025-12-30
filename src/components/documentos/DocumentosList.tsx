import { useState, useEffect } from "react";
import { FileText, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Documento {
  id: string;
  titulo: string;
  updated_at: string;
}

interface DocumentosListProps {
  atividadeId?: string;
  clienteId?: string;
  onOpenDoc: (docId: string) => void;
}

export function DocumentosList({ atividadeId, clienteId, onOpenDoc }: DocumentosListProps) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);

  const carregarDocumentos = async () => {
    setLoading(true);
    let query = supabase.from("documentos").select("id, titulo, updated_at");

    if (atividadeId) {
      query = query.eq("atividade_id", atividadeId);
    } else if (clienteId) {
      query = query.eq("cliente_id", clienteId);
    }

    const { data, error } = await query.order("updated_at", { ascending: false });

    if (!error && data) {
      setDocumentos(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregarDocumentos();
  }, [atividadeId, clienteId]);

  const excluirDocumento = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja excluir este documento?")) return;

    await supabase.from("documentos").delete().eq("id", docId);
    setDocumentos((prev) => prev.filter((d) => d.id !== docId));
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        Carregando documentos...
      </div>
    );
  }

  if (documentos.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        Nenhum documento criado ainda.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {documentos.map((doc) => (
        <div
          key={doc.id}
          onClick={() => onOpenDoc(doc.id)}
          className={cn(
            "flex items-center justify-between p-2 rounded-md cursor-pointer",
            "hover:bg-muted transition-colors group"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{doc.titulo}</p>
              <p className="text-xs text-muted-foreground">
                Editado {formatDistanceToNow(new Date(doc.updated_at), {
                  locale: ptBR,
                  addSuffix: true,
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDoc(doc.id);
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={(e) => excluirDocumento(e, doc.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
