// Linha do tempo do dia na guia "Relatório" do Jarvis: junta o que a pessoa
// escreveu (diário) com o que o sistema já sabe (atividades concluídas e
// sessões de foco). Função pura, testável.

export interface RegistroDiario { id: string; texto: string; registrado_em: string; projeto: string | null }
export interface AtividadeConcluida { id: string; titulo: string; concluida_em: string; projeto: string | null }
export interface SessaoFoco { id: string; started_at: string; duration_seconds: number; titulo: string | null; projeto: string | null }

export type ItemLinhaDoTempo =
  | { tipo: "registro"; id: string; quando: string; texto: string; projeto: string | null }
  | { tipo: "concluida"; id: string; quando: string; texto: string; projeto: string | null }
  | { tipo: "foco"; id: string; quando: string; texto: string; projeto: string | null; minutos: number };

// Sessões muito curtas (abriu e fechou) só poluiriam a linha do tempo.
export const FOCO_MINIMO_SEGUNDOS = 5 * 60;

export function montarLinhaDoTempo(registros: RegistroDiario[], concluidas: AtividadeConcluida[], sessoes: SessaoFoco[]): ItemLinhaDoTempo[] {
  const itens: ItemLinhaDoTempo[] = [
    ...registros.map((r) => ({ tipo: "registro" as const, id: r.id, quando: r.registrado_em, texto: r.texto, projeto: r.projeto })),
    ...concluidas.map((a) => ({ tipo: "concluida" as const, id: a.id, quando: a.concluida_em, texto: a.titulo, projeto: a.projeto })),
    ...sessoes
      .filter((s) => s.duration_seconds >= FOCO_MINIMO_SEGUNDOS)
      .map((s) => ({ tipo: "foco" as const, id: s.id, quando: s.started_at, texto: s.titulo ?? "Sessão de foco", projeto: s.projeto, minutos: Math.round(s.duration_seconds / 60) })),
  ];
  // Mais recente primeiro (o campo de escrever fica em cima).
  return itens.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
}

export function resumoDoDia(registros: RegistroDiario[], concluidas: AtividadeConcluida[], sessoes: SessaoFoco[]) {
  const focoSegundos = sessoes.reduce((total, s) => total + Math.max(0, s.duration_seconds), 0);
  return { registros: registros.length, concluidas: concluidas.length, focoMinutos: Math.round(focoSegundos / 60) };
}

// "45min", "2h", "2h 15min".
export function duracaoCurta(minutos: number): string {
  if (minutos < 60) return `${minutos}min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}
