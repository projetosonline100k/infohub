import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { SlashCommandMenu, type SlashCommandMenuHandle, type SlashMenuItem } from "./SlashCommandMenu";

interface ComandoItem extends SlashMenuItem {
  run: (props: { editor: Editor; range: Range }) => void;
}

function listarComandos(
  query: string,
  abrirPicker: (props: { editor: Editor; range: Range }) => void
): ComandoItem[] {
  const itens: ComandoItem[] = [
    {
      title: "Título",
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
    },
    {
      title: "Cabeçalho",
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
    },
    {
      title: "Subtítulo",
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
    },
    {
      title: "Corpo",
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    {
      title: "Lista com Marcadores",
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      title: "Lista Numerada",
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      title: "Checklist",
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      title: "Citação em Bloco",
      run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      // Não insere nada sozinha — abre o picker de busca; a inserção de
      // verdade acontece só depois que uma atividade é escolhida ali.
      title: "Atividade de outro cliente",
      run: ({ editor, range }) => abrirPicker({ editor, range }),
    },
  ];

  if (!query) return itens;
  const termo = query.toLowerCase();
  return itens.filter((item) => item.title.toLowerCase().includes(termo));
}

export const SlashCommand = Extension.create<{
  abrirPicker: (props: { editor: Editor; range: Range }) => void;
}>({
  name: "slashCommand",

  addOptions() {
    return {
      abrirPicker: () => {},
    };
  },

  addProseMirrorPlugins() {
    const abrirPicker = this.options.abrirPicker;

    return [
      Suggestion<ComandoItem, ComandoItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => listarComandos(query, abrirPicker),
        command: ({ editor, range, props }) => {
          props.run({ editor, range });
        },
        render: () => {
          let component: ReactRenderer<SlashCommandMenuHandle>;
          let popup: HTMLDivElement;

          const posicionar = (clientRect: (() => DOMRect | null) | null | undefined) => {
            const rect = clientRect?.();
            if (!rect || !popup) return;
            popup.style.left = `${rect.left}px`;
            popup.style.top = `${rect.bottom + 6}px`;
          };

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashCommandMenu, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              });

              popup = document.createElement("div");
              popup.style.position = "fixed";
              popup.style.zIndex = "100";
              popup.appendChild(component.element);
              document.body.appendChild(popup);
              posicionar(props.clientRect);
            },
            onUpdate(props) {
              component.updateProps({ items: props.items, command: props.command });
              posicionar(props.clientRect);
            },
            onKeyDown(props) {
              if (props.event.key === "Escape") {
                popup.remove();
                return true;
              }
              return component.ref?.onKeyDown(props) ?? false;
            },
            onExit() {
              popup.remove();
              component.destroy();
            },
          };
        },
      }),
    ];
  },
});
