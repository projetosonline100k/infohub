import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";

// Total de caracteres do documento + do trecho selecionado no momento,
// pro rodapé do editor mostrar "X selecionados · Y caracteres" (igual ao
// contador do Roteiro). Usa o evento "transaction" (não "update") porque
// ele dispara também em mudanças programáticas com emitUpdate: false —
// como o conteúdo chegando de outra pessoa via colaboração — então o
// total não fica desatualizado depois de uma edição remota.
export function useCaracteresSelecao(editor: Editor | null) {
  const [total, setTotal] = useState(0);
  const [selecionados, setSelecionados] = useState(0);

  useEffect(() => {
    if (!editor) return;

    const atualizar = () => {
      setTotal(editor.getText().length);
      const { from, to } = editor.state.selection;
      setSelecionados(from === to ? 0 : editor.state.doc.textBetween(from, to, "\n").length);
    };

    atualizar();
    editor.on("transaction", atualizar);
    return () => {
      editor.off("transaction", atualizar);
    };
  }, [editor]);

  return { total, selecionados };
}
