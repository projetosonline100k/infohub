// Mini editor do Danilo: o projeto de edição guarda tudo no TEMPO DO BRUTO
// (scripts/danilo/motor.py). Estas funções convertem entre o tempo do vídeo
// que o Davi está assistindo (final) e o do bruto, igual ao motor.

export interface Remocao { id: string; inicio: number; fim: number; origem: "auto" | "davi"; motivo?: string }
/** `tamanho` (px em 1080 de largura, padrão 74), `entrelinhas` (1 = junto) e `largura` (px da caixa,
 * padrão 960; as linhas quebram sozinhas nela, além das quebras do texto) só valem na headline. */
export interface Legenda { id: string; inicio: number; fim: number; texto: string; tipo: "head" | "leg"; tamanho?: number; entrelinhas?: number; largura?: number }
/** `chroma`: vídeo com fundo verde (o motor tira o verde; o editor mostra a cópia com transparência). */
export interface Midia { id: string; tipo: "imagem" | "video"; arquivo: string; inicio: number; fim: number; x: number; y: number; w: number; h: number; chroma?: boolean }
/** Trecho que continua no tempo do vídeo, mas fica preto e mudo (apagado
 * com "Juntar ao apagar" desligado). */
export interface Lacuna { id: string; inicio: number; fim: number }
/** Zoom como camada de ajuste por cima do vídeo (tempo do bruto).
 * suave: entra e sai devagar · seco: corte seco (punch) · lento: vai aproximando o bloco todo. */
export interface BlocoZoom { id: string; inicio: number; fim: number; z: number; tipo: "suave" | "seco" | "lento" }
/** Cor no estilo Lumetri: cada ajuste vai de -100 a 100 (0 = sem mudança). */
export interface AjusteCor { exposicao: number; contraste: number; saturacao: number; temperatura: number }
export interface ProjetoEdicao {
  fonte: string;
  duracao_fonte: number;
  remocoes: Remocao[];
  legendas: Legenda[];
  midias: Midia[];
  /** `abaixar`: quanto a música fica quando o Davi fala (0,35 = 35% do volume). */
  musica: { arquivo: string; volume: number; abaixar?: number } | null;
  zoom: { t: number; z: number; d: number }[];
  cor: string;
  palavras?: { t: string; s: number; e: number }[];
  lacunas?: Lacuna[];
  /** Só do mini editor (o motor ignora): marcadores (M) e cortes da lâmina. */
  marcadores?: number[];
  divisoes?: number[];
  zooms?: BlocoZoom[];
  ajuste_cor?: AjusteCor;
}

export function trechosMantidos(p: Pick<ProjetoEdicao, "remocoes" | "duracao_fonte">): [number, number][] {
  const rem = [...p.remocoes].map((r) => [r.inicio, r.fim] as [number, number]).sort((a, b) => a[0] - b[0]);
  const mant: [number, number][] = [];
  let pos = 0;
  for (const [a, b] of rem) {
    if (a > pos) mant.push([pos, a]);
    pos = Math.max(pos, b);
  }
  if (pos < p.duracao_fonte) mant.push([pos, p.duracao_fonte]);
  return mant.filter(([a, b]) => b - a >= 0.05);
}

export const duracaoFinal = (segs: [number, number][]) => segs.reduce((s, [a, b]) => s + (b - a), 0);

/** Tempo do bruto → tempo do vídeo final. Caiu num corte: vai pro começo do
 * trecho seguinte (lado "inicio") ou pro fim do anterior (lado "fim"). */
export function paraFinal(segs: [number, number][], t: number, lado: "inicio" | "fim" = "inicio"): number | null {
  let acc = 0;
  let anterior: number | null = null;
  for (const [a, b] of segs) {
    if (t < a) return lado === "inicio" ? acc : anterior;
    if (t <= b) return acc + (t - a);
    acc += b - a;
    anterior = acc;
  }
  return lado === "fim" ? acc : null;
}

/** Tempo do vídeo final → tempo do bruto. */
export function paraBruto(segs: [number, number][], tf: number): number {
  let acc = 0;
  for (const [a, b] of segs) {
    if (tf <= acc + (b - a)) return a + (tf - acc);
    acc += b - a;
  }
  return segs.length ? segs[segs.length - 1][1] : 0;
}

