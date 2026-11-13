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

/** Código do link curto (infopro-hub.vercel.app/r/<código>): a-z, 0-9 e hífen, 3 a 40, sem hífen nas pontas. null se não sobra nada. */
export function codigoCurto(v: string): string | null {
  const s = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s) ? s : null;
}
export const enderecoCurto = (baseDoSite: string, codigo: string) => `${baseDoSite.replace(/\/$/, "")}/r/${codigo}`;

/** Telefone só com números e sem o 55 do Brasil (o checkout da Eduzz já traz o DDI): "+55 (11) 98765-4321" → "11987654321". Vazio se não parecer um telefone. */
export function telefoneNacional(v: string | null | undefined): string {
  let d = (v ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d.length >= 10 && d.length <= 11 ? d : "";
}

/**
 * Leva o que a pessoa já preencheu no quiz (nome, e-mail, WhatsApp) para o checkout da Eduzz, que preenche sozinho os campos
 * (13/11/2026, Davi: "ao ir para a Eduzz, os dados que ela já preencheu já vão sendo preenchidos"). Testado em chk.eduzz.com:
 * `name` → Nome completo, `email` → E-mail, `phone`/`cellphone` → Celular. Só mexe em endereços da Eduzz e não troca o que já estiver na URL.
 */
export function comDadosDoLead(url: string, dados: { nome?: string; email?: string; whatsapp?: string }): string {
  if (!/^https?:\/\//i.test(url)) return url;
  try {
    const u = new URL(url);
    if (!/(^|\.)eduzz\.com$/i.test(u.hostname)) return url;
    const nome = (dados.nome ?? "").trim().slice(0, 120);
    const email = (dados.email ?? "").trim().toLowerCase().slice(0, 160);
    const fone = telefoneNacional(dados.whatsapp);
    const poe = (k: string, v: string) => { if (v && !u.searchParams.has(k)) u.searchParams.set(k, v); };
    poe("name", nome);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) poe("email", email);
    poe("phone", fone);
    poe("cellphone", fone);
    return u.toString();
  } catch { return url; }
}
