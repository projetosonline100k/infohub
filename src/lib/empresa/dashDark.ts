// Esteira dos vídeos dark (clique no Lauro; 12/11/2026, Davi: "preciso que o dash do Lauro seja assim": esteira de produção por perfil).
// Lógica pura, testada em tests/empresaDashDark.test.mjs.

export interface EdicaoDark {
  id: string;
  titulo: string;
  status: string;
  cliente_id: string;
  perfil: string;
  criado_em: string;
  atualizado_em: string;
  /** status do vídeo vertical ligado à edição (null = sem ligação). */
  video_status: string | null;
  /** dia (AAAA-MM-DD) marcado para postar, do vídeo vertical ligado. */
  data_postagem: string | null;
}

export type EtapaEsteira = "fila" | "criando" | "edicao" | "revisao" | "pronto" | "programado" | "postado" | "cancelado";
/** Ordem da esteira (do começo ao fim). */
export const ORDEM_ETAPAS: Exclude<EtapaEsteira, "cancelado" | "postado">[] = ["fila", "criando", "edicao", "revisao", "pronto", "programado"];
export const ROTULO_ETAPA: Record<EtapaEsteira, string> = { fila: "Na fila", criando: "Sendo criado", edicao: "Em edição", revisao: "Em revisão", pronto: "Pronto", programado: "Programado", postado: "Postado", cancelado: "Cancelado" };

/** Em que ponto da esteira está a edição. `hoje` = AAAA-MM-DD (dia de Brasília). */
export function etapaEsteira(e: Pick<EdicaoDark, "status" | "video_status" | "data_postagem">, hoje: string): EtapaEsteira {
  if (e.status === "cancelado") return "cancelado";
  if (e.video_status === "postado") return "postado";
  if (e.status === "aprovado") return e.data_postagem && e.data_postagem >= hoje ? "programado" : "pronto";
  if (e.status === "revisar") return "revisao";
  if (e.status === "renderizando" || e.status === "aprovando") return "edicao";
  if (e.status === "na_fila") return "fila";
  return "criando"; // editando e o que mais vier
}

/** "Versão dark: Instalivros: piloto…" → "piloto…" (o perfil já aparece na linha). */
export const tituloCurto = (titulo: string, perfil?: string) => {
  let t = titulo.replace(/^Versão dark:\s*/i, "").trim();
  if (perfil && t.toLowerCase().startsWith(`${perfil.toLowerCase()}:`)) t = t.slice(perfil.length + 1).trim();
  return t || titulo;
};

export type ContagemEsteira = Record<Exclude<EtapaEsteira, "cancelado">, number> & { total: number };
const zero = (): ContagemEsteira => ({ fila: 0, criando: 0, edicao: 0, revisao: 0, pronto: 0, programado: 0, postado: 0, total: 0 });

export interface LinhaPerfil { cliente_id: string; perfil: string; videos: (EdicaoDark & { etapa: EtapaEsteira })[]; ativos: number; programados: number; ultimo: string }

export function resumirEsteira(edicoes: EdicaoDark[], hoje: string) {
  const geral = zero();
  const por = new Map<string, LinhaPerfil>();
  for (const e of edicoes) {
    const etapa = etapaEsteira(e, hoje);
    if (etapa === "cancelado") continue;
    geral[etapa]++; geral.total++;
    if (etapa === "postado") continue;   // postado já saiu da esteira
    const l = por.get(e.cliente_id) ?? { cliente_id: e.cliente_id, perfil: e.perfil, videos: [], ativos: 0, programados: 0, ultimo: e.atualizado_em };
    l.videos.push({ ...e, etapa }); l.ativos++;
    if (etapa === "programado") l.programados++;
    if (e.atualizado_em > l.ultimo) l.ultimo = e.atualizado_em;
    por.set(e.cliente_id, l);
  }
  const rank = (e: { etapa: EtapaEsteira }) => ORDEM_ETAPAS.indexOf(e.etapa as never);
  for (const l of por.values()) l.videos.sort((a, b) => rank(a) - rank(b) || b.atualizado_em.localeCompare(a.atualizado_em));
  return { geral, porPerfil: [...por.values()] };
}

export type OrdemPerfis = "nome" | "videos" | "recente";
export const ordenarPerfis = (l: LinhaPerfil[], por: OrdemPerfis) =>
  [...l].sort((a, b) => (por === "videos" ? b.ativos - a.ativos : por === "recente" ? b.ultimo.localeCompare(a.ultimo) : 0) || a.perfil.localeCompare(b.perfil));

const FRASE: Record<EtapaEsteira, string> = {
  fila: "entrou na fila", criando: "começou a ser criado", edicao: "entrou em Edição", revisao: "foi para Em revisão",
  pronto: "marcado como Pronto", programado: "foi Programado", postado: "foi Postado", cancelado: "foi cancelado",
};
export interface Atividade { id: string; titulo: string; perfil: string; etapa: EtapaEsteira; frase: string; quando: string }

/** Últimos movimentos (pela data da última mudança de cada edição). */
export function atividadeRecente(edicoes: EdicaoDark[], hoje: string, n = 6): Atividade[] {
  return [...edicoes].filter((e) => etapaEsteira(e, hoje) !== "cancelado").sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em)).slice(0, n)
    .map((e) => { const etapa = etapaEsteira(e, hoje); return { id: e.id, titulo: tituloCurto(e.titulo, e.perfil), perfil: e.perfil, etapa, frase: FRASE[etapa], quando: e.atualizado_em }; });
}

/** Vídeos prontos para postar parados há mais de `dias` dias (sem data de postagem). */
export function prontosParados(edicoes: EdicaoDark[], hoje: string, agora: Date, dias = 7) {
  const limite = agora.getTime() - dias * 86400000;
  return edicoes.filter((e) => etapaEsteira(e, hoje) === "pronto" && new Date(e.atualizado_em).getTime() < limite).length;
}
