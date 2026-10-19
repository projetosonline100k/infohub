import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Parágrafo "Preparando +Info…" (⌘H, enquanto o Claude escreve): ganha a bolinha girando
// (classe bloco-carregando, editor.css) até o bloco de verdade entrar no lugar dele.
export const TEXTO_CARREGANDO = "Preparando +Info";

// "Headline N" vira título (18/10/2026, Davi: "quando eu escrever Headline e tal, quero que fique
// em negrito, em título mesmo, para depois conseguir ocultar com a ferramenta de abrir e fechar").
// Todo parágrafo de topo que começa com "Headline N", "Roteiro N" ou "#N" vira título nível 2 —
// e aí ganha a setinha de recolher (tiptapTituloRecolhivel). Mesma regra de roteirosNoDocumento.
export const MARCA_HEADLINE = /^\s*(?:(?:headlines?|roteiros?)\s*#?\s*\d{1,3}|#\s?\d{1,3})\b/i;

export const MAX_HEADLINE = 160;

export const HeadlineTitulo = Extension.create({
  name: "headlineTitulo",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("headlineTitulo"),
        appendTransaction: (transacoes, _antes, estado) => {
          if (!transacoes.some((t) => t.docChanged)) return null;
          const titulo = estado.schema.nodes.heading;
          if (!titulo) return null;
          let tr = null as ReturnType<typeof estado.tr.setNodeMarkup> | null;
          estado.doc.forEach((no, pos) => {
            // Só linha curta (a headline): parágrafo longo que começa com "Headline" é roteiro e fica
            // texto normal (19/10, Davi: "sempre que gerar o roteiro precisa vir em texto normal").
            if (no.type.name !== "paragraph" || no.textContent.length > MAX_HEADLINE || !MARCA_HEADLINE.test(no.textContent)) return;
            tr = (tr ?? estado.tr).setNodeMarkup(pos, titulo, { level: 2 });
          });
          return tr;
        },
      }),
      new Plugin({
        key: new PluginKey("blocoCarregando"),
        props: {
          decorations: (estado) => {
            const marcas: Decoration[] = [];
            estado.doc.forEach((no, pos) => {
              if (no.type.name === "paragraph" && no.textContent.startsWith(TEXTO_CARREGANDO)) {
                marcas.push(Decoration.node(pos, pos + no.nodeSize, { class: "bloco-carregando" }));
              }
            });
            return DecorationSet.create(estado.doc, marcas);
          },
        },
      }),
    ];
  },
});
