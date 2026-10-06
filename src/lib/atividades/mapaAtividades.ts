// Lógica do "Mapa" de atividades (visão geral de todos os projetos num
// canvas com zoom). Separada do componente pra ser testável.

export interface ColunaMapa { status_key: string; nome: string; eh_conclusao: boolean; ordem?: number }
export interface AtividadeMapa { id: string; status: string; concluida: boolean; ordem: number; data_vencimento: string | null }

export const COLUNAS_PADRAO: ColunaMapa[] = [
  { nome: "Backlog", status_key: "backlog", eh_conclusao: false },
  { nome: "Em Execução", status_key: "em_progresso", eh_conclusao: false },
  { nome: "Revisão", status_key: "revisao", eh_conclusao: false },
  { nome: "Finalizado", status_key: "finalizado", eh_conclusao: true },
];

// Distribui as atividades pelas colunas do projeto. Status que não existe
// mais no quadro cai na primeira coluna (ou na de conclusão, se concluída).
export function agruparPorColuna<T extends AtividadeMapa>(atividades: T[], colunas: ColunaMapa[]): Map<string, T[]> {
  const grupos = new Map<string, T[]>(colunas.map((c) => [c.status_key, []]));
  const conclusao = colunas.find((c) => c.eh_conclusao)?.status_key;
  for (const atividade of atividades) {
    const destino = grupos.has(atividade.status)
      ? atividade.status
      : (atividade.concluida && conclusao) || colunas[0]?.status_key;
    if (destino) grupos.get(destino)!.push(atividade);
  }
  grupos.forEach((lista) => lista.sort((a, b) => a.ordem - b.ordem));
  return grupos;
}

export function estaAtrasadaMapa(atividade: AtividadeMapa, hojeIso: string): boolean {
  return !atividade.concluida && !!atividade.data_vencimento && atividade.data_vencimento.slice(0, 10) < hojeIso;
}

export interface Visao { x: number; y: number; escala: number }
export const ESCALA_MIN = 0.1;
export const ESCALA_MAX = 2;

// Zoom mantendo fixo o ponto sob o cursor (px, py relativos ao canvas).
export function zoomNoPonto(visao: Visao, novaEscala: number, px: number, py: number): Visao {
  const escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, novaEscala));
  const fator = escala / visao.escala;
  return { escala, x: px - (px - visao.x) * fator, y: py - (py - visao.y) * fator };
}

// Enquadra um conteúdo (largura x altura, em escala 1) dentro do canvas.
export function enquadrar(conteudoL: number, conteudoA: number, canvasL: number, canvasA: number, margem = 32): Visao {
  if (!conteudoL || !conteudoA) return { x: margem, y: margem, escala: 1 };
  const escala = Math.min(1, Math.max(ESCALA_MIN, Math.min((canvasL - margem * 2) / conteudoL, (canvasA - margem * 2) / conteudoA)));
  return { escala, x: (canvasL - conteudoL * escala) / 2, y: margem };
}
