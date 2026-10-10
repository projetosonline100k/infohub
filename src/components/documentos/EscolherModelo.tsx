import { Editor, useEditorState } from "@tiptap/react";
import { ChevronDown, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { confirmar } from "@/components/DialogosGlobais";
import { MODELOS_DOCUMENTO, type ModeloDocumento } from "@/lib/documentos/modelos";

// Aplica um modelo no documento. Se já tiver texto, pergunta antes de trocar.
async function aplicarModelo(editor: Editor, modelo: ModeloDocumento, nome: string) {
  if (!editor.isEmpty && !(await confirmar(`Trocar o conteúdo deste documento pelo modelo "${modelo.nome}"?`, { botao: "Usar modelo", destrutivo: true }))) return;
  editor.chain().focus().setContent(modelo.html(nome), { emitUpdate: true }).run();
}

// Botão "Modelos" da barra de cima do documento (sempre visível).
export function BotaoModelos({ editor, nome }: { editor: Editor | null; nome: string }) {
  if (!editor || !editor.isEditable) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <LayoutTemplate className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Modelos</span>
          <ChevronDown className="ml-1 hidden h-3.5 w-3.5 opacity-60 sm:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Preencher com um modelo</DropdownMenuLabel>
        {MODELOS_DOCUMENTO.map((modelo) => (
          <DropdownMenuItem key={modelo.id} onClick={() => void aplicarModelo(editor, modelo, nome)} className="flex flex-col items-start gap-0.5">
            <span className="font-medium">{modelo.nome}</span>
            <span className="text-xs text-muted-foreground">{modelo.descricao}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Documento vazio: oferece começar a partir de um modelo (ex.: Mentoria
// Core). Some assim que o documento tem conteúdo.
export function EscolherModelo({ editor, nome }: { editor: Editor; nome: string }) {
  const vazio = useEditorState({ editor, selector: ({ editor: e }) => e.isEmpty });
  if (!vazio || !editor.isEditable) return null;
  return (
    <div className="not-prose mt-6 rounded-xl border border-dashed p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <LayoutTemplate className="h-4 w-4" />Começar com um modelo
      </p>
      <div className="flex flex-wrap gap-2">
        {MODELOS_DOCUMENTO.map((modelo) => (
          <button
            key={modelo.id}
            type="button"
            onClick={() => void aplicarModelo(editor, modelo, nome)}
            className="rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
          >
            <span className="block text-sm font-semibold">{modelo.nome}</span>
            <span className="block text-xs text-muted-foreground">{modelo.descricao}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
