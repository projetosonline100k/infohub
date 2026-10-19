// Modo chat do documento, ⌘I (19/10/2026, Davi: "a criação de roteiro do escritório dentro do
// Docs; onde estiver o cursor é lá que começa a escrever, tipo o Claude; aparecem o Leo, o Junior e
// o Elias: Leo = headline, Junior = roteiros, Elias = revisão; Junior + Elias juntos é um trabalho
// só"). Aqui fica a parte pura: o pedido de cada funcionário (mesmo contexto da esteira, ver
// scripts/empresa/esteira.py contexto) e o texto → HTML do editor. Testes: tests/escritaAgentes.test.mjs.

export interface SecaoCerebro { titulo?: string; texto?: string }
export interface CerebroEscrita { id: string; nome: string; secoes?: SecaoCerebro[] }
export interface FormatoEscrita { nome?: string; texto?: string }
export interface SkillEscrita { nome: string; conteudo: string }

/** Uma etapa da esteira com quem a faz (Leo · Headlines, Junior · Roteiro, Elias · Revisão). */
export interface AgenteEscrita {
  etapa: string;
  nome: string;
  funcao?: string | null;
  manual?: string | null;
  aprendizados?: string | null;
  criterios?: string | string[] | null;
  formatos?: FormatoEscrita[] | null;
}

export interface Conversa { pedido: string; resposta: string }

export interface DadosPedido {
  escritorio?: string | null;
  agente: AgenteEscrita | null;            // null = Claude sem funcionário
  skills: SkillEscrita[];
  cerebro: CerebroEscrita | null;
  documento: string;                       // texto do documento com [CURSOR] onde vai escrever
  selecao?: string | null;                 // texto selecionado (o que revisar/reescrever)
  anterior?: { quem: string; texto: string } | null;   // o que a etapa anterior acabou de entregar
  historico?: Conversa[];
  pedido: string;
  proximaHeadline: number;
}

export const MARCA_NOTAS = "===NOTAS===";
const LIMITE_DOC = 14000;

/** Revisão substitui o texto da etapa anterior; as outras escrevem depois dele. */
export const ehRevisao = (etapa: string) => /revis/i.test(etapa);

export function listaCriterios(c: string | string[] | null | undefined): string[] {
  if (Array.isArray(c)) return c.map((x) => String(x).trim()).filter(Boolean);
  return String(c ?? "").split("\n").map((l) => l.replace(/^\s*\d+[.)-]\s*/, "").trim()).filter(Boolean);
}

/** O documento em volta do cursor, cortado se for grande (mantém o pedaço perto do cursor). */
export function recortarDocumento(texto: string, limite = LIMITE_DOC): string {
  if (texto.length <= limite) return texto;
  const cursor = Math.max(0, texto.indexOf("[CURSOR]"));
  const de = Math.max(0, Math.min(cursor - Math.floor(limite * 0.7), texto.length - limite));
  return `${de > 0 ? "[…]\n" : ""}${texto.slice(de, de + limite)}${de + limite < texto.length ? "\n[…]" : ""}`;
}

