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

export interface LinhaPerfil { id: string; cliente_id: string | null; perfil: string; videos: (EdicaoDark & { etapa: EtapaEsteira })[]; ativos: number; programados: number; ultimo: string }
export interface PerfilBase { id: string; perfil: string; cliente_id: string | null }

/** `perfisBase`: os perfis criados no dash (cada um pode estar ligado a um projeto, `cliente_id`). Aparecem mesmo sem vídeo, e as edições dark entram no perfil ligado ao projeto delas. */
export function resumirEsteira(edicoes: EdicaoDark[], hoje: string, perfisBase: PerfilBase[] = []) {
  const geral = zero();
  const por = new Map<string, LinhaPerfil>(perfisBase.map((p) => [p.id, { id: p.id, cliente_id: p.cliente_id, perfil: p.perfil, videos: [], ativos: 0, programados: 0, ultimo: "" }]));
  const dono = new Map<string, string>();   // projeto → perfil (o primeiro perfil ligado a ele)
  for (const p of perfisBase) if (p.cliente_id && !dono.has(p.cliente_id)) dono.set(p.cliente_id, p.id);
  for (const e of edicoes) {
    const perfilId = dono.get(e.cliente_id);
    if (!perfilId) continue;   // edição de um projeto que não está ligado a nenhum perfil: fora da esteira
    const etapa = etapaEsteira(e, hoje);
    if (etapa === "cancelado") continue;
    geral[etapa]++; geral.total++;
    if (etapa === "postado") continue;   // postado já saiu da esteira
    const l = por.get(perfilId)!;
    l.videos.push({ ...e, etapa }); l.ativos++;
    if (etapa === "programado") l.programados++;
    if (!l.ultimo || e.atualizado_em > l.ultimo) l.ultimo = e.atualizado_em;
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


// ---------------------------------------------------------------- Estilo do vídeo do perfil

/** O que o Davi cadastra ao clicar no perfil: como é o vídeo que esse perfil vai fazer (o Lauro/Danilo leem daqui). */
export interface EstiloDark {
  descricao: string; publico: string; duracao: string; gancho: string; estrutura: string; narracao: string;
  visual: string; musica: string; cta: string; regras: string; referencias: string[]; observacoes: string;
}
export const estiloVazio = (): EstiloDark => ({ descricao: "", publico: "", duracao: "", gancho: "", estrutura: "", narracao: "", visual: "", musica: "", cta: "", regras: "", referencias: [], observacoes: "" });

const txt = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export function sanitizarEstilo(bruto: unknown): EstiloDark {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const e = estiloVazio();
  for (const k of Object.keys(e) as (keyof EstiloDark)[]) if (k !== "referencias") e[k] = txt(b[k], k === "duracao" ? 80 : 4000) as never;
  e.referencias = (Array.isArray(b.referencias) ? b.referencias : []).map((r) => txt(r, 500)).filter(Boolean).slice(0, 30);
  return e;
}

/** Quanto do estilo já está cadastrado (8 itens essenciais) e o que falta. */
export function completudeEstilo(e: EstiloDark) {
  const itens: [string, boolean][] = [["a ideia do vídeo", !!e.descricao], ["o gancho", !!e.gancho], ["a estrutura do roteiro", !!e.estrutura], ["a narração", !!e.narracao],
    ["o visual", !!e.visual], ["a música e os efeitos", !!e.musica], ["o fechamento", !!e.cta], ["as regras", !!e.regras]];
  return { feitos: itens.filter(([, ok]) => ok).length, total: itens.length, faltando: itens.filter(([, ok]) => !ok).map(([n]) => n) };
}

/** Junta o estilo devolvido na conversa com o atual: só troca os campos que vieram (o que não veio fica como estava). */
export function aplicarEstilo(atual: EstiloDark, bruto: unknown): EstiloDark {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const novo = sanitizarEstilo(b);
  const r = { ...atual };
  for (const k of Object.keys(r) as (keyof EstiloDark)[]) if (k in b) (r as Record<string, unknown>)[k] = novo[k];
  return r;
}
