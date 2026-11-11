// Links rastreados do quiz (11/11/2026, Davi: "nomear o link, o nome é UTM, para saber de onde vêm as vendas").
// Sem React nem importações: testável. A UTM viaja do link para a visita, para o lead e para o botão da oferta (e daí
// para a venda na Eduzz/Kiwify/Hotmart, que já guardam utm_*).

export const UTM_CHAVES = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type Utm = Partial<Record<(typeof UTM_CHAVES)[number], string>>;
export interface LinkQuiz { id: string; nome: string; utm_source: string; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; utm_term: string | null; criado_em: string }

/** "Bio do Instagram" → "bio-do-instagram" (minúsculo, sem acento nem espaço): UTM com formato único soma certo. */
export const normalizarUtm = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** O novo endereço do quiz (só a-z, 0-9 e hífen; 4 a 60). null se não dá para aproveitar. */
export function slugValido(v: string): string | null {
  const s = v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return /^[a-z0-9-]{4,60}$/.test(s) ? s : null;
}

export function utmDaUrl(busca: string): Utm {
  const p = new URLSearchParams(busca);
  const r: Utm = {};
  for (const k of UTM_CHAVES) { const v = p.get(k); if (v?.trim()) r[k] = v.trim().slice(0, 120); }
  return r;
}

/** Põe na URL as UTM que faltam (não troca as que já estão lá). Só mexe em http(s). */
export function comUtm(url: string, utm: Utm): string {
  if (!/^https?:\/\//i.test(url) || !Object.keys(utm).length) return url;
  try {
    const u = new URL(url);
    for (const k of UTM_CHAVES) if (utm[k] && !u.searchParams.has(k)) u.searchParams.set(k, utm[k]!);
    return u.toString();
  } catch { return url; }
}

/** Copia a estrutura levando a UTM da visita para os botões de compra (oferta e perfis). */
export function propagarUtm<T extends { oferta?: { cta_url?: string } | null; perfis?: { cta_url?: string }[] }>(e: T, utm: Utm): T {
  if (!Object.keys(utm).length) return e;
  const n = structuredClone(e);
  if (n.oferta?.cta_url) n.oferta.cta_url = comUtm(n.oferta.cta_url, utm);
  for (const p of n.perfis ?? []) if (p.cta_url) p.cta_url = comUtm(p.cta_url, utm);
  return n;
}

/** O endereço que se divulga: o do quiz + as UTM do link. */
export function linkRastreado(base: string, l: Pick<LinkQuiz, "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term">): string {
  const u = new URL(base);
  for (const k of UTM_CHAVES) { const v = l[k]; if (v) u.searchParams.set(k, v); }
  return u.toString();
}
