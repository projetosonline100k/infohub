// Escritório virtual 3D: Entrada → corredor → Audiovisual, Marketing e Diretoria.
// O mundo é DESCRITO POR DADOS: salas (piso), paredes (com vãos e janelas), portas (abrem/fecham),
// estações (mesa + cadeira, viradas para a porta da sala) e peças soltas (tipo + posição + giro).
// A cena só desenha o que está aqui, e as colisões saem dos mesmos dados — assim o futuro "Editar
// escritório" (mover mesa, adicionar planta, criar sala) é só mudar estas listas e salvar no projeto.
// Unidades em metros; y para cima; o jogador entra olhando para -z.

export type Vec2 = [number, number];
export type TipoPeca =
  | "planta" | "planta_grande" | "estante" | "tripe_camera" | "softbox" | "fundo_verde" | "luminaria_teto"
  | "sofa" | "tapete" | "quadro_ideias" | "tv_resultado" | "placa_direcao" | "neon" | "banco" | "orbe";

export interface Peca {
  id: string;
  tipo: TipoPeca;
  pos: Vec2;
  y?: number;
  /** giro em torno do eixo vertical, em graus (0 = virado para +z) */
  giro?: number;
  texto?: string;
  cor?: string;
  tam?: Vec2;
}

export type SalaId = "corredor" | "audiovisual" | "marketing" | "diretoria";
export interface Sala { id: SalaId; nome: string; rect: [number, number, number, number]; cor: string }

/** Tipo de estação: muda o que vai em cima da mesa. */
export type TipoEstacao = "edicao" | "criativa" | "executiva";
/** Mesa + cadeira. giro em graus: 0 = quem senta olha para -z; 90 = olha para -x; -90 = +x; 180 = +z. */
export interface Estacao { id: string; sala: SalaId; pos: Vec2; giro: number; tipo: TipoEstacao }

/** Parede reta; vãos e janelas medidos ao longo dela (do "de" para o "ate"). */
export interface Parede { de: Vec2; ate: Vec2; vaos?: [number, number][]; janelas?: [number, number][] }

/** Porta de vidro num vão: desliza para o lado quando abre. eixo = direção da parede. */
export interface Porta { id: string; nome: string; centro: Vec2; largura: number; eixo: "x" | "z"; abertaNoInicio?: boolean; vao: [number, number, number, number] }

export const ALTURA_PAREDE = 3.2;

export const SALAS: Sala[] = [
  { id: "corredor", nome: "Corredor", rect: [-2, -18, 2, 0], cor: "#f59e0b" },
  { id: "audiovisual", nome: "Audiovisual", rect: [2, -14, 14, -2], cor: "#38bdf8" },
  { id: "marketing", nome: "Marketing", rect: [-14, -14, -2, -2], cor: "#a855f7" },
  { id: "diretoria", nome: "Diretoria", rect: [-5, -28, 5, -18], cor: "#fbbf24" },
];

export const PAREDES: Parede[] = [
  { de: [-2, 0], ate: [2, 0], vaos: [[0.9, 3.1]] },                         // entrada
  { de: [2, 0], ate: [2, -18], vaos: [[6.4, 9.6]] },                         // corredor | Audiovisual
  { de: [-2, 0], ate: [-2, -18], vaos: [[6.4, 9.6]] },                       // corredor | Marketing
  { de: [-5, -18], ate: [5, -18], vaos: [[3.8, 6.2]] },                      // corredor | Diretoria
  { de: [2, -14], ate: [14, -14] }, { de: [2, -2], ate: [14, -2] },
  { de: [14, -14], ate: [14, -2], janelas: [[1.5, 4.5], [7.5, 10.5]] },
  { de: [-14, -14], ate: [-2, -14] }, { de: [-14, -2], ate: [-2, -2] },
  { de: [-14, -2], ate: [-14, -14], janelas: [[1.5, 4.5], [7.5, 10.5]] },
  { de: [-5, -18], ate: [-5, -28] }, { de: [5, -18], ate: [5, -28] },
  { de: [-5, -28], ate: [5, -28], janelas: [[1, 3.5], [6.5, 9]] },
];

export const PORTAS: Porta[] = [
  { id: "porta-audiovisual", nome: "Audiovisual", centro: [2, -8], largura: 3.2, eixo: "z", abertaNoInicio: true, vao: [1.6, -9.6, 2.4, -6.4] },
  { id: "porta-marketing", nome: "Marketing", centro: [-2, -8], largura: 3.2, eixo: "z", vao: [-2.4, -9.6, -1.6, -6.4] },
  { id: "porta-diretoria", nome: "Diretoria", centro: [0, -18], largura: 2.4, eixo: "x", vao: [-1.2, -18.4, 1.2, -17.6] },
];

