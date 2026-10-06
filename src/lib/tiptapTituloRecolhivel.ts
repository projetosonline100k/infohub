import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, Plugin, PluginKey, TextSelection, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Títulos recolhíveis (como no Apple Notes): uma setinha ao lado de cada
// título fecha/abre tudo que vem abaixo dele até o próximo título de nível
// igual ou maior. O estado fica no próprio conteúdo (data-collapsed), então
// a nota reabre do jeito que foi deixada.

const chave = new PluginKey("tituloRecolhivel");

// `titulo`: posição do título recolhido que esconde este bloco.
interface Intervalo { de: number; ate: number; titulo: number }

// Blocos de topo escondidos por títulos recolhidos.
export function intervalosOcultos(doc: PMNode): Intervalo[] {
  const ocultos: Intervalo[] = [];
  let nivelOculto: number | null = null;
  let titulo = -1;
  doc.forEach((node, offset) => {
    const nivel = node.type.name === "heading" ? (node.attrs.level as number) : null;
    if (nivelOculto !== null && nivel !== null && nivel <= nivelOculto) nivelOculto = null;
    if (nivelOculto !== null) {
      ocultos.push({ de: offset, ate: offset + node.nodeSize, titulo });
      return;
    }
    if (nivel !== null && node.attrs.collapsed) { nivelOculto = nivel; titulo = offset; }
  });
  return ocultos;
}

// Título tem algo "dentro" dele (bloco seguinte que ele recolheria)?
function temConteudoAbaixo(doc: PMNode, index: number, nivel: number): boolean {
  if (index + 1 >= doc.childCount) return false;
  const proximo = doc.child(index + 1);
  return !(proximo.type.name === "heading" && (proximo.attrs.level as number) <= nivel);
}

// Bloco de topo que contém `pos` (posição e nó), ou null.
function blocoEm(doc: PMNode, pos: number) {
  const $pos = doc.resolve(pos);
  if ($pos.depth < 1) return null;
  const inicio = $pos.before(1);
  return { inicio, node: doc.child($pos.index(0)) };
}

// Fim da seção escondida por um título recolhido (fim do último bloco oculto).
function fimDaSecao(doc: PMNode, posTitulo: number): number {
  const ocultos = intervalosOcultos(doc).filter((i) => i.titulo === posTitulo);
  const titulo = doc.nodeAt(posTitulo);
  return ocultos.length ? ocultos[ocultos.length - 1].ate : posTitulo + (titulo?.nodeSize ?? 0);
}

// Enter no fim de um título recolhido: cria a linha nova DEPOIS de toda a
// seção escondida e mantém o título fechado. A linha nova é um título do
// mesmo nível — texto comum ali faria parte da seção fechada e nasceria
// escondido.
export function trEnterTituloRecolhido(state: EditorState): Transaction | null {
  const { selection, schema } = state;
  if (!selection.empty) return null;
  const bloco = blocoEm(state.doc, selection.from);
  if (!bloco || bloco.node.type.name !== "heading" || !bloco.node.attrs.collapsed) return null;
  if (selection.from !== bloco.inicio + bloco.node.nodeSize - 1) return null;
  const destino = fimDaSecao(state.doc, bloco.inicio);
  const tr = state.tr.insert(destino, schema.nodes.heading.create({ level: bloco.node.attrs.level, collapsed: false }));
  return tr.setSelection(TextSelection.create(tr.doc, destino + 1));
}

// Backspace no começo do bloco logo depois de uma seção recolhida: sem isto
// o texto se juntaria ao último bloco escondido e "sumiria". Bloco vazio é
// apagado; com texto, o cursor só volta pro fim do título.
export function trBackspaceAposRecolhido(state: EditorState): Transaction | null {
  const { selection } = state;
  if (!selection.empty || selection.$from.depth !== 1 || selection.$from.parentOffset !== 0) return null;
  const bloco = blocoEm(state.doc, selection.from);
  if (!bloco) return null;
  const anterior = intervalosOcultos(state.doc).find((i) => i.ate === bloco.inicio);
  if (!anterior) return null;
  const titulo = state.doc.nodeAt(anterior.titulo);
  if (!titulo) return null;
  const fimTitulo = anterior.titulo + titulo.nodeSize - 1;
  const tr = state.tr;
  if (bloco.node.content.size === 0) tr.delete(bloco.inicio, bloco.inicio + bloco.node.nodeSize);
  return tr.setSelection(TextSelection.create(tr.doc, fimTitulo));
}

