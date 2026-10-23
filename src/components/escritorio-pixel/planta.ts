import { PAREDES, PISOS, S, type Celula, type Estacao, type Movel, type Parede, type Piso, type Pose, type Recorte, type TipoEstacao } from "./mapa";

// Planta do escritório: grade de espaços (o Davi escolhe quantas colunas e fileiras no modo edição),
// corredores entre as fileiras e a Entrada embaixo, no centro. Em cada espaço vai um setor, uma sala comum
// ou nada (vira passagem).

export const LIMITES = { colunas: [1, 4], fileiras: [1, 3] } as const;
const W = 12; // largura do chão de cada sala (tiles)
const H = 7; // altura do chão de cada sala
const PASSO_X = W + 1; // 1 coluna de divisória entre salas
const PASSO_Y = 2 + H + 2 + 3; // parede + chão + parede do corredor + corredor
const X0 = 2;

export type SalaComum = "colaborativa" | "copa" | "resultado";
export type Conteudo = { tipo: "setor"; setorId: string } | { tipo: SalaComum } | { tipo: "vazio" };
export interface Espaco { conteudo: Conteudo; piso?: Piso; parede?: Parede }
export interface Arrumacao { colunas: number; fileiras: number; espacos: Espaco[] }

export interface SetorPixel { id: string; nome: string; cor: string; pessoas: number }

export const SALAS_COMUNS: Record<SalaComum, string> = {
  colaborativa: "Área Colaborativa", copa: "Copa", resultado: "Nosso Resultado",
};

export interface EspacoNaPlanta { indice: number; x0: number; y0: number; x1: number; y1: number; nome: string; cor: string }
export interface Placa { texto: string; x: number; y: number; cor: string }

export interface Planta {
  largura: number;
  altura: number;
  grade: Celula[][];
  andavel: boolean[][];
  moveis: Movel[];
  estacoes: Estacao[];
  placas: Placa[];
  tela: { x: number; y: number; w: number; h: number } | null;
  chegada: { x: number; y: number };
  espacos: EspacoNaPlanta[];
}

// Estilo de cada tipo de sala (o Davi pode trocar piso e parede de cada espaço).
function estiloPadrao(c: Conteudo, setores: SetorPixel[]): { piso: Piso; parede: Parede } {
  if (c.tipo === "colaborativa") return { piso: "madeira", parede: "bege" };
  if (c.tipo === "copa") return { piso: "azulejo", parede: "menta" };
  if (c.tipo === "resultado") return { piso: "madeiraEscura", parede: "cinza" };
  if (c.tipo === "vazio") return { piso: "ladrilho", parede: "madeira" };
  const setorId = c.tipo === "setor" ? c.setorId : ""; const nome = setores.find((s) => s.id === setorId)?.nome ?? "";
  if (/audiovisual|v[ií]deo|edi[cç]|est[uú]dio/i.test(nome)) return { piso: "carpete", parede: "cinza" };
  if (/marketing|mkt|conte[uú]do|tr[aá]fego/i.test(nome)) return { piso: "madeira", parede: "amarela" };
  if (/diretoria|dire[cç]/i.test(nome)) return { piso: "madeiraEscura", parede: "madeiraEscura" };
  if (/venda|sales|comercial/i.test(nome)) return { piso: "azulejo", parede: "menta" };
  if (/sucesso|cliente|suporte|cs\b/i.test(nome)) return { piso: "espinha", parede: "bege" };
  if (/lab|viral/i.test(nome)) return { piso: "tijolo", parede: "vermelha" };
  return { piso: "madeira", parede: "bege" };
}
export const estiloDoEspaco = (e: Espaco, setores: SetorPixel[]) => {
  const p = estiloPadrao(e.conteudo, setores);
  return { piso: e.piso && e.piso in PISOS ? e.piso : p.piso, parede: e.parede && e.parede in PAREDES ? e.parede : p.parede };
};

