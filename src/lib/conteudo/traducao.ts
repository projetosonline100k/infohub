// Tradução grátis (endpoint público do Google Tradutor, sem chave). Usada
// nas Ideias em destaque pra mostrar headline e transcrição em português
// quando o reel é de outra língua.

const LIMITE = 1500; // caracteres por pedido (a URL tem limite)

// Quebra o texto em pedaços de até `limite` caracteres, sem cortar frases.
export function dividirTexto(texto: string, limite = LIMITE): string[] {
  const frases = texto.split(/(?<=[.!?…])\s+/);
  const partes: string[] = [];
  let atual = "";
  for (const frase of frases) {
    if (atual && (atual + " " + frase).length > limite) { partes.push(atual); atual = ""; }
    if (frase.length > limite) {
      for (let i = 0; i < frase.length; i += limite) partes.push(frase.slice(i, i + limite));
      continue;
    }
    atual = atual ? `${atual} ${frase}` : frase;
  }
  if (atual) partes.push(atual);
  return partes;
}

// Resposta do Google: [[["tradução","original",...],...], null, "es", ...]
export function lerResposta(dados: unknown): { texto: string; idioma: string | null } {
  const linhas = Array.isArray(dados) && Array.isArray(dados[0]) ? (dados[0] as unknown[][]) : [];
  const texto = linhas.map((l) => (Array.isArray(l) && typeof l[0] === "string" ? l[0] : "")).join("");
  const idioma = Array.isArray(dados) && typeof dados[2] === "string" ? dados[2] : null;
  return { texto, idioma };
}

export const ehPortugues = (idioma: string | null | undefined) => !!idioma && /^pt/i.test(idioma);

// No app do Mac a tradução passa pelo Python do modo Creator (a janela do
// Jarvis não consegue chamar o Google direto); na web, fetch normal.
async function traduzirPedaco(parte: string): Promise<{ texto: string; idioma: string | null }> {
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<{ texto: string; idioma: string | null }>("creator_transcrever", { url: parte, modo: "traduzir" });
  }
  // POST: texto longo não cabe na URL.
  const corpo = new URLSearchParams({ q: parte });
  let resp: Response | null = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (tentativa) await new Promise((ok) => setTimeout(ok, 1500 * tentativa));
    try {
      resp = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t", { method: "POST", body: corpo, signal: AbortSignal.timeout(20_000) });
    } catch { resp = null; }
    if (resp?.ok) break;
  }
  if (!resp?.ok) throw new Error(`tradutor respondeu ${resp?.status ?? "sem resposta"}`);
  return lerResposta(await resp.json());
}

export async function traduzirParaPortugues(texto: string): Promise<{ texto: string; idioma: string | null }> {
  let idioma: string | null = null;
  const saida: string[] = [];
  for (const parte of dividirTexto(texto)) {
    const r = await traduzirPedaco(parte);
    idioma ??= r.idioma;
    saida.push(r.texto);
  }
  return { texto: saida.join(" "), idioma };
}
