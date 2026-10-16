// Crescimento do Instagram a partir das linhas diárias de
// instagram_metricas_diarias (uma por conta e dia; edge instagram-metricas).

export type MetricaDiaria = {
  dia: string; // AAAA-MM-DD
  username: string | null;
  seguidores: number | null;
  alcance: number | null;
  visualizacoes: number | null;
  erro: string | null;
};

export type Periodo = {
  dias: number;
  ganho: number | null; // seguidores ganhos (null = ainda sem histórico)
  desde: string | null; // dia usado como base do ganho
  alcance: number | null; // soma do alcance diário
  visualizacoes: number | null;
};

export type ResumoInstagram = {
  conta: string | null;
  seguidores: number | null;
  atualizadoDia: string | null;
  semana: Periodo;
  mes: Periodo;
  semInsights: boolean; // falta a permissão de insights: reconectar a conta
};

const somarDias = (dia: string, dias: number) => {
  const data = new Date(`${dia}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
};

const soma = (valores: (number | null)[]) => {
  const numeros = valores.filter((v): v is number => typeof v === "number");
  return numeros.length ? numeros.reduce((a, b) => a + b, 0) : null;
};

function periodo(linhas: MetricaDiaria[], ultimo: MetricaDiaria | undefined, dias: number): Periodo {
  if (!ultimo || ultimo.seguidores == null) return { dias, ganho: null, desde: null, alcance: null, visualizacoes: null };
  const corte = somarDias(ultimo.dia, -dias);
  const comSeguidores = linhas.filter((l) => l.seguidores != null && l.dia < ultimo.dia);
  // Base: o último dia até o corte; sem histórico tão antigo, o dia mais antigo que houver.
  const base = [...comSeguidores].reverse().find((l) => l.dia <= corte) ?? comSeguidores[0];
  const janela = linhas.filter((l) => l.dia > corte && l.dia <= ultimo.dia);
  return {
    dias,
    ganho: base ? ultimo.seguidores - (base.seguidores as number) : null,
    desde: base?.dia ?? null,
    alcance: soma(janela.map((l) => l.alcance)),
    visualizacoes: soma(janela.map((l) => l.visualizacoes)),
  };
}

export function resumoInstagram(linhas: MetricaDiaria[]): ResumoInstagram {
  const ordenadas = [...linhas].sort((a, b) => a.dia.localeCompare(b.dia));
  const ultimo = [...ordenadas].reverse().find((l) => l.seguidores != null);
  const maisRecente = ordenadas[ordenadas.length - 1];
  return {
    conta: maisRecente?.username ?? null,
    seguidores: ultimo?.seguidores ?? null,
    atualizadoDia: ultimo?.dia ?? null,
    semana: periodo(ordenadas, ultimo, 7),
    mes: periodo(ordenadas, ultimo, 30),
    semInsights: Boolean(maisRecente?.erro?.includes("insights")),
  };
}

// Posts com os números de cada um (instagram_posts; mesma edge, todo dia).
export type PostInstagram = {
  ig_media_id: string;
  tipo: string | null; // FEED, REELS
  legenda: string | null;
  permalink: string | null;
  publicado_em: string;
  visualizacoes: number | null;
  alcance: number | null;
  curtidas: number | null;
  comentarios: number | null;
  salvamentos: number | null;
  compartilhamentos: number | null;
  video_vertical_id: string | null;
  carrossel_id: string | null;
};

// Os mais vistos dos últimos `dias` (desempate: salvamentos).
export function topPosts(posts: PostInstagram[], dias = 30, quantos = 5, agora = Date.now()): PostInstagram[] {
  const corte = agora - dias * 24 * 60 * 60 * 1000;
  return posts
    .filter((p) => Date.parse(p.publicado_em) >= corte && p.visualizacoes != null)
    .sort((a, b) => (b.visualizacoes ?? 0) - (a.visualizacoes ?? 0) || (b.salvamentos ?? 0) - (a.salvamentos ?? 0))
    .slice(0, quantos);
}

// 1234 → "1,2 mil"; 2500000 → "2,5 mi".
export function numeroCurto(valor: number | null): string {
  if (valor == null) return "–";
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (Math.abs(valor) >= 1_000_000) return `${fmt(valor / 1_000_000)} mi`;
  if (Math.abs(valor) >= 1_000) return `${fmt(valor / 1_000)} mil`;
  return String(valor);
}

// Primeira linha da legenda, para servir de título quando o post não tem card.
export const tituloDoPost = (p: PostInstagram) =>
  (p.legenda ?? "").split("\n").find((l) => l.trim())?.trim() || "(sem legenda)";
