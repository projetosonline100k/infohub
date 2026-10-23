// Peças do escritório em pixel art: tiles, pisos, paredes, sprites e o caminho entre tiles.
// Tudo em tiles de 16 px. Os sprites vêm das folhas gratuitas da LimeZu (public/escritorio-pixel, fora do git).
// A planta (onde fica cada sala) é gerada em planta.ts a partir da arrumação que o Davi monta.

export const TILE = 16;

/** Recorte numa folha de sprites, em tiles: coluna, linha, largura, altura. */
export type Recorte = [number, number, number, number];

// Pisos (folha "construcao"): padrão que se repete a cada `w` × `h` tiles a partir de (c, l).
export const PISOS = {
  madeira: { c: 4, l: 11, w: 3, h: 1, nome: "Madeira", amostra: "#b9773f" },
  madeiraEscura: { c: 4, l: 13, w: 3, h: 1, nome: "Madeira escura", amostra: "#8a5a44" },
  carpete: { c: 14, l: 5, w: 3, h: 8, nome: "Carpete", amostra: "#8f8a8c" },
  ladrilho: { c: 11, l: 7, w: 3, h: 2, nome: "Ladrilho", amostra: "#efe1a6" },
  azulejo: { c: 11, l: 9, w: 3, h: 2, nome: "Azulejo", amostra: "#9fd3d3" },
  espinha: { c: 11, l: 13, w: 3, h: 2, nome: "Espinha de peixe", amostra: "#b45a3c" },
  tijolo: { c: 11, l: 5, w: 3, h: 2, nome: "Tijolinho", amostra: "#a8484a" },
} as const;
export type Piso = keyof typeof PISOS;

// Paredes (folha "construcao"): faixa de 2 tiles de altura; colunas 0 (ponta esquerda), 1 (meio), 2 (ponta direita).
export const PAREDES = {
  bege: { l: 19, nome: "Bege", amostra: "#c9c3a8" },
  cinza: { l: 17, nome: "Cinza", amostra: "#a9adbf" },
  madeira: { l: 11, nome: "Madeira", amostra: "#b9773f" },
  madeiraEscura: { l: 13, nome: "Madeira escura", amostra: "#8a5a44" },
  menta: { l: 9, nome: "Menta", amostra: "#cdf3ea" },
  amarela: { l: 7, nome: "Amarela", amostra: "#f0e39b" },
  vermelha: { l: 5, nome: "Vermelha", amostra: "#d58a6c" },
} as const;
export type Parede = keyof typeof PAREDES;

/** Sprites usados (folha interiores, tiles de 16 px). */
export const S = {
  janela: [7, 24, 2, 2], janela2: [9, 24, 2, 2],
  quadroBranco: [10, 40, 2, 2], lousa: [13, 40, 2, 2], geladeira: [12, 40, 1, 2],
  plantaGrande: [10, 44, 2, 3], plantaPequena: [12, 45, 1, 2], palmeira: [13, 44, 2, 3],
  mesaReuniao: [0, 10, 4, 3], cadeiraDir: [9, 31, 1, 2], cadeiraEsq: [9, 33, 1, 2],
  tapete: [7, 15, 4, 3], tapeteAzul: [13, 21, 2, 1], tapeteVerde: [0, 42, 3, 2],
  sofaCinza: [1, 72, 3, 2], sofaClaro: [4, 72, 3, 2], sofaMarrom: [7, 72, 3, 2], mesinha: [7, 13, 3, 2],
  mesaPc1: [1, 33, 2, 2], mesaPc2: [4, 33, 2, 2], mesaPc3: [7, 33, 2, 2],
  estanteMetal: [6, 18, 2, 3], estanteBranca: [2, 18, 4, 3], estanteLivros: [5, 14, 2, 2],
  luzVermelha: [11, 53, 1, 3], luzAzul: [12, 53, 1, 3], quadro: [8, 21, 2, 1],
  balcao: [5, 55, 2, 2], portaVidro: [0, 28, 4, 2], armarioCozinha: [1, 16, 4, 2],
  banco: [4, 31, 1, 1], bancoEscuro: [4, 32, 1, 1], globo: [12, 66, 1, 2], mapaMundi: [10, 66, 2, 2],
  quadroA: [0, 72, 1, 1], quadroB: [0, 74, 1, 1], quadroC: [0, 76, 1, 1],
  mesaSeg: [7, 33, 1, 2], mesaSegTopo: [7, 33, 1, 1], mesaSegEscura: [4, 33, 1, 2], mesaSegEscuraTopo: [4, 33, 1, 1],
  sofaVermelho: [8, 18, 2, 2], poltrona: [10, 18, 1, 2], estanteLivros2: [5, 16, 2, 2],
  prateleiraA: [10, 72, 2, 2], prateleiraB: [12, 72, 2, 2], prateleiraC: [14, 72, 2, 2],
  tapeteAzulPeq: [11, 16, 2, 1], tapeteVerdePeq: [11, 18, 2, 1], tapeteVermelhoPeq: [11, 20, 2, 1], tapeteBege: [3, 42, 3, 2],
  luminaria: [12, 56, 1, 3], abajur: [14, 53, 1, 2],
} satisfies Record<string, Recorte>;

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

export type Pose = "sentado-dir" | "sentado-esq" | "sofa" | "em-pe-baixo" | "em-pe-cima";
export type TipoEstacao = "mesa" | "reuniao" | "sofa" | "copa" | "espera";

export interface Estacao { id: string; tipo: TipoEstacao; x: number; y: number; pose: Pose; setorId?: string }

export type Celula = { piso: Piso } | { parede: Parede; linha: 0 | 1; ponta: "e" | "m" | "d" } | null;

/** Caminho em 4 direções (busca em largura); o destino pode estar ocupado por móvel (cadeira, sofá). */
export function caminho(andavel: boolean[][], de: { x: number; y: number }, para: { x: number; y: number }) {
  const altura = andavel.length, largura = andavel[0]?.length ?? 0;
  const chave = (x: number, y: number) => y * largura + x;
  const veio = new Map<number, number>();
  const fila = [chave(de.x, de.y)];
  veio.set(fila[0], -1);
  const alvo = chave(para.x, para.y);
  for (let i = 0; i < fila.length; i++) {
    const atual = fila[i];
    if (atual === alvo) break;
    const x = atual % largura, y = Math.floor(atual / largura);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= largura || ny >= altura) continue;
      const k = chave(nx, ny);
      if (veio.has(k) || (!andavel[ny][nx] && k !== alvo)) continue;
      veio.set(k, atual);
      fila.push(k);
    }
  }
  if (!veio.has(alvo)) return [];
  const passos: { x: number; y: number }[] = [];
  for (let k = alvo; k !== -1; k = veio.get(k)!) passos.unshift({ x: k % largura, y: Math.floor(k / largura) });
  return passos.slice(1);
}
