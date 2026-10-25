import { Mark, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/react";

// Trecho comentado no documento (25/10, Davi: "comentário igual ao do Google"): uma marca com o id do comentário
// (tabela documento_comentarios). Fica salva no HTML do documento como <span data-comentario="id">.
export const Comentario = Mark.create({
  name: "comentario",
  inclusive: false,
  excludes: "",
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-comentario"),
        renderHTML: (attrs) => (attrs.id ? { "data-comentario": attrs.id } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-comentario]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "comentario-marca" }), 0];
  },
});

/** Tira a marca de um comentário do documento inteiro (resolvido ou apagado). */
export function tirarMarcaComentario(editor: Editor, id: string) {
  const tipo = editor.schema.marks.comentario;
  if (!tipo) return;
  const { tr, doc } = editor.state;
  let mudou = false;
  doc.descendants((no, pos) => {
    if (!no.isText) return;
    for (const m of no.marks) {
      if (m.type === tipo && m.attrs.id === id) { tr.removeMark(pos, pos + no.nodeSize, m); mudou = true; }
    }
  });
  if (mudou) editor.view.dispatch(tr);
}

/** Ids dos comentários que ainda têm trecho marcado no documento, na ordem em que aparecem. */
export function idsComentariosNoTexto(editor: Editor): string[] {
  const tipo = editor.schema.marks.comentario;
  const ids: string[] = [];
  if (!tipo) return ids;
  editor.state.doc.descendants((no) => {
    if (!no.isText) return;
    for (const m of no.marks) if (m.type === tipo && m.attrs.id && !ids.includes(m.attrs.id)) ids.push(m.attrs.id);
  });
  return ids;
}
