// Pixels do quiz (18/11/2026): Meta, TikTok e Google (GA4 / Ads / GTM) na página pública, com os eventos do funil.
// Só ids ficam no banco (quizzes.pixels); o código de cada pixel é montado aqui. Sem id = não carrega nada.

export interface PixelsQuiz { meta?: string; tiktok?: string; ga4?: string; google_ads?: string; gtm?: string }
export type EventoPixel = "visita" | "passo" | "lead" | "fim" | "cta";

const ID = {
  meta: /^\d{8,20}$/,
  tiktok: /^[A-Z0-9]{8,30}$/i,
  ga4: /^G-[A-Z0-9]{4,20}$/i,
  google_ads: /^AW-\d{6,15}$/i,
  gtm: /^GTM-[A-Z0-9]{4,12}$/i,
};

/** Tira espaços e descarta o que não tem cara de id (evita código estranho entrar na página). */
export function limparPixels(p: unknown): PixelsQuiz {
  const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
  const out: PixelsQuiz = {};
  for (const k of Object.keys(ID) as (keyof PixelsQuiz)[]) {
    const v = typeof o[k] === "string" ? (o[k] as string).trim() : "";
    if (v && ID[k].test(v)) out[k] = k === "ga4" || k === "google_ads" || k === "gtm" ? v.toUpperCase() : v;
  }
  return out;
}

/** Devolve o texto de erro do campo, ou null se está vazio/ok. */
export function erroDoId(k: keyof PixelsQuiz, v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return ID[k].test(t) ? null : "id com formato inválido";
}

type W = Window & Record<string, unknown>;

function script(src: string) {
  const s = document.createElement("script");
  s.async = true; s.src = src;
  document.head.appendChild(s);
}

let carregado = "";

/** Carrega os pixels (uma vez por conjunto de ids) e dispara o PageView. */
export function iniciarPixels(bruto: unknown) {
  const p = limparPixels(bruto);
  const chave = JSON.stringify(p);
  if (carregado === chave || typeof window === "undefined") return;
  carregado = chave;
  const w = window as unknown as W;

  // O servidor já pôs o código base da Meta no <head> (api/quiz.js): init e PageView já saíram, não repete.
  const meta_no_servidor = !!p.meta && w.__metaSsr === p.meta;
  if (p.meta && !meta_no_servidor) {
    if (!w.fbq) {
      // Mesmo formato do código oficial da Meta: o fbevents.js troca a fila (queue) pelo pixel de verdade quando carrega.
      const fbq = function (...a: unknown[]) {
        const f = fbq as unknown as { callMethod?: (...x: unknown[]) => void; queue: unknown[] };
        if (f.callMethod) f.callMethod(...a); else f.queue.push(a);
      } as unknown as Record<string, unknown>;
      fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = [];
      w.fbq = fbq; if (!w._fbq) w._fbq = fbq;
      script("https://connect.facebook.net/en_US/fbevents.js");
    }
    (w.fbq as (...a: unknown[]) => void)("init", p.meta);
    (w.fbq as (...a: unknown[]) => void)("track", "PageView");
  }

  if (p.tiktok) {
    // Mesmo formato do código oficial do TikTok (fila de métodos + load que injeta o events.js).
    w.TiktokAnalyticsObject = "ttq";
    const ttq = ((w.ttq as unknown) = (w.ttq as unknown) || []) as unknown as Record<string, unknown> & unknown[];
    const metodos = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
    const adiar = (alvo: Record<string, unknown> & unknown[], m: string) => { alvo[m] = (...a: unknown[]) => { alvo.push([m, ...a]); }; };
    for (const m of metodos) adiar(ttq, m);
    ttq.instance = (id: string) => { const i = ((ttq._i as Record<string, unknown[]>)?.[id] || []) as Record<string, unknown> & unknown[]; for (const m of metodos) adiar(i, m); return i; };
    ttq.load = (id: string, op?: unknown) => {
      const u = "https://analytics.tiktok.com/i18n/pixel/events.js";
      const q = ttq as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      q._i = q._i || {}; q._i[id] = []; q._i[id]._u = u;
      q._t = q._t || {}; q._t[id] = Date.now();
      q._o = q._o || {}; q._o[id] = op || {};
      script(u + "?sdkid=" + encodeURIComponent(id) + "&lib=ttq");
    };
    (ttq.load as (id: string) => void)(p.tiktok);
    (ttq.page as () => void)();
  }

  const google = [p.ga4, p.google_ads].filter(Boolean) as string[];
  if (google.length) {
    const dl = (w.dataLayer = (w.dataLayer as unknown[]) || []);
    // O gtag.js exige o objeto `arguments` na fila (um array comum não é entendido).
    // eslint-disable-next-line prefer-rest-params
    if (!w.gtag) w.gtag = function () { dl.push(arguments); };
    script("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(google[0]));
    (w.gtag as (...a: unknown[]) => void)("js", new Date());
    for (const id of google) (w.gtag as (...a: unknown[]) => void)("config", id);
  }

  if (p.gtm) {
    const dl = (w.dataLayer = (w.dataLayer as unknown[]) || []);
    dl.push({ "gtm.start": Date.now(), event: "gtm.js" });
    script("https://www.googletagmanager.com/gtm.js?id=" + encodeURIComponent(p.gtm));
  }
}

const DE_PARA: Record<EventoPixel, { meta: [string, boolean]; tiktok: string | null; ga: string; gtm: string }> = {
  visita: { meta: ["PageView", false], tiktok: null, ga: "", gtm: "quiz_visita" },                  // PageView já saiu em iniciarPixels
  passo: { meta: ["QuizPasso", true], tiktok: "ViewContent", ga: "quiz_passo", gtm: "quiz_passo" },
  lead: { meta: ["Lead", false], tiktok: "SubmitForm", ga: "generate_lead", gtm: "quiz_lead" },
  fim: { meta: ["CompleteRegistration", false], tiktok: "CompleteRegistration", ga: "quiz_concluido", gtm: "quiz_concluido" },
  cta: { meta: ["InitiateCheckout", false], tiktok: "InitiateCheckout", ga: "begin_checkout", gtm: "quiz_cta" },
};

/** Dispara um evento do funil em todos os pixels ligados. `passo` = número da tela (0 = primeira). */
export function eventoPixel(bruto: unknown, tipo: EventoPixel, passo?: number) {
  if (typeof window === "undefined") return;
  const p = limparPixels(bruto);
  const w = window as unknown as W;
  const m = DE_PARA[tipo];
  const dados = passo !== undefined && passo >= 0 ? { passo: passo + 1 } : undefined;
  try {
    if (p.meta && typeof w.fbq === "function" && !(tipo === "visita")) (w.fbq as (...a: unknown[]) => void)(m.meta[1] ? "trackCustom" : "track", m.meta[0], dados);
    if (p.tiktok && w.ttq && m.tiktok) (w.ttq as { track: (n: string, d: unknown) => void }).track(m.tiktok, dados ?? {});
    if ((p.ga4 || p.google_ads) && typeof w.gtag === "function" && m.ga) (w.gtag as (...a: unknown[]) => void)("event", m.ga, dados ?? {});
    if (p.gtm && Array.isArray(w.dataLayer)) (w.dataLayer as unknown[]).push({ event: m.gtm, ...(dados ?? {}) });
  } catch { /* pixel bloqueado (adblock): o quiz segue */ }
}
