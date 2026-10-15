import { htmlLimpo } from "./htmlLimpo";

// Diferença entre duas versões de um documento, por bloco (título,
// parágrafo, item de lista): o que entrou e o que saiu. Usado pra mostrar o
// funcionário "escrevendo" na revisão (texto novo aparecendo, o antigo riscado).
export type Bloco = { tipo: "igual" | "novo" | "removido"; html: string; chave: string };

function blocos(html: string): { html: string; texto: string }[] {
  const doc = new DOMParser().parseFromString(`<div>${htmlLimpo(html)}</div>`, "text/html");
  const saida: { html: string; texto: string }[] = [];
  for (const el of Array.from(doc.body.firstElementChild?.children ?? [])) {
    const tag = el.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      Array.from(el.children).forEach((li, k) => {
        const inicio = tag === "ol" ? ` start="${k + 1}"` : "";
        saida.push({ html: `<${tag}${inicio} style="margin:0">${li.outerHTML}</${tag}>`, texto: `${tag}:${li.textContent ?? ""}` });
      });
    } else {
      saida.push({ html: el.outerHTML, texto: `${tag}:${el.textContent ?? ""}` });
    }
  }
  return saida;
}

export function diffBlocos(antes: string, depois: string): Bloco[] {
  const a = blocos(antes), b = blocos(depois);
  // LCS pelo texto de cada bloco.
  const n = a.length, m = b.length;
  const t = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    t[i][j] = a[i].texto === b[j].texto ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const r: Bloco[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i].texto === b[j].texto) { r.push({ tipo: "igual", html: b[j].html, chave: `i${j}` }); i++; j++; }
    else if (i < n && (j >= m || t[i + 1][j] >= t[i][j + 1])) { r.push({ tipo: "removido", html: a[i].html, chave: `r${i}` }); i++; }
    else { r.push({ tipo: "novo", html: b[j].html, chave: `n${j}` }); j++; }
  }
  return r;
}
