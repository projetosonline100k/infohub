// Quadro (Kanban) dentro dos documentos: dados, texto para a IA e a escolha de referências (24/10, Davi:
// "categorizar bem os cards para que, quando eu escrever os roteiros, ele consiga puxar as coisas na hora").
// Sem React aqui: usado pelo bloco do editor (components/documentos/QuadroKanban.tsx), pelo chat do documento
// e testado em tests/quadroDocumento.test.mjs.

export interface Cartao { id: string; texto: string; titulo?: string; etiquetas?: string[] }
export interface Coluna { id: string; titulo: string; cor: string; cartoes: Cartao[] }
export interface DadosQuadro { colunas: Coluna[] }

export const CORES_COLUNA = ["#94a3b8", "#60a5fa", "#fbbf24", "#34d399", "#f472b6", "#a78bfa", "#f87171"];
export const novoId = () => Math.random().toString(36).slice(2, 10);

export function quadroPadrao(): DadosQuadro {
  return {
    colunas: [
      { id: novoId(), titulo: "A fazer", cor: CORES_COLUNA[0], cartoes: [] },
      { id: novoId(), titulo: "Fazendo", cor: CORES_COLUNA[1], cartoes: [] },
      { id: novoId(), titulo: "Feito", cor: CORES_COLUNA[3], cartoes: [] },
    ],
  };
}

export function lerDados(v: unknown): DadosQuadro {
  try {
    const d = typeof v === "string" ? JSON.parse(v) : v;
    if (d && Array.isArray((d as DadosQuadro).colunas)) return d as DadosQuadro;
  } catch { /* quadro estragado: começa do padrão */ }
  return quadroPadrao();
}

/** Título do cartão: o campo título ou, nos cartões antigos, a 1ª linha do texto. */
export function tituloDoCartao(c: Cartao): string {
  return (c.titulo ?? "").trim() || (c.texto.split("\n").find((l) => l.trim()) ?? "").trim();
}
/** O corpo sem o título (nos antigos, o texto tirando a 1ª linha). */
export function corpoDoCartao(c: Cartao): string {
  if ((c.titulo ?? "").trim()) return c.texto.trim();
  const linhas = c.texto.split("\n");
  const i = linhas.findIndex((l) => l.trim());
  return i < 0 ? "" : linhas.slice(i + 1).join("\n").trim();
}

export const normalizarEtiqueta = (t: string) => t.trim().replace(/^#/, "").replace(/\s+/g, " ").toLowerCase();

/** Todas as etiquetas usadas no quadro (para sugerir ao digitar e filtrar). */
export function etiquetasDoQuadro(d: DadosQuadro): string[] {
  const todas = new Set<string>();
  for (const col of d.colunas) for (const c of col.cartoes) for (const e of c.etiquetas ?? []) todas.add(normalizarEtiqueta(e));
  return [...todas].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/** O quadro como texto: o que a IA lê quando ele está no documento ou é citado com @. */
export function textoDoQuadro(d: DadosQuadro): string {
  const partes = ["[QUADRO]"];
  for (const col of d.colunas) {
    partes.push(`[Coluna: ${col.titulo || "sem nome"}]`);
    for (const c of col.cartoes) {
      const et = (c.etiquetas ?? []).length ? ` (etiquetas: ${(c.etiquetas ?? []).join(", ")})` : "";
      const corpo = corpoDoCartao(c);
      partes.push(`- ${tituloDoCartao(c) || "sem título"}${et}${corpo ? `: ${corpo}` : ""}`);
    }
  }
  return partes.join("\n");
}

// ---------------------------------------------------------------- referências para o roteiro

export interface Referencia { fonte: string; coluna: string; titulo: string; etiquetas: string[]; texto: string }

/** Os cartões de todos os quadros de um HTML de documento (atributo data-dados de cada quadro). */
export function cartoesDoHtml(html: string, fonte: string): Referencia[] {
  const saida: Referencia[] = [];
  const re = /data-dados="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const json = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const d = lerDados(json);
    for (const col of d.colunas) {
      for (const c of col.cartoes) {
        const texto = corpoDoCartao(c);
        if (!tituloDoCartao(c) && !texto) continue;
        saida.push({ fonte, coluna: col.titulo, titulo: tituloDoCartao(c), etiquetas: (c.etiquetas ?? []).map(normalizarEtiqueta), texto });
      }
    }
  }
  return saida;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PALAVRAS_VAZIAS = new Set(["para", "sobre", "como", "quero", "roteiro", "roteiros", "headline", "headlines", "escreve", "escrever", "faca", "fazer", "uma", "umas", "esse", "essa", "isso", "este", "esta", "com", "que", "dos", "das", "nos", "nas", "pra", "por", "mais", "muito"]);

/** Palavras do pedido que contam para escolher referências (4+ letras, sem as vazias). */
export function palavrasDoPedido(pedido: string): string[] {
  return [...new Set(semAcento(pedido).split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !PALAVRAS_VAZIAS.has(p)))];
}

/**
 * Os cartões que mais combinam com o pedido: etiqueta e coluna valem mais, título médio, texto pouco.
 * Sem nenhuma palavra que combine, não puxa nada (para não encher o pedido de coisa aleatória).
 */
export function escolherReferencias(refs: Referencia[], pedido: string, limiteCaracteres = 9000): Referencia[] {
  const palavras = palavrasDoPedido(pedido);
  if (!palavras.length) return [];
  const pontos = refs.map((r) => {
    const et = semAcento(r.etiquetas.join(" ")), col = semAcento(r.coluna), tit = semAcento(r.titulo), txt = semAcento(r.texto);
    let p = 0;
    for (const w of palavras) {
      if (et.includes(w)) p += 5;
      if (col.includes(w)) p += 4;
      if (tit.includes(w)) p += 2;
      if (txt.includes(w)) p += 1;
    }
    return { r, p };
  }).filter((x) => x.p >= 2).sort((a, b) => b.p - a.p);
  const escolhidas: Referencia[] = [];
  let total = 0;
  for (const { r } of pontos) {
    const tamanho = r.texto.length + r.titulo.length + 80;
    if (total + tamanho > limiteCaracteres && escolhidas.length) break;
    escolhidas.push(r);
    total += tamanho;
  }
  return escolhidas;
}
