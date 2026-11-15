// Respostas em número do quiz (15/11/2026, V2 do Instalivros: roleta "quantos livros você leu" e régua "quanto tempo por dia").
// A pessoa escolhe um número; as `opcoes` da pergunta viram faixas (`ate`) para a pontuação de perfil e para o selo da roleta. Sem imports: testável.

export interface ConfigNumero {
  min: number; max: number; passo?: number; inicial?: number;
  /** Texto depois do número ("min/dia", "livros"). */
  unidade?: string;
  /** Mostra "50+" no valor máximo. */
  mais?: boolean;
  /** Minutos que um resumo leva (padrão 10): base de "resumos por mês" e "livros em 12 meses". */
  min_por_resumo?: number;
  /** Régua: linha que recalcula ao vivo ({n}, {resumos_mes}, {resumos_semana}, {livros_12m}). */
  linha?: string;
}
export interface PerguntaNumerica { numero?: ConfigNumero; opcoes: { ate?: number }[] }

const inteiro = (n: unknown, padrao: number) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : padrao);

/** Limites e passo válidos (sem passo zero, min <= max). */
export function limitesDoNumero(c: ConfigNumero) {
  const min = inteiro(c.min, 0);
  const max = Math.max(min, inteiro(c.max, min + 10));
  const passo = Math.max(1, inteiro(c.passo, 1));
  const inicial = Math.min(max, Math.max(min, inteiro(c.inicial, min)));
  return { min, max, passo, inicial };
}

/** Os valores que a roleta/régua oferecem, do menor ao maior. */
export function valoresDoNumero(c: ConfigNumero): number[] {
  const { min, max, passo } = limitesDoNumero(c);
  const lista: number[] = [];
  for (let v = min; v <= max; v += passo) lista.push(v);
  if (lista[lista.length - 1] !== max) lista.push(max);
  return lista;
}

/** Faixa (índice da opção) do número: a 1ª opção com `ate` >= número; passou de todas, a última. Sem faixas: -1. */
export function faixaDoNumero(q: PerguntaNumerica, n: number): number {
  if (!q.opcoes.length) return -1;
  const k = q.opcoes.findIndex((o) => typeof o.ate === "number" && n <= o.ate);
  return k >= 0 ? k : q.opcoes.length - 1;
}

/** "20 min/dia", "50+ livros" — o que vai para o lead e para os textos. */
export function textoDoNumero(c: ConfigNumero | undefined, n: number): string {
  const max = c ? limitesDoNumero(c).max : n;
  const valor = c?.mais && n >= max ? `${n}+` : String(n);
  return c?.unidade ? `${valor} ${c.unidade}` : valor;
}

const porResumo = (c?: ConfigNumero) => Math.max(1, inteiro(c?.min_por_resumo, 10));
/** Resumos por mês lendo `min` minutos por dia (1 resumo ≈ `min_por_resumo` min). */
export const resumosPorMes = (min: number, c?: ConfigNumero) => Math.round((min * 30) / porResumo(c));
export const resumosPorSemana = (min: number, c?: ConfigNumero) => Math.round((min * 7) / porResumo(c));
/** Livros (resumos) em 12 meses lendo `min` minutos por dia. */
export const livrosEm12Meses = (min: number, c?: ConfigNumero) => Math.round((min * 365) / porResumo(c));

/** {n}, {resumos_mes}, {resumos_semana}, {livros_12m} → valores calculados do número `n` (a mesma pergunta). */
export function preencherCalculos(texto: string, n: number, c?: ConfigNumero): string {
  return texto
    .replace(/\{n\}/g, String(n))
    .replace(/\{resumos_mes\}/g, String(resumosPorMes(n, c)))
    .replace(/\{resumos_semana\}/g, String(resumosPorSemana(n, c)))
    .replace(/\{livros_12m\}/g, String(livrosEm12Meses(n, c)));
}

/** {numero:id}, {resumos_mes:id}, {resumos_semana:id}, {livros_12m:id} → valores a partir da resposta numérica da pergunta `id`. Sem resposta, some. */
export function preencherNumeros(texto: string, perguntas: { id: string; numero?: ConfigNumero }[], numeros: Record<string, number>): string {
  return texto.replace(/\{(numero|resumos_mes|resumos_semana|livros_12m):([\w-]+)\}/g, (_t, tipo: string, id: string) => {
    const n = numeros[id];
    if (n === undefined) return "";
    const c = perguntas.find((p) => p.id === id)?.numero;
    if (tipo === "numero") return textoDoNumero(c, n).replace(/\s.*$/, "");
    return preencherCalculos(`{${tipo}}`, n, c);
  });
}

/** Nomes em lista: "A", "A e B", "A, B e C". */
export function listaEmTexto(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}
