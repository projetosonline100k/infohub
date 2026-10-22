// HTML dos documentos entregues pelos funcionários (h2, h3, p, listas, links…)
// pronto pra mostrar: mantém só marcações de texto e links http(s); o resto
// vira texto. Usa o DOMParser do navegador.
const PERMITIDAS = new Set(["H2", "H3", "H4", "P", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "A", "BLOCKQUOTE", "BR", "IMG"]);

export function htmlLimpo(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const limpar = (no: Node): string => {
    if (no.nodeType === Node.TEXT_NODE) return (no.textContent ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    if (no.nodeType !== Node.ELEMENT_NODE) return "";
    const el = no as Element;
    const filhos = Array.from(el.childNodes).map(limpar).join("");
    if (!PERMITIDAS.has(el.tagName)) return filhos;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") return "<br>";
    // 22/10: imagens das entregas (scripts/empresa/imagens.py), só por link https.
    if (tag === "img") {
      const src = el.getAttribute("src") ?? "";
      return /^https:\/\//i.test(src) ? `<img src="${src.replace(/"/g, "&quot;")}" alt="${(el.getAttribute("alt") ?? "").replace(/"/g, "&quot;")}" loading="lazy">` : "";
    }
    if (tag === "a") {
      const href = el.getAttribute("href") ?? "";
      return /^https?:\/\//i.test(href) ? `<a href="${href.replace(/"/g, "&quot;")}" target="_blank" rel="noreferrer">${filhos}</a>` : filhos;
    }
    return `<${tag}>${filhos}</${tag}>`;
  };
  return Array.from(doc.body.firstChild?.childNodes ?? []).map(limpar).join("");
}

// Primeiro parágrafo em texto puro (o resumo do card) e o tempo de leitura.
export function resumoDoHtml(html: string): { resumo: string; minutos: number } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const p = doc.querySelector("p");
  const texto = (doc.body.textContent ?? "").trim();
  const declarado = texto.match(/Tempo de leitura:\s*(\d+)/i);
  return { resumo: (p?.textContent ?? texto).trim().slice(0, 320), minutos: declarado ? Number(declarado[1]) : Math.max(1, Math.round(texto.split(/\s+/).length / 200)) };
}
