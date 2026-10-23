// Planta do escritório em pixel art (vertical slice: Entrada, corredor, Área Colaborativa e Audiovisual).
// Tudo em tiles de 16 px. Os sprites vêm das folhas gratuitas da LimeZu (public/escritorio-pixel, fora do git).

export const TILE = 16;
export const LARGURA = 36;
export const ALTURA = 26;

/** Recorte numa folha de sprites, em tiles: coluna, linha, largura, altura. */
export type Recorte = [number, number, number, number];
export type Folha = "interiores" | "construcao";

// Pisos (folha "construcao"): padrão que se repete a cada `w` × `h` tiles a partir de (c, l).
export const PISOS = {
  madeira: { c: 4, l: 11, w: 3, h: 1 },
  carpete: { c: 14, l: 5, w: 3, h: 8 },
  ladrilho: { c: 11, l: 7, w: 3, h: 2 },
  espinha: { c: 11, l: 13, w: 3, h: 2 },
} as const;
export type Piso = keyof typeof PISOS;

// Paredes (folha "construcao"): faixa de 2 tiles de altura; colunas 0 (ponta esquerda), 1 (meio), 2 (ponta direita).
export const PAREDES = { bege: 19, cinza: 17, madeira: 11, menta: 9 } as const;
export type Parede = keyof typeof PAREDES;

export type SalaId = "colaborativa" | "audiovisual" | "corredor" | "entrada";

export interface Sala {
  id: SalaId;
  nome: string;
  /** chão: x0..x1, y0..y1 (inclusive); a parede ocupa as 2 linhas acima de y0 */
  x0: number; x1: number; y0: number; y1: number;
  piso: Piso;
  parede: Parede;
  cor: string;
}

export const SALAS: Sala[] = [
  { id: "colaborativa", nome: "Área Colaborativa", x0: 2, x1: 19, y0: 3, y1: 12, piso: "madeira", parede: "bege", cor: "#f59e0b" },
  { id: "audiovisual", nome: "Audiovisual", x0: 21, x1: 33, y0: 3, y1: 12, piso: "carpete", parede: "cinza", cor: "#38bdf8" },
  { id: "corredor", nome: "Corredor", x0: 2, x1: 33, y0: 15, y1: 17, piso: "ladrilho", parede: "madeira", cor: "#a3a3a3" },
  { id: "entrada", nome: "Entrada", x0: 12, x1: 23, y0: 20, y1: 23, piso: "espinha", parede: "madeira", cor: "#34d399" },
];

/** Passagens: tiles de chão abertos na parede ou entre salas (portas sem folha). */
export const PASSAGENS: { x0: number; x1: number; y0: number; y1: number; piso: Piso }[] = [
  { x0: 20, x1: 20, y0: 7, y1: 8, piso: "madeira" }, // Colaborativa ↔ Audiovisual
  { x0: 10, x1: 11, y0: 13, y1: 14, piso: "madeira" }, // Colaborativa ↔ corredor
  { x0: 26, x1: 27, y0: 13, y1: 14, piso: "carpete" }, // Audiovisual ↔ corredor
  { x0: 16, x1: 19, y0: 18, y1: 19, piso: "espinha" }, // corredor ↔ Entrada
];

export interface Movel {
  /** recorte na folha "interiores" */
  r: Recorte;
  x: number; y: number;
  /** tiles que bloqueiam a passagem, relativos ao canto (dx, dy, w, h); sem isso, não bloqueia */
  bloqueia?: [number, number, number, number];
  /** fica no chão, por baixo de tudo (tapete) */
  chao?: boolean;
  /** pendurado na parede (desenha atrás das pessoas) */
  parede?: boolean;
}

// Sprites usados (folha interiores, tiles de 16 px).
const S = {
  janela: [7, 24, 2, 2], janela2: [9, 24, 2, 2],
  quadroBranco: [10, 40, 2, 2], geladeira: [12, 40, 1, 2],
  plantaGrande: [10, 44, 2, 3], plantaPequena: [12, 45, 1, 2], palmeira: [13, 44, 2, 3],
  mesaReuniao: [0, 10, 4, 3], cadeiraDir: [9, 31, 1, 2], cadeiraEsq: [9, 33, 1, 2],
  tapete: [7, 15, 4, 3], tapeteAzul: [13, 21, 2, 1],
  sofaCinza: [1, 72, 3, 2], sofaClaro: [4, 72, 3, 2], mesinha: [7, 13, 3, 2],
  mesaPc1: [1, 33, 2, 2], mesaPc2: [4, 33, 2, 2], mesaPc3: [7, 33, 2, 2],
  estanteMetal: [6, 18, 2, 3], estanteBranca: [2, 18, 4, 3],
  luzVermelha: [11, 53, 1, 3], luzAzul: [12, 53, 1, 3], quadro: [8, 21, 2, 1],
  balcao: [5, 55, 2, 2], portaVidro: [0, 28, 4, 2], estanteLivros: [5, 14, 2, 2],
  quadroA: [0, 72, 1, 1], quadroB: [0, 74, 1, 1], quadroC: [0, 76, 1, 1],
} satisfies Record<string, Recorte>;

