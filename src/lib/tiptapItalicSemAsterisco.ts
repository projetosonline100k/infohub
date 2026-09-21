import Italic from "@tiptap/extension-italic";
import { markInputRule, markPasteRule } from "@tiptap/core";

const underscoreInputRegex = /(?:^|\s)(_(?!\s+_)((?:[^_]+))_(?!\s+_))$/;
const underscorePasteRegex = /(?:^|\s)(_(?!\s+_)((?:[^_]+))_(?!\s+_))/g;

// Digitar *palavra* não deveria virar itálico sozinho: quem usa WhatsApp usa
// *asterisco* pra negrito, não pra itálico, e o efeito automático do Tiptap
// (convenção do Markdown) atrapalhava esse fluxo. O botão/atalho (Ctrl+I) de
// itálico continuam funcionando, e "_palavra_" também — só o gatilho
// automático do asterisco foi removido.
export const ItalicSemAsterisco = Italic.extend({
  addInputRules() {
    return [markInputRule({ find: underscoreInputRegex, type: this.type })];
  },
  addPasteRules() {
    return [markPasteRule({ find: underscorePasteRegex, type: this.type })];
  },
});