// Estações viradas para a porta da sala: quem entra vê o rosto de quem trabalha.
export const ESTACOES: Estacao[] = [
  // Audiovisual: porta em x = 2 → olham para -x (giro 90)
  ...([[5.6, -4.4], [9.0, -4.4], [5.6, -11.2], [9.0, -11.2]] as Vec2[]).map((pos, k) => ({ id: `av-${k}`, sala: "audiovisual" as const, pos, giro: 90, tipo: "edicao" as const })),
  // Marketing: porta em x = -2 → olham para +x (giro -90)
  ...([[-5.6, -4.4], [-9.0, -4.4], [-5.6, -11.2], [-9.0, -11.2]] as Vec2[]).map((pos, k) => ({ id: `mkt-${k}`, sala: "marketing" as const, pos, giro: -90, tipo: "criativa" as const })),
  // Diretoria: porta em z = -18 → olham para +z (giro 180)
  ...([[-2.2, -22.6], [2.2, -22.6]] as Vec2[]).map((pos, k) => ({ id: `dir-${k}`, sala: "diretoria" as const, pos, giro: 180, tipo: "executiva" as const })),
];

const luminarias = (pts: Vec2[], prefixo: string): Peca[] => pts.map((pos, k) => ({ id: `lum-${prefixo}${k}`, tipo: "luminaria_teto", pos }));

export const PECAS: Peca[] = [
  // Corredor
  { id: "dir-1", tipo: "placa_direcao", pos: [0, -4.6], y: 2.55, texto: "← Marketing    ↑ Diretoria    Audiovisual →", cor: "#f59e0b", tam: [3.4, 0.5] },
  { id: "neon-av", tipo: "neon", pos: [1.9, -8], y: 2.85, giro: -90, texto: "Audiovisual", cor: "#38bdf8", tam: [2.4, 0.42] },
  { id: "neon-mkt", tipo: "neon", pos: [-1.9, -8], y: 2.85, giro: 90, texto: "Marketing", cor: "#a855f7", tam: [2.4, 0.42] },
  { id: "neon-dir", tipo: "neon", pos: [0, -17.9], y: 2.85, texto: "Diretoria", cor: "#fbbf24", tam: [2.2, 0.42] },
  { id: "tv-resultado", tipo: "tv_resultado", pos: [-1.9, -13.2], y: 1.7, giro: 90, tam: [2.6, 1.46] },
  { id: "pl-c1", tipo: "planta_grande", pos: [-1.45, -1.2] }, { id: "pl-c2", tipo: "planta_grande", pos: [1.45, -1.2] },
  { id: "pl-c3", tipo: "planta", pos: [1.5, -16.6] }, { id: "pl-c4", tipo: "planta", pos: [-1.5, -16.6] },
  { id: "banco-1", tipo: "banco", pos: [1.55, -12.6], giro: -90 },
  ...luminarias([[0, -2.5], [0, -6.5], [0, -10.5], [0, -14.5]], "c"),

  // Audiovisual
  { id: "tapete-av", tipo: "tapete", pos: [7.3, -7.8], cor: "#1e3a5f", tam: [7.4, 9] },
  { id: "fundo-verde", tipo: "fundo_verde", pos: [12.4, -13.85], tam: [3.2, 2.9] },
  { id: "tripe", tipo: "tripe_camera", pos: [12.4, -10.6], giro: 180 },
  { id: "softbox-1", tipo: "softbox", pos: [11.0, -12.4], giro: 150 },
  { id: "softbox-2", tipo: "softbox", pos: [13.6, -10.8], giro: 210 },
  { id: "estante-1", tipo: "estante", pos: [13.75, -5.2], giro: -90 },
  { id: "estante-2", tipo: "estante", pos: [13.75, -7.6], giro: -90 },
  { id: "sofa-av", tipo: "sofa", pos: [4.0, -2.6], giro: 180 },
  { id: "pl-a1", tipo: "planta_grande", pos: [2.6, -13.4] }, { id: "pl-a2", tipo: "planta_grande", pos: [13.4, -2.6] },
  { id: "pl-a3", tipo: "planta", pos: [11.2, -2.5] },
  { id: "quadro-av", tipo: "quadro_ideias", pos: [6.6, -13.96], y: 1.6, tam: [3, 1.4] },
  ...luminarias([[5, -4.5], [10, -4.5], [5, -10.5], [10, -10.5]], "a"),

  // Marketing: quadro de campanha, métricas, plantas, sofá
  { id: "tapete-mkt", tipo: "tapete", pos: [-7.3, -7.8], cor: "#3b1f5c", tam: [7.4, 9] },
  { id: "quadro-mkt", tipo: "quadro_ideias", pos: [-8, -13.96], y: 1.6, tam: [3.6, 1.5] },
  { id: "neon-mkt-in", tipo: "neon", pos: [-11.8, -13.96], y: 2.55, texto: "Marketing", cor: "#a855f7", tam: [2.2, 0.48] },
  { id: "estante-mkt", tipo: "estante", pos: [-13.75, -6.4], giro: 90 },
  { id: "sofa-mkt", tipo: "sofa", pos: [-11.4, -2.6], giro: 180 },
  { id: "pl-m1", tipo: "planta_grande", pos: [-2.6, -13.4] }, { id: "pl-m2", tipo: "planta_grande", pos: [-13.4, -13.4] },
  { id: "pl-m3", tipo: "planta", pos: [-13.4, -2.6] },
  ...luminarias([[-5, -4.5], [-10, -4.5], [-5, -10.5], [-10, -10.5]], "m"),

  // Diretoria: executiva — estante, sofá, plantas, o Atlas (orbe)
  { id: "tapete-dir", tipo: "tapete", pos: [0, -23], cor: "#4a3418", tam: [8, 8] },
  { id: "estante-dir", tipo: "estante", pos: [-2.4, -27.75] }, { id: "estante-dir2", tipo: "estante", pos: [2.4, -27.75] },
  { id: "sofa-dir", tipo: "sofa", pos: [-3.6, -19.4], giro: 90 },
  { id: "orbe-atlas", tipo: "orbe", pos: [3.2, -19.8] },
  { id: "neon-dir-in", tipo: "neon", pos: [0, -27.9], y: 2.7, texto: "Diretoria", cor: "#fbbf24", tam: [2.4, 0.5] },
  { id: "pl-d1", tipo: "planta_grande", pos: [-4.4, -27.4] }, { id: "pl-d2", tipo: "planta_grande", pos: [4.4, -27.4] },
  ...luminarias([[-2.5, -21], [2.5, -21], [0, -25.5]], "d"),
];

