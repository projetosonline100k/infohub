// Dash dos vídeos dark (clique no Lauro): conta as edições de formato "dark" por etapa e por perfil.
// Lógica pura, testada em tests/empresaDashDark.test.mjs.

export interface EdicaoDark {
  id: string;
  titulo: string;
  status: string;
  cliente_id: string;
  perfil: string;
  criado_em: string;
  /** status do vídeo vertical ligado à edição (null = sem ligação). */
  video_status: string | null;
}

export type EtapaDark = "fila" | "producao" | "revisar" | "pronto" | "postado" | "cancelado";

export function etapaDark(e: Pick<EdicaoDark, "status" | "video_status">): EtapaDark {
  if (e.status === "cancelado") return "cancelado";
  if (e.video_status === "postado") return "postado";
  if (e.status === "aprovado") return "pronto";
  if (e.status === "revisar") return "revisar";
  if (e.status === "na_fila") return "fila";
  return "producao"; // editando, renderizando, aprovando
}

export interface ContagemDark { fila: number; producao: number; revisar: number; pronto: number; postado: number; total: number }
const zero = (): ContagemDark => ({ fila: 0, producao: 0, revisar: 0, pronto: 0, postado: 0, total: 0 });

export function resumirDark(edicoes: EdicaoDark[]) {
  const geral = zero();
  const porPerfil = new Map<string, ContagemDark & { perfil: string; ultimo: string }>();
  for (const e of edicoes) {
    const etapa = etapaDark(e);
    if (etapa === "cancelado") continue;
    geral[etapa]++; geral.total++;
    const p = porPerfil.get(e.cliente_id) ?? { ...zero(), perfil: e.perfil, ultimo: e.criado_em };
    p[etapa]++; p.total++;
    if (e.criado_em > p.ultimo) p.ultimo = e.criado_em;
    porPerfil.set(e.cliente_id, p);
  }
  return { geral, porPerfil: [...porPerfil.values()].sort((a, b) => b.total - a.total || a.perfil.localeCompare(b.perfil)) };
}

/** Vídeos prontos para postar com mais de `dias` dias parados (aprovado e não postado). */
export function prontosParados(edicoes: EdicaoDark[], agora: Date, dias = 7) {
  const limite = agora.getTime() - dias * 86400000;
  return edicoes.filter((e) => etapaDark(e) === "pronto" && new Date(e.criado_em).getTime() < limite).length;
}
