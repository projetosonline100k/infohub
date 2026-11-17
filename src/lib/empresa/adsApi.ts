// Facebook Ads pela API (dash do Kdu, 17/11/2026): chamada à edge function, tipos e a atribuição de vendas pelos UTMs. Parte pura testada em tests/adsApi.test.mjs.
import { supabase } from "@/integrations/supabase/client";

export async function chamarFacebook<T = Record<string, unknown>>(rota: string, corpo: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`facebook-ads/${rota}`, { body: corpo });
  if (error) {
    // A função devolve {error: "…"} com status 4xx/5xx: o invoke só entrega o Response, então lê o texto de lá.
    let msg = error.message;
    try { const r = (error as { context?: Response }).context; if (r) { const j = await r.json(); if (j?.error) msg = j.error; } } catch { /* fica a mensagem genérica */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export interface ContaAds { id: string; conta_ref: string; nome: string | null; moeda: string | null; status: string | null; empresa: string | null; cliente_id: string | null; limite_diario: number | null; sincronizada_em: string | null }
export interface Linha { ref: string; nome: string; status: string | null; efetivo: string | null; orcamento: number | null; campanha_ref?: string; conjunto_ref?: string; miniatura?: string | null; objetivo?: string | null }
export type Nivel = "campanha" | "conjunto" | "anuncio";

export interface Venda { utm_campaign: string | null; utm_medium: string | null; utm_content: string | null; utm_term: string | null; tipo: string; valor: number }
/** Os UTMs recomendados nos anúncios (iguais aos da UTMify): campanha|id, conjunto|id, anúncio|id. */
export const UTMS_RECOMENDADOS = "utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}";

/** Pega o id numérico de um UTM no formato "nome|123456" (ou só "123456"). */
export const idDoUtm = (utm: string | null | undefined): string | null => {
  if (!utm) return null;
  const m = /(\d{6,})\s*$/.exec(decodeURIComponent(utm.replace(/\+/g, " ")));
  return m ? m[1] : null;
};
/** Vendas e faturamento por id, no nível pedido (campanha → utm_campaign, conjunto → utm_medium, anúncio → utm_content). Reembolso desconta. */
export function vendasPorId(vendas: Venda[], nivel: Nivel): Map<string, { vendas: number; faturamento: number }> {
  const campo = nivel === "campanha" ? "utm_campaign" : nivel === "conjunto" ? "utm_medium" : "utm_content";
  const mapa = new Map<string, { vendas: number; faturamento: number }>();
  for (const v of vendas) {
    const id = idDoUtm(v[campo]);
    if (!id) continue;
    const t = mapa.get(id) ?? { vendas: 0, faturamento: 0 };
    const sinal = v.tipo === "reembolso" ? -1 : 1;
    t.vendas += sinal; t.faturamento += sinal * (Number(v.valor) || 0);
    mapa.set(id, t);
  }
  return mapa;
}
export const lucro = (faturamento: number, gasto: number) => faturamento - gasto;
export const roi = (faturamento: number, gasto: number) => (gasto > 0 ? ((faturamento - gasto) / gasto) * 100 : null);
