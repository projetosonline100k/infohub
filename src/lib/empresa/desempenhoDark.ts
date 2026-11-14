// Desempenho dos vídeos dark (13/11/2026, Davi: "quero ver o número atual de seguidores, views que cada vídeo trouxe, leads"). Sem React: testável.
export interface DiaMetrica { dia: string; seguidores: number | null; atualizado_em?: string }
export interface PostMetrica { ig_media_id: string; visualizacoes: number | null; alcance: number | null; curtidas: number | null; comentarios: number | null; salvamentos: number | null; compartilhamentos: number | null; permalink: string | null; atualizado_em: string }

/** 1234 → "1,2 mil"; 1.500.000 → "1,5 mi"; abaixo de mil, o número inteiro. */
export function compacto(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const f = (v: number, s: string) => `${(Math.round(v * 10) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${s}`;
  if (a >= 1_000_000) return f(n / 1_000_000, "mi");
  if (a >= 10_000) return `${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
  if (a >= 1000) return f(n / 1000, "mil");
  return String(Math.round(n));
}

/** Seguidores de agora e quanto mudou desde o dia mais antigo da janela (até 7 dias atrás). `dias` em qualquer ordem. */
export function seguidoresAtuais(dias: DiaMetrica[], hoje: string): { atual: number | null; variacao: number | null; desde: string | null } {
  const com = dias.filter((d) => d.seguidores != null).sort((a, b) => (a.dia < b.dia ? 1 : -1));
  if (!com.length) return { atual: null, variacao: null, desde: null };
  const atual = com[0];
  const limite = new Date(Date.parse(`${hoje}T12:00:00Z`) - 7 * 86400_000).toISOString().slice(0, 10);
  const base = [...com].reverse().find((d) => d.dia >= limite && d.dia < atual.dia);
  return { atual: atual.seguidores, variacao: base ? (atual.seguidores as number) - (base.seguidores as number) : null, desde: base?.dia ?? null };
}

export interface ResumoVideos { views: number; curtidas: number; comentarios: number; salvamentos: number; compartilhamentos: number; leads: number; videos: number }
export function resumirVideos(posts: PostMetrica[], leadsPorMedia: Record<string, number>): ResumoVideos {
  const soma = (f: (p: PostMetrica) => number | null) => posts.reduce((s, p) => s + (f(p) ?? 0), 0);
  return {
    views: soma((p) => p.visualizacoes), curtidas: soma((p) => p.curtidas), comentarios: soma((p) => p.comentarios), salvamentos: soma((p) => p.salvamentos),
    compartilhamentos: soma((p) => p.compartilhamentos), leads: posts.reduce((s, p) => s + (leadsPorMedia[p.ig_media_id] ?? 0), 0), videos: posts.length,
  };
}

/** Pessoas distintas que comentaram a palavra num post (cada uma conta uma vez): são os leads daquele vídeo. */
export function leadsPorPost(disparos: { media_id: string | null; autor_id: string | null }[]): Record<string, number> {
  const por: Record<string, Set<string>> = {};
  for (const d of disparos) if (d.media_id && d.autor_id) (por[d.media_id] ??= new Set()).add(d.autor_id);
  return Object.fromEntries(Object.entries(por).map(([k, v]) => [k, v.size]));
}
