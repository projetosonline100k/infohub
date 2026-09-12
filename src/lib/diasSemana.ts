// Detecta se o nome de uma coluna do quadro é um dia da semana, pra que a
// coluna passe a representar aquele dia de verdade (filtra por data, não por
// status). Índice: 0 = segunda ... 6 = domingo (bate com weekStartsOn: 1).
const NOMES_DIAS = [
  ["segunda", "segunda-feira", "seg"],
  ["terca", "terca-feira", "ter"],
  ["quarta", "quarta-feira", "qua"],
  ["quinta", "quinta-feira", "qui"],
  ["sexta", "sexta-feira", "sex"],
  ["sabado", "sab"],
  ["domingo", "dom"],
];

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function detectarDiaSemana(nomeColuna: string): number | null {
  const normalizado = normalizar(nomeColuna);
  for (let i = 0; i < NOMES_DIAS.length; i++) {
    if (NOMES_DIAS[i].includes(normalizado)) return i;
  }
  return null;
}
