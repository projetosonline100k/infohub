// Carrosséis do Roy (IA de carrosséis, docs/agentes/roy-carrossel.md).
// O Roy cria no Mac (scripts/roy/) e grava na tabela carrosseis; aqui fica a
// lógica pura da revisão no Infopro, testada em tests/carrossel.test.mjs.

export interface SlideCarrossel {
  titulo: string; // *palavra* = cor de destaque
  texto: string;
  pagina: string; // "01/08"
}

export interface CarrosselResumo {
  id: string;
  numero: number | null;
  tema: string;
  status: string;
  mensagem: string | null;
  feedback: string | null;
  slides: SlideCarrossel[];
  legenda: string | null;
  paginas: string[];
  modelos?: string[]; // molde HTML de cada página (prévia ao vivo ao editar)
  versao: number;
  fonte_permalink: string | null;
  pasta_drive: string | null;
  atividade_id: string | null;
  atualizado_em: string;
}

// produzindo → revisar → (ajuste → produzindo → revisar)* → aprovado → programado → publicado
export const STATUS_CARROSSEL: Record<string, string> = {
  produzindo: "Roy está criando",
  revisar: "Esperando sua revisão",
  ajuste: "Roy está ajustando",
  aprovado: "Aprovado · Dalila programa",
  programado: "Programado",
  publicado: "Publicado",
  erro: "Com problema",
};

export const precisaRevisar = (c: Pick<CarrosselResumo, "status">) => c.status === "revisar" || c.status === "erro";
export const emProducao = (c: Pick<CarrosselResumo, "status">) => c.status === "produzindo" || c.status === "ajuste";

// Linha do "Precisa de você".
export function linhaPrecisa(c: CarrosselResumo): { titulo: string; detalhe: string; problema: boolean } {
  if (c.status === "erro") return { titulo: `Carrossel com problema: ${c.tema}`, detalhe: c.mensagem ?? "erro", problema: true };
  const n = c.paginas.length;
  return {
    titulo: `Revisar carrossel: ${c.tema}`,
    detalhe: `Roy terminou · ${n} ${n === 1 ? "página" : "páginas"}${c.versao > 1 ? ` · versão ${c.versao}` : ""}`,
    problema: false,
  };
}

export const semMarcas = (titulo: string) => titulo.replace(/\*/g, "");

// Partes do título pra mostrar com a cor de destaque (*palavra*).
export function partesDoTitulo(titulo: string): { texto: string; destaque: boolean }[] {
  return titulo.split(/(\*[^*]+\*)/).filter(Boolean).map((p) =>
    p.startsWith("*") && p.endsWith("*") && p.length > 2 ? { texto: p.slice(1, -1), destaque: true } : { texto: p, destaque: false });
}

// O Davi editou textos na tela? Devolve as páginas que mudaram (1 = primeira).
export function paginasEditadas(original: SlideCarrossel[], editado: SlideCarrossel[]): number[] {
  return editado.flatMap((s, i) => {
    const o = original[i];
    return !o || o.titulo.trim() !== s.titulo.trim() || o.texto.trim() !== s.texto.trim() ? [i + 1] : [];
  });
}

// Pedido de ajuste que vai pro Roy: o que o Davi escreveu + o que ele mexeu.
export function montarPedidoAjuste(pedido: string, editadas: number[], legendaMudou: boolean, excluidas: number[] = []): string {
  const dois = (n: number) => String(n).padStart(2, "0");
  const partes = [pedido.trim()];
  if (excluidas.length) partes.push(`Excluir ${excluidas.length === 1 ? "a página" : "as páginas"} ${excluidas.map(dois).join(", ")}.`);
  if (editadas.length) partes.push(`Textos editados na tela: ${editadas.length === 1 ? "página" : "páginas"} ${editadas.map((n) => String(n).padStart(2, "0")).join(", ")}.`);
  if (legendaMudou) partes.push("Legenda editada na tela.");
  return partes.filter(Boolean).join("\n");
}