// Abre/fecha o título em `pos`. Ao fechar, o cursor vai pro fim do título:
// se ficasse dentro do conteúdo que some, a regra de "cursor em conteúdo
// escondido" (appendTransaction) puxava o cursor de volta e atrapalhava.
export function trAlternarTitulo(state: EditorState, pos: number): Transaction | null {
  const titulo = state.doc.nodeAt(pos);
  if (!titulo || titulo.type.name !== "heading") return null;
  const fechar = !titulo.attrs.collapsed;
  const tr = state.tr.setNodeMarkup(pos, undefined, { ...titulo.attrs, collapsed: fechar });
  if (fechar && state.selection.from > pos + titulo.nodeSize - 1) {
    tr.setSelection(TextSelection.create(tr.doc, pos + titulo.nodeSize - 1));
  }
  return tr;
}

export function pluginTituloRecolhivel() {
  return new Plugin({
    key: chave,
    props: {
      decorations(state) {
        const decos: Decoration[] = [];
        state.doc.forEach((node, offset, index) => {
          if (node.type.name !== "heading") return;
          if (!node.attrs.collapsed && !temConteudoAbaixo(state.doc, index, node.attrs.level as number)) return;
          decos.push(Decoration.widget(offset + 1, (view) => {
            const botao = document.createElement("button");
            botao.type = "button";
            botao.contentEditable = "false";
            botao.className = "titulo-recolhivel-seta";
            botao.setAttribute("aria-label", node.attrs.collapsed ? "Mostrar conteúdo" : "Recolher conteúdo");
            botao.setAttribute("aria-expanded", String(!node.attrs.collapsed));
            botao.addEventListener("mousedown", (event) => {
              event.preventDefault();
              event.stopPropagation();
              const tr = trAlternarTitulo(view.state, offset);
              if (tr) view.dispatch(tr);
            });
            return botao;
          }, {
            side: -1,
            ignoreSelection: true,
            // O editor ignora os eventos da seta (sem isso ele tratava o clique
            // como clique no texto e mexia no cursor ao mesmo tempo).
            stopEvent: () => true,
            key: `seta-${offset}-${node.attrs.collapsed ? 1 : 0}`,
          }));
        });
        intervalosOcultos(state.doc).forEach(({ de, ate }) => decos.push(Decoration.node(de, ate, { class: "titulo-recolhido-oculto" })));
        return DecorationSet.create(state.doc, decos);
      },
    },
    // Conteúdo recolhido só abre pela seta. Se o cursor cair dentro dele
    // (setas do teclado, clique, etc.), pula por cima: descendo, vai pro
    // primeiro ponto visível depois da seção; subindo, pro fim do título.
    appendTransaction(_trs, antigo, state) {
      const pos = state.selection.from;
      const oculto = intervalosOcultos(state.doc).find(({ de, ate }) => pos > de && pos < ate);
      if (!oculto) return null;
      const titulo = state.doc.nodeAt(oculto.titulo);
      if (!titulo) return null;
      const descendo = pos >= antigo.selection.from;
      const fim = fimDaSecao(state.doc, oculto.titulo);
      if (descendo && fim < state.doc.content.size) {
        return state.tr.setSelection(TextSelection.near(state.doc.resolve(fim + 1)));
      }
      return state.tr.setSelection(TextSelection.create(state.doc, oculto.titulo + titulo.nodeSize - 1));
    },
  });
}

export const TituloRecolhivel = Extension.create({
  name: "tituloRecolhivel",

  addGlobalAttributes() {
    return [{
      types: ["heading"],
      attributes: {
        collapsed: {
          default: false,
          parseHTML: (el) => el.getAttribute("data-collapsed") === "true",
          renderHTML: (attrs) => (attrs.collapsed ? { "data-collapsed": "true" } : {}),
        },
      },
    }];
  },

  addKeyboardShortcuts() {
    const rodar = (criar: (state: EditorState) => Transaction | null) => () => {
      const tr = criar(this.editor.state);
      if (!tr) return false;
      this.editor.view.dispatch(tr);
      return true;
    };
    return { Enter: rodar(trEnterTituloRecolhido), Backspace: rodar(trBackspaceAposRecolhido) };
  },

  addProseMirrorPlugins() {
    return [pluginTituloRecolhivel()];
  },
});
