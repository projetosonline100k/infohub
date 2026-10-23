// Escritório virtual 3D — protótipo (vertical slice): Entrada → corredor → Audiovisual.
// O mundo é DESCRITO POR DADOS: salas (piso/paredes/portas) e uma lista de peças (tipo + posição + giro).
// A cena só desenha o que está aqui, e as colisões saem das mesmas peças — assim o futuro "Editar
// escritório" (mover mesa, adicionar planta, criar sala) é só mudar esta lista e salvar no projeto.
// Unidades em metros; y para cima; o jogador entra olhando para -z.

export type Vec2 = [number, number];
export type TipoPeca =
  | "estacao_edicao"    // mesa com dois monitores (quem senta olha para -z)
  | "planta" | "planta_grande"
  | "estante"           // estante com equipamentos/livros
  | "tripe_camera" | "softbox" | "fundo_verde"
  | "luminaria_teto"
  | "sofa" | "mesa_centro" | "tapete"
  | "quadro_ideias" | "tv_resultado" | "placa" | "placa_direcao" | "neon"
  | "porta_vidro" | "banco";

export interface Peca {
  id: string;
  tipo: TipoPeca;
  /** posição no chão (x, z) */
  pos: Vec2;
  /** altura (para placas/TVs na parede) */
  y?: number;
  /** giro em torno do eixo vertical, em graus (0 = virado para +z) */
  giro?: number;
  /** texto (placas) ou cor (tapete/neon) */
  texto?: string;
  cor?: string;
  /** tamanho (tapete, fundo verde, placa): largura × profundidade/altura */
  tam?: Vec2;
  setor?: string;
}

export interface Sala {
  id: string;
  nome: string;
  /** retângulo do piso: x0, z0, x1, z1 (x0 < x1, z0 < z1) */
  rect: [number, number, number, number];
  /** cor de acento do setor */
  cor: string;
  piso?: "madeira" | "carpete";
}

/** Vão de porta numa parede: liga duas salas. */
export interface Porta { id: string; rect: [number, number, number, number]; nome?: string }

export const ALTURA_PAREDE = 3.2;

export const SALAS: Sala[] = [
  { id: "corredor", nome: "Corredor", rect: [-2, -18, 2, 0], cor: "#f59e0b", piso: "madeira" },
  { id: "audiovisual", nome: "Audiovisual", rect: [2, -14, 14, -2], cor: "#38bdf8", piso: "madeira" },
];
// Vãos: a porta do Audiovisual (parede x = 2) e as portas que ainda não abrem (Marketing e Diretoria).
export const PORTAS: Porta[] = [
  { id: "porta-audiovisual", rect: [1.6, -9.6, 2.4, -6.4], nome: "Audiovisual" },
];

// Mesas de edição: a pessoa senta em (x, z + 0.75) olhando para -z (para a tela).
export const ESTACOES: Vec2[] = [[6, -10], [9.2, -10], [6, -5.6], [9.2, -5.6]];

