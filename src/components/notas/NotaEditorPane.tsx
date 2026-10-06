import { useState } from "react";
import {
  ArrowLeft,
  Bold,
  Copy,
  FolderInput,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  MoreHorizontal,
  Pin,
  PinOff,
  RotateCcw,
  Trash2,
  Underline as UnderlineIcon,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuSelecaoTexto } from "@/components/documentos/MenuSelecaoTexto";
import { useNotaEditor } from "@/hooks/useNotaEditor";
import { cn } from "@/lib/utils";
import type { AssistantDocumento } from "@/hooks/useAssistantDocumentos";
import type { NotaPasta } from "@/hooks/useNotasPastas";
import "@/components/documentos/editor.css";
import { pedirTexto } from "@/components/DialogosGlobais";

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
  // Corrige o cache local (useAssistantDocumentos) depois de cada autosave
  // — ver comentário em useNotaEditor.ts. Sem isto, reabrir a nota mostra
  // conteúdo desatualizado mesmo com o autosave funcionando normalmente.
  onNotaAtualizada?: (id: string, patch: Partial<AssistantDocumento>) => void;
  compact?: boolean;
  // Botão extra no começo da barra (página /notas: mostrar/ocultar pastas).
  acaoEsquerda?: React.ReactNode;
}

function formatarEdicaoCompacta(data: Date): string {
  const hora = format(data, "HH:mm");
  if (isToday(data)) return `Editada hoje às ${hora}`;
  if (isYesterday(data)) return `Editada ontem às ${hora}`;
  return `Editada em ${format(data, "d 'de' MMM", { locale: ptBR })} às ${hora}`;
}

