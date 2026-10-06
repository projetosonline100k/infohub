import { useState } from "react";
import { Editor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, ChevronDown, Italic, Link, RemoveFormatting, Strikethrough, Underline } from "lucide-react";
import { cn } from "@/lib/utils";
import { CORES_GRIFO, CORES_TEXTO, FONTES, TAMANHOS } from "@/lib/tiptapEstiloTexto";
import { trIsolarLinhasDaSelecao } from "@/lib/tiptapIsolarLinhas";
import { pedirTexto } from "@/components/DialogosGlobais";

type Painel = "tipo" | "fonte" | "tamanho" | "cor" | null;

const TIPOS = [
  { nome: "Texto", nivel: 0 },
  { nome: "Título 1", nivel: 1 },
  { nome: "Título 2", nivel: 2 },
  { nome: "Título 3", nivel: 3 },
] as const;

// Ver trIsolarLinhasDaSelecao: só a linha selecionada muda de tipo.
function isolarLinhasDaSelecao(editor: Editor) {
  const tr = trIsolarLinhasDaSelecao(editor.state);
  if (tr) editor.view.dispatch(tr);
}

// Todos os cliques usam onMouseDown + preventDefault: assim o editor não
// perde o foco nem a seleção, e o menu continua aberto enquanto se formata.
const semPerderSelecao = (acao: () => void) => (event: React.MouseEvent) => {
  event.preventDefault();
  acao();
};

function Botao({ ativo, titulo, onAcionar, children, className }: {
  ativo?: boolean; titulo: string; onAcionar: () => void; children: React.ReactNode; className?: string;
}) {
  return <button type="button" title={titulo} aria-label={titulo} aria-pressed={ativo} onMouseDown={semPerderSelecao(onAcionar)}
    className={cn("flex h-7 min-w-7 items-center justify-center gap-1 rounded px-1.5 text-sm hover:bg-muted", ativo && "bg-muted text-primary", className)}>
    {children}
  </button>;
}

