import { S, type Celula, type Estacao, type Movel, type Parede, type Piso, type Pose, type Recorte, type TipoEstacao } from "./mapa";

// Cena fixa do escritório, copiada da imagem de referência do Davi (24/10): a imagem é a especificação.
// Grade de 30 × 27 tiles (cerca de 24 px da imagem por tile), com o boneco no mesmo tamanho relativo às salas:
//
//   x:  0 ─ 9      10   11 ─ 18          19   20 ─ 29
//   y 0 ┌ Diretoria ┬ Nosso Resultado ┬ Copa ┐        (paredes nas linhas 0–1; painel do resultado em 0–4)
//   y 8 ├ Marketing ┼ Área Colaborativa ┼ Audiovisual ┤ (paredes nas linhas 8–9)
//   y16 ├ Lab. Viral ┼ corredor 11–15 ┼ Sucesso 17–22 ┼ Sales 24–29 ┤ (paredes nas linhas 16–17)
//   y24 └ jardim ─── Entrada (fim do corredor) ─── jardim ┘

export const LARGURA = 30;
export const ALTURA = 27;

export type SalaRef = "diretoria" | "marketing" | "audiovisual" | "lab" | "sucesso" | "sales";

/** Em qual sala da cena fica cada setor real (pelo nome); setor sem sala trabalha na Área Colaborativa. */
export function salaDoSetor(nome: string): SalaRef | null {
  if (/diretoria|dire[cç]|ceo/i.test(nome)) return "diretoria";
  if (/audiovisual|v[ií]deo|edi[cç]|est[uú]dio/i.test(nome)) return "audiovisual";
  if (/lab|viral/i.test(nome)) return "lab";
  if (/sucesso|cliente|suporte|atendimento|\bcs\b/i.test(nome)) return "sucesso";
  if (/venda|sales|comercial/i.test(nome)) return "sales";
  if (/marketing|mkt|conte[uú]do|tr[aá]fego|copy/i.test(nome)) return "marketing";
  return null;
}

/** Área de cada sala na grade (tiles; ver o desenho no topo) — para aproximar a câmera ao clicar nela (29/10). */
export type AreaRef = SalaRef | "colab" | "copa";
export const AREAS: Record<AreaRef, { x: number; y: number; w: number; h: number; nome: string }> = {
  diretoria: { x: 0, y: 0, w: 10, h: 8, nome: "Diretoria" },
  copa: { x: 20, y: 0, w: 10, h: 8, nome: "Copa" },
  marketing: { x: 0, y: 8, w: 10, h: 8, nome: "Marketing" },
  colab: { x: 10, y: 8, w: 10, h: 8, nome: "Área Colaborativa" },
  audiovisual: { x: 20, y: 8, w: 10, h: 8, nome: "Audiovisual" },
  lab: { x: 0, y: 16, w: 11, h: 8, nome: "Laboratório de Viral" },
  sucesso: { x: 16, y: 16, w: 7, h: 8, nome: "Sucesso do Cliente" },
  sales: { x: 23, y: 16, w: 7, h: 8, nome: "Sales" },
};
export function areaEm(x: number, y: number): AreaRef | null {
  for (const [ref, a] of Object.entries(AREAS) as [AreaRef, (typeof AREAS)[AreaRef]][]) {
    if (x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h) return ref;
  }
  return null;
}

/** Desenhos feitos à mão (o pack gratuito não tem): quadros, monitores, objetos de mesa, luminárias, câmera… */
export type TipoDecor =
  | "quadro-ideias" | "quadro-viral" | "quadro-vendas" | "quadro-parede" | "monitor" | "monitor-costas" | "notebook"
  | "papeis" | "cafe" | "plantinha" | "tripe" | "green-screen" | "bebedouro" | "atlas" | "cadeira-exec"
  | "cafeteira" | "pia" | "utensilios" | "tapete-entrada" | "jardim" | "sebe" | "beiral";
