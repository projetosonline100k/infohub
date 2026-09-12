import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";

export interface CursorRemoto {
  nome: string;
  cor: string;
  from: number;
  to: number;
}

export const remoteCursorPluginKey = new PluginKey("remote-cursor");

function criarElementoCursor(cursor: CursorRemoto): HTMLElement {
  const caret = document.createElement("span");
  caret.className = "remote-cursor-caret";
  caret.style.borderColor = cursor.cor;

  const label = document.createElement("span");
  label.className = "remote-cursor-label";
  label.style.backgroundColor = cursor.cor;
  label.textContent = cursor.nome;
  caret.appendChild(label);

  return caret;
}

// Um "cursor de verdade" (barrinha + nome), tipo Google Docs, sem precisar
// migrar o documento inteiro pra um CRDT (Yjs). A posição vem por broadcast
// (efêmero, não grava no banco) e pode ficar levemente desatualizada por
// uma fração de segundo entre uma edição e a próxima — aceitável pro que é.
export function criarPluginCursorRemoto(cursoresRef: { current: Record<string, CursorRemoto> }) {
  return new Plugin({
    key: remoteCursorPluginKey,
    props: {
      decorations(state) {
        const tamanho = state.doc.content.size;
        const decoracoes = Object.entries(cursoresRef.current).map(([chave, cursor]) => {
          const pos = Math.max(0, Math.min(cursor.from, tamanho));
          return Decoration.widget(pos, () => criarElementoCursor(cursor), { key: chave, side: 1 });
        });
        return DecorationSet.create(state.doc, decoracoes);
      },
    },
  });
}

// Força o ProseMirror a recalcular as decorações (o plugin lê de uma ref
// mutável, então uma atualização remota sozinha não dispara re-render).
export function redesenharCursores(editor: Editor) {
  if (!editor || editor.isDestroyed) return;
  editor.view.dispatch(editor.view.state.tr.setMeta("remoteCursor", true));
}
