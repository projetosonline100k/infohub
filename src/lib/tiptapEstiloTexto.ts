import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";

// Texto colado de outro lugar (Google Docs, Word, sites) vem com a cor, o
// fundo e a fonte de lá — feitos pra página branca, ficam ilegíveis no tema
// escuro. Ao colar, mantém a estrutura (negrito, itálico, listas, links) e
// descarta cor/fundo/fonte/tamanho; isso a pessoa aplica pelo menu.
// 27/10 (Davi: "copio algo de outro lugar e do nada fica destoando"): título
// de fora (ex.: linha de título do Notas) vira parágrafo — colado no meio de
// uma linha, ele transformava a linha inteira num título enorme.
export function limparEstiloColado(html: string): string {
  // Copiado de dentro do próprio editor (Infopro): mantém tudo, inclusive as
  // cores e o marca-texto aplicados aqui.
  if (html.includes("data-pm-slice")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.body.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));
  doc.body.querySelectorAll("[color], [bgcolor], [face]").forEach((el) => {
    el.removeAttribute("color");
    el.removeAttribute("bgcolor");
    el.removeAttribute("face");
  });
  // <font> e <mark> de fora viram texto simples (o conteúdo fica).
  doc.body.querySelectorAll("font, mark").forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
  doc.body.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
    const p = doc.createElement("p");
    p.append(...Array.from(el.childNodes));
    el.replaceWith(p);
  });
  return doc.body.innerHTML;
}

const ColarSemEstilo = Extension.create({
  name: "colarSemEstilo",
  addProseMirrorPlugins() {
    return [new Plugin({ key: new PluginKey("colarSemEstilo"), props: { transformPastedHTML: limparEstiloColado } })];
  },
});

// Seleção desenhada pelo próprio editor (27/10, Davi: "aperto ⌘A e não vejo as coisas selecionadas"): no app do
// Mac o destaque do sistema não aparecia (a seleção existia — "2.268 sel." —, só não era pintada). Uma marcação
// sobre o trecho selecionado mostra sempre; o destaque nativo fica transparente para não pintar em dobro.
const SelecaoVisivel = Extension.create({
  name: "selecaoVisivel",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("selecaoVisivel"),
      props: {
        decorations(state) {
          const { from, to, empty } = state.selection;
          if (empty) return null;
          return DecorationSet.create(state.doc, [Decoration.inline(from, to, { class: "selecao-visivel" })]);
        },
      },
    })];
  },
});

// Extensões de estilo por trecho (fonte, tamanho, cor e marca-texto colorido)
// usadas pelo menu de seleção. Precisam estar em todo editor que abre o mesmo
// conteúdo (inclusive o documento compartilhado), senão o estilo some lá.
export const extensoesEstiloTexto = [
  ColarSemEstilo,
  SelecaoVisivel,
  TextStyle,
  FontFamily,
  FontSize,
  Color,
  Highlight.configure({ multicolor: true }),
];

export const FONTES = [
  { nome: "Padrão", valor: "" },
  { nome: "Poppins", valor: "Poppins, sans-serif" },
  { nome: "Serifada", valor: "Georgia, 'Times New Roman', serif" },
  { nome: "Mono", valor: "ui-monospace, 'SF Mono', Menlo, monospace" },
  { nome: "Arredondada", valor: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif" },
  { nome: "Manuscrita", valor: "'Bradley Hand', 'Segoe Print', cursive" },
];

export const TAMANHOS = [
  { nome: "Pequeno", valor: "13px" },
  { nome: "Normal", valor: "" },
  { nome: "Grande", valor: "20px" },
  { nome: "Enorme", valor: "26px" },
];

export const CORES_TEXTO = [
  { nome: "Padrão", valor: "" },
  { nome: "Cinza", valor: "#9b9a97" },
  { nome: "Marrom", valor: "#a27763" },
  { nome: "Laranja", valor: "#e5813b" },
  { nome: "Amarelo", valor: "#d4a72c" },
  { nome: "Verde", valor: "#4f9a6f" },
  { nome: "Azul", valor: "#3e83c8" },
  { nome: "Roxo", valor: "#9065c4" },
  { nome: "Rosa", valor: "#c85a95" },
  { nome: "Vermelho", valor: "#d9534f" },
];

export const CORES_GRIFO = [
  { nome: "Amarelo", valor: "#fde68a" },
  { nome: "Verde", valor: "#bbf7d0" },
  { nome: "Azul", valor: "#bfdbfe" },
  { nome: "Roxo", valor: "#ddd6fe" },
  { nome: "Rosa", valor: "#fbcfe8" },
  { nome: "Vermelho", valor: "#fecaca" },
  { nome: "Laranja", valor: "#fed7aa" },
  { nome: "Cinza", valor: "#e5e7eb" },
];