// Menu flutuante que aparece ao selecionar texto (estilo Notion): tipo de
// bloco, fonte, tamanho, negrito/itálico/sublinhado/tachado, cor do texto,
// marca-texto colorido e link.
export function MenuSelecaoTexto({ editor }: { editor: Editor }) {
  const [painel, setPainel] = useState<Painel>(null);
  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      negrito: e.isActive("bold"),
      italico: e.isActive("italic"),
      sublinhado: e.isActive("underline"),
      tachado: e.isActive("strike"),
      link: e.isActive("link"),
      grifo: e.isActive("highlight"),
      nivel: [1, 2, 3].find((nivel) => e.isActive("heading", { level: nivel })) || 0,
      fonte: (e.getAttributes("textStyle").fontFamily as string | undefined) || "",
      tamanho: (e.getAttributes("textStyle").fontSize as string | undefined) || "",
      cor: (e.getAttributes("textStyle").color as string | undefined) || "",
    }),
  });

  const alternar = (alvo: Painel) => setPainel((atual) => atual === alvo ? null : alvo);
  const cadeia = () => editor.chain().focus();

  const definirLink = async () => {
    if (estado.link) { cadeia().extendMarkRange("link").unsetLink().run(); return; }
    const url = await pedirTexto("Endereço do link:");
    if (!url?.trim()) return;
    cadeia().extendMarkRange("link").setLink({ href: /^https?:\/\//i.test(url) ? url.trim() : `https://${url.trim()}` }).run();
  };

  const tipoAtual = TIPOS.find((tipo) => tipo.nivel === estado.nivel)?.nome || "Texto";
  const fonteAtual = FONTES.find((fonte) => fonte.valor === estado.fonte)?.nome || "Padrão";
  const tamanhoAtual = TAMANHOS.find((tamanho) => tamanho.valor === estado.tamanho)?.nome || "Normal";

  return <BubbleMenu editor={editor} options={{ placement: "top", offset: 8 }} onMouseDown={(event) => event.preventDefault()}
    className="z-[300] rounded-lg border bg-popover text-popover-foreground shadow-lg">
    <div className="flex items-center gap-0.5 p-1">
      <Botao titulo="Tipo de texto" ativo={painel === "tipo"} onAcionar={() => alternar("tipo")} className="px-2">{tipoAtual}<ChevronDown className="h-3 w-3 opacity-60" /></Botao>
      <Botao titulo="Fonte" ativo={painel === "fonte"} onAcionar={() => alternar("fonte")} className="px-2">{fonteAtual}<ChevronDown className="h-3 w-3 opacity-60" /></Botao>
      <Botao titulo="Tamanho" ativo={painel === "tamanho"} onAcionar={() => alternar("tamanho")} className="px-2">{tamanhoAtual}<ChevronDown className="h-3 w-3 opacity-60" /></Botao>
      <span className="mx-0.5 h-5 w-px bg-border" />
      <Botao titulo="Negrito (⌘B)" ativo={estado.negrito} onAcionar={() => cadeia().toggleBold().run()}><Bold className="h-4 w-4" /></Botao>
      <Botao titulo="Itálico (⌘I)" ativo={estado.italico} onAcionar={() => cadeia().toggleItalic().run()}><Italic className="h-4 w-4" /></Botao>
      <Botao titulo="Sublinhado (⌘U)" ativo={estado.sublinhado} onAcionar={() => cadeia().toggleUnderline().run()}><Underline className="h-4 w-4" /></Botao>
      <Botao titulo="Tachado" ativo={estado.tachado} onAcionar={() => cadeia().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></Botao>
      <span className="mx-0.5 h-5 w-px bg-border" />
      <Botao titulo="Cor e marca-texto" ativo={painel === "cor" || estado.grifo || !!estado.cor} onAcionar={() => alternar("cor")}>
        <span className="text-sm font-semibold underline decoration-2 underline-offset-2" style={{ color: estado.cor || undefined }}>A</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Botao>
      <Botao titulo={estado.link ? "Remover link" : "Adicionar link"} ativo={estado.link} onAcionar={definirLink}><Link className="h-4 w-4" /></Botao>
      <Botao titulo="Limpar formatação" onAcionar={() => cadeia().unsetAllMarks().run()}><RemoveFormatting className="h-4 w-4" /></Botao>
    </div>

    {painel === "tipo" && <div className="border-t p-1">
      {TIPOS.map((tipo) => <button key={tipo.nome} type="button" onMouseDown={semPerderSelecao(() => {
        isolarLinhasDaSelecao(editor);
        if (tipo.nivel === 0) cadeia().setParagraph().run(); else cadeia().setHeading({ level: tipo.nivel }).run();
        setPainel(null);
      })} className={cn("flex w-full rounded px-2 py-1 text-left hover:bg-muted", tipo.nivel === estado.nivel && "text-primary", tipo.nivel === 1 ? "text-lg font-bold" : tipo.nivel === 2 ? "text-base font-bold" : tipo.nivel === 3 ? "text-sm font-semibold" : "text-sm")}>{tipo.nome}</button>)}
    </div>}

    {painel === "fonte" && <div className="border-t p-1">
      {FONTES.map((fonte) => <button key={fonte.nome} type="button" onMouseDown={semPerderSelecao(() => {
        if (fonte.valor) cadeia().setFontFamily(fonte.valor).run(); else cadeia().unsetFontFamily().run();
        setPainel(null);
      })} className={cn("flex w-full rounded px-2 py-1 text-left text-sm hover:bg-muted", fonte.valor === estado.fonte && "text-primary")} style={{ fontFamily: fonte.valor || undefined }}>{fonte.nome}</button>)}
    </div>}

    {painel === "tamanho" && <div className="border-t p-1">
      {TAMANHOS.map((tamanho) => <button key={tamanho.nome} type="button" onMouseDown={semPerderSelecao(() => {
        if (tamanho.valor) cadeia().setFontSize(tamanho.valor).run(); else cadeia().unsetFontSize().run();
        setPainel(null);
      })} className={cn("flex w-full rounded px-2 py-1 text-left hover:bg-muted", tamanho.valor === estado.tamanho && "text-primary")} style={{ fontSize: tamanho.valor || undefined }}>{tamanho.nome}</button>)}
    </div>}

    {painel === "cor" && <div className="space-y-2 border-t p-2">
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Cor do texto</p>
        <div className="flex flex-wrap gap-1">
          {CORES_TEXTO.map((cor) => <button key={cor.nome} type="button" title={cor.nome} aria-label={`Texto ${cor.nome}`} onMouseDown={semPerderSelecao(() => {
            if (cor.valor) cadeia().setColor(cor.valor).run(); else cadeia().unsetColor().run();
          })} className={cn("flex h-6 w-6 items-center justify-center rounded border text-sm font-semibold hover:bg-muted", cor.valor === estado.cor && "ring-2 ring-primary")} style={{ color: cor.valor || undefined }}>A</button>)}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Marca-texto</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" title="Sem marca-texto" aria-label="Sem marca-texto" onMouseDown={semPerderSelecao(() => cadeia().unsetHighlight().run())} className="flex h-6 w-6 items-center justify-center rounded border text-xs text-muted-foreground hover:bg-muted">∅</button>
          {CORES_GRIFO.map((cor) => <button key={cor.nome} type="button" title={cor.nome} aria-label={`Marca-texto ${cor.nome}`} onMouseDown={semPerderSelecao(() => cadeia().setHighlight({ color: cor.valor }).run())}
            className={cn("h-6 w-6 rounded border", editor.isActive("highlight", { color: cor.valor }) && "ring-2 ring-primary")} style={{ background: cor.valor }} />)}
        </div>
      </div>
    </div>}
  </BubbleMenu>;
}
