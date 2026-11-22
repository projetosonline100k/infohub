// Embaixadores (19/11/2026). Funções puras: o link que cada embaixador divulga leva a marca dele (utm_content = aff_<código>),
// a mesma usada pelos afiliados do quiz, e é ela que liga visita → lead → venda a ele.
import { codigoAfiliado, marcaDoAfiliado } from "@/lib/quiz/afiliados";

export const codigoEmbaixador = codigoAfiliado;

/** Endereço do site publicado: é o que vai para os embaixadores (o app em desenvolvimento roda em localhost, que ninguém mais abre). */
export const ORIGEM_PUBLICA = "https://infopro-hub.vercel.app";
/** Troca o endereço local (localhost / 127.0.0.1) pelo do site publicado; qualquer outro endereço fica como está. */
export function urlPublica(url: string): string {
  try {
    const u = new URL(url);
    if (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || u.hostname.endsWith(".localhost")) return ORIGEM_PUBLICA + u.pathname + u.search + u.hash;
  } catch { /* devolve como veio */ }
  return url;
}

/** Endereço com a marca do embaixador; mantém o que já existir na URL (outras UTM, parâmetros da oferta). */
export function linkDoEmbaixador(destino: string, codigo: string): string {
  try {
    const u = new URL(urlPublica(destino));
    // Quiz: link curto, só com o nome do embaixador (o quiz expande para a marca completa, ver utmDaUrl).
    if (/^\/quiz\/[a-z0-9-]+\/?$/i.test(u.pathname)) { u.search = ""; u.searchParams.set("ref", codigo); return u.toString(); }
    u.searchParams.set("utm_source", "embaixador");
    u.searchParams.set("utm_medium", "link");
    if (!u.searchParams.has("utm_campaign")) u.searchParams.set("utm_campaign", "embaixador");
    u.searchParams.set("utm_content", marcaDoAfiliado(codigo));
    return u.toString();
  } catch { return destino; }
}

export const conviteDoEmbaixador = (origem: string, token: string) => `${origem}/embaixador/convite/${token}`;

export const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

/** Endereço para mostrar uma aula do Google Drive/Docs dentro da página (null = só dá para abrir no Drive). */
export function driveEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const arquivo = u.pathname.match(/\/(?:file|document|presentation|spreadsheets)\/d\/([\w-]+)/)?.[1];
    const pasta = u.pathname.match(/\/folders\/([\w-]+)/)?.[1];
    if (pasta) return `https://drive.google.com/embeddedfolderview?id=${pasta}#list`;
    const id = arquivo ?? u.searchParams.get("id");
    if (!id) return null;
    if (u.pathname.includes("/document/")) return `https://docs.google.com/document/d/${id}/preview`;
    if (u.pathname.includes("/presentation/")) return `https://docs.google.com/presentation/d/${id}/embed`;
    if (u.pathname.includes("/spreadsheets/")) return `https://docs.google.com/spreadsheets/d/${id}/preview`;
    return `https://drive.google.com/file/d/${id}/preview`;
  } catch { return null; }
}
