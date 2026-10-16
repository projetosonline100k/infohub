// Quiz de verdadeiro ou falso dos estudos do Gabriel (pedido do Davi, 16/10:
// "faltou o quiz"). O estudo traz as perguntas numa seção "Teste…" e as
// respostas numa seção "Gabarito…" (cada item começa com <strong>Verdadeiro.</strong>
// ou <strong>Falso.</strong>, seguido do porquê). Aqui separamos isso do texto
// para a tela mostrar um quiz de clicar no lugar das duas seções.

export interface PerguntaEstudo { pergunta: string; resposta: boolean; porque: string }

const semTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** Seções do HTML por <h2>: [{ titulo, inicio, fim }] (fim = começo do próximo h2 ou fim do texto). */
function secoes(html: string) {
  const marcas = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  return marcas.map((m, i) => ({
    titulo: semTags(m[1]),
    inicio: m.index ?? 0,
    corpo: html.slice((m.index ?? 0) + m[0].length, i + 1 < marcas.length ? marcas[i + 1].index : html.length),
    fim: i + 1 < marcas.length ? (marcas[i + 1].index ?? html.length) : html.length,
  }));
}

const itens = (html: string) => [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);

/** Devolve o HTML sem as seções do teste e do gabarito, e as perguntas (vazio se não achar as duas). */
export function separarQuiz(html: string): { html: string; perguntas: PerguntaEstudo[] } {
  const ss = secoes(html);
  const teste = ss.find((s) => /^teste\b/i.test(s.titulo) || /verdadeiro ou falso/i.test(s.titulo));
  const gabarito = ss.find((s) => /^gabarito/i.test(s.titulo));
  if (!teste || !gabarito) return { html, perguntas: [] };
  const perguntas = itens(teste.corpo).map(semTags);
  const respostas = itens(gabarito.corpo).map((li) => {
    const t = semTags(li);
    const m = t.match(/^(verdadeiro|falso)\.?\s*/i);
    return m ? { resposta: m[1].toLowerCase() === "verdadeiro", porque: t.slice(m[0].length).trim() } : null;
  });
  if (!perguntas.length || perguntas.length !== respostas.length || respostas.some((r) => !r)) return { html, perguntas: [] };
  // Tira as duas seções (da maior posição para a menor, para não deslocar os índices).
  let limpo = html;
  for (const s of [teste, gabarito].sort((a, b) => b.inicio - a.inicio)) limpo = limpo.slice(0, s.inicio) + limpo.slice(s.fim);
  return { html: limpo, perguntas: perguntas.map((p, i) => ({ pergunta: p, ...respostas[i]! })) };
}
