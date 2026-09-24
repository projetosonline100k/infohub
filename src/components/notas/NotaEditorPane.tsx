import { ArrowLeft, Copy, FolderInput, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import { EditorContent } from "@tiptap/react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentToolbar } from "@/components/documentos/DocumentToolbar";
import { useNotaEditor } from "@/hooks/useNotaEditor";
import type { AssistantDocumento } from "@/hooks/useAssistantDocumentos";
import type { NotaPasta } from "@/hooks/useNotasPastas";
import "@/components/documentos/editor.css";

const SEM_PASTA = "__sem_pasta__";

interface NotaEditorPaneProps {
  nota: AssistantDocumento;
  // Só no Jarvis compacto (lista <-> editor empilhados) — a página /notas
  // não precisa, os painéis já ficam visíveis ao mesmo tempo.
  onVoltar?: () => void;
  onFixar: (id: string, fixado: boolean) => void;
  onExcluir: (id: string) => void;
  onDuplicar?: (id: string) => void;
  onMoverParaPasta?: (id: string, pastaId: string | null) => void;
  pastas?: NotaPasta[];
  onRestaurar?: (id: string) => void;
  compact?: boolean;
}

// Editor completo da nota (item 2) — mesmo Tiptap/DocumentToolbar já
// usados em DocumentEditor.tsx, gerenciados por useNotaEditor.ts
// (compartilhado com o Jarvis compacto). Fixar/duplicar/mover/excluir
// (ou restaurar, se a nota estiver na lixeira) + datas de criação/edição.
export function NotaEditorPane({ nota, onVoltar, onFixar, onExcluir, onDuplicar, onMoverParaPasta, pastas, onRestaurar, compact }: NotaEditorPaneProps) {
  const { editor, titulo, onTituloChange, salvando, salvoEm } = useNotaEditor(nota);
  const naLixeira = !!nota.deleted_at;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 pb-2">
        {onVoltar && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onVoltar} aria-label="Voltar para a lista">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {salvando ? "Salvando..." : salvoEm ? `Salvo ${formatDistanceToNow(salvoEm, { locale: ptBR, addSuffix: true })}` : ""}
        </p>

        {naLixeira ? (
          onRestaurar && (
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => onRestaurar(nota.id)}>
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar
            </Button>
          )
        ) : (
          <>
            {onMoverParaPasta && pastas && (
              <Select value={nota.pasta_id ?? SEM_PASTA} onValueChange={(v) => onMoverParaPasta(nota.id, v === SEM_PASTA ? null : v)}>
                <SelectTrigger className="h-7 w-auto gap-1 border-none px-2 text-xs text-muted-foreground shadow-none [&>svg]:h-3 [&>svg]:w-3">
                  <FolderInput className="h-3.5 w-3.5" />
                  <SelectValue placeholder="Pasta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_PASTA}>Sem pasta</SelectItem>
                  {pastas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {onDuplicar && (
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onDuplicar(nota.id)} aria-label="Duplicar nota" title="Duplicar">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => onFixar(nota.id, !nota.fixado)}
              aria-label={nota.fixado ? "Desafixar nota" : "Fixar nota"}
              title={nota.fixado ? "Desafixar" : "Fixar"}
            >
              {nota.fixado ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
              onClick={() => onExcluir(nota.id)}
              aria-label="Mover para a lixeira"
              title="Excluir"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      <Input
        value={titulo}
        onChange={(e) => onTituloChange(e.target.value)}
        placeholder="Título"
        disabled={naLixeira}
        className="mb-1 shrink-0 border-none px-0 text-base font-semibold shadow-none focus-visible:ring-0"
      />

      <p
        className="mb-2 shrink-0 text-[11px] text-muted-foreground"
        title={`Criada em ${format(new Date(nota.created_at), "d 'de' MMM 'de' yyyy", { locale: ptBR })}`}
      >
        Editada {formatDistanceToNow(new Date(nota.updated_at), { locale: ptBR, addSuffix: true })}
      </p>

      {!naLixeira && editor && (
        <div className="shrink-0 overflow-x-auto pb-1">
          <DocumentToolbar editor={editor} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent
          editor={editor}
          className={compact ? "prose prose-sm max-w-none document-editor dark:prose-invert" : "prose max-w-none document-editor py-2 dark:prose-invert"}
        />
      </div>
    </div>
  );
}
