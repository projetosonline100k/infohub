// Shorts no YouTube pela Dalila (migração 20261016121500_dalila_youtube_shorts,
// edge `youtube`). Regras do título iguais às do banco e da edge.
export const LIMITE_TITULO_SHORT = 100;
export const LIMITE_DURACAO_SHORT = 180; // acima de 3 min o YouTube trata como vídeo comum

// Título sugerido: a headline do reel, sem < > e cortada em 100 caracteres.
export function tituloDoShort(titulo: string): string {
  return titulo.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, LIMITE_TITULO_SHORT).trim();
}

export function problemaNoTitulo(titulo: string): string | null {
  const t = titulo.trim();
  if (!t) return "Escreva o título do Short.";
  if (t.length > LIMITE_TITULO_SHORT) return `O título do Short passa de ${LIMITE_TITULO_SHORT} caracteres.`;
  if (/[<>]/.test(t)) return "O YouTube não aceita < ou > no título.";
  return null;
}

// Volta do login Google (?youtube=conectado | erro&mensagem=…).
export function retornoDoYoutube(busca: string): { ok: boolean; mensagem: string } | null {
  const p = new URLSearchParams(busca);
  const r = p.get("youtube");
  if (r === "conectado") return { ok: true, mensagem: "Canal do YouTube conectado. A Dalila já pode publicar os Shorts." };
  if (r === "erro") return { ok: false, mensagem: p.get("mensagem") || "Não deu para conectar o YouTube." };
  return null;
}