export interface Decor {
  tipo: TipoDecor;
  x: number; y: number; w: number; h: number;
  /** variação de cor/conteúdo */
  v?: number;
  /** "parede" (atrás de todos), "chao" (no piso) ou a linha (em tiles) usada para ordenar com as pessoas */
  z?: "parede" | "chao" | number;
  bloqueia?: [number, number, number, number];
}
export interface Luz { x: number; y: number; raio: number; forca?: number }
export interface Placa { texto: string; x: number; y: number; cor: string }

export interface Planta {
  largura: number;
  altura: number;
  grade: Celula[][];
  andavel: boolean[][];
  moveis: Movel[];
  decor: Decor[];
  luzes: Luz[];
  estacoes: Estacao[];
  placas: Placa[];
  tela: { x: number; y: number; w: number; h: number };
  chegada: { x: number; y: number };
  inicioJogador: { x: number; y: number };
}

export function montarCena(): Planta {
  const grade: Celula[][] = Array.from({ length: ALTURA }, () => Array<Celula>(LARGURA).fill(null));
  const moveis: Movel[] = [];
  const decor: Decor[] = [];
  const luzes: Luz[] = [];
  const estacoes: Estacao[] = [];
  const placas: Placa[] = [];

  const chao = (x0: number, x1: number, y0: number, y1: number, piso: Piso) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) grade[y][x] = { piso };
  };
  const parede = (x0: number, x1: number, y: number, tipo: Parede) => {
    for (let x = x0; x <= x1; x++) for (const linha of [0, 1] as const) {
      grade[y + linha][x] = { parede: tipo, linha, ponta: x === x0 ? "e" : x === x1 ? "d" : "m" };
    }
  };
  const m = (r: Recorte, x: number, y: number, extra: Partial<Movel> = {}) => moveis.push({ r, x, y, ...extra });
  const d = (tipo: TipoDecor, x: number, y: number, w: number, h: number, extra: Partial<Decor> = {}) => decor.push({ tipo, x, y, w, h, ...extra });
  const luz = (x: number, y: number, raio = 2.6, forca = 1) => luzes.push({ x, y, raio, forca });
  const est = (id: string, tipo: TipoEstacao, x: number, y: number, pose: Pose, sala?: SalaRef) => estacoes.push({ id, tipo, x, y, pose, setorId: sala });
  const placa = (texto: string, x: number, y: number, cor: string) => placas.push({ texto, x, y, cor });
  // Mesa comprida feita de pedaços (tampo + pés), de x0 a x1 na linha y.
  const mesa = (x0: number, x1: number, y: number, escura = false) => {
    for (let x = x0; x <= x1; x++) m(escura ? S.mesaSegEscura : S.mesaSeg, x, y, { bloqueia: [0, 0, 1, 1] });
  };
  // Mesa de 2 tiles de tampo (para gente dos dois lados).
  const mesaGrande = (x0: number, x1: number, y: number) => {
    for (let x = x0; x <= x1; x++) { m(S.mesaSegTopo, x, y, { bloqueia: [0, 0, 1, 1] }); m(S.mesaSeg, x, y + 1, { bloqueia: [0, 0, 1, 1] }); }
  };

  // ── Arquitetura ──────────────────────────────────────────────────────────
  // Fileira de cima
  parede(0, 9, 0, "madeiraEscura"); chao(0, 9, 2, 7, "espinha"); // Diretoria
  parede(11, 18, 3, "madeiraEscura"); chao(11, 18, 5, 7, "carpete"); // passagem do Nosso Resultado
  parede(20, 29, 0, "bege"); chao(20, 29, 2, 7, "madeira"); // Copa
  chao(10, 10, 5, 6, "espinha"); chao(19, 19, 5, 6, "madeira");
  // Fileira do meio
  parede(0, 9, 8, "madeira"); chao(0, 9, 10, 15, "madeira"); // Marketing
  parede(11, 18, 8, "bege"); chao(11, 18, 10, 15, "madeira"); // Área Colaborativa
  chao(17, 18, 8, 9, "madeira"); // porta para a passagem do Resultado
  parede(20, 29, 8, "cinza"); chao(20, 29, 10, 15, "madeiraEscura"); // Audiovisual
  chao(10, 10, 10, 11, "madeira"); chao(19, 19, 10, 11, "madeira");
  // Fileira de baixo
  parede(0, 9, 16, "madeira"); chao(0, 9, 18, 23, "madeiraEscura"); // Laboratório de Viral
  chao(11, 15, 16, 25, "carpete"); // corredor central até a entrada
  parede(17, 22, 16, "bege"); chao(17, 22, 18, 23, "espinha"); // Sucesso do Cliente
  parede(24, 29, 16, "madeira"); chao(24, 29, 18, 23, "madeira"); // Sales
  chao(10, 10, 20, 21, "madeiraEscura"); chao(16, 16, 20, 21, "espinha"); chao(23, 23, 20, 21, "madeira");
  chao(12, 14, 26, 26, "carpete"); // soleira da entrada

  // ── Diretoria ────────────────────────────────────────────────────────────
  placa("👑 Diretoria", 4.6, 0.15, "#f59e0b");
  m(S.estanteLivros, 0, 2, { bloqueia: [0, 0, 2, 2] });
  m(S.estanteLivros2, 0, 4, { bloqueia: [0, 0, 2, 2] });
  m(S.janela, 6, 0, { parede: true });
  m(S.quadroB, 2.6, 0.45, { parede: true }); m(S.quadroA, 8.4, 0.45, { parede: true });
  m(S.tapete, 3, 3, { chao: true });
  d("cadeira-exec", 4.55, 2.55, 0.9, 1.3, { z: 4 });
  mesa(3, 6, 4, true);
  d("monitor-costas", 3.25, 3.55, 1.2, 0.85, { z: 6.05 });
  d("papeis", 4.7, 4.05, 0.9, 0.5, { z: 6.05 });
  d("cafe", 6.2, 4.05, 0.35, 0.4, { z: 6.05 });
  est("dir-0", "mesa", 5, 4, "em-pe-baixo", "diretoria");
  d("atlas", 7.15, 3.1, 0.95, 1.4, { z: 5, bloqueia: [0, 1, 1, 1] });
  m(S.luminaria, 2, 1, { bloqueia: [0, 2, 1, 1] }); luz(2.5, 2, 2.8, 1.1);
  m(S.luminaria, 9, 1, { bloqueia: [0, 2, 1, 1] }); luz(9.5, 2, 2.8, 1.1);
  m(S.sofaMarrom, 0, 6, { bloqueia: [0, 0, 3, 1] });
  for (let k = 0; k < 3; k++) est(`dir-sofa-${k}`, "sofa", k, 7, "sofa");
  m(S.plantaPequena, 3, 6, { bloqueia: [0, 1, 1, 1] });
  m(S.poltrona, 7, 6, { bloqueia: [0, 0, 1, 1] });
  est("dir-1", "mesa", 7, 7, "sofa", "diretoria");
  m(S.plantaPequena, 8, 6, { bloqueia: [0, 1, 1, 1] });
  luz(5, 5.5, 3.2, 0.8);

  // ── Nosso Resultado (placar na parede) e a passagem embaixo dele ────────────
  m(S.plantaPequena, 11, 5, { bloqueia: [0, 1, 1, 1] }); m(S.plantaPequena, 18, 5, { bloqueia: [0, 1, 1, 1] });
  luz(11.5, 5, 2, 1); luz(18.5, 5, 2, 1);
  est("res-0", "espera", 13, 6, "em-pe-cima"); est("res-1", "espera", 15, 6, "em-pe-cima"); est("res-2", "espera", 16, 7, "em-pe-cima");

  // ── Copa ─────────────────────────────────────────────────────────────────
  placa("☕ Copa", 25.2, 0.15, "#34d399");
  m(S.armarioCozinha, 20, 1, { bloqueia: [0, 1, 4, 1] });
  d("cafeteira", 20.35, 1.05, 0.7, 0.85, { z: 3.05 });
  d("pia", 21.4, 1.35, 1.1, 0.5, { z: 3.05 });
  d("utensilios", 22.75, 1.15, 0.9, 0.7, { z: 3.05 });
  m(S.geladeira, 24, 1, { bloqueia: [0, 1, 1, 1] });
  m(S.prateleiraB, 26.5, 0, { parede: true });
  m(S.prateleiraA, 28, 2, { bloqueia: [0, 1, 2, 1] });
  mesaGrande(22, 26, 4);
  d("cafe", 22.3, 4.25, 0.35, 0.4, { z: 6.05 }); d("papeis", 23.3, 4.4, 0.8, 0.5, { z: 6.05 });
  d("plantinha", 24.3, 3.95, 0.5, 0.7, { z: 6.05 }); d("cafe", 25.5, 4.6, 0.35, 0.4, { z: 6.05 }); d("cafe", 26.3, 4.15, 0.35, 0.4, { z: 6.05 });
  m(S.cadeiraDir, 21, 3); m(S.cadeiraEsq, 27, 3);
  est("copa-0", "copa", 21, 4, "sentado-dir"); est("copa-1", "copa", 27, 4, "sentado-esq");
  est("copa-2", "copa", 23, 3, "em-pe-baixo"); est("copa-3", "copa", 25, 3, "em-pe-baixo");
  est("copa-4", "copa", 23, 6, "em-pe-cima"); est("copa-5", "copa", 25, 6, "em-pe-cima");
  m(S.palmeira, 28, 5, { bloqueia: [0, 2, 2, 1] });
  m(S.plantaPequena, 20, 6, { bloqueia: [0, 1, 1, 1] });
  luz(21.5, 2.2, 2.4, 1); luz(26, 2.2, 2.4, 1); luz(24.5, 5, 3, 0.8);

  // ── Marketing ────────────────────────────────────────────────────────────
  placa("📊 Marketing", 3.6, 8.1, "#a78bfa");
  d("quadro-ideias", 0.6, 8.75, 6.2, 1.15, { z: "parede", v: 0 });
  m(S.prateleiraC, 7.4, 8, { parede: true });
  [S.mesaPc1, S.mesaPc2, S.mesaPc3].forEach((r, k) => {
    m(r, 1 + k * 3, 11, { bloqueia: [0, 0, 2, 2] });
    d("monitor", 1.15 + k * 3, 10.75, 0.75, 0.6, { z: 12.5, v: k });
    est(`mkt-${k}`, "mesa", 2 + k * 3, 13, "em-pe-cima", "marketing");
  });
  m(S.tapeteBege, 2, 14, { chao: true });
  m(S.plantaPequena, 0, 14, { bloqueia: [0, 1, 1, 1] });
  d("bebedouro", 9.1, 13.2, 0.8, 1.7, { z: 15, bloqueia: [0, 1, 1, 1] });
  est("mkt-3", "mesa", 8, 14, "em-pe-baixo", "marketing");
  est("mkt-4", "mesa", 5, 15, "em-pe-cima", "marketing");
  luz(1.5, 10.6, 2.2); luz(5, 10.6, 2.2); luz(8.5, 10.6, 2.2);

  // ── Área Colaborativa ────────────────────────────────────────────────────
  placa("💡 Área Colaborativa", 14, 8.1, "#fbbf24");
  d("quadro-ideias", 11.6, 8.75, 5.1, 1.15, { z: "parede", v: 1 });
  mesaGrande(13, 16, 11);
  d("notebook", 13.25, 11.2, 0.75, 0.55, { z: 13.05 }); d("notebook", 15.55, 11.35, 0.75, 0.55, { z: 13.05, v: 1 });
  d("papeis", 14.2, 11.75, 0.9, 0.5, { z: 13.05 }); d("plantinha", 14.85, 11, 0.5, 0.7, { z: 13.05 });
  d("cafe", 16.3, 12.1, 0.35, 0.4, { z: 13.05 }); d("cafe", 13.1, 12.3, 0.35, 0.4, { z: 13.05 });
  m(S.cadeiraDir, 12, 11); m(S.cadeiraEsq, 17, 11);
  est("colab-0", "reuniao", 12, 12, "sentado-dir"); est("colab-1", "reuniao", 17, 12, "sentado-esq");
  est("colab-2", "reuniao", 14, 10, "em-pe-baixo"); est("colab-3", "reuniao", 15, 10, "em-pe-baixo");
  est("colab-4", "reuniao", 14, 14, "em-pe-cima"); est("colab-5", "reuniao", 15, 14, "em-pe-cima");
  m(S.plantaGrande, 11, 13, { bloqueia: [0, 2, 1, 1] });
  m(S.plantaGrande, 17, 13, { bloqueia: [1, 2, 1, 1] });
  luz(12, 10.4, 2.2); luz(17.5, 10.4, 2.2); luz(14.8, 12, 3, 0.9);

  // ── Audiovisual ──────────────────────────────────────────────────────────
  placa("📹 Audiovisual", 24.6, 8.1, "#38bdf8");
  d("quadro-parede", 20.6, 8.8, 1, 0.8, { z: "parede", v: 2 });
  m(S.janela2, 22.4, 8, { parede: true });
  d("quadro-parede", 26.3, 8.8, 1.1, 0.8, { z: "parede", v: 3 });
  d("green-screen", 28.25, 9.3, 1.7, 4.4, { z: 13.7, bloqueia: [1, 1, 1, 3] });
  mesa(21, 23, 11, true);
  d("monitor", 21.05, 10.6, 0.8, 0.65, { z: 13.05, v: 0 }); d("monitor", 21.9, 10.5, 0.9, 0.72, { z: 13.05, v: 1 }); d("monitor", 22.85, 10.6, 0.8, 0.65, { z: 13.05, v: 2 });
  mesa(25, 27, 11, true);
  d("monitor", 25.05, 10.6, 0.8, 0.65, { z: 13.05, v: 3 }); d("monitor", 25.9, 10.5, 0.9, 0.72, { z: 13.05, v: 0 }); d("monitor", 26.85, 10.6, 0.8, 0.65, { z: 13.05, v: 1 });
  d("tripe", 24, 9.6, 1, 2.3, { z: 12, bloqueia: [0, 1, 1, 1] });
  est("av-0", "mesa", 22, 13, "em-pe-cima", "audiovisual");
  est("av-1", "mesa", 26, 13, "em-pe-cima", "audiovisual");
  est("av-2", "mesa", 28, 14, "em-pe-baixo", "audiovisual");
  est("av-3", "mesa", 24, 14, "em-pe-cima", "audiovisual");
  m(S.luzAzul, 20, 12, { bloqueia: [0, 2, 1, 1] });
  m(S.luzVermelha, 27, 12.6, { bloqueia: [0, 2, 1, 1] });
  m(S.plantaPequena, 20, 14, { bloqueia: [0, 1, 1, 1] }); m(S.plantaPequena, 29, 14, { bloqueia: [0, 1, 1, 1] });
  luz(22, 11, 2.4, 1); luz(26, 11, 2.4, 1); luz(29, 11.5, 2.2, 0.6);

  // ── Laboratório de Viral ─────────────────────────────────────────────────
  placa("🧪 Laboratório de Viral", 4.6, 16.1, "#f43f5e");
  d("quadro-viral", 1.9, 16.75, 5.6, 1.15, { z: "parede" });
  m(S.estanteLivros, 0, 18, { bloqueia: [0, 0, 2, 2] });
  m(S.estanteLivros2, 0, 20, { bloqueia: [0, 0, 2, 2] });
  m(S.prateleiraC, 8, 18, { bloqueia: [0, 1, 2, 1] });
  m(S.mesaPc1, 3, 19, { bloqueia: [0, 0, 2, 2] }); d("monitor", 3.1, 18.8, 0.75, 0.6, { z: 20.5, v: 2 });
  m(S.mesaPc3, 6, 19, { bloqueia: [0, 0, 2, 2] }); d("monitor", 6.1, 18.8, 0.75, 0.6, { z: 20.5, v: 0 });
  est("lab-0", "mesa", 4, 21, "em-pe-cima", "lab");
  est("lab-1", "mesa", 7, 21, "em-pe-cima", "lab");
  est("lab-2", "mesa", 2, 22, "em-pe-cima", "lab");
  m(S.tapeteVermelhoPeq, 4, 22, { chao: true });
  m(S.plantaPequena, 0, 22, { bloqueia: [0, 1, 1, 1] });
  m(S.plantaGrande, 8, 21, { bloqueia: [0, 2, 2, 1] });
  luz(3.5, 18.6, 2.2); luz(6.5, 18.6, 2.2); luz(8.7, 19, 2, 0.7);

  // ── Corredor central e Entrada ───────────────────────────────────────────
  m(S.luminaria, 11, 17, { bloqueia: [0, 2, 1, 1] }); m(S.luminaria, 15, 17, { bloqueia: [0, 2, 1, 1] });
  luz(11.5, 18, 2.4, 1); luz(15.5, 18, 2.4, 1);
  m(S.plantaPequena, 11, 22, { bloqueia: [0, 1, 1, 1] }); m(S.plantaPequena, 15, 22, { bloqueia: [0, 1, 1, 1] });
  est("cor-0", "espera", 12, 19, "em-pe-baixo"); est("cor-1", "espera", 14, 19, "em-pe-baixo");
  d("tapete-entrada", 12.1, 23.4, 2.8, 3.6, { z: "chao" });
  m(S.plantaPequena, 11, 24, { bloqueia: [0, 1, 1, 1] }); m(S.plantaPequena, 15, 24, { bloqueia: [0, 1, 1, 1] });
  luz(11.6, 24.4, 2.2, 1.1); luz(15.4, 24.4, 2.2, 1.1);

  // ── Sucesso do Cliente ───────────────────────────────────────────────────
  placa("👥 Sucesso do Cliente", 19.9, 16.1, "#34d399");
  d("quadro-parede", 17.3, 16.85, 1, 0.8, { z: "parede", v: 0 }); d("quadro-parede", 21.4, 16.85, 1, 0.8, { z: "parede", v: 1 });
  m(S.tapete, 17, 20, { chao: true });
  m(S.sofaVermelho, 17, 19, { bloqueia: [0, 0, 2, 1] });
  m(S.poltrona, 21, 19, { bloqueia: [0, 0, 1, 1] });
  m(S.mesinha, 18, 21, { bloqueia: [0, 0, 3, 2] });
  d("notebook", 18.5, 21.15, 0.75, 0.55, { z: 23.05, v: 2 }); d("cafe", 19.8, 21.3, 0.35, 0.4, { z: 23.05 }); d("papeis", 20.3, 21.6, 0.7, 0.45, { z: 23.05 });
  est("cs-0", "mesa", 17, 20, "sofa", "sucesso"); est("cs-1", "mesa", 18, 20, "sofa", "sucesso");
  est("cs-2", "mesa", 21, 20, "sofa", "sucesso"); est("cs-3", "mesa", 21, 22, "em-pe-cima", "sucesso");
  m(S.abajur, 22, 18, { bloqueia: [0, 1, 1, 1] });
  m(S.plantaPequena, 17, 22, { bloqueia: [0, 1, 1, 1] }); m(S.plantaPequena, 22, 22, { bloqueia: [0, 1, 1, 1] });
  luz(22.5, 18.6, 2.6, 1.2); luz(19.5, 21, 3, 0.8);

  // ── Sales ────────────────────────────────────────────────────────────────
  placa("📈 Sales", 26.9, 16.1, "#fbbf24");
  d("quadro-vendas", 24.5, 16.75, 3.4, 1.15, { z: "parede" });
  m(S.mesaPc2, 24, 19, { bloqueia: [0, 0, 2, 2] }); d("monitor", 24.1, 18.8, 0.75, 0.6, { z: 20.5, v: 1 });
  m(S.mesaPc3, 26, 19, { bloqueia: [0, 0, 2, 2] }); d("monitor", 26.1, 18.8, 0.75, 0.6, { z: 20.5, v: 3 });
  est("sales-0", "mesa", 25, 21, "em-pe-cima", "sales"); est("sales-1", "mesa", 27, 21, "em-pe-cima", "sales");
  est("sales-2", "mesa", 26, 23, "em-pe-cima", "sales");
  m(S.prateleiraA, 28, 18, { bloqueia: [0, 1, 2, 1] });
  m(S.tapeteAzulPeq, 24, 22, { chao: true });
  m(S.plantaGrande, 28, 21, { bloqueia: [0, 2, 2, 1] });
  luz(25, 18.6, 2.2); luz(27, 18.6, 2.2);

  // ── Jardim de fora (dos dois lados da entrada) ──────────────────────────
  d("jardim", 0, 24, 11, 3, { z: "chao" }); d("jardim", 16, 24, 14, 3, { z: "chao" });
  d("beiral", 0, 23.85, 11, 0.3, { z: "chao" }); d("beiral", 16, 23.85, 14, 0.3, { z: "chao" });
  d("sebe", 0, 24.1, 11, 0.9, { z: 25 }); d("sebe", 16, 24.1, 14, 0.9, { z: 25 });
  const arbustos: [Recorte, number][] = [[S.plantaGrande, 0.2], [S.palmeira, 2.3], [S.plantaGrande, 4.6], [S.palmeira, 6.8], [S.plantaGrande, 8.9],
    [S.plantaGrande, 16.3], [S.palmeira, 18.5], [S.plantaGrande, 20.8], [S.palmeira, 23], [S.plantaGrande, 25.2], [S.palmeira, 27.6]];
  for (const [r, x] of arbustos) m(r, x, 24);
  luz(10.5, 25.5, 1.8, 0.7); luz(16.5, 25.5, 1.8, 0.7);

  // Onde dá para andar: chão sem móvel nem desenho que bloqueia.
  const andavel = grade.map((linha) => linha.map((c) => !!c && "piso" in c));
  const bloquear = (x0: number, y0: number, b?: [number, number, number, number]) => {
    if (!b) return;
    const [dx, dy, w, h] = b;
    const bx = Math.floor(x0) + dx, by = Math.floor(y0) + dy;
    for (let x = bx; x < bx + w; x++) for (let y = by; y < by + h; y++) if (andavel[y]?.[x] != null) andavel[y][x] = false;
  };
  for (const mv of moveis) bloquear(mv.x, mv.y, mv.bloqueia);
  for (const dc of decor) bloquear(dc.x, dc.y, dc.bloqueia);

  return {
    largura: LARGURA, altura: ALTURA, grade, andavel, moveis, decor, luzes, estacoes, placas,
    tela: { x: 11.15, y: 0.25, w: 7.7, h: 4.5 },
    chegada: { x: 13, y: 25 },
    inicioJogador: { x: 13, y: 21 },
  };
}