// O padrão do manual é de 6 a 8 páginas, e a última é a chamada para ação.
export const MINIMO_PAGINAS = 6;
export function podeExcluir(pagina: number, total: number, jaExcluidas: number[]): string | null {
  if (pagina === total) return "A última página é a chamada para ação; não dá para excluir.";
  if (total - jaExcluidas.length - 1 < MINIMO_PAGINAS) return `O carrossel precisa de pelo menos ${MINIMO_PAGINAS} páginas.`;
  return null;
}

// Tarefa que nasce na fila da Dalila quando o Davi aprova.
export function tarefaDaDalila(c: Pick<CarrosselResumo, "tema" | "numero" | "paginas">): string {
  const num = c.numero ? `${String(c.numero).padStart(3, "0")} · ` : "";
  return `Programar carrossel: ${num}${c.tema} (${c.paginas.length} páginas)`;
}

// Quem programa: a Dalila (social media) do projeto.
export function acharProgramador<T extends { nome: string; funcao: string | null; eh_ia: boolean }>(membros: T[]): T | null {
  return membros.find((m) => !m.eh_ia && m.nome.toLowerCase() === "dalila")
    ?? membros.find((m) => !m.eh_ia && /social/i.test(m.funcao ?? ""))
    ?? null;
}

// Páginas excluídas na tela somem da visualização. `atual` é o índice (0 =
// primeira) na lista original; devolve a próxima página visível na direção
// pedida, ou a mais próxima se não houver (ex.: excluiu a que estava aberta).
export function paginaVisivel(atual: number, total: number, excluidas: number[], direcao: 1 | -1 = 1): number {
  const visivel = (i: number) => i >= 0 && i < total && !excluidas.includes(i + 1);
  for (let i = atual; i >= 0 && i < total; i += direcao) if (visivel(i)) return i;
  for (let i = atual; i >= 0 && i < total; i -= direcao) if (visivel(i)) return i;
  return 0;
}

// Desfazer/refazer das exclusões (⌘Z / ⌘⇧Z).
export interface HistoricoExclusao { excluidas: number[]; feitas: number[]; desfeitas: number[] }
export const historicoVazio = (): HistoricoExclusao => ({ excluidas: [], feitas: [], desfeitas: [] });
const ordenar = (l: number[]) => [...l].sort((a, b) => a - b);
export function excluirPagina(h: HistoricoExclusao, pagina: number): HistoricoExclusao {
  if (h.excluidas.includes(pagina)) return h;
  return { excluidas: ordenar([...h.excluidas, pagina]), feitas: [...h.feitas, pagina], desfeitas: [] };
}
export function desfazerExclusao(h: HistoricoExclusao): { h: HistoricoExclusao; pagina: number | null } {
  const pagina = h.feitas.at(-1);
  if (pagina == null) return { h, pagina: null };
  return { h: { excluidas: h.excluidas.filter((n) => n !== pagina), feitas: h.feitas.slice(0, -1), desfeitas: [...h.desfeitas, pagina] }, pagina };
}
export function refazerExclusao(h: HistoricoExclusao): { h: HistoricoExclusao; pagina: number | null } {
  const pagina = h.desfeitas.at(-1);
  if (pagina == null) return { h, pagina: null };
  return { h: { excluidas: ordenar([...h.excluidas, pagina]), feitas: [...h.feitas, pagina], desfeitas: h.desfeitas.slice(0, -1) }, pagina };
}

// Prévia ao vivo: o molde é o mesmo HTML que o Roy transforma em PNG, com
// __TITULO__ e __TEXTO__ no lugar do texto (scripts/roy/render.py).
const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function montarPrevia(modelo: string, titulo: string, texto: string): string {
  const tituloHtml = partesDoTitulo(titulo).map((p) => (p.destaque ? `<span class="d">${escapar(p.texto)}</span>` : escapar(p.texto))).join("");
  const textoHtml = escapar(texto).replace(/\n/g, "<br>");
  return modelo.replace("__TITULO__", () => tituloHtml).replace("__TEXTO__", () => textoHtml);
}
