// Mapa da inteligência de um funcionário de IA (24/10): centro + pilares numerados, cada um com descrição,
// itens e exemplo. Fica em membros.mapa_inteligencia; aparece como mapa mental e vai junto no pedido.

export interface PilarMapa { titulo: string; descricao: string; itens: string[]; exemplo?: string; cor?: string }
export interface MapaInteligencia { titulo?: string; subtitulo?: string; pilares: PilarMapa[] }

export const CORES_PILAR = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e", "#06b6d4", "#84cc16"];

/** Ponto de partida para quem escreve roteiro (o mapa que o Davi desenhou para o Junior, 24/10). */
export const MODELO_ROTEIRO: MapaInteligencia = {
  subtitulo: "Roteiro claro, simples e com profundidade",
  pilares: [
    { titulo: "Headline", descricao: "Identificar qual a melhor estrutura para a headline", itens: ["Gatilho forte", "Curiosidade", "Especificidade", "Benefício claro"] },
    { titulo: "Estilo do roteiro", descricao: "Vem de um jeito que até uma criança de 12 entenda", itens: ["Linguagem simples", "Sem termos técnicos", "Fluidez natural", "Exemplos práticos"] },
    { titulo: "Visualização", descricao: "Pintar um filme na mente da pessoa. Que ela consiga visualizar, entender e imaginar.", itens: ["Usar cenas mentais", "Trazer especificidade", "Exemplos concretos", "Estimular a imaginação"], exemplo: "Ex ruim: Anda de bike na semana\nEx bom: Andar de bike 2x na semana" },
    { titulo: "Referência e adaptação", descricao: "Quando o vídeo vier com referência, teste primeiro a estrutura invisível do roteiro.", itens: ["Analisar a estrutura", "Adaptar para meu tom", "Manter minha narrativa", "Ajustar para o conhecimento do meu público"] },
    { titulo: "Formato final", descricao: "Ex.: roteiro de 40 a 60s de fala", itens: ["Duração do roteiro", "Quebras de cena", "Ritmo de fala", "Linha por linha"] },
  ],
};

/** Mapa válido (o que veio do banco pode estar vazio ou num formato antigo). */
export function lerMapa(v: unknown): MapaInteligencia | null {
  if (!v || typeof v !== "object" || !Array.isArray((v as MapaInteligencia).pilares)) return null;
  const m = v as MapaInteligencia;
  return {
    titulo: m.titulo, subtitulo: m.subtitulo,
    pilares: m.pilares.filter((p) => p && typeof p === "object").map((p) => ({
      titulo: String(p.titulo ?? ""), descricao: String(p.descricao ?? ""), exemplo: p.exemplo ? String(p.exemplo) : undefined,
      itens: Array.isArray(p.itens) ? p.itens.map(String).filter((i) => i.trim()) : [], cor: p.cor,
    })),
  };
}

/** O mapa em texto, para o pedido da IA (pilar por pilar, na ordem). */
export function mapaParaTexto(mapa: MapaInteligencia | null | undefined, nome: string): string | null {
  const pilares = (mapa?.pilares ?? []).filter((p) => p.titulo.trim() || p.descricao.trim() || p.itens.length);
  if (!pilares.length) return null;
  const linhas = [`MAPA DA INTELIGÊNCIA DE ${nome.toUpperCase()}${mapa?.subtitulo?.trim() ? ` (${mapa.subtitulo.trim()})` : ""} — siga cada pilar:`];
  pilares.forEach((p, i) => {
    linhas.push(`${i + 1}. ${p.titulo.trim() || "Pilar"}${p.descricao.trim() ? `: ${p.descricao.trim()}` : ""}`);
    for (const item of p.itens) linhas.push(`   - ${item.trim()}`);
    if (p.exemplo?.trim()) linhas.push(`   Exemplo: ${p.exemplo.trim().replace(/\n+/g, " | ")}`);
  });
  return linhas.join("\n");
}
