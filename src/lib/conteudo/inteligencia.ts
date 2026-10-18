// Inteligência de Conteúdo (pedido do Davi, 17/10/2026: "implementar algo como a imagem,
// com mais métricas, na parte que era somente o cronograma"). Contas puras sobre os posts
// do Instagram (instagram_posts) e o histórico diário da conta (instagram_metricas_diarias).
// Testes: tests/inteligencia.test.mjs.

export interface PostMetricas {
  ig_media_id: string; tipo: string | null; legenda: string | null; permalink: string | null; publicado_em: string;
  visualizacoes: number | null; alcance: number | null; curtidas: number | null; comentarios: number | null;
  salvamentos: number | null; compartilhamentos: number | null; video_vertical_id: string | null; carrossel_id: string | null;
}
export interface DiaConta { dia: string; seguidores: number | null; alcance: number | null; visualizacoes: number | null }

const DIA = 24 * 60 * 60 * 1000;
const n = (v: number | null | undefined) => v ?? 0;

/** Posts do período atual (últimos `dias`) e do anterior (os `dias` antes disso). */
export function separarPeriodos<T extends { publicado_em: string }>(posts: T[], dias: number, agora = Date.now()) {
  const corte = agora - dias * DIA, corteAnt = agora - 2 * dias * DIA;
  return {
    atual: posts.filter((p) => Date.parse(p.publicado_em) >= corte && Date.parse(p.publicado_em) <= agora),
    anterior: posts.filter((p) => Date.parse(p.publicado_em) >= corteAnt && Date.parse(p.publicado_em) < corte),
  };
}

export const somar = (posts: PostMetricas[], campo: keyof Pick<PostMetricas, "visualizacoes" | "alcance" | "curtidas" | "comentarios" | "salvamentos" | "compartilhamentos">) =>
  posts.reduce((s, p) => s + n(p[campo]), 0);

/** Engajamento: (curtidas + comentários + salvamentos + compartilhamentos) / alcance, em %. */
export function engajamento(posts: PostMetricas[]): number | null {
  const alcance = somar(posts, "alcance");
  if (!alcance) return null;
  return ((somar(posts, "curtidas") + somar(posts, "comentarios") + somar(posts, "salvamentos") + somar(posts, "compartilhamentos")) / alcance) * 100;
}

/** Variação % entre períodos (null quando não dá para comparar). */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((atual - anterior) / anterior) * 100;
}

const diaIso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Série diária pelo dia de publicação: soma do campo no período atual e no anterior (mesma posição). */
export function serieDiaria(posts: PostMetricas[], dias: number, campo: "visualizacoes" | "alcance", agora = Date.now()) {
  const inicio = agora - (dias - 1) * DIA;
  const porDia = new Map<string, number>();
  for (const p of posts) porDia.set(p.publicado_em.slice(0, 10), (porDia.get(p.publicado_em.slice(0, 10)) ?? 0) + n(p[campo]));
  return Array.from({ length: dias }, (_, i) => {
    const t = inicio + i * DIA;
    return { dia: diaIso(t), atual: porDia.get(diaIso(t)) ?? 0, anterior: porDia.get(diaIso(t - dias * DIA)) ?? 0 };
  });
}

/** Seguidores por dia (do histórico da conta) e o ganho no período. */
export function seguidoresNoPeriodo(dias: DiaConta[], periodo: number, agora = Date.now()) {
  const corte = diaIso(agora - periodo * DIA);
  const lista = dias.filter((d) => d.seguidores != null && d.dia >= corte).sort((a, b) => a.dia.localeCompare(b.dia));
  if (lista.length < 2) return { ganho: null as number | null, desde: lista[0]?.dia ?? null, serie: lista };
  return { ganho: lista[lista.length - 1].seguidores! - lista[0].seguidores!, desde: lista[0].dia, serie: lista };
}

/** Reels × Carrosséis: visualizações, quantidade e média por publicação. */
export function porFormato(posts: PostMetricas[]) {
  const grupo = (f: (p: PostMetricas) => boolean) => {
    const ps = posts.filter(f);
    const v = somar(ps, "visualizacoes");
    return { visualizacoes: v, quantidade: ps.length, media: ps.length ? Math.round(v / ps.length) : 0 };
  };
  const reels = grupo((p) => (p.tipo ?? "").toUpperCase() === "REELS");
  const carrosseis = grupo((p) => (p.tipo ?? "").toUpperCase() !== "REELS");
  const total = reels.visualizacoes + carrosseis.visualizacoes;
  return { reels, carrosseis, total, pctReels: total ? Math.round((reels.visualizacoes / total) * 100) : 0 };
}

/** Quantos dias a fila de programados cobre (1 reel e 1 carrossel por dia) e quantos faltam para a meta de 30 dias. */
export function filaProgramada(programados: { tipo: "reel" | "carrossel"; quando: string }[], agora = Date.now()) {
  const futuros = programados.filter((p) => Date.parse(p.quando) > agora);
  const dias = (tipo: "reel" | "carrossel") => new Set(futuros.filter((p) => p.tipo === tipo).map((p) => p.quando.slice(0, 10))).size;
  const ultimo = (tipo: "reel" | "carrossel") => futuros.filter((p) => p.tipo === tipo).map((p) => p.quando).sort().pop() ?? null;
  return {
    reels: dias("reel"), carrosseis: dias("carrossel"), total: futuros.length,
    ateReel: ultimo("reel"), ateCarrossel: ultimo("carrossel"),
    // Meta: 30 dias de fila de cada formato.
    pctMeta: Math.min(100, Math.round(((dias("reel") + dias("carrossel")) / 60) * 100)),
  };
}

/** Frases do resumo rápido. */
export function resumoRapido(p: {
  visualizacoes: number; varVisualizacoes: number | null; formato: ReturnType<typeof porFormato>; ganhoSeguidores: number | null;
  melhor: { titulo: string; visualizacoes: number } | null; fila: ReturnType<typeof filaProgramada>;
}): string[] {
  const fr: string[] = [];
  if (p.varVisualizacoes != null) fr.push(`Visualizações ${p.varVisualizacoes >= 0 ? "subiram" : "caíram"} ${Math.abs(Math.round(p.varVisualizacoes))}% em relação ao período anterior.`);
  if (p.formato.total) fr.push(`Reels trazem ${p.formato.pctReels}% das visualizações (média de ${p.formato.reels.media.toLocaleString("pt-BR")} por reel contra ${p.formato.carrosseis.media.toLocaleString("pt-BR")} por carrossel).`);
  if (p.melhor) fr.push(`O melhor do período foi "${p.melhor.titulo}", com ${p.melhor.visualizacoes.toLocaleString("pt-BR")} visualizações.`);
  if (p.ganhoSeguidores != null) fr.push(`${p.ganhoSeguidores >= 0 ? "Ganhou" : "Perdeu"} ${Math.abs(p.ganhoSeguidores).toLocaleString("pt-BR")} seguidores no período.`);
  if (p.fila.reels < 7) fr.push(`A fila de reels cobre só ${p.fila.reels} dia(s): aprove mais edições do Danilo.`);
  if (p.fila.carrosseis < 7) fr.push(`A fila de carrosséis cobre só ${p.fila.carrosseis} dia(s): peça mais ao Roy.`);
  return fr;
}
