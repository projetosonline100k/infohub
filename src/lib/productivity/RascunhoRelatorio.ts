import type { RespostasQuestionario } from "./DailyReportService";

// Relatório de fim do dia montado sozinho: em vez do questionário de 9
// telas do zero, o Atlas propõe as respostas a partir do que o dia já
// registrou (foco, tarefas concluídas, plano da manhã) e a pessoa só dá
// "ok" ou ajusta. Lógica pura (sem supabase) pra ser testável em
// tests/rascunhoRelatorio.test.mjs.

// A partir de que horas o Atlas lembra de encerrar o dia.
export const HORA_LEMBRETE_ENCERRAR = 18;

export interface DadosDoDiaParaRascunho {
  focoSegundos: number;
  distracaoSegundos: number;
  concluidasTitulos: string[];
  prioridadeUm: { titulo: string; concluida: boolean } | null;
  // Atividades do plano da manhã que não foram concluídas, na ordem do plano.
  pendentesDoPlano: string[];
}

const limitar = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, valor));

// 0 a 10: até 6 pontos pelas horas de foco (6h = cheio), até 2 pelas
// tarefas concluídas e 2 por ter concluído a prioridade #1.
export function notaProdutividadeSugerida(dados: DadosDoDiaParaRascunho): number {
  const horas = dados.focoSegundos / 3600;
  const pontos = Math.min(horas, 6) + Math.min(dados.concluidasTitulos.length, 4) * 0.5 + (dados.prioridadeUm?.concluida ? 2 : 0);
  return limitar(Math.round(pontos), 0, 10);
}

// 1 a 5 pela fração do tempo que foi distração. Sem dado de foco, fica no
// meio (3) — não inventa um foco perfeito nem um péssimo.
export function notaFocoSugerida(dados: DadosDoDiaParaRascunho): number {
  const total = dados.focoSegundos + dados.distracaoSegundos;
  if (total <= 0) return 3;
  const fracao = dados.distracaoSegundos / total;
  if (fracao < 0.05) return 5;
  if (fracao < 0.15) return 4;
  if (fracao < 0.3) return 3;
  if (fracao < 0.5) return 2;
  return 1;
}

export function montarRascunho(dados: DadosDoDiaParaRascunho): RespostasQuestionario {
  const p1 = dados.prioridadeUm;
  return {
    productivityScore: notaProdutividadeSugerida(dados),
    energyScore: 3,
    focusScore: notaFocoSugerida(dados),
    mainWin: p1?.concluida ? p1.titulo : dados.concluidasTitulos[0] ?? "",
    mainBlocker: null,
    mainBlockerOther: "",
    completedMainPriority: p1?.concluida ?? false,
    pendingForTomorrow: dados.pendentesDoPlano.join(", "),
    tomorrowMainPriority: p1 && !p1.concluida ? p1.titulo : dados.pendentesDoPlano[0] ?? "",
    plannedBedTime: "",
  };
}

export function deveLembrarDeEncerrar(agora: Date, relatorioJaExiste: boolean | null, dispensadoHoje: boolean): boolean {
  return relatorioJaExiste === false && !dispensadoHoje && agora.getHours() >= HORA_LEMBRETE_ENCERRAR;
}