export const PECAS: Peca[] = [
  // Corredor: placas de direção, plantas, bancos e a TV do Nosso resultado no fundo (porta da Diretoria).
  { id: "dir-1", tipo: "placa_direcao", pos: [0, -4.6], y: 2.55, texto: "← Marketing    ↑ Diretoria    Audiovisual →", cor: "#f59e0b", tam: [3.4, 0.5] },
  { id: "neon-av", tipo: "neon", pos: [1.98, -8], y: 2.55, giro: -90, texto: "Audiovisual", cor: "#38bdf8", tam: [2.6, 0.55] },
  { id: "neon-mkt", tipo: "neon", pos: [-1.98, -8], y: 2.55, giro: 90, texto: "Marketing · em breve", cor: "#a855f7", tam: [2.8, 0.5] },
  { id: "porta-mkt", tipo: "porta_vidro", pos: [-1.98, -8], giro: 90, tam: [3, 2.6] },
  { id: "neon-dir", tipo: "neon", pos: [0, -17.96], y: 2.85, texto: "Diretoria · em breve", cor: "#fbbf24", tam: [2.8, 0.42] },
  { id: "porta-dir", tipo: "porta_vidro", pos: [0, -17.96], tam: [2.4, 2.4] },
  { id: "tv-resultado", tipo: "tv_resultado", pos: [-1.96, -13.2], y: 1.7, giro: 90, tam: [2.6, 1.46] },
  { id: "pl-c1", tipo: "planta_grande", pos: [-1.45, -1.2] },
  { id: "pl-c2", tipo: "planta_grande", pos: [1.45, -1.2] },
  { id: "pl-c3", tipo: "planta", pos: [1.5, -15.6] },
  { id: "pl-c4", tipo: "planta", pos: [-1.5, -16.8] },
  { id: "banco-1", tipo: "banco", pos: [1.55, -12.6], giro: -90 },
  ...[-2.5, -6.5, -10.5, -14.5].map((z, k) => ({ id: `lum-c${k}`, tipo: "luminaria_teto" as const, pos: [0, z] as Vec2 })),

  // Audiovisual: quatro estações de edição, estúdio com fundo verde, câmera e softboxes, estantes e plantas.
  { id: "tapete-av", tipo: "tapete", pos: [7.6, -7.8], cor: "#1e3a5f", tam: [7.6, 7.6] },
  ...ESTACOES.map(([x, z], k) => ({ id: `est-${k}`, tipo: "estacao_edicao" as const, pos: [x, z] as Vec2, setor: "audiovisual" })),
  { id: "fundo-verde", tipo: "fundo_verde", pos: [12.4, -13.85], tam: [3.2, 2.9] },
  { id: "tripe", tipo: "tripe_camera", pos: [12.4, -10.6], giro: 180 },
  { id: "softbox-1", tipo: "softbox", pos: [10.6, -11.4], giro: 150 },
  { id: "softbox-2", tipo: "softbox", pos: [13.6, -10.8], giro: 210 },
  { id: "estante-1", tipo: "estante", pos: [13.75, -5.2], giro: -90 },
  { id: "estante-2", tipo: "estante", pos: [13.75, -7.6], giro: -90 },
  { id: "sofa-av", tipo: "sofa", pos: [4.2, -2.6], giro: 180 },
  { id: "pl-a1", tipo: "planta_grande", pos: [2.6, -13.4] },
  { id: "pl-a2", tipo: "planta_grande", pos: [13.4, -2.6] },
  { id: "pl-a3", tipo: "planta", pos: [10.9, -2.5] },
  { id: "pl-a4", tipo: "planta", pos: [2.6, -2.6] },
  { id: "quadro-av", tipo: "quadro_ideias", pos: [7.6, -13.96], y: 1.6, tam: [3, 1.4] },
  { id: "placa-av", tipo: "neon", pos: [4.2, -13.96], y: 2.5, texto: "Audiovisual", cor: "#38bdf8", tam: [2.2, 0.5] },
  ...[[5, -4.5], [10, -4.5], [5, -10.5], [10, -10.5]].map(([x, z], k) => ({ id: `lum-a${k}`, tipo: "luminaria_teto" as const, pos: [x, z] as Vec2 })),
];

// Colisão: onde dá para andar (pisos + vãos de porta), menos as peças que ocupam o chão.
const FOLGA = 0.32;   // "raio" do jogador
const OCUPA: Partial<Record<TipoPeca, Vec2>> = {
  estacao_edicao: [1.8, 2.4], planta: [0.6, 0.6], planta_grande: [0.8, 0.8], estante: [0.5, 1.8], tripe_camera: [0.8, 0.8],
  softbox: [0.7, 0.7], fundo_verde: [3.2, 0.5], sofa: [2.2, 1], banco: [1.4, 0.5],
};
export const OBSTACULOS: [number, number, number, number][] = PECAS.flatMap((p) => {
  const t = OCUPA[p.tipo];
  if (!t) return [];
  const giro = ((p.giro ?? 0) % 180 + 180) % 180;
  const [w, d] = giro === 90 ? [t[1], t[0]] : t;
  // A estação ocupa a mesa e a cadeira (atrás dela, em +z).
  const dz = p.tipo === "estacao_edicao" ? 0.45 : 0;
  return [[p.pos[0] - w / 2, p.pos[1] - d / 2 + dz, p.pos[0] + w / 2, p.pos[1] + d / 2 + dz] as [number, number, number, number]];
});

export function podeEstar(x: number, z: number): boolean {
  const dentro = (r: [number, number, number, number], f: number) => x > r[0] + f && x < r[2] - f && z > r[1] + f && z < r[3] - f;
  const noPiso = SALAS.some((s) => dentro(s.rect, FOLGA)) || PORTAS.some((p) => dentro(p.rect, 0.05));
  if (!noPiso) return false;
  return !OBSTACULOS.some((o) => x > o[0] - FOLGA && x < o[2] + FOLGA && z > o[1] - FOLGA && z < o[3] + FOLGA);
}

export const INICIO = { x: 0, z: -0.9, olhando: 0 };
