// Vídeo do banco de virais dentro do documento (18/10/2026, Davi: "⌘H no Docs mostra os vídeos
// salvos; ao selecionar, aparece em abre e fecha: link, transcrição, conteúdo notável, por que
// viralizou"). Monta o bloco "Headline NN" no formato que ele já usa (títulos recolhíveis do
// editor, tiptapTituloRecolhivel). Testes: tests/blocoReferencia.test.mjs.

export interface DadosBloco {
  numero: number; headline: string; link: string | null; transcricao: string | null;
  notavel: string[]; porque: string[];
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Próximo número de "Headline NN" no documento (o maior que já existe + 1). */
export function proximoNumeroHeadline(conteudo: string | null | undefined): number {
  const texto = (conteudo ?? "").replace(/<[^>]+>/g, " ");
  let maior = 0;
  for (const m of texto.matchAll(/headlines?\s*#?\s*(\d{1,3})/gi)) maior = Math.max(maior, Number(m[1]));
  return maior + 1;
}

const paragrafos = (t: string | null) => (t ?? "").split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${esc(p)}</p>`).join("") || "<p></p>";
const lista = (itens: string[]) => (itens.length ? `<ul>${itens.map((i) => `<li><p>${esc(i)}</p></li>`).join("")}</ul>` : "<p></p>");

/** HTML do bloco: o título com a headline; link e as três seções dentro de "+Info" (recolhido,
 *  18/10: "quero que essas info fiquem dentro do nome +Info"); "Roteiro finalizado" fica fora. */
export function montarBlocoReferencia(d: DadosBloco): string {
  const n = String(d.numero).padStart(2, "0");
  // h3 recolhido esconde tudo até o próximo h3 (o "Roteiro finalizado"); dentro, cada seção é h4.
  const secao = (titulo: string, corpo: string) => `<h4 data-collapsed="true">${esc(titulo)}</h4>${corpo}`;
  return [
    `<h2>Headline ${n}: ${esc(d.headline)}</h2>`,
    `<h3 data-collapsed="true">+Info</h3>`,
    d.link ? `<p><a href="${esc(d.link)}">Link da referência</a></p>` : "",
    secao("Transcrição", paragrafos(d.transcricao)),
    secao("Conteúdo Notável", lista(d.notavel)),
    secao("Por que o vídeo viralizou", lista(d.porque)),
    `<h3>Roteiro finalizado:</h3><p></p>`,
  ].join("");
}

/** Lê a resposta do Claude (JSON, às vezes cercado de texto ou ```). */
export function lerAnalise(resposta: string): { headline?: string; notavel: string[]; porque: string[] } {
  const m = resposta.match(/\{[\s\S]*\}/);
  if (!m) return { notavel: [], porque: [] };
  try {
    const j = JSON.parse(m[0]) as { headline?: unknown; notavel?: unknown; porque?: unknown };
    const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : []);
    return { headline: typeof j.headline === "string" ? j.headline.trim() : undefined, notavel: arr(j.notavel), porque: arr(j.porque) };
  } catch {
    return { notavel: [], porque: [] };
  }
}
