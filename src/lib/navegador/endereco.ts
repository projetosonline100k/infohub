// Barra de endereço do navegador das guias (27/10): o que foi digitado vira um endereço — site com ou sem
// "https://", localhost — ou, se não parece endereço, uma pesquisa no Google (como no Chrome).
export function paraEndereco(texto: string): string {
  const t = texto.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(t)) return `http://${t}`;
  if (!/\s/.test(t) && /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t)) return `https://${t}`;
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`;
}

/** Nome curto para a guia: o site sem "www.". */
export function nomeDoSite(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "") || "Navegador"; } catch { return "Navegador"; }
}
