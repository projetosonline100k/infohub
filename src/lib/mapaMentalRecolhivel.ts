// Título recolhível num texto do mapa mental/lousa (16/11/2026, Davi: "selecionar uma palavra, botão direito, tornar um título e esconder o que vem depois, abrir e fechar, igual no docs").
// O Excalidraw só guarda texto puro, então o título vira uma marca no próprio texto ("▾ Título" aberto, "▸ Título …" fechado) e o que fica escondido
// mora em customData.recolhivel.corpo. Lógica pura, testada em tests/mapaMentalRecolhivel.test.mjs.
export const MARCA_ABERTO = "▾ ";
export const MARCA_FECHADO = "▸ ";
export interface Recolhivel { aberto: boolean; titulo: string; corpo?: string }

/** Seleção [ini, fim) do texto vira o título; o que vem depois dela é o que o título abre e fecha. null se não há nada depois para esconder. */
export function converter(original: string, ini: number, fim: number): { texto: string; dados: Recolhivel } | null {
  if (!(fim > ini) || ini < 0 || fim > original.length) return null;
  const titulo = original.slice(ini, fim).replace(/\s+/g, " ").trim();
  const depois = original.slice(fim);
  if (!titulo || !depois.trim()) return null;
  return { texto: original.slice(0, ini) + MARCA_ABERTO + titulo + depois, dados: { aberto: true, titulo } };
}

/** Abre ou fecha. `texto` é o texto atual do elemento (já com as marcas). null se a marca não foi encontrada (o título foi apagado à mão). */
export function alternar(texto: string, d: Recolhivel): { texto: string; dados: Recolhivel } | null {
  if (d.aberto) {
    const i = texto.indexOf(MARCA_ABERTO + d.titulo);
    if (i < 0) return null;
    const corpo = texto.slice(i + MARCA_ABERTO.length + d.titulo.length);
    return { texto: texto.slice(0, i) + MARCA_FECHADO + d.titulo + " …", dados: { aberto: false, titulo: d.titulo, corpo } };
  }
  const i = texto.lastIndexOf(MARCA_FECHADO);
  if (i < 0) return null;
  const titulo = texto.slice(i + MARCA_FECHADO.length).replace(/ …$/, "").replace(/\s+$/, "") || d.titulo;
  return { texto: texto.slice(0, i) + MARCA_ABERTO + titulo + (d.corpo ?? ""), dados: { aberto: true, titulo } };
}

/** Quebra o texto em linhas que cabem em `largura` (px), medindo com `medir`. Respeita as quebras de linha que já existem. */
export function quebrar(texto: string, largura: number, medir: (s: string) => number): string {
  if (!(largura > 0)) return texto;
  return texto.split("\n").map((paragrafo) => {
    const linhas: string[] = [];
    let atual = "";
    for (const palavra of paragrafo.split(/(?<= )/)) {   // mantém o espaço no fim de cada palavra
      const tentativa = atual + palavra;
      if (atual && medir(tentativa.replace(/ +$/, "")) > largura) { linhas.push(atual.replace(/ +$/, "")); atual = palavra; } else atual = tentativa;
    }
    linhas.push(atual.replace(/ +$/, ""));
    return linhas.join("\n");
  }).join("\n");
}
