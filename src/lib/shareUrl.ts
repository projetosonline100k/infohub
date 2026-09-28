// O token continua sendo a chave de acesso. O nome é apenas descritivo,
// em query string para funcionar também com versões web já publicadas.
export const PUBLIC_SITE_URL = "https://infopro-hub.vercel.app";

export function publicWebOrigin(configured: string | undefined, current: string): string | null {
  try {
    const url = new URL(configured?.trim() || current);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "tauri.localhost" || /^[\d.]+$/.test(host) || host.includes(":")) return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function documentShareUrl(origin: string, token: string, name: string): string {
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
  return `${origin}/compartilhado/${encodeURIComponent(token)}${slug ? `?nome=${slug}` : ""}`;
}
