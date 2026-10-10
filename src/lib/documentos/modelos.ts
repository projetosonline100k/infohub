// Modelos de documento (Documentos → "Modelos"). Cada um gera o HTML inicial
// do editor (TipTap). A fonte vai em cada trecho (marca de estilo do TipTap);
// as linhas em branco levam um caractere invisível com a mesma fonte, pra que
// o que for digitado ali já saia no padrão do modelo.

export interface ModeloDocumento {
  id: string;
  nome: string;
  descricao: string;
  titulo: string;
  // nome: título do documento (ex.: o mentorado), quando já existe um.
  html: (nome?: string) => string;
}

const ESTILO_POPPINS_16 = "font-family: Poppins, sans-serif; font-size: 16px";
const INVISIVEL = "​";

const escapar = (texto: string) => texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const trecho = (texto: string, estilo: string) => `<span style="${estilo}">${escapar(texto)}</span>`;
const paragrafo = (texto: string, estilo: string, negrito = false) =>
  `<p>${negrito ? `<strong>${trecho(texto, estilo)}</strong>` : trecho(texto, estilo)}</p>`;
const linhaEmBranco = (estilo: string) => `<p>${trecho(INVISIVEL, estilo)}</p>`;

export function htmlMentoriaCore(quantidadeRoteiros = 25, nome = ""): string {
  const e = ESTILO_POPPINS_16;
  const itens = [
    "Instagram: ",
    "Copywriter Responsável: Junior Costa",
    "Mentor Responsável: ",
    "Tempo de Mentoria: 3 meses",
    "Plano de Mentoria: ",
  ];
  const partes = [
    paragrafo(`MENTORIA CORE – ${nome}`, e, true),
    paragrafo("📌 Informações Gerais", e, true),
    `<ul>${itens.map((item) => `<li>${paragrafo(item, e)}</li>`).join("")}</ul>`,
    linhaEmBranco(e),
  ];
  for (let i = 1; i <= quantidadeRoteiros; i++) {
    partes.push(paragrafo(`ROTEIRO ${String(i).padStart(2, "0")}`, e, true));
    // Espaço pra escrever o roteiro.
    partes.push(linhaEmBranco(e), linhaEmBranco(e), linhaEmBranco(e));
  }
  return partes.join("");
}

export const MODELOS_DOCUMENTO: ModeloDocumento[] = [
  {
    id: "mentoria-core",
    nome: "Mentoria Core",
    descricao: "Informações gerais + 25 roteiros (Poppins 16)",
    titulo: "MENTORIA CORE – ",
    html: (nome) => htmlMentoriaCore(25, nome),
  },
];
