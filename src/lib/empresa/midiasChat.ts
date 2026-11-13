// Imagens, vídeos e áudios que o Lauro gera no Mac e cita na conversa (12/11/2026, Davi: "preciso que eu consiga ver o vídeo e as imagens que ele vai gerar").
// Acha no texto os caminhos de arquivo (completos, ou só o nome do arquivo junto de uma pasta citada antes) para o chat mostrar. Sem React: testável.

export interface MidiaChat { caminho: string; nome: string; tipo: "imagem" | "video" | "audio" }

const EXT = "png|jpe?g|webp|gif|mp4|mov|webm|m4v|mp3|wav|m4a|aac|ogg|opus";
const PASTA_BASE = String.raw`(?:~|/Users/[^/\s]+)/\.infopro-hub/`;
const tipoDe = (nome: string): "imagem" | "video" | "audio" => (/\.(mp4|mov|webm|m4v)$/i.test(nome) ? "video" : /\.(mp3|wav|m4a|aac|ogg|opus)$/i.test(nome) ? "audio" : "imagem");
const limpa = (s: string) => s.replace(/[.,;:!?)\]}"'`]+$/, "");

/** `pasta`: a última pasta citada nas mensagens anteriores (para "folha.png" solto). Devolve as mídias do texto e a pasta vigente. */
export function midiasDoTexto(texto: string, pasta: string | null = null): { midias: MidiaChat[]; pasta: string | null } {
  const achadas: { i: number; m: MidiaChat }[] = [];
  const usados: [number, number][] = [];
  const dentro = (i: number) => usados.some(([a, b]) => i >= a && i < b);
  // 1) caminhos completos de arquivo
  for (const r of texto.matchAll(new RegExp(String.raw`${PASTA_BASE}[^\s"'\x60()\[\]<>]*?\.(?:${EXT})\b`, "gi"))) {
    const caminho = r[0];
    achadas.push({ i: r.index ?? 0, m: { caminho, nome: caminho.split("/").pop() ?? caminho, tipo: tipoDe(caminho) } });
    usados.push([r.index ?? 0, (r.index ?? 0) + caminho.length]);
  }
  const pastaDe = (c: string) => c.slice(0, c.lastIndexOf("/"));
  // 2) pastas citadas (sem extensão de mídia): valem para os nomes soltos que vierem depois
  let atual = pasta;
  const eventos: { i: number; tipo: "pasta" | "nome"; v: string }[] = achadas.map((a) => ({ i: a.i, tipo: "pasta" as const, v: pastaDe(a.m.caminho) }));   // o arquivo citado por inteiro também define a pasta
  for (const r of texto.matchAll(new RegExp(String.raw`${PASTA_BASE}[^\s"'\x60()\[\]<>]+`, "gi"))) {
    if (dentro(r.index ?? 0)) continue;
    const v = limpa(r[0]);
    if (!new RegExp(String.raw`\.(?:${EXT})$`, "i").test(v)) eventos.push({ i: r.index ?? 0, tipo: "pasta", v: v.replace(/\/$/, "") });
  }
  // 3) nomes de arquivo soltos
  for (const r of texto.matchAll(new RegExp(String.raw`(?<![\w./:\-])[\w][\w.\-]*\.(?:${EXT})\b`, "gi"))) {
    if (dentro(r.index ?? 0)) continue;
    eventos.push({ i: r.index ?? 0, tipo: "nome", v: r[0] });
  }
  for (const e of eventos.sort((a, b) => a.i - b.i)) {
    if (e.tipo === "pasta") atual = e.v;
    else if (atual) achadas.push({ i: e.i, m: { caminho: `${atual}/${e.v}`, nome: e.v, tipo: tipoDe(e.v) } });
  }
  const vistos = new Set<string>();
  const midias = achadas.sort((a, b) => a.i - b.i).map((x) => x.m).filter((m) => (vistos.has(m.caminho) ? false : (vistos.add(m.caminho), true)));
  return { midias, pasta: atual };
}
