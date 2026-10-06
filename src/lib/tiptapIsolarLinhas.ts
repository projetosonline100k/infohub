import type { EditorState, Transaction } from "@tiptap/pm/state";

// Linhas separadas por quebra simples (Shift+Enter, ou texto colado) ficam
// num bloco só — mudar o tipo pra Título transformaria todas. Esta transação
// separa a(s) linha(s) da seleção num bloco próprio (troca as quebras em
// volta por divisões de bloco), pra só ela mudar de tipo e o resto continuar
// como estava. Devolve null quando não há o que separar.
export function trIsolarLinhasDaSelecao(state: EditorState): Transaction | null {
  const { $from, $to } = state.selection;
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return null;
  const inicio = $from.start();
  let quebraAntes = -1;
  let quebraDepois = -1;
  $from.parent.forEach((filho, offset) => {
    if (filho.type.name !== "hardBreak") return;
    const pos = inicio + offset;
    if (pos < $from.pos) quebraAntes = pos;
    else if (pos >= $to.pos && quebraDepois < 0) quebraDepois = pos;
  });
  if (quebraAntes < 0 && quebraDepois < 0) return null;
  const tr = state.tr;
  // De trás pra frente, pra posição anterior continuar valendo.
  if (quebraDepois >= 0) tr.delete(quebraDepois, quebraDepois + 1).split(quebraDepois);
  if (quebraAntes >= 0) tr.delete(quebraAntes, quebraAntes + 1).split(quebraAntes);
  return tr;
}
