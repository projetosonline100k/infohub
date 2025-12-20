import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, FileText, Trash2, Upload } from "lucide-react";

interface Knowledge {
  id: string;
  nome: string;
  caracteres: number;
  created_at: string;
}

interface KnowledgeUploadProps {
  agenteId: string;
  clienteId: string;
  conhecimentos: Knowledge[];
  onUpdate: () => void;
}

export function KnowledgeUpload({ agenteId, clienteId, conhecimentos, onUpdate }: KnowledgeUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    const validTypes = ['application/pdf', 'text/plain', 'text/markdown'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.md')) {
      toast.error("Formato não suportado. Use PDF, TXT ou MD.");
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }

    setUploading(true);

    try {
      // Upload file to storage
      const fileName = `${clienteId}/${agenteId}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('conhecimentos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('conhecimentos')
        .getPublicUrl(fileName);

      // Extract text content
      let conteudo = "";
      if (file.type === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        conteudo = await file.text();
      } else if (file.type === 'application/pdf') {
        // For PDFs, we'll need to process on the server or use a simple approach
        // For now, we'll store the URL and process later
        conteudo = `[PDF: ${file.name}] - Conteúdo será extraído do arquivo.`;
        
        // Call edge function to process PDF
        const { data: pdfData, error: pdfError } = await supabase.functions.invoke('process-pdf', {
          body: { fileUrl: publicUrl, fileName: file.name }
        });
        
        if (!pdfError && pdfData?.content) {
          conteudo = pdfData.content;
        }
      }

      // Save to database
      const { error: dbError } = await supabase
        .from('conhecimentos_agente')
        .insert({
          agente_id: agenteId,
          cliente_id: clienteId,
          nome: file.name,
          tipo: file.type === 'application/pdf' ? 'pdf' : 'txt',
          conteudo_extraido: conteudo,
          arquivo_url: publicUrl,
          caracteres: conteudo.length,
        });

      if (dbError) throw dbError;

      toast.success("Documento adicionado!");
      onUpdate();
    } catch (error) {
      console.error("Error uploading:", error);
      toast.error("Erro ao enviar documento");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase
        .from('conhecimentos_agente')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success("Documento removido!");
      onUpdate();
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Erro ao remover documento");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">📚 Base de Conhecimento</span>
        <span className="text-xs text-muted-foreground">{conhecimentos.length} documento(s)</span>
      </div>

      {/* Lista de documentos */}
      {conhecimentos.length > 0 && (
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {conhecimentos.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-2 bg-muted/50 rounded-md text-sm"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{doc.nome}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {doc.caracteres.toLocaleString()} chars
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => handleDelete(doc.id)}
                disabled={deleting === doc.id}
              >
                {deleting === doc.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3 text-destructive" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !agenteId}
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
          ) : (
            <Upload className="h-3 w-3 mr-2" />
          )}
          Adicionar PDF ou documento
        </Button>
        {!agenteId && (
          <p className="text-xs text-muted-foreground mt-1 text-center">
            Salve o agente primeiro
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Os documentos serão usados como referência nas respostas da IA
      </p>
    </div>
  );
}
