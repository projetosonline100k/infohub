import { format, getDay, parseISO } from "date-fns";
import type { Habito, HabitoLog, Meta } from "./PerformanceHabitService";
import type { ResultadoAutomatico } from "./PerformanceAutomaticSources";

// Módulo puro — sem chamadas ao Supabase. Quem busca os dados são os hooks/
// services; aqui só mesclam/calculam.

const hojeStr = () => format(new Date(), "yyyy-MM-dd");

// "Um hábito nunca conta como perdido": dia futuro, dia anterior à criação
// do hábito, ou dia fora da frequência configurada.
export function habitoProgramadoNoDia(habito: Pick<Habito, "frequencia" | "dias_da_semana" | "created_at">, date: string): boolean {
  if (date > hojeStr()) return false;
  if (date < habito.created_at.slice(0, 10)) return false;
  if (habito.frequencia === "todos_os_dias") return true;
  const diaSemana = getDay(parseISO(date));
  return (habito.dias_da_semana ?? []).includes(diaSemana);
}

export interface LinhaHabito {
  habito: Habito;
  date: string;
  programado: boolean;
  completed: boolean;
  valueNumeric: number | null;
  // Já tem log manual gravado hoje (independente de ter batido a meta) —
  // usado pelo Encerrar o dia pra não perguntar de novo.
  registrado: boolean;
}

// Merge central (correção #8 do plano) — hábito + log manual (se houver) +
// resultado automático (se houver) → uma linha só, mesma forma pra
// usePerformanceToday/usePerformanceMonth/usePerformanceHistory/
// useEndOfDayRoutines.
export function montarLinhaDoHabito(
  habito: Habito,
  date: string,
  log: HabitoLog | null,
  automatico: ResultadoAutomatico | null
): LinhaHabito {
  if (habito.source === "automatic") {
    if (habito.tipo === "boolean") {
      const status = automatico?.statusBooleano ?? "nao_aplicavel";
      if (status === "nao_aplicavel") {
        return { habito, date, programado: false, completed: false, valueNumeric: null, registrado: false };
      }
      return { habito, date, programado: true, completed: status === "concluida", valueNumeric: null, registrado: true };
    }
    const valueNumeric = automatico?.valueNumeric ?? 0;
    const completed = habito.meta_diaria != null && valueNumeric >= habito.meta_diaria;
    return { habito, date, programado: true, completed, valueNumeric, registrado: true };
  }

  const programado = habitoProgramadoNoDia(habito, date);
  if (!programado) {
    return { habito, date, programado: false, completed: false, valueNumeric: null, registrado: false };
  }

  if (habito.tipo === "boolean") {
    const completed = log?.completed ?? false;
    return { habito, date, programado: true, completed, valueNumeric: null, registrado: log != null };
  }

  const valueNumeric = log?.value_numeric ?? null;
  const completed = valueNumeric != null && habito.meta_diaria != null && valueNumeric >= habito.meta_diaria;
  return { habito, date, programado: true, completed, valueNumeric, registrado: valueNumeric != null };
}

export interface Consistencia {
  concluidos: number;
  programados: number;
  percentual: number;
}

export function calcularConsistencia(linhas: Pick<LinhaHabito, "programado" | "completed">[]): Consistencia {
  const programadas = linhas.filter((l) => l.programado);
  const concluidos = programadas.filter((l) => l.completed).length;
  return { concluidos, programados: programadas.length, percentual: programadas.length > 0 ? (concluidos / programadas.length) * 100 : 0 };
}

export interface Streaks {
  atual: number;
  melhor: number;
}

// `linhas` precisa vir ordenada por data ASCENDENTE. Dias não programados
// são "transparentes": nem contam a favor, nem quebram a sequência.
export function calcularStreaks(linhas: Pick<LinhaHabito, "programado" | "completed">[]): Streaks {
  let melhor = 0;
  let corrente = 0;
  for (const l of linhas) {
    if (!l.programado) continue;
    if (l.completed) {
      corrente += 1;
      melhor = Math.max(melhor, corrente);
    } else {
      corrente = 0;
    }
  }

  let atual = 0;
  for (let i = linhas.length - 1; i >= 0; i--) {
    const l = linhas[i];
    if (!l.programado) continue;
    if (!l.completed) break;
    atual += 1;
  }

  return { atual, melhor };
}

export interface ProgressoMeta {
  atual: number;
  alvo: number;
  percentual: number;
}

