import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { SlashCommandMenu, type SlashCommandMenuHandle, type SlashMenuItem } from "@/components/atividades/notas/SlashCommandMenu";

// "/" no documento (24/10, Davi: "ao digitar / mostrar coisas especiais — 1: criar colunas, tipo kanban, igual o
// Notion"). Abre o menu na hora; o que vem depois da barra filtra (ex.: "/qua" → Quadro).
interface Comando extends SlashMenuItem {
  busca: string;
  run: (p: { editor: Editor; range: Range }) => void;
}

const COMANDOS: Comando[] = [
  { title: "Quadro (colunas tipo Kanban)", busca: "quadro kanban colunas board notion", run: ({ editor, range }) => editor.chain().focus().deleteRange(range).inserirQuadro().run() },
  { title: "Título", busca: "titulo h1", run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run() },
  { title: "Cabeçalho", busca: "cabecalho h2", run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run() },
  { title: "Subtítulo", busca: "subtitulo h3", run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run() },
  { title: "Texto", busca: "texto corpo paragrafo", run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run() },
  { title: "Lista com marcadores", busca: "lista marcadores bullet", run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  { title: "Lista numerada", busca: "lista numerada", run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  { title: "Citação", busca: "citacao bloco quote", run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
  { title: "Divisória", busca: "divisoria linha separador", run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const ComandosBarra = Extension.create({
  name: "comandosBarra",
  addProseMirrorPlugins() {
    return [
      Suggestion<Comando, Comando>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        // Só depois de espaço ou no começo da linha: "24/10" e links não abrem o menu.
        allowedPrefixes: [" ", " "],
        items: ({ query }) => {
          const q = semAcento(query);
          return q ? COMANDOS.filter((c) => semAcento(`${c.title} ${c.busca}`).includes(q)) : COMANDOS;
        },
        command: ({ editor, range, props }) => props.run({ editor, range }),
        render: () => {
          let componente: ReactRenderer<SlashCommandMenuHandle>;
          let caixa: HTMLDivElement;
          const posicionar = (rect: (() => DOMRect | null) | null | undefined) => {
            const r = rect?.();
            if (!r || !caixa) return;
            caixa.style.left = `${r.left}px`;
            caixa.style.top = `${Math.min(r.bottom + 6, window.innerHeight - 340)}px`;
          };
          return {
            onStart: (props) => {
              componente = new ReactRenderer(SlashCommandMenu, { props: { items: props.items, command: props.command }, editor: props.editor });
              caixa = document.createElement("div");
              caixa.style.position = "fixed";
              caixa.style.zIndex = "200";
              caixa.appendChild(componente.element);
              document.body.appendChild(caixa);
              posicionar(props.clientRect);
            },
            onUpdate: (props) => { componente.updateProps({ items: props.items, command: props.command }); posicionar(props.clientRect); },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") { caixa.remove(); return true; }
              return componente.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => { caixa.remove(); componente.destroy(); },
          };
        },
      }),
    ];
  },
});