export const MOVEIS: Movel[] = [
  // Área Colaborativa
  { r: S.janela, x: 3, y: 1, parede: true },
  { r: S.janela, x: 17, y: 1, parede: true },
  { r: S.quadroBranco, x: 2, y: 3, bloqueia: [0, 1, 2, 1] },
  { r: S.estanteLivros, x: 14, y: 2, bloqueia: [0, 1, 2, 1] },
  { r: S.mesaReuniao, x: 3, y: 8, bloqueia: [1, 0, 2, 3] },
  { r: S.cadeiraDir, x: 3, y: 7 }, { r: S.cadeiraDir, x: 3, y: 9 },
  { r: S.cadeiraEsq, x: 6, y: 7 }, { r: S.cadeiraEsq, x: 6, y: 9 },
  { r: S.tapete, x: 10, y: 6, chao: true },
  { r: S.sofaCinza, x: 10, y: 4, bloqueia: [0, 0, 3, 1] },
  { r: S.sofaClaro, x: 14, y: 4, bloqueia: [0, 0, 3, 1] },
  { r: S.mesinha, x: 10, y: 7, bloqueia: [0, 0, 3, 2] },
  { r: S.geladeira, x: 18, y: 3, bloqueia: [0, 0, 1, 2] },
  { r: S.palmeira, x: 17, y: 10, bloqueia: [0, 2, 2, 1] },
  { r: S.plantaPequena, x: 2, y: 11, bloqueia: [0, 1, 1, 1] },
  { r: S.plantaPequena, x: 9, y: 3, bloqueia: [0, 1, 1, 1] },
  // Audiovisual
  { r: S.janela2, x: 22, y: 1, parede: true },
  { r: S.janela2, x: 32, y: 1, parede: true },
  { r: S.quadro, x: 29, y: 1, parede: true },
  { r: S.estanteMetal, x: 24, y: 1, bloqueia: [0, 2, 2, 1] },
  { r: S.estanteBranca, x: 26, y: 1, bloqueia: [0, 2, 3, 1] },
  { r: S.mesaPc1, x: 23, y: 5, bloqueia: [0, 0, 2, 2] }, { r: S.cadeiraDir, x: 22, y: 4 },
  { r: S.mesaPc2, x: 27, y: 5, bloqueia: [0, 0, 2, 2] }, { r: S.cadeiraDir, x: 26, y: 4 },
  { r: S.mesaPc3, x: 31, y: 5, bloqueia: [0, 0, 2, 2] }, { r: S.cadeiraDir, x: 30, y: 4 },
  { r: S.mesaPc2, x: 23, y: 9, bloqueia: [0, 0, 2, 2] }, { r: S.cadeiraDir, x: 22, y: 8 },
  { r: S.mesaPc3, x: 27, y: 9, bloqueia: [0, 0, 2, 2] }, { r: S.cadeiraDir, x: 26, y: 8 },
  { r: S.mesaPc1, x: 31, y: 9, bloqueia: [0, 0, 2, 2] }, { r: S.cadeiraDir, x: 30, y: 8 },
  { r: S.luzVermelha, x: 33, y: 10, bloqueia: [0, 2, 1, 1] },
  { r: S.luzAzul, x: 21, y: 10, bloqueia: [0, 2, 1, 1] },
  // Corredor
  { r: S.quadroA, x: 6, y: 13, parede: true }, { r: S.quadroB, x: 15, y: 13, parede: true },
  { r: S.quadroC, x: 22, y: 13, parede: true }, { r: S.quadroA, x: 31, y: 13, parede: true },
  { r: S.plantaPequena, x: 2, y: 15, bloqueia: [0, 1, 1, 1] },
  { r: S.plantaPequena, x: 33, y: 15, bloqueia: [0, 1, 1, 1] },
  // Entrada
  { r: S.balcao, x: 13, y: 20, bloqueia: [0, 0, 2, 2] },
  { r: S.sofaClaro, x: 20, y: 20, bloqueia: [0, 0, 3, 1] },
  { r: S.plantaPequena, x: 12, y: 22, bloqueia: [0, 1, 1, 1] },
  { r: S.plantaPequena, x: 23, y: 22, bloqueia: [0, 1, 1, 1] },
  { r: S.tapeteAzul, x: 17, y: 23, chao: true },
  { r: S.portaVidro, x: 16, y: 24 },
];

/** Tela "Nosso Resultado" na parede da Área Colaborativa (tiles). */
export const TELA_RESULTADO = { x: 6.5, y: 0.6, w: 6.5, h: 2.2 };