/** Corta o trecho [tf1, tf2] do vídeo final (vira remoção do Davi). */
export function cortarTrecho(p: ProjetoEdicao, tf1: number, tf2: number): ProjetoEdicao {
  const segs = trechosMantidos(p);
  const [x, y] = tf1 < tf2 ? [tf1, tf2] : [tf2, tf1];
  // Um intervalo no final pode atravessar cortes: vira uma remoção por trecho.
  const novas: Remocao[] = [];
  let acc = 0;
  for (const [a, b] of segs) {
    const ini = Math.max(x, acc), fim = Math.min(y, acc + (b - a));
    if (fim - ini > 0.02) novas.push({ id: `d${Date.now()}${novas.length}`, inicio: a + (ini - acc), fim: a + (fim - acc), origem: "davi", motivo: "cortado no mini editor" });
    acc += b - a;
  }
  return { ...p, remocoes: [...p.remocoes, ...novas] };
}

export function restaurar(p: ProjetoEdicao, id: string): ProjetoEdicao {
  return { ...p, remocoes: p.remocoes.filter((r) => r.id !== id) };
}

export const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// ---------------------------------------------------------------- linha do tempo
/** Tira [a, b] do bruto do vídeo (vira remoção do Davi). */
export function removerIntervalo(p: ProjetoEdicao, a: number, b: number): ProjetoEdicao {
  const [x, y] = [Math.max(0, Math.min(a, b)), Math.min(p.duracao_fonte, Math.max(a, b))];
  if (y - x < 0.02) return p;
  return { ...p, remocoes: [...p.remocoes, { id: `d${Date.now()}${Math.random().toString(36).slice(2, 6)}`, inicio: x, fim: y, origem: "davi", motivo: "cortado na linha do tempo" }] };
}

/** Traz [a, b] do bruto de volta: tira esse pedaço de todas as remoções
 * (uma remoção que só encosta é aparada; a que atravessa vira duas). */
export function restaurarIntervalo(p: ProjetoEdicao, a: number, b: number): ProjetoEdicao {
  const [x, y] = [Math.min(a, b), Math.max(a, b)];
  const remocoes: Remocao[] = [];
  for (const r of p.remocoes) {
    if (r.fim <= x || r.inicio >= y) { remocoes.push(r); continue; }
    if (r.inicio < x) remocoes.push({ ...r, id: `${r.id}a`, fim: x });
    if (r.fim > y) remocoes.push({ ...r, id: `${r.id}b`, inicio: y });
  }
  return { ...p, remocoes: remocoes.filter((r) => r.fim - r.inicio > 0.02), lacunas: tirarDe(p.lacunas ?? [], x, y) };
}

function tirarDe<T extends { id: string; inicio: number; fim: number }>(lista: T[], x: number, y: number): T[] {
  const out: T[] = [];
  for (const r of lista) {
    if (r.fim <= x || r.inicio >= y) { out.push(r); continue; }
    if (r.inicio < x) out.push({ ...r, id: `${r.id}a`, fim: x });
    if (r.fim > y) out.push({ ...r, id: `${r.id}b`, inicio: y });
  }
  return out.filter((r) => r.fim - r.inicio > 0.02);
}