// ---------------------------------------------------------------- colisão
const FOLGA = 0.32;   // "raio" do jogador
const OCUPA: Partial<Record<TipoPeca, Vec2>> = {
  planta: [0.6, 0.6], planta_grande: [0.8, 0.8], estante: [1.8, 0.5], tripe_camera: [0.8, 0.8], softbox: [0.7, 0.7],
  fundo_verde: [3.2, 0.5], sofa: [2.2, 1], banco: [1.4, 0.5], orbe: [1.6, 1.6],
};
type Ret = [number, number, number, number];
const girado = (w: number, d: number, giro: number): Vec2 => (((giro % 180) + 180) % 180 === 90 ? [d, w] : [w, d]);
/** Desloca (dx, dz) do sistema da peça para o mundo, pelo giro. */
export function noMundo(dx: number, dz: number, giroGraus: number): Vec2 {
  const g = (giroGraus * Math.PI) / 180;
  return [dx * Math.cos(g) + dz * Math.sin(g), -dx * Math.sin(g) + dz * Math.cos(g)];
}

export const OBSTACULOS: Ret[] = [
  ...PECAS.flatMap((p) => {
    const t = OCUPA[p.tipo];
    if (!t) return [];
    const [w, d] = girado(t[0], t[1], p.giro ?? 0);
    return [[p.pos[0] - w / 2, p.pos[1] - d / 2, p.pos[0] + w / 2, p.pos[1] + d / 2] as Ret];
  }),
  // Estação: a mesa e a cadeira (a cadeira fica 0,78 m atrás, no lado de quem senta).
  ...ESTACOES.map((e) => {
    const [w, d] = girado(e.tipo === "executiva" ? 2.1 : 1.8, 2.4, e.giro);
    const [ox, oz] = noMundo(0, 0.45, e.giro);
    return [e.pos[0] + ox - w / 2, e.pos[1] + oz - d / 2, e.pos[0] + ox + w / 2, e.pos[1] + oz + d / 2] as Ret;
  }),
];

export function podeEstar(x: number, z: number, portasAbertas: Set<string>): boolean {
  const dentro = (r: Ret, f: number) => x > r[0] + f && x < r[2] - f && z > r[1] + f && z < r[3] - f;
  const noPiso = SALAS.some((s) => dentro(s.rect, FOLGA)) || PORTAS.some((p) => portasAbertas.has(p.id) && dentro(p.vao, 0.02));
  if (!noPiso) return false;
  return !OBSTACULOS.some((o) => x > o[0] - FOLGA && x < o[2] + FOLGA && z > o[1] - FOLGA && z < o[3] + FOLGA);
}

/** Lugar de quem senta numa estação (na cadeira, olhando para a mesa). */
export function assentoDa(e: Estacao): { x: number; z: number; giroRad: number } {
  const [dx, dz] = noMundo(0, 0.78, e.giro);
  return { x: e.pos[0] + dx, z: e.pos[1] + dz, giroRad: (e.giro * Math.PI) / 180 };
}

export const INICIO = { x: 0, z: -0.9, olhando: 0 };
