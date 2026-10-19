// Vários roteiros num documento só (18/10/2026, Davi): "em vez de registrar a ideia, eu crio
// um documento; toda vez que eu escrever Headline 1, conta como uma ideia; Headline 2, são 2…
// daria até para usar #1, #2, #3". Cada linha que começa com "Headline N", "Roteiro N" ou "#N"
// abre um roteiro; o card mostra quantos tem e o painel lista para pular direto.
// Testes: tests/roteirosNoDocumento.test.mjs.

export interface RoteiroMarcado { numero: number; titulo: string; inicio: number }

// Começo da linha: marcação opcional (#, *, -, >), depois "headline N" / "roteiro N" / "#N",
// e o resto da linha (depois de ":", "-", "–", ".", ")") é o título.
const MARCA = /^[ \t]*(?:[*>-][ \t]*)*(?:(?:headline|roteiro)[ \t]*#?[ \t]*(\d{1,3})|#[ \t]?(\d{1,3}))\b[ \t]*[:\-–—.)]?[ \t]*(.*)$/gim;

export function roteirosNoDocumento(texto: string | null | undefined): RoteiroMarcado[] {
  const t = (texto ?? "").replace(/<\/(p|h\d|li|div)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  const achados: RoteiroMarcado[] = [];
  for (const m of t.matchAll(MARCA)) {
    const numero = Number(m[1] ?? m[2]);
    let titulo = (m[3] ?? "").replace(/^[\s*_:\-–—.)]+|[*_\s]+$/g, "");
    if (!titulo) {
      // Título na linha de baixo ("Headline 1" sozinho, a frase embaixo).
      const depois = t.slice((m.index ?? 0) + m[0].length).split("\n").map((l) => l.trim()).find(Boolean);
      titulo = depois ? depois.replace(/^[*_]+|[*_]+$/g, "") : "";
    }
    achados.push({ numero, titulo: titulo.slice(0, 140), inicio: m.index ?? 0 });
  }
  return achados;
}

export const rotuloRoteiros = (n: number) => `${n} roteiro${n === 1 ? "" : "s"}`;
