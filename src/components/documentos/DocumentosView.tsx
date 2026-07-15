import { useState, useEffect } from "react";
import { FileText, Plus, Search, Trash2, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DocumentEditor } from "./DocumentEditor";
import { CadernoEditor, createEmptyCadernoContent, isCadernoContent } from "./CadernoEditor";
import { toast } from "sonner";

interface Documento {
  id: string;
  titulo: string;
  conteudo: string | null;
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
  const [cadernoEditorOpen, setCadernoEditorOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const carregarDocumentos = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from("documentos")
      .select("id, titulo, conteudo, created_at, updated_at, atividade_id")
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

  const criarNovoCaderno = async () => {
    const { data, error } = await supabase
      .from("documentos")
      .insert({
        cliente_id: clienteId,
        titulo: "Caderno sem título",
        conteudo: createEmptyCadernoContent(),
      })
      .select()
      .single();

    if (data && !error) {
      setSelectedDocId(data.id);
      setCadernoEditorOpen(true);
    } else {
      toast.error("Erro ao criar caderno");
    }
  };

  const abrirDocumento = (docId: string) => {
    setSelectedDocId(docId);
    setDocEditorOpen(true);
  };

  const abrirCaderno = (docId: string) => {
    setSelectedDocId(docId);
    setCadernoEditorOpen(true);
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
    setCadernoEditorOpen(false);
    setSelectedDocId(null);
    carregarDocumentos();
  };

  const documentosFiltrados = documentos.filter((doc) => {
    const matchesSearch = doc.titulo.toLowerCase().includes(busca.toLowerCase());
    return matchesSearch && !isCadernoContent(doc.conteudo);
  });

  const cadernosFiltrados = documentos.filter((doc) => {
    const matchesSearch = doc.titulo.toLowerCase().includes(busca.toLowerCase());
    return matchesSearch && isCadernoContent(doc.conteudo);
  });

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
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={criarNovoCaderno}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Caderno
          </Button>
          <Button size="sm" onClick={criarNovoDocumento}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Documento
          </Button>
        </div>
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

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Caderno
          </h3>
          <Button size="sm" variant="ghost" onClick={criarNovoCaderno}>
            <Plus className="h-4 w-4 mr-1" />
            Criar
          </Button>
        </div>

        {cadernosFiltrados.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-muted-foreground">
            {busca ? "Nenhum caderno encontrado." : "Nenhum caderno criado ainda."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cadernosFiltrados.map((doc) => (
              <div
                key={doc.id}
                onClick={() => abrirCaderno(doc.id)}
                className={cn(
                  "overflow-hidden rounded-lg border border-border bg-card cursor-pointer",
                  "hover:border-primary/50 hover:shadow-md transition-all group"
                )}
              >
                <div className="h-28 bg-[radial-gradient(circle,#d1d5db_1.2px,transparent_1.2px)] [background-size:18px_18px] bg-white relative">
                  <div className="absolute left-6 top-8 h-9 w-28 rounded-full border-t-2 border-foreground/70 rotate-[-5deg]" />
                  <div className="absolute left-14 top-14 h-8 w-24 rounded-full border-t-2 border-blue-500/70 rotate-[3deg]" />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-medium truncate">{doc.titulo}</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Atualizado {formatDistanceToNow(new Date(doc.updated_at), {
                          locale: ptBR,
                          addSuffix: true,
                        })}
                      </p>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Documentos
        </h3>

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
      </section>

      {/* Document Editor Modal */}
      {docEditorOpen && selectedDocId && (
        <DocumentEditor documentoId={selectedDocId} onClose={handleCloseEditor} />
      )}

      {cadernoEditorOpen && selectedDocId && (
        <CadernoEditor documentoId={selectedDocId} onClose={handleCloseEditor} />
      )}
    </div>
  );
}