const novoId = (pre: string) => `${pre}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

/** Apaga [a, b] do bruto. juntar=true: o resto do vídeo encosta (remoção);
 * false: fica um buraco preto e mudo no lugar (lacuna). */
export function apagarIntervalo(p: ProjetoEdicao, a: number, b: number, juntar: boolean): ProjetoEdicao {
  if (juntar) return removerIntervalo({ ...p, lacunas: tirarDe(p.lacunas ?? [], Math.min(a, b), Math.max(a, b)) }, a, b);
  const [x, y] = [Math.max(0, Math.min(a, b)), Math.min(p.duracao_fonte, Math.max(a, b))];
  if (y - x < 0.02) return p;
  return { ...p, lacunas: [...tirarDe(p.lacunas ?? [], x, y), { id: novoId("l"), inicio: x, fim: y }] };
}

/** Fecha o buraco: a lacuna vira remoção e o vídeo encosta. */
export function fecharLacuna(p: ProjetoEdicao, id: string): ProjetoEdicao {
  const l = (p.lacunas ?? []).find((x) => x.id === id);
  if (!l) return p;
  return removerIntervalo({ ...p, lacunas: (p.lacunas ?? []).filter((x) => x.id !== id) }, l.inicio, l.fim);
}

export const lacunaEm = (p: Pick<ProjetoEdicao, "lacunas">, t: number) => (p.lacunas ?? []).find((l) => t >= l.inicio && t < l.fim) ?? null;

/** Corta a legenda em t (bruto). Com as palavras da transcrição, cada lado
 * fica com as palavras ditas nele; sem elas, divide o texto pela proporção. */
export function dividirLegenda(p: ProjetoEdicao, id: string, t: number): ProjetoEdicao {
  const l = p.legendas.find((x) => x.id === id);
  if (!l || t <= l.inicio + 0.05 || t >= l.fim - 0.05) return p;
  const termos = l.texto.split(/\s+/).filter(Boolean);
  const ditas = (p.palavras ?? []).filter((w) => w.s >= l.inicio - 0.05 && w.s < l.fim);
  let n = ditas.length === termos.length && ditas.length > 0
    ? ditas.filter((w) => (w.s + w.e) / 2 < t).length
    : Math.round(termos.length * ((t - l.inicio) / (l.fim - l.inicio)));
  n = Math.max(termos.length > 1 ? 1 : 0, Math.min(termos.length > 1 ? termos.length - 1 : termos.length, n));
  const a = termos.slice(0, n).join(" "), b = termos.slice(n).join(" ");
  const novas = [{ ...l, fim: t, texto: a || l.texto }, { ...l, id: novoId("g"), inicio: t, texto: b || l.texto }];
  return { ...p, legendas: p.legendas.flatMap((x) => (x.id === id ? novas : [x])) };
}

export function dividirMidia(p: ProjetoEdicao, id: string, t: number): ProjetoEdicao {
  const m = p.midias.find((x) => x.id === id);
  if (!m || t <= m.inicio + 0.05 || t >= m.fim - 0.05) return p;
  return { ...p, midias: p.midias.flatMap((x) => (x.id === id ? [{ ...m, fim: t }, { ...m, id: novoId("m"), inicio: t }] : [x])) };
}

export interface Clipe { inicio: number; fim: number; posFinal: number; lacuna?: string }

/** Clipes da faixa V1: os trechos mantidos, subdivididos nos pontos onde o
 * Davi passou a lâmina (divisões, no tempo do bruto). Buracos (lacunas) vêm
 * como clipes com `lacuna` = id. */
export function clipes(p: ProjetoEdicao, divisoes: number[]): Clipe[] {
  const out: Clipe[] = [];
  const lac = p.lacunas ?? [];
  const bordas = [...divisoes, ...lac.flatMap((l) => [l.inicio, l.fim])];
  let acc = 0;
  for (const [a, b] of trechosMantidos(p)) {
    const pontos = [a, ...[...new Set(bordas.filter((d) => d > a + 0.05 && d < b - 0.05))].sort((m, n) => m - n), b];
    for (let i = 0; i < pontos.length - 1; i++) {
      const meio = (pontos[i] + pontos[i + 1]) / 2;
      const l = lac.find((x) => meio >= x.inicio && meio < x.fim);
      out.push({ inicio: pontos[i], fim: pontos[i + 1], posFinal: acc + (pontos[i] - a), ...(l ? { lacuna: l.id } : {}) });
    }
    acc += b - a;
  }
  return out;
}

/** Remoção que contém o instante t do bruto (pro player pular), ou null. */
export function remocaoEm(p: Pick<ProjetoEdicao, "remocoes">, t: number): Remocao | null {
  return p.remocoes.find((r) => t >= r.inicio && t < r.fim - 0.01) ?? null;
}

// ---------------------------------------------------------------- zoom (camada de ajuste)
/** Blocos de zoom do projeto. Projeto antigo (só `zoom` em pontos) vira blocos. */
export function blocosZoom(p: Pick<ProjetoEdicao, "zoom" | "zooms" | "duracao_fonte">): BlocoZoom[] {
  if (p.zooms) return p.zooms;
  const ks = [...(p.zoom ?? [])].sort((a, b) => a.t - b.t);
  const out: BlocoZoom[] = [];
  let aberto: BlocoZoom | null = null;
  for (const k of ks) {
    if (k.z > 1.001) {
      if (aberto) out.push({ ...aberto, fim: Math.max(aberto.inicio + 0.2, k.t) });
      aberto = { id: `z${out.length}`, inicio: k.t, fim: k.t + 3, z: k.z, tipo: k.d > 0 ? "suave" : "seco" };
    } else if (aberto) {
      out.push({ ...aberto, fim: Math.max(aberto.inicio + 0.2, k.t + (aberto.tipo === "suave" ? k.d ?? 0 : 0)) });
      aberto = null;
    }
  }
  if (aberto) out.push({ ...aberto, fim: p.duracao_fonte });
  out.sort((a, b) => a.inicio - b.inicio);
  for (let i = 0; i < out.length - 1; i++) if (out[i].fim > out[i + 1].inicio) out[i] = { ...out[i], fim: out[i + 1].inicio };
  return out.filter((z) => z.fim - z.inicio > 0.1);
}

const suavizar = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

/** Nível de zoom no instante tf do vídeo final (igual ao motor). Blocos já no tempo final. */
export function zoomNoFinal(blocos: { a: number; b: number; z: number; tipo: BlocoZoom["tipo"] }[], tf: number): number {
  const k = blocos.find((x) => tf >= x.a && tf < x.b);
  if (!k) return 1;
  const len = k.b - k.a;
  if (k.tipo === "seco") return k.z;
  if (k.tipo === "lento") return 1 + (k.z - 1) * suavizar((tf - k.a) / len);
  const r = Math.min(1.2, len / 3);
  if (tf < k.a + r) return 1 + (k.z - 1) * suavizar((tf - k.a) / r);
  if (tf > k.b - r) return 1 + (k.z - 1) * suavizar((k.b - tf) / r);
  return k.z;
}

export function dividirZoom(p: ProjetoEdicao, id: string, t: number): ProjetoEdicao {
  const zs = blocosZoom(p);
  const z = zs.find((x) => x.id === id);
  if (!z || t <= z.inicio + 0.1 || t >= z.fim - 0.1) return { ...p, zooms: zs };
  return { ...p, zooms: zs.flatMap((x) => (x.id === id ? [{ ...z, fim: t }, { ...z, id: novoId("z"), inicio: t }] : [x])) };
}

// ---------------------------------------------------------------- cor (Lumetri)
export const PRESETS_COR = {
  natural: { rotulo: "Natural (sem filtro)", css: "", quente: 0 },
  cinema: { rotulo: "Cinema", css: "contrast(1.07) saturate(1.07) brightness(0.99)", quente: 0.08 },
  quente: { rotulo: "Quente", css: "saturate(1.05)", quente: 0.3 },
  frio: { rotulo: "Frio", css: "saturate(1.02)", quente: -0.3 },
  vibrante: { rotulo: "Vibrante", css: "saturate(1.3) contrast(1.08)", quente: 0 },
  pb: { rotulo: "Preto e branco", css: "grayscale(1) contrast(1.1)", quente: 0 },
} as const;
export const COR_NEUTRA: AjusteCor = { exposicao: 0, contraste: 0, saturacao: 0, temperatura: 0 };

/** Prévia da cor no player (filtro CSS + quanto puxar pro quente/frio, -1 a 1). */
export function previaCor(cor: string, a: AjusteCor = COR_NEUTRA): { filtro: string; quente: number } {
  const pre = PRESETS_COR[cor as keyof typeof PRESETS_COR] ?? PRESETS_COR.natural;
  const extra = [
    a.exposicao ? `brightness(${(1 + (a.exposicao / 100) * 0.35).toFixed(3)})` : "",
    a.contraste ? `contrast(${(1 + (a.contraste / 100) * 0.5).toFixed(3)})` : "",
    a.saturacao ? `saturate(${(1 + a.saturacao / 100).toFixed(3)})` : "",
  ].filter(Boolean).join(" ");
  return { filtro: [pre.css, extra].filter(Boolean).join(" "), quente: Math.max(-1, Math.min(1, pre.quente + a.temperatura / 100)) };
}

/** Nível da voz no vídeo final, a cada 0,1 s (pico da onda do bruto, 0 a 1 em raiz). */
export function nivelVoz(picos: number[], porSegundo: number, segs: [number, number][]): number[] {
  const n = Math.ceil(duracaoFinal(segs) * 10);
  return Array.from({ length: n }, (_, i) => {
    const t0 = paraBruto(segs, i / 10);
    let m = 0;
    for (let j = Math.floor(t0 * porSegundo); j < Math.floor((t0 + 0.1) * porSegundo); j++) if ((picos[j] ?? 0) > m) m = picos[j];
    return m;
  });
}

/** Música abaixa sozinha quando o Davi fala (mesma conta do motor.curva_musica): ganho de 0 a 1 a
 * cada 0,1 s do vídeo final. Fala = voz acima de 0,25; abaixa 0,1 s antes, segura 0,5 s depois e
 * volta subindo em ~0,4 s. */
export function curvaMusica(voz: number[], abaixar = 0.35): number[] {
  const alvo = voz.map((v) => (v > 0.25 ? abaixar : 1));
  const g = alvo.map((_, i) => Math.min(...alvo.slice(Math.max(0, i - 5), i + 2)));
  for (let i = 1; i < g.length; i++) g[i] = Math.min(g[i], g[i - 1] + 0.15);
  return g;
}
