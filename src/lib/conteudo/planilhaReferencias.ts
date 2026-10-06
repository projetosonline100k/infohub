// Leitura da planilha de vídeos de referência (Excel/CSV) → linhas prontas
// pra virar Banco de referências + ideias. Funções puras (testáveis); quem
// lê o arquivo e grava no banco é importarPlanilhaReferencias.

export interface LinhaReferencia {
  link: string;
  headline: string;
  transcricao: string | null;
  visualizacoes: number | null;
  criador: string | null;
  dataPublicacao: string | null; // yyyy-MM-dd
}

type Campo = keyof LinhaReferencia;

const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Nomes de coluna aceitos (sem acento/maiúscula). A planilha atual usa:
// Link, Headline falada, Transcrição, Visualizações, Criador, Data de publicação.
const SINONIMOS: Record<Campo, string[]> = {
  link: ["link", "link do video", "url", "video"],
  headline: ["headline falada", "headline", "titulo", "gancho"],
  transcricao: ["transcricao", "transcript", "roteiro", "texto"],
  visualizacoes: ["visualizacoes", "views", "visualizacao", "plays"],
  criador: ["criador", "nome do criador", "perfil", "autor", "creator"],
  dataPublicacao: ["data de publicacao", "data publicacao", "data", "publicado em"],
};

export function mapearColunas(cabecalho: string[]): Partial<Record<Campo, number>> {
  const mapa: Partial<Record<Campo, number>> = {};
  const nomes = cabecalho.map((c) => normalizar(String(c ?? "")));
  (Object.keys(SINONIMOS) as Campo[]).forEach((campo) => {
    const indice = nomes.findIndex((nome) => SINONIMOS[campo].includes(nome));
    if (indice >= 0) mapa[campo] = indice;
  });
  return mapa;
}

// "1.057.225", "84135", "1,2 mil", "3,4M", "12k" → número.
export function lerVisualizacoes(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? Math.round(valor) : null;
  const texto = String(valor ?? "").trim().toLowerCase();
  if (!texto) return null;
  // Sufixo no fim: "3,4M", "2 mi", "1,5 milhões" / "12k", "1,2 mil".
  const sufixo = texto.match(/([a-zà-ú]+)\.?\s*$/)?.[1] ?? "";
  const multiplicador = ["m", "mi", "mm", "milhao", "milhoes", "milhão", "milhões"].includes(sufixo) ? 1_000_000
    : ["k", "mil"].includes(sufixo) ? 1_000 : 1;
  const numero = texto.replace(/[^\d,.]/g, "");
  if (!numero) return null;
  const decimal = multiplicador > 1 ? Number(numero.replace(/\./g, "").replace(",", ".")) : Number(numero.replace(/[.,]/g, ""));
  return Number.isFinite(decimal) ? Math.round(decimal * multiplicador) : null;
}

// "24/08/2026", "2026-08-24", Date do Excel → "2026-08-24".
export function lerData(valor: unknown): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  const br = texto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

// Mesmo vídeo com links diferentes (parâmetros, barra final, %3F de link
// copiado) conta como um só.
export function chaveDoLink(link: string): string {
  return link.trim().toLowerCase()
    .replace(/%3f.*$/i, "")
    .replace(/[?#].*$/, "")
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/+$/, "");
}

export function linhasDaPlanilha(tabela: unknown[][]): { linhas: LinhaReferencia[]; faltando: Campo[] } {
  const [cabecalho = [], ...resto] = tabela;
  const mapa = mapearColunas(cabecalho.map((c) => String(c ?? "")));
  const faltando = (["link", "headline"] as Campo[]).filter((campo) => mapa[campo] === undefined);
  if (faltando.length) return { linhas: [], faltando };
  const celula = (linha: unknown[], campo: Campo) => (mapa[campo] === undefined ? null : linha[mapa[campo]!]);
  const texto = (v: unknown) => { const t = String(v ?? "").trim(); return t || null; };
  const linhas = resto
    .map((linha) => ({
      link: texto(celula(linha, "link")) ?? "",
      headline: texto(celula(linha, "headline")) ?? "",
      transcricao: texto(celula(linha, "transcricao")),
      visualizacoes: lerVisualizacoes(celula(linha, "visualizacoes")),
      criador: texto(celula(linha, "criador")),
      dataPublicacao: lerData(celula(linha, "dataPublicacao")),
    }))
    .filter((l) => l.link && /^https?:\/\//i.test(l.link));
  // Dentro da própria planilha também não repete.
  const vistos = new Set<string>();
  return { linhas: linhas.filter((l) => { const k = chaveDoLink(l.link); if (vistos.has(k)) return false; vistos.add(k); return true; }), faltando: [] };
}

// CSV com aspas, vírgulas e quebras de linha dentro das células (transcrições).
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = "";
  let aspas = false;
  const separador = (texto.split("\n")[0].match(/;/g)?.length ?? 0) > (texto.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { celula += '"'; i++; }
      else if (c === '"') aspas = false;
      else celula += c;
    } else if (c === '"') aspas = true;
    else if (c === separador) { linha.push(celula); celula = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(celula); linhas.push(linha); linha = []; celula = "";
    } else celula += c;
  }
  if (celula || linha.length) { linha.push(celula); linhas.push(linha); }
  return linhas.filter((l) => l.some((v) => v.trim()));
}