function BotaoFormatacao({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
        active && "bg-accent/15 text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// Barra de formatação compacta (item "Aa" do pedido) — só os 7 comandos
// pedidos, nada do resto do DocumentToolbar (alinhamento, destaque,
// tachado, desfazer/refazer) pra caber numa linha só e ficar discreta.
// Fica escondida por padrão; só aparece quando a pessoa clica em "Aa".
function FormatacaoCompacta({ editor }: { editor: Editor }) {
  const heading = editor.isActive("heading", { level: 1 })
    ? "1"
    : editor.isActive("heading", { level: 2 })
      ? "2"
      : editor.isActive("heading", { level: 3 })
        ? "3"
        : "paragraph";

  return (
    <div className="flex items-center gap-0.5 border-t border-border/60 pt-1.5">
      <Select
        value={heading}
        onValueChange={(v) => {
          if (v === "paragraph") editor.chain().focus().setParagraph().run();
          else editor.chain().focus().toggleHeading({ level: Number(v) as 1 | 2 | 3 }).run();
        }}
      >
        <SelectTrigger className="h-7 w-[74px] shrink-0 px-1.5 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="paragraph">Texto</SelectItem>
          <SelectItem value="1">Título 1</SelectItem>
          <SelectItem value="2">Título 2</SelectItem>
          <SelectItem value="3">Título 3</SelectItem>
        </SelectContent>
      </Select>
      <BotaoFormatacao onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrito">
        <Bold className="h-3.5 w-3.5" />
      </BotaoFormatacao>
      <BotaoFormatacao onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Itálico">
        <Italic className="h-3.5 w-3.5" />
      </BotaoFormatacao>
      <BotaoFormatacao onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Sublinhado">
        <UnderlineIcon className="h-3.5 w-3.5" />
      </BotaoFormatacao>
      <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      <BotaoFormatacao onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Lista">
        <List className="h-3.5 w-3.5" />
      </BotaoFormatacao>
      <BotaoFormatacao onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive("taskList")} title="Checklist">
        <ListChecks className="h-3.5 w-3.5" />
      </BotaoFormatacao>
      <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      <BotaoFormatacao
        onClick={async () => {
          const url = await pedirTexto("URL do link:");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        active={editor.isActive("link")}
        title="Link"
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </BotaoFormatacao>
    </div>
  );
}

// Editor completo da nota (item 2) — mesmo Tiptap/useNotaEditor.ts
// (compartilhado com a página /notas). O modo compact (Jarvis) tem chrome
// próprio — cabeçalho "← Notas / Aa / 📌 / •••" e formatação escondida por
// padrão — bem diferente do modo desktop (DocumentToolbar sempre visível),
// então os dois viraram blocos praticamente separados aqui dentro, embora
// usem os mesmos dados/autosave por baixo.
export function NotaEditorPane({ nota, onVoltar, onFixar, onExcluir, onDuplicar, onMoverParaPasta, pastas, onRestaurar, onNotaAtualizada, compact, acaoEsquerda }: NotaEditorPaneProps) {
  const { editor, titulo, onTituloChange, salvando, salvoEm } = useNotaEditor(nota, onNotaAtualizada);
  const naLixeira = !!nota.deleted_at;
  const [mostrarFormatacao, setMostrarFormatacao] = useState(false);

  if (compact) {
    return (
      <div className="flex h-full w-full flex-col">
        <div className="flex shrink-0 items-center gap-0.5 pb-2">
          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              className="-ml-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Notas
            </button>
          )}
          <div className="flex-1" />
          {!naLixeira && editor && (
            <button
              type="button"
              onClick={() => setMostrarFormatacao((v) => !v)}
              title="Formatação"
              aria-label="Formatação"
              className={cn(
                "rounded-md px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                mostrarFormatacao && "bg-muted text-foreground"
              )}
            >
              Aa
            </button>
          )}
          {!naLixeira && (
            <button
              type="button"
              onClick={() => onFixar(nota.id, !nota.fixado)}
              title={nota.fixado ? "Desafixar" : "Fixar"}
              aria-label={nota.fixado ? "Desafixar nota" : "Fixar nota"}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {nota.fixado ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Mais opções"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {naLixeira ? (
                onRestaurar && <DropdownMenuItem onClick={() => onRestaurar(nota.id)}>Restaurar</DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onExcluir(nota.id)}>
                  Excluir
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Input
          value={titulo}
          onChange={(e) => onTituloChange(e.target.value)}
          placeholder="Título"
          disabled={naLixeira}
          className="mb-0.5 ml-7 w-auto shrink-0 border-none px-0 text-lg font-bold shadow-none focus-visible:ring-0"
        />
        <p className="mb-3 shrink-0 pl-7 text-xs text-muted-foreground">
          {salvando ? "Salvando..." : salvoEm ? formatarEdicaoCompacta(salvoEm) : formatarEdicaoCompacta(new Date(nota.updated_at))}
        </p>

        {/* pl-7: espaço pras setas dos títulos recolhíveis (ficam à esquerda
            do texto) — sem isso eram cortadas e não dava pra abrir no Jarvis. */}
        <div className="min-h-0 flex-1 overflow-y-auto pl-7">
          <EditorContent editor={editor} className="prose prose-sm max-w-none document-editor dark:prose-invert" />
        </div>

        {mostrarFormatacao && !naLixeira && editor && <FormatacaoCompacta editor={editor} />}
      </div>
    );
  }

  // Layout tipo Apple Notes: barra discreta (voltar · data · ações), título
  // grande e o texto direto — sem barra de formatação fixa; formatar é pelo
  // menu que aparece ao selecionar texto (MenuSelecaoTexto).
  const dataEdicao = salvoEm || new Date(nota.updated_at);
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 items-center gap-1 pb-2">
        {acaoEsquerda}
        {onVoltar && (
          <button type="button" onClick={onVoltar} aria-label="Voltar para as notas"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Notas
          </button>
        )}
        <div className="flex-1" />
        {naLixeira ? (
          onRestaurar && (
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => onRestaurar(nota.id)}>
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar
            </Button>
          )
        ) : (
          <>
            {editor && (
              <Button type="button" variant="ghost" size="icon" className={cn("h-8 w-8", editor.isActive("taskList") && "bg-muted")} title="Checklist"
                aria-label="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}>
                <ListChecks className="h-4 w-4" />
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onFixar(nota.id, !nota.fixado)}
              aria-label={nota.fixado ? "Desafixar nota" : "Fixar nota"} title={nota.fixado ? "Desafixar" : "Fixar"}>
              {nota.fixado ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais opções" title="Mais opções">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {onMoverParaPasta && pastas && (
                  <>
                    <DropdownMenuItem onClick={() => onMoverParaPasta(nota.id, null)} disabled={!nota.pasta_id}>
                      <FolderInput className="mr-2 h-4 w-4" />Sem pasta
                    </DropdownMenuItem>
                    {pastas.map((p) => (
                      <DropdownMenuItem key={p.id} onClick={() => onMoverParaPasta(nota.id, p.id)} disabled={nota.pasta_id === p.id}>
                        <FolderInput className="mr-2 h-4 w-4" />Mover para {p.nome}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {onDuplicar && (
                  <DropdownMenuItem onClick={() => onDuplicar(nota.id)}><Copy className="mr-2 h-4 w-4" />Duplicar</DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onExcluir(nota.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* pl-7: espaço à esquerda pras setas dos títulos recolhíveis, que
            ficam fora da linha do texto — sem isso elas eram cortadas. */}
        <div className="mx-auto w-full max-w-3xl pl-7">
          <p className="mb-3 text-center text-xs text-muted-foreground"
            title={`Criada em ${format(new Date(nota.created_at), "d 'de' MMM 'de' yyyy", { locale: ptBR })}`}>
            {salvando ? "Salvando..." : format(dataEdicao, "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
          <Input
            value={titulo}
            onChange={(e) => onTituloChange(e.target.value)}
            placeholder="Título"
            disabled={naLixeira}
            className="mb-1 h-auto border-none bg-transparent px-0 py-1 text-3xl font-bold shadow-none focus-visible:ring-0 md:text-3xl"
          />
          <EditorContent editor={editor} className="prose prose-lg max-w-none document-editor pb-16 dark:prose-invert" />
          {editor && !naLixeira && <MenuSelecaoTexto editor={editor} />}
        </div>
      </div>
    </div>
  );
}
