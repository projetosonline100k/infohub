// Tira o texto de um PDF no próprio navegador (o arquivo não precisa ir ao
// Mac). PDF escaneado (só imagem) volta vazio.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function lerTextoPdf(arquivo: File, onProgresso?: (pagina: number, total: number) => void): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const paginas: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const { items } = await pagina.getTextContent();
    let linha = "";
    for (const item of items) {
      if (!("str" in item)) continue;
      linha += item.str + (item.hasEOL ? "\n" : "");
    }
    paginas.push(linha.replace(/[ \t]+\n/g, "\n").trim());
    onProgresso?.(n, doc.numPages);
  }
  await doc.destroy();
  return paginas.map((t, i) => (t ? `[página ${i + 1}]\n${t}` : "")).filter(Boolean).join("\n\n");
}