/** Arrumação inicial: o layout do pedido (Diretoria – Resultado – Copa / Marketing – Colaborativa – Audiovisual / Lab – Sucesso – Sales). */
export function arrumacaoPadrao(setores: SetorPixel[]): Arrumacao {
  const espacos: Espaco[] = Array.from({ length: 9 }, () => ({ conteudo: { tipo: "vazio" } }));
  espacos[1] = { conteudo: { tipo: "resultado" } };
  espacos[2] = { conteudo: { tipo: "copa" } };
  espacos[4] = { conteudo: { tipo: "colaborativa" } };
  const preferido: [RegExp, number][] = [
    [/diretoria|dire[cç]/i, 0], [/marketing|mkt|conte[uú]do/i, 3], [/audiovisual|v[ií]deo|edi[cç]/i, 5],
    [/lab|viral/i, 6], [/sucesso|cliente|suporte/i, 7], [/venda|sales|comercial/i, 8],
  ];
  const sobra: SetorPixel[] = [];
  for (const s of setores) {
    const i = preferido.find(([re, k]) => re.test(s.nome) && espacos[k].conteudo.tipo === "vazio")?.[1];
    if (i != null) espacos[i] = { conteudo: { tipo: "setor", setorId: s.id } };
    else sobra.push(s);
  }
  for (const s of sobra) {
    const i = [3, 5, 0, 6, 8, 7, 2, 1].find((k) => espacos[k].conteudo.tipo === "vazio");
    if (i == null) break;
    espacos[i] = { conteudo: { tipo: "setor", setorId: s.id } };
  }
  return { colunas: 3, fileiras: 3, espacos };
}

/**
 * Muda o tamanho do escritório. Cada sala fica no mesmo lugar quando ele ainda existe; as que caem fora
 * do corte vão para os espaços vazios (e, sem espaço, saem do mapa).
 */
export function redimensionar(a: Arrumacao, colunas: number, fileiras: number): Arrumacao {
  const espacos: Espaco[] = Array.from({ length: colunas * fileiras }, () => ({ conteudo: { tipo: "vazio" } }));
  const sobra: Espaco[] = [];
  a.espacos.forEach((e, i) => {
    const col = i % a.colunas, fil = Math.floor(i / a.colunas);
    if (col < colunas && fil < fileiras) espacos[fil * colunas + col] = e;
    else if (e.conteudo.tipo !== "vazio") sobra.push(e);
  });
  for (const e of sobra) {
    const livre = espacos.findIndex((x) => x.conteudo.tipo === "vazio");
    if (livre < 0) break;
    espacos[livre] = e;
  }
  return { colunas, fileiras, espacos };
}

/** Confere uma arrumação salva: tamanho dentro dos limites, setores que ainda existem, cada setor uma vez só. */
export function arrumacaoValida(salva: unknown, setores: SetorPixel[]): Arrumacao | null {
  // A primeira versão salvava só a lista dos 9 espaços (3 × 3).
  const obj = (Array.isArray(salva) ? { colunas: 3, fileiras: 3, espacos: salva } : salva) as Partial<Arrumacao> | null;
  const { colunas, fileiras, espacos } = obj ?? {};
  if (!Number.isInteger(colunas) || !Number.isInteger(fileiras) || !Array.isArray(espacos)) return null;
  if (colunas! < LIMITES.colunas[0] || colunas! > LIMITES.colunas[1] || fileiras! < LIMITES.fileiras[0] || fileiras! > LIMITES.fileiras[1]) return null;
  if (espacos.length !== colunas! * fileiras!) return null;
  const vistos = new Set<string>();
  const lista = espacos.map((e: Espaco) => {
    const c = e?.conteudo;
    const ok = c && (c.tipo === "vazio" || c.tipo in SALAS_COMUNS || (c.tipo === "setor" && setores.some((s) => s.id === c.setorId) && !vistos.has(c.setorId)));
    if (c?.tipo === "setor" && ok) vistos.add(c.setorId);
    return ok ? { conteudo: c, piso: e.piso, parede: e.parede } : { conteudo: { tipo: "vazio" } } as Espaco;
  });
  return { colunas: colunas!, fileiras: fileiras!, espacos: lista };
}

export function nomeDoConteudo(c: Conteudo, setores: SetorPixel[]) {
  if (c.tipo === "setor") return setores.find((s) => s.id === c.setorId)?.nome ?? "Setor";
  if (c.tipo === "vazio") return "Vazio";
  return SALAS_COMUNS[c.tipo];
}