export function montarPedido(d: DadosPedido): string {
  const partes: string[] = [];
  const a = d.agente;
  if (a) {
    partes.push(`Você é ${a.nome}${a.funcao ? `, ${a.funcao}` : ""}${d.escritorio ? ` do escritório "${d.escritorio}"` : ""}. `
      + `Sua parte na esteira é: ${a.etapa}. Você escreve direto no documento do Davi, onde está o cursor dele.`);
    if (a.manual?.trim()) partes.push(`SEU MANUAL:\n${a.manual.trim()}`);
    if (a.aprendizados?.trim()) partes.push(`APRENDIZADOS COM O DAVI (correções que ele já fez):\n${a.aprendizados.trim()}`);
  } else {
    partes.push("Você é o Claude escrevendo direto no documento do Davi, onde está o cursor dele.");
  }
  if (d.cerebro) {
    const secoes = (d.cerebro.secoes ?? []).filter((s) => (s.texto ?? "").trim());
    if (secoes.length) {
      partes.push(`CÉREBRO DE ${d.cerebro.nome.toUpperCase()} (para quem é o texto: baseie-se nisto, use a apresentação e a narrativa daqui em vez de inventar):\n`
        + secoes.map((s) => `[${(s.titulo ?? "").trim() || "Sem título"}]\n${(s.texto ?? "").trim()}`).join("\n\n"));
    }
  }
  if (a) {
    const crit = listaCriterios(a.criterios);
    if (crit.length) partes.push(`CRITÉRIOS DO DAVI PARA ${a.etapa.toUpperCase()} (confira um por um antes de responder):\n${crit.map((c, i) => `${i + 1}. ${c}`).join("\n")}`);
    const formatos = (a.formatos ?? []).filter((f) => (f.texto ?? "").trim());
    if (formatos.length) {
      partes.push("FORMATOS DE REFERÊNCIA (escolha o que mais combina e siga a estrutura):\n"
        + formatos.map((f, i) => `[Formato ${i + 1}: ${(f.nome ?? "").trim() || "sem nome"}]\n${(f.texto ?? "").trim()}`).join("\n\n"));
    }
  }
  if (d.skills.length) {
    partes.push("SKILLS DO DAVI (valem como critério: siga o método delas; a 'gerador-roteiro-por-headline', se houver, orquestra as outras):\n\n"
      + d.skills.map((s) => `<skill nome="${s.nome}">\n${s.conteudo.trim()}\n</skill>`).join("\n\n"));
  }
  partes.push(`DOCUMENTO ATUAL (contexto; [CURSOR] é onde a sua resposta entra; não repita o que já está escrito):\n"""\n${recortarDocumento(d.documento)}\n"""`);
  if (d.selecao?.trim()) partes.push(`TRECHO SELECIONADO PELO DAVI (é sobre ele o pedido; a sua resposta entra no lugar dele):\n"""\n${d.selecao.trim()}\n"""`);
  if (d.anterior?.texto.trim()) {
    partes.push(`O QUE ${d.anterior.quem.toUpperCase()} ACABOU DE ENTREGAR (${a && ehRevisao(a.etapa) ? "revise isto: a sua versão substitui a dele" : "parta disto"}):\n"""\n${d.anterior.texto.trim()}\n"""`);
  }
  const hist = (d.historico ?? []).slice(-4);
  if (hist.length) {
    partes.push("CONVERSA ATÉ AQUI (pedidos anteriores do Davi neste documento):\n"
      + hist.map((h) => `Davi: ${h.pedido}\nResposta: ${h.resposta.slice(0, 1500)}`).join("\n\n"));
  }
  partes.push(`PEDIDO DO DAVI: ${d.pedido.trim() || (d.anterior ? "faça a sua parte com base no que veio antes" : "continue o documento")}`);
  partes.push(["COMO RESPONDER:",
    "- Escreva SOMENTE o texto que entra no documento, em português do Brasil. Nada de \"Claro!\", explicação ou pergunta antes.",
    "- Uma frase ou parágrafo por linha. Sem markdown: nada de #, ** ou tabelas. Listas só com \"- \" no começo da linha.",
    `- Headline sempre numa linha própria começando com "Headline N:" (a próxima do documento é a ${d.proximaHeadline}).`,
    "- Roteiro: a fala pronta para gravar, sem rótulos de cena, a não ser que o formato peça.",
    a && d.anterior && ehRevisao(a.etapa)
      ? `- Depois do texto, numa linha sozinha, escreva ${MARCA_NOTAS} e um JSON com um comentário em cada linha que você mudou (ou logo onde tirou algo): [{"linha": 3, "nota": "tirei X e troquei por Y porque Z"}]. "linha" é o número da linha no SEU texto revisado (1 = a primeira). Esses comentários aparecem ao lado do texto para o Davi; NÃO entram no documento.`
      : `- Depois do texto, numa linha sozinha, escreva ${MARCA_NOTAS} e até 5 linhas curtas para o Davi: qual formato usou e como ficaram os critérios. Essas notas NÃO entram no documento.`,
  ].join("\n"));
  return partes.join("\n\n");
}