export function calcularProgressoDeMeta(
  meta: Meta,
  contexto: {
    habitoVinculado?: Habito | null;
    logsDoHabito?: HabitoLog[];
    automaticoIntervalo?: Map<string, ResultadoAutomatico>;
  }
): ProgressoMeta {
  const alvo = meta.target_value;

  if (meta.tipo === "percentual") {
    if (contexto.automaticoIntervalo) {
      let concluidos = 0;
      let total = 0;
      contexto.automaticoIntervalo.forEach((r) => {
        if (r.statusBooleano === "nao_aplicavel" || r.statusBooleano === null) return;
        total += 1;
        if (r.statusBooleano === "concluida") concluidos += 1;
      });
      const percentual = total > 0 ? (concluidos / total) * 100 : 0;
      return { atual: Math.round(percentual), alvo, percentual: Math.min(100, (percentual / alvo) * 100) };
    }
    if (contexto.habitoVinculado && contexto.logsDoHabito) {
      const logsPorData = new Map(contexto.logsDoHabito.map((l) => [l.date, l]));
      const dias = Array.from(logsPorData.keys());
      const linhas = dias.map((d) => montarLinhaDoHabito(contexto.habitoVinculado as Habito, d, logsPorData.get(d) ?? null, null));
      const { concluidos, programados } = calcularConsistencia(linhas);
      const percentual = programados > 0 ? (concluidos / programados) * 100 : 0;
      return { atual: Math.round(percentual), alvo, percentual: Math.min(100, (percentual / alvo) * 100) };
    }
    return { atual: 0, alvo, percentual: 0 };
  }

  let atual = 0;
  if (contexto.automaticoIntervalo) {
    contexto.automaticoIntervalo.forEach((r) => {
      atual += r.valueNumeric ?? 0;
    });
  } else if (contexto.habitoVinculado?.tipo === "boolean") {
    atual = (contexto.logsDoHabito ?? []).filter((l) => l.completed).length;
  } else {
    atual = (contexto.logsDoHabito ?? []).reduce((soma, l) => soma + (l.value_numeric ?? 0), 0);
  }

  return { atual, alvo, percentual: alvo > 0 ? Math.min(100, (atual / alvo) * 100) : 0 };
}

export interface ScoreDoDiaInput {
  consistenciaHojePercentual: number;
  focoHojeHoras: number;
  // Referência pra normalizar o foco em 0-100 — usa a meta_diaria do hábito
  // automático "Horas de foco" se a pessoa configurou um; senão cai numa
  // referência fixa (documentada aqui, nunca escondida).
  metaFocoHorasReferencia: number;
  // null quando não existe plano/prioridade #1 hoje (peso dela é
  // redistribuído pros outros componentes, nunca conta contra).
  prioridadeUmConcluida: boolean | null;
  tarefasConcluidasHoje: number;
}

// "Score do dia" — NÃO é um score de IA/opaco: é uma média ponderada de 4
// números que já aparecem em outros lugares da tela (consistência das
// rotinas, foco profundo vs uma referência, prioridade #1, tarefas
// concluídas), pesos fixos e documentados aqui:
// 35% consistência das rotinas, 30% foco profundo, 20% prioridade #1
// concluída, 15% tarefas concluídas (capado em 5/dia — a 6ª tarefa não vale
// mais que a 5ª).
const PESOS_SCORE = { consistencia: 0.35, foco: 0.3, prioridade: 0.2, tarefas: 0.15 } as const;

export function calcularScoreDoDia(input: ScoreDoDiaInput): number {
  const foco = input.metaFocoHorasReferencia > 0 ? Math.min(100, (input.focoHojeHoras / input.metaFocoHorasReferencia) * 100) : 0;
  const tarefas = Math.min(100, (input.tarefasConcluidasHoje / 5) * 100);
  const prioridade = input.prioridadeUmConcluida == null ? null : input.prioridadeUmConcluida ? 100 : 0;

  const partes =
    prioridade == null
      ? [
          { valor: input.consistenciaHojePercentual, peso: PESOS_SCORE.consistencia / (1 - PESOS_SCORE.prioridade) },
          { valor: foco, peso: PESOS_SCORE.foco / (1 - PESOS_SCORE.prioridade) },
          { valor: tarefas, peso: PESOS_SCORE.tarefas / (1 - PESOS_SCORE.prioridade) },
        ]
      : [
          { valor: input.consistenciaHojePercentual, peso: PESOS_SCORE.consistencia },
          { valor: foco, peso: PESOS_SCORE.foco },
          { valor: prioridade, peso: PESOS_SCORE.prioridade },
          { valor: tarefas, peso: PESOS_SCORE.tarefas },
        ];

  return Math.round(partes.reduce((soma, p) => soma + p.valor * p.peso, 0));
}

// Variação percentual simples pra badge "↑+12%" — null quando não há base
// de comparação (evita "↑Infinity%" saindo de 0).
export function calcularVariacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return Math.round(((atual - anterior) / anterior) * 100);
}
