// Inteligência de cada funcionário (PDF, texto, vídeo, link). Regra fixa do
// Davi: equipe em projeto novo chega zerada — só vai junto o que é "geral"
// do funcionário; o que é "deste projeto" fica no projeto.

export type Alcance = "geral" | "projeto";
// "aprendizado": o que o funcionário anotou quando o Davi corrigiu (scripts/inteligencia/aprender.py).
export type TipoInteligencia = "pdf" | "texto" | "video" | "link" | "aprendizado";
export type StatusInteligencia = "pendente" | "processando" | "pronto" | "erro";

export type ItemInteligencia = {
  id: string;
  cliente_id: string;
  agente: string;
  escopo: Alcance;
  tipo: TipoInteligencia;
  nome: string;
  observacao: string | null;
  arquivo_path: string | null;
  link: string | null;
  caracteres: number;
  status: StatusInteligencia;
  mensagem: string | null;
  created_at: string;
};

export const ALCANCES: { valor: Alcance; rotulo: string; ajuda: string }[] = [
  { valor: "geral", rotulo: "Geral do funcionário", ajuda: "vai junto para todo projeto (ex.: livros, métodos)" },
  { valor: "projeto", rotulo: "Só deste projeto", ajuda: "voz, produto e histórico deste especialista" },
];

export const ROTULO_TIPO: Record<TipoInteligencia, string> = {
  pdf: "PDF", texto: "Texto", video: "Vídeo", link: "Link", aprendizado: "Aprendido com o Davi",
};

// Mesmo funcionário em projetos diferentes = mesmo nome (o banco faz igual).
export const chaveAgente = (nome: string) => nome.trim().toLowerCase();

export function tipoDoArquivo(nome: string, mime = ""): TipoInteligencia | null {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("text/") || ["txt", "md"].includes(ext)) return "texto";
  if (mime.startsWith("video/") || mime.startsWith("audio/") || ["mp4", "mov", "m4v", "mp3", "m4a", "wav", "webm"].includes(ext)) return "video";
  return null;
}

// Nome seguro para o Storage (sem acento, espaço ou barra).
export function nomeSeguro(nome: string): string {
  const limpo = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-").replace(/-+/g, "-").replace(/-\./g, ".").replace(/^-|-$/g, "");
  return limpo || "arquivo";
}

export const tituloSemExtensao = (nome: string) => nome.replace(/\.[a-z0-9]{1,5}$/i, "").trim() || nome;

// O que o funcionário deste projeto enxerga: o geral dele + o deste projeto.
export function separarPorAlcance(itens: ItemInteligencia[], clienteId: string) {
  const geral = itens.filter((i) => i.escopo === "geral");
  const projeto = itens.filter((i) => i.escopo === "projeto" && i.cliente_id === clienteId);
  return { geral, projeto };
}

export function resumo(itens: ItemInteligencia[]) {
  const prontos = itens.filter((i) => i.status === "pronto");
  return {
    prontos: prontos.length,
    pendentes: itens.filter((i) => i.status === "pendente" || i.status === "processando").length,
    erros: itens.filter((i) => i.status === "erro").length,
    caracteres: prontos.reduce((s, i) => s + (i.caracteres || 0), 0),
  };
}

// "≈ 120 páginas" a partir dos caracteres (≈ 2.500 por página de livro).
export function tamanhoLegivel(caracteres: number): string {
  if (!caracteres) return "";
  const paginas = Math.max(1, Math.round(caracteres / 2500));
  return paginas === 1 ? "≈ 1 página" : `≈ ${paginas.toLocaleString("pt-BR")} páginas`;
}
