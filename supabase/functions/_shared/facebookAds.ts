// Facebook Ads pela API da Meta (dash do Kdu, 17/11/2026). Lógica pura (sem rede nem banco), usada pela edge `facebook-ads` e testada em tests/facebookAds.test.mjs.
export const GRAPH = "https://graph.facebook.com/v21.0";
export const ESCOPOS = "ads_management,ads_read,business_management,pages_show_list,pages_read_engagement,pages_manage_ads,instagram_basic";

export const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
/** A API manda e recebe valores em centavos (menor unidade da moeda da conta). */
export const centavos = (reais: number) => Math.round(num(reais) * 100);
export const reais = (cent: unknown) => num(cent) / 100;

// ---------------------------------------------------------------- resultados
// O "Resultados" do Gerenciador depende do objetivo. A API devolve todas as ações; aqui se escolhe a que conta como resultado de cada objetivo.
const ACOES_POR_OBJETIVO: Record<string, { tipo: string; acoes: string[] }> = {
  OUTCOME_SALES: { tipo: "compras", acoes: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"] },
  OUTCOME_LEADS: { tipo: "leads", acoes: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped", "onsite_conversion.messaging_conversation_started_7d"] },
  OUTCOME_TRAFFIC: { tipo: "visitas à página", acoes: ["landing_page_view", "link_click"] },
  OUTCOME_ENGAGEMENT: { tipo: "engajamento", acoes: ["onsite_conversion.messaging_conversation_started_7d", "page_engagement", "post_engagement"] },
  OUTCOME_AWARENESS: { tipo: "alcance", acoes: [] },
  OUTCOME_APP_PROMOTION: { tipo: "instalações", acoes: ["mobile_app_install", "app_install"] },
};
type Acao = { action_type: string; value: string };
const valorDe = (lista: Acao[] | undefined, tipos: string[]) => {
  for (const t of tipos) { const a = (lista ?? []).find((x) => x.action_type === t); if (a) return { tipo: t, valor: num(a.value) }; }
  return null;
};
// deno-lint-ignore no-explicit-any
export function resultadoDaLinha(linha: any, objetivo: string | null | undefined): { resultados: number; tipo: string | null; valor: number } {
  const regra = ACOES_POR_OBJETIVO[objetivo ?? ""] ?? ACOES_POR_OBJETIVO.OUTCOME_TRAFFIC;
  const r = valorDe(linha.actions, regra.acoes);
  const compra = valorDe(linha.action_values, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]);
  if (objetivo === "OUTCOME_AWARENESS") return { resultados: num(linha.reach), tipo: regra.tipo, valor: compra?.valor ?? 0 };
  return { resultados: r?.valor ?? 0, tipo: r ? regra.tipo : null, valor: compra?.valor ?? 0 };
}

// ---------------------------------------------------------------- teto de verba
export interface ItemOrcamento { nivel: "campanha" | "conjunto"; ref: string; campanha_ref: string; status: string | null; orcamento_diario: number | null }
/** Soma da verba diária que está LIGADA: campanha ativa com verba própria (CBO) ou, sem ela, os conjuntos ativos dela (ABO). */
export function verbaAtiva(campanhas: ItemOrcamento[], conjuntos: ItemOrcamento[], ligar?: { nivel: "campanha" | "conjunto"; ref: string }): number {
  const ativo = (i: ItemOrcamento) => i.status === "ACTIVE" || (!!ligar && ligar.nivel === i.nivel && ligar.ref === i.ref);
  let total = 0;
  for (const c of campanhas) {
    if (!ativo(c)) continue;
    if (c.orcamento_diario) { total += c.orcamento_diario; continue; }
    for (const j of conjuntos) if (j.campanha_ref === c.ref && (ativo(j) || (!!ligar && ligar.nivel === "campanha" && ligar.ref === c.ref && j.status !== "ARCHIVED" && j.status !== "DELETED" && j.status === "ACTIVE")) && j.orcamento_diario) total += j.orcamento_diario;
  }
  return total;
}
export function podeLigar(limite: number | null, verbaDepois: number): { ok: boolean; motivo?: string } {
  if (limite == null || limite <= 0) return { ok: false, motivo: "Defina o teto de verba diária desta conta antes de ligar algo (Contas › teto diário)." };
  if (verbaDepois > limite) return { ok: false, motivo: `Ligar isso levaria a verba diária ligada a R$ ${verbaDepois.toFixed(2)}, acima do teto de R$ ${limite.toFixed(2)} da conta.` };
  return { ok: true };
}

// ---------------------------------------------------------------- criação (tudo nasce PAUSADO)
export const PRESETS: Record<string, { rotulo: string; objective: string; optimization_goal: string; precisaPixel: boolean; evento?: string }> = {
  trafego: { rotulo: "Tráfego para o site (visitas à página)", objective: "OUTCOME_TRAFFIC", optimization_goal: "LANDING_PAGE_VIEWS", precisaPixel: false },
  cliques: { rotulo: "Cliques no link", objective: "OUTCOME_TRAFFIC", optimization_goal: "LINK_CLICKS", precisaPixel: false },
  leads: { rotulo: "Leads no site (pixel)", objective: "OUTCOME_LEADS", optimization_goal: "OFFSITE_CONVERSIONS", precisaPixel: true, evento: "LEAD" },
  vendas: { rotulo: "Vendas no site (pixel)", objective: "OUTCOME_SALES", optimization_goal: "OFFSITE_CONVERSIONS", precisaPixel: true, evento: "PURCHASE" },
};
const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function payloadCampanha(d: { nome?: string; preset?: string }): { erro?: string; corpo?: Record<string, string> } {
  const p = PRESETS[d.preset ?? ""];
  if (!p) return { erro: "Escolha o objetivo da campanha." };
  const nome = texto(d.nome, 200);
  if (!nome) return { erro: "Dê um nome à campanha." };
  return { corpo: { name: nome, objective: p.objective, status: "PAUSED", special_ad_categories: "[]", buying_type: "AUCTION" } };
}
export function payloadConjunto(d: { nome?: string; campanha_ref?: string; preset?: string; orcamento_diario?: number; paises?: string[]; idade_min?: number; idade_max?: number; pixel_id?: string; pagina_id?: string }): { erro?: string; corpo?: Record<string, string> } {
  const p = PRESETS[d.preset ?? ""];
  if (!p) return { erro: "Escolha o objetivo do conjunto." };
  const nome = texto(d.nome, 200);
  if (!nome || !d.campanha_ref) return { erro: "Dê um nome ao conjunto e escolha a campanha." };
  const orc = num(d.orcamento_diario);
  if (orc < 6) return { erro: "A verba diária mínima é R$ 6,00." };
  if (p.precisaPixel && !d.pixel_id) return { erro: "Esse objetivo precisa de um pixel." };
  const paises = (d.paises?.length ? d.paises : ["BR"]).map((c) => c.toUpperCase().slice(0, 2));
  const idadeMin = Math.min(65, Math.max(18, Math.round(num(d.idade_min) || 18))), idadeMax = Math.min(65, Math.max(idadeMin, Math.round(num(d.idade_max) || 65)));
  const corpo: Record<string, string> = {
    name: nome, campaign_id: String(d.campanha_ref), daily_budget: String(centavos(orc)), billing_event: "IMPRESSIONS", optimization_goal: p.optimization_goal,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP", status: "PAUSED",
    targeting: JSON.stringify({ geo_locations: { countries: paises }, age_min: idadeMin, age_max: idadeMax, targeting_automation: { advantage_audience: 0 } }),
  };
  if (p.precisaPixel) corpo.promoted_object = JSON.stringify({ pixel_id: d.pixel_id, custom_event_type: p.evento });
  return { corpo };
}
export const CTAS = ["LEARN_MORE", "SIGN_UP", "SHOP_NOW", "SUBSCRIBE", "GET_OFFER", "CONTACT_US", "WHATSAPP_MESSAGE", "DOWNLOAD", "APPLY_NOW", "BOOK_TRAVEL"];
export function payloadCriativo(d: { nome?: string; pagina_id?: string; instagram_id?: string; texto?: string; titulo?: string; descricao?: string; link?: string; cta?: string; imagem_hash?: string; video_id?: string; miniatura_url?: string }): { erro?: string; corpo?: Record<string, string> } {
  if (!d.pagina_id) return { erro: "Escolha a página do Facebook que aparece no anúncio." };
  if (!/^https?:\/\/\S+$/.test(d.link ?? "")) return { erro: "Coloque o link de destino (https://…)." };
  if (!d.imagem_hash && !d.video_id) return { erro: "Escolha o criativo (imagem ou vídeo)." };
  if (d.video_id && !d.miniatura_url) return { erro: "O vídeo ainda não tem miniatura (a Meta ainda processa). Tente em alguns minutos." };
  const cta = CTAS.includes(d.cta ?? "") ? d.cta! : "LEARN_MORE";
  const base: Record<string, unknown> = { page_id: d.pagina_id };
  if (d.instagram_id) base.instagram_actor_id = d.instagram_id;
  const chamada = { type: cta, value: { link: d.link } };
  const spec = d.video_id
    ? { ...base, video_data: { video_id: d.video_id, image_url: d.miniatura_url, message: texto(d.texto, 2000), title: texto(d.titulo, 100), link_description: texto(d.descricao, 200), call_to_action: chamada } }
    : { ...base, link_data: { image_hash: d.imagem_hash, link: d.link, message: texto(d.texto, 2000), name: texto(d.titulo, 100), description: texto(d.descricao, 200), call_to_action: chamada } };
  return { corpo: { name: texto(d.nome, 200) || "Criativo", object_story_spec: JSON.stringify(spec) } };
}
export function payloadAnuncio(d: { nome?: string; conjunto_ref?: string; criativo_id?: string }): { erro?: string; corpo?: Record<string, string> } {
  const nome = texto(d.nome, 200);
  if (!nome || !d.conjunto_ref || !d.criativo_id) return { erro: "Falta o nome, o conjunto ou o criativo do anúncio." };
  return { corpo: { name: nome, adset_id: String(d.conjunto_ref), creative: JSON.stringify({ creative_id: d.criativo_id }), status: "PAUSED" } };
}
export const STATUS_VALIDOS = ["ACTIVE", "PAUSED"];
export const statusLegivel = (s: string | null | undefined): string => ({ ACTIVE: "ativa", PAUSED: "pausada", ARCHIVED: "arquivada", DELETED: "arquivada", WITH_ISSUES: "com problema", DISAPPROVED: "com problema" } as Record<string, string>)[s ?? ""] ?? "pausada";