export type Pose = "sentado-dir" | "sentado-esq" | "sofa" | "em-pe-baixo" | "em-pe-cima";
export type TipoEstacao = "mesa" | "reuniao" | "sofa" | "copa" | "espera";

export interface Estacao { id: string; sala: SalaId; tipo: TipoEstacao; x: number; y: number; pose: Pose }

export const ESTACOES: Estacao[] = [
  ...[[22, 5], [26, 5], [30, 5], [22, 9], [26, 9], [30, 9]].map(([x, y], i) =>
    ({ id: `av-mesa-${i}`, sala: "audiovisual" as const, tipo: "mesa" as const, x, y, pose: "sentado-dir" as const })),
  { id: "reuniao-0", sala: "colaborativa", tipo: "reuniao", x: 3, y: 8, pose: "sentado-dir" },
  { id: "reuniao-1", sala: "colaborativa", tipo: "reuniao", x: 6, y: 8, pose: "sentado-esq" },
  { id: "reuniao-2", sala: "colaborativa", tipo: "reuniao", x: 3, y: 10, pose: "sentado-dir" },
  { id: "reuniao-3", sala: "colaborativa", tipo: "reuniao", x: 6, y: 10, pose: "sentado-esq" },
  ...[10, 11, 12, 14, 15, 16].map((x, i) => ({ id: `sofa-${i}`, sala: "colaborativa" as const, tipo: "sofa" as const, x, y: 5, pose: "sofa" as const })),
  { id: "copa-0", sala: "colaborativa", tipo: "copa", x: 18, y: 5, pose: "em-pe-cima" },
  { id: "copa-1", sala: "colaborativa", tipo: "copa", x: 17, y: 5, pose: "em-pe-cima" },
  ...[[9, 10], [12, 11], [14, 9], [15, 11], [8, 6], [16, 7]].map(([x, y], i) =>
    ({ id: `espera-${i}`, sala: "colaborativa" as const, tipo: "espera" as const, x, y, pose: "em-pe-baixo" as const })),
];

/** Onde as pessoas aparecem quando chegam (porta de vidro da Entrada). */
export const CHEGADA = { x: 17, y: 23 };

export type Celula = { piso: Piso } | { parede: Parede; linha: 0 | 1; ponta: "e" | "m" | "d" } | null;

/** Grade do mapa: chão, parede (2 linhas) ou vazio. */
export function montarGrade(): Celula[][] {
  const g: Celula[][] = Array.from({ length: ALTURA }, () => Array<Celula>(LARGURA).fill(null));
  for (const s of SALAS) {
    for (let x = s.x0; x <= s.x1; x++) {
      for (const linha of [0, 1] as const) g[s.y0 - 2 + linha][x] = { parede: s.parede, linha, ponta: x === s.x0 ? "e" : x === s.x1 ? "d" : "m" };
      for (let y = s.y0; y <= s.y1; y++) g[y][x] = { piso: s.piso };
    }
  }
  for (const p of PASSAGENS) for (let x = p.x0; x <= p.x1; x++) for (let y = p.y0; y <= p.y1; y++) g[y][x] = { piso: p.piso };
  return g;
}

/** Tiles por onde dá para andar (chão sem móvel que bloqueia). */
export function montarAndavel(grade: Celula[][]): boolean[][] {
  const ok = grade.map((linha) => linha.map((c) => !!c && "piso" in c));
  for (const m of MOVEIS) {
    if (!m.bloqueia) continue;
    const [dx, dy, w, h] = m.bloqueia;
    for (let x = m.x + dx; x < m.x + dx + w; x++) for (let y = m.y + dy; y < m.y + dy + h; y++) if (ok[y]) ok[y][x] = false;
  }
  return ok;
}

/** Caminho em 4 direções (busca em largura); o destino pode estar ocupado por móvel (cadeira, sofá). */
export function caminho(andavel: boolean[][], de: { x: number; y: number }, para: { x: number; y: number }) {
  const chave = (x: number, y: number) => y * LARGURA + x;
  const veio = new Map<number, number>();
  const fila = [chave(de.x, de.y)];
  veio.set(fila[0], -1);
  const alvo = chave(para.x, para.y);
  while (fila.length) {
    const atual = fila.shift()!;
    if (atual === alvo) break;
    const x = atual % LARGURA, y = Math.floor(atual / LARGURA);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= LARGURA || ny >= ALTURA) continue;
      const k = chave(nx, ny);
      if (veio.has(k) || (!andavel[ny][nx] && k !== alvo)) continue;
      veio.set(k, atual);
      fila.push(k);
    }
  }
  if (!veio.has(alvo)) return [];
  const passos: { x: number; y: number }[] = [];
  for (let k = alvo; k !== -1; k = veio.get(k)!) passos.unshift({ x: k % LARGURA, y: Math.floor(k / LARGURA) });
  return passos.slice(1);
}