export function gerarPlanta(arrumacao: Arrumacao, setores: SetorPixel[]): Planta {
  const { colunas: COLUNAS, fileiras: FILEIRAS } = arrumacao;
  const LARGURA = X0 * 2 + COLUNAS * W + (COLUNAS - 1);
  const Y_ENTRADA = 1 + FILEIRAS * PASSO_Y + 2;
  const ALTURA = Y_ENTRADA + 4 + 3;
  const grade: Celula[][] = Array.from({ length: ALTURA }, () => Array<Celula>(LARGURA).fill(null));
  const moveis: Movel[] = [];
  const estacoes: Estacao[] = [];
  const placas: Placa[] = [];
  const espacos: EspacoNaPlanta[] = [];
  let tela: Planta["tela"] = null;

  const chao = (x0: number, x1: number, y0: number, y1: number, piso: Piso) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) grade[y][x] = { piso };
  };
  const parede = (x0: number, x1: number, y: number, tipo: Parede) => {
    for (let x = x0; x <= x1; x++) for (const linha of [0, 1] as const) {
      grade[y + linha][x] = { parede: tipo, linha, ponta: x === x0 ? "e" : x === x1 ? "d" : "m" };
    }
  };
  const movel = (r: Recorte, x: number, y: number, extra: Partial<Movel> = {}) => moveis.push({ r, x, y, ...extra });
  const estacao = (id: string, tipo: TipoEstacao, x: number, y: number, pose: Pose, setorId?: string) =>
    estacoes.push({ id, tipo, x, y, pose, setorId });

  // Corredores (um embaixo de cada fileira), de ponta a ponta.
  const xFim = LARGURA - X0 - 1;
  for (let f = 0; f < FILEIRAS; f++) {
    const yc = 1 + f * PASSO_Y + 2 + H + 2;
    parede(X0, xFim, yc - 2, "madeira");
    chao(X0, xFim, yc, yc + 2, "ladrilho");
    movel(S.plantaPequena, X0, yc - 1, { bloqueia: [0, 1, 1, 1] });
    movel(S.plantaPequena, xFim, yc - 1, { bloqueia: [0, 1, 1, 1] });
    [S.quadroA, S.quadroB, S.quadroC, S.quadroA].slice(0, COLUNAS).forEach((q, k) => movel(q, X0 + 2 + k * 13, yc - 2, { parede: true }));
  }

  for (let i = 0; i < COLUNAS * FILEIRAS; i++) {
    const e: Espaco = arrumacao.espacos[i] ?? { conteudo: { tipo: "vazio" } };
    const col = i % COLUNAS, fil = Math.floor(i / COLUNAS);
    const x0 = X0 + col * PASSO_X, y0 = 1 + fil * PASSO_Y + 2;
    const x1 = x0 + W - 1, y1 = y0 + H - 1;
    const { piso, parede: tipoParede } = estiloDoEspaco(e, setores);
    const c = e.conteudo;
    const setor = c.tipo === "setor" ? setores.find((s) => s.id === c.setorId) : undefined;
    const nome = nomeDoConteudo(c, setores);
    const cor = setor?.cor ?? (c.tipo === "colaborativa" ? "#f59e0b" : c.tipo === "copa" ? "#34d399" : c.tipo === "resultado" ? "#fbbf24" : "#a3a3a3");
    espacos.push({ indice: i, x0, y0: y0 - 2, x1, y1, nome, cor });

    if (c.tipo === "vazio") {
      // Espaço livre: vira passagem aberta entre os corredores (sem paredes).
      chao(x0, x1, y0 - 2, y1, piso);
      chao(x0, x1, y1 + 1, y1 + 2, piso);
      continue;
    }
    parede(x0, x1, y0 - 2, tipoParede);
    chao(x0, x1, y0, y1, piso);
    // Portas: para o corredor de baixo e, a partir da 2ª fileira, para o de cima.
    chao(x0 + 5, x0 + 6, y1 + 1, y1 + 2, piso);
    if (fil > 0) chao(x0 + 5, x0 + 6, y0 - 2, y0 - 1, piso);
    if (c.tipo !== "resultado") placas.push({ texto: nome.toUpperCase(), x: x0 + W / 2, y: y0 - 2, cor });
    const X = (dx: number) => x0 + dx, Y = (dy: number) => y0 + dy;

    if (c.tipo === "setor") {
      // Mesas conforme o número de pessoas do setor (1 a 6).
      const n = Math.max(1, Math.min(6, setor?.pessoas ?? 1));
      const lugares: [number, number][] = [[1, 1], [5, 1], [9, 1], [1, 4], [5, 4], [9, 4]];
      const mesas = [S.mesaPc1, S.mesaPc2, S.mesaPc3];
      lugares.slice(0, n).forEach(([dx, dy], k) => {
        movel(S.cadeiraDir, X(dx), Y(dy - 1));
        movel(mesas[k % 3], X(dx + 1), Y(dy), { bloqueia: [0, 0, 2, 2] });
        estacao(`mesa-${i}-${k}`, "mesa", X(dx), Y(dy), "sentado-dir", c.setorId);
      });
      movel(S.janela, X(1), Y(-2), { parede: true });
      movel(S.janela2, X(9), Y(-2), { parede: true });
      if (/audiovisual|v[ií]deo|edi[cç]|est[uú]dio/i.test(nome)) {
        movel(S.luzVermelha, X(0), Y(4), { bloqueia: [0, 2, 1, 1] });
        movel(S.estanteMetal, X(3), Y(-2), { bloqueia: [0, 2, 2, 1] });
        if (n < 6) movel(S.luzAzul, X(11), Y(4), { bloqueia: [0, 2, 1, 1] });
      } else if (/diretoria|dire[cç]/i.test(nome)) {
        movel(S.estanteLivros, X(3), Y(-1), { bloqueia: [0, 1, 2, 1] });
        if (n < 6) movel(S.palmeira, X(10), Y(4), { bloqueia: [0, 2, 2, 1] });
      } else if (/marketing|mkt|conte[uú]do/i.test(nome)) {
        movel(S.lousa, X(3), Y(-2), { parede: true });
        if (n < 6) movel(S.plantaGrande, X(10), Y(4), { bloqueia: [0, 2, 2, 1] });
      } else {
        movel(S.quadro, X(3), Y(-2), { parede: true });
        if (n < 6) movel(S.plantaPequena, X(11), Y(5), { bloqueia: [0, 1, 1, 1] });
      }
    } else if (c.tipo === "colaborativa") {
      movel(S.lousa, X(1), Y(-2), { parede: true });
      movel(S.janela, X(9), Y(-2), { parede: true });
      movel(S.mesaReuniao, X(1), Y(2), { bloqueia: [1, 0, 2, 3] });
      movel(S.cadeiraDir, X(1), Y(1)); movel(S.cadeiraDir, X(1), Y(3));
      movel(S.cadeiraEsq, X(4), Y(1)); movel(S.cadeiraEsq, X(4), Y(3));
      estacao(`reuniao-${i}-0`, "reuniao", X(1), Y(2), "sentado-dir");
      estacao(`reuniao-${i}-1`, "reuniao", X(4), Y(2), "sentado-esq");
      estacao(`reuniao-${i}-2`, "reuniao", X(1), Y(4), "sentado-dir");
      estacao(`reuniao-${i}-3`, "reuniao", X(4), Y(4), "sentado-esq");
      movel(S.sofaCinza, X(7), Y(0), { bloqueia: [0, 0, 3, 1] });
      for (let k = 0; k < 3; k++) estacao(`sofa-${i}-${k}`, "sofa", X(7 + k), Y(1), "sofa");
      movel(S.tapete, X(7), Y(2), { chao: true });
      movel(S.mesinha, X(7), Y(3), { bloqueia: [0, 0, 3, 2] });
      movel(S.plantaPequena, X(11), Y(0), { bloqueia: [0, 1, 1, 1] });
      movel(S.plantaPequena, X(0), Y(5), { bloqueia: [0, 1, 1, 1] });
      ([[6, 5], [8, 5], [10, 5], [3, 6], [11, 3], [5, 3]] as const).forEach(([dx, dy], k) =>
        estacao(`espera-${i}-${k}`, "espera", X(dx), Y(dy), "em-pe-baixo"));
    } else if (c.tipo === "copa") {
      movel(S.janela2, X(6), Y(-2), { parede: true });
      movel(S.geladeira, X(0), Y(-1), { bloqueia: [0, 1, 1, 1] });
      movel(S.armarioCozinha, X(1), Y(-1), { bloqueia: [0, 1, 4, 1] });
      estacao(`copa-${i}-0`, "copa", X(1), Y(1), "em-pe-cima");
      estacao(`copa-${i}-1`, "copa", X(3), Y(1), "em-pe-cima");
      movel(S.sofaMarrom, X(8), Y(0), { bloqueia: [0, 0, 3, 1] });
      for (let k = 0; k < 3; k++) estacao(`sofa-${i}-${k}`, "sofa", X(8 + k), Y(1), "sofa");
      movel(S.tapeteVerde, X(1), Y(4), { chao: true });
      movel(S.mesinha, X(1), Y(4), { bloqueia: [0, 0, 3, 2] });
      movel(S.banco, X(0), Y(5)); movel(S.banco, X(4), Y(5));
      estacao(`copa-${i}-2`, "copa", X(0), Y(5), "em-pe-baixo");
      estacao(`copa-${i}-3`, "copa", X(4), Y(5), "em-pe-baixo");
      movel(S.plantaGrande, X(10), Y(4), { bloqueia: [0, 2, 2, 1] });
    } else if (c.tipo === "resultado") {
      tela = { x: x0 + 1.5, y: y0 - 1.8, w: 9, h: 3.2 };
      for (const dy of [3, 5]) for (const dx of [2, 4, 7, 9]) {
        movel(dy === 3 ? S.banco : S.bancoEscuro, X(dx), Y(dy));
        estacao(`espera-${i}-${dx}-${dy}`, "espera", X(dx), Y(dy), "em-pe-cima");
      }
      movel(S.plantaPequena, X(0), Y(0), { bloqueia: [0, 1, 1, 1] });
      movel(S.plantaPequena, X(11), Y(0), { bloqueia: [0, 1, 1, 1] });
      movel(S.globo, X(11), Y(5), { bloqueia: [0, 1, 1, 1] });
    }
  }

  // Divisórias entre salas vizinhas: porta no meio da altura.
  for (let fil = 0; fil < FILEIRAS; fil++) for (let col = 0; col < COLUNAS - 1; col++) {
    const x = X0 + col * PASSO_X + W, y0 = 1 + fil * PASSO_Y + 2;
    const esq = grade[y0 + 3][x - 1], dir = grade[y0 + 3][x + 1];
    const piso = esq && "piso" in esq ? esq.piso : dir && "piso" in dir ? dir.piso : "ladrilho";
    const vazio = (k: number) => (arrumacao.espacos[k]?.conteudo.tipo ?? "vazio") === "vazio";
    // Dois espaços vazios lado a lado viram uma passagem só (sem divisória no meio).
    if (vazio(fil * COLUNAS + col) && vazio(fil * COLUNAS + col + 1)) chao(x, x, y0 - 2, y0 + H + 1, piso);
    else chao(x, x, y0 + 3, y0 + 4, piso);
  }

  // Entrada, embaixo no centro: porta de vidro, recepção e sofá de espera.
  const xe0 = Math.floor((LARGURA - (W - 2)) / 2), xe1 = xe0 + W - 3;
  parede(xe0, xe1, Y_ENTRADA - 2, "madeira");
  chao(xe0, xe1, Y_ENTRADA, Y_ENTRADA + 3, "espinha");
  const xm = Math.floor((xe0 + xe1) / 2) - 1;
  chao(xm, xm + 3, Y_ENTRADA - 2, Y_ENTRADA - 1, "espinha");
  placas.push({ texto: "ENTRADA", x: xe0 + 2.5, y: Y_ENTRADA - 2, cor: "#34d399" });
  movel(S.balcao, xe0 + 1, Y_ENTRADA, { bloqueia: [0, 0, 2, 2] });
  movel(S.sofaClaro, xe1 - 3, Y_ENTRADA, { bloqueia: [0, 0, 3, 1] });
  movel(S.plantaPequena, xe0, Y_ENTRADA + 2, { bloqueia: [0, 1, 1, 1] });
  movel(S.plantaPequena, xe1, Y_ENTRADA + 2, { bloqueia: [0, 1, 1, 1] });
  movel(S.tapeteAzul, xm + 1, Y_ENTRADA + 3, { chao: true });
  movel(S.portaVidro, xm, Y_ENTRADA + 4);
  const chegada = { x: xm + 1, y: Y_ENTRADA + 3 };

  // Onde dá para andar: chão sem móvel que bloqueia.
  const andavel = grade.map((linha) => linha.map((c) => !!c && "piso" in c));
  for (const m of moveis) {
    if (!m.bloqueia) continue;
    const [dx, dy, w, h] = m.bloqueia;
    for (let x = m.x + dx; x < m.x + dx + w; x++) for (let y = m.y + dy; y < m.y + dy + h; y++) if (andavel[y]?.[x] != null) andavel[y][x] = false;
  }
  return { largura: LARGURA, altura: ALTURA, grade, andavel, moveis, estacoes, placas, tela, chegada, espacos };
}