/** Separa o texto do documento das notas do fim (também com a resposta ainda chegando). */
export function separarNotas(bruto: string): { texto: string; notas: string } {
  const i = bruto.indexOf(MARCA_NOTAS);
  if (i >= 0) return { texto: bruto.slice(0, i).trim(), notas: bruto.slice(i + MARCA_NOTAS.length).trim() };
  // A marca pode estar chegando pela metade ("===NO"): não deixa o pedaço aparecer no documento.
  const parcial = bruto.match(/\n?=+[A-Z]*=*$/);
  return { texto: (parcial ? bruto.slice(0, parcial.index) : bruto).trim(), notas: "" };
}

/** Comentários do revisor por linha ([{linha, nota}]); texto solto vira comentário da 1ª linha. */
export function lerNotasRevisao(notas: string): { linha: number; nota: string }[] {
  const m = notas.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const j = JSON.parse(m[0]) as unknown;
      if (Array.isArray(j)) {
        return j.flatMap((x) => {
          const o = x as { linha?: unknown; nota?: unknown };
          const linha = Number(o?.linha), nota = typeof o?.nota === "string" ? o.nota.trim() : "";
          return Number.isInteger(linha) && linha >= 1 && nota ? [{ linha, nota }] : [];
        });
      }
    } catch { /* cai no texto solto */ }
  }
  const t = notas.trim();
  return t ? [{ linha: 1, nota: t }] : [];
}

/** O texto que cada linha vira no documento (sem "- ", "# " nem **), na ordem dos blocos de textoParaHtml. */
export function linhasDoTexto(texto: string): string[] {
  return texto.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(/^[-•*]\s+/, "").replace(/^#{1,3}\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1"));
}

export interface LinhaRevisada { texto: string; original: string | null; nota: string | null }
export interface Revisao { id: string; quem: string; linhas: LinhaRevisada[]; removidas: { depoisDe: number; texto: string }[] }

/** Junior → Elias, linha a linha: de qual linha veio cada uma, o que saiu inteiro e o comentário de cada mudança. */
export function montarRevisao(id: string, quem: string, antes: string, depois: string, notas: string,
  alinhar: (a: string[], b: string[]) => (number | null)[]): Revisao {
  const a = linhasDoTexto(antes), b = linhasDoTexto(depois);
  const origem = alinhar(a, b);
  const comentarios = lerNotasRevisao(notas);
  const linhas = b.map((texto, k) => ({
    texto, original: origem[k] === null ? null : a[origem[k]!],
    nota: comentarios.filter((c) => Math.min(c.linha, b.length) === k + 1).map((c) => c.nota).join("\n") || null,
  }));
  const usadas = new Set(origem.filter((x): x is number => x !== null));
  const removidas = a.flatMap((texto, i) => {
    if (usadas.has(i)) return [];
    let depoisDe = -1;
    origem.forEach((o, k) => { if (o !== null && o < i) depoisDe = k; });
    return [{ depoisDe, texto }];
  });
  return { id, quem, linhas, removidas };
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const negrito = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

/** Texto do Claude → HTML do editor: cada linha um parágrafo; "- " vira lista; "# " vira título. */
export function textoParaHtml(texto: string): string {
  const linhas = texto.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const html: string[] = [];
  let lista: string[] = [];
  const fecharLista = () => {
    if (lista.length) html.push(`<ul>${lista.map((i) => `<li><p>${negrito(i)}</p></li>`).join("")}</ul>`);
    lista = [];
  };
  for (const l of linhas) {
    const item = l.match(/^[-•*]\s+(.*)$/);
    if (item) { lista.push(item[1]); continue; }
    fecharLista();
    const titulo = l.match(/^#{1,3}\s+(.*)$/);
    html.push(titulo ? `<h2>${negrito(titulo[1])}</h2>` : `<p>${negrito(l)}</p>`);
  }
  fecharLista();
  return html.join("") || "<p></p>";
}
