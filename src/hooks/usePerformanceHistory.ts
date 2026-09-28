import { useCallback, useEffect, useMemo, useState } from "react";
import { eachDayOfInterval, endOfMonth, format, parseISO, startOfMonth, subDays, subMonths } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { usePerformanceHabits } from "./usePerformanceHabits";
import { buscarLogsDoIntervalo } from "@/lib/performance/PerformanceHabitService";
import { calcularAutomaticoDoIntervalo, type AutomaticKey, type ResultadoAutomatico } from "@/lib/performance/PerformanceAutomaticSources";
import { calcularConsistencia, calcularStreaks, montarLinhaDoHabito, type Consistencia, type Streaks } from "@/lib/performance/PerformanceMetricsService";
import type { Habito } from "@/lib/performance/PerformanceHabitService";

export type FiltroHistorico = "7dias" | "30dias" | "este_mes" | "mes_anterior" | "personalizado";

export interface PeriodoPersonalizado {
  inicio: string;
  fim: string;
}

export interface EstatisticaHabito {
  habito: Habito;
  total: number;
  media: number | null;
  consistencia: Consistencia;
  streaks: Streaks;
}

function calcularIntervalo(filtro: FiltroHistorico, personalizado?: PeriodoPersonalizado) {
  const hoje = new Date();
  if (filtro === "7dias") return { inicioStr: format(subDays(hoje, 6), "yyyy-MM-dd"), fimStr: format(hoje, "yyyy-MM-dd") };
  if (filtro === "30dias") return { inicioStr: format(subDays(hoje, 29), "yyyy-MM-dd"), fimStr: format(hoje, "yyyy-MM-dd") };
  if (filtro === "este_mes") return { inicioStr: format(startOfMonth(hoje), "yyyy-MM-dd"), fimStr: format(hoje, "yyyy-MM-dd") };
  if (filtro === "mes_anterior") {
    const mesPassado = subMonths(hoje, 1);
    return { inicioStr: format(startOfMonth(mesPassado), "yyyy-MM-dd"), fimStr: format(endOfMonth(mesPassado), "yyyy-MM-dd") };
  }
  const inicioStr = personalizado?.inicio || format(subDays(hoje, 6), "yyyy-MM-dd");
  const fimStr = personalizado?.fim || format(hoje, "yyyy-MM-dd");
  return { inicioStr, fimStr };
}

// Histórico (item 14) — total/média/consistência/streaks por hábito, num
// período filtrável. Nunca conta dia futuro (calcularIntervalo já limita a
// "hoje" como teto pros filtros relativos).
export function usePerformanceHistory(filtro: FiltroHistorico, personalizado?: PeriodoPersonalizado) {
  const { user } = useAuth();
  const { habitosAtivos, loading: loadingHabitos } = usePerformanceHabits();
  const [estatisticas, setEstatisticas] = useState<EstatisticaHabito[]>([]);
  const [loading, setLoading] = useState(true);

  const { inicioStr, fimStr } = useMemo(() => calcularIntervalo(filtro, personalizado), [filtro, personalizado]);

  const carregar = useCallback(async () => {
    if (!user || loadingHabitos) return;
    setLoading(true);
    try {
      const dias = eachDayOfInterval({ start: parseISO(inicioStr), end: parseISO(fimStr) }).map((d) => format(d, "yyyy-MM-dd"));
      const manuais = habitosAtivos.filter((h) => h.source === "manual");
      const automaticos = habitosAtivos.filter((h) => h.source === "automatic");

      const logs = manuais.length > 0 ? await buscarLogsDoIntervalo(user.id, inicioStr, fimStr) : [];
      const logsPorChave = new Map(logs.map((l) => [`${l.habit_id}:${l.date}`, l]));

      const automaticoPorHabito = new Map<string, Map<string, ResultadoAutomatico>>();
      for (const h of automaticos) {
        automaticoPorHabito.set(h.id, await calcularAutomaticoDoIntervalo(h.automatic_key as AutomaticKey, user.id, inicioStr, fimStr));
      }

      const novasEstatisticas = habitosAtivos.map((h) => {
        const linhas = dias.map((d) =>
          montarLinhaDoHabito(h, d, logsPorChave.get(`${h.id}:${d}`) ?? null, automaticoPorHabito.get(h.id)?.get(d) ?? null)
        );
        const consistencia = calcularConsistencia(linhas);
        const streaks = calcularStreaks(linhas);
        const programadas = linhas.filter((l) => l.programado);
        const total = h.tipo === "boolean" ? consistencia.concluidos : programadas.reduce((s, l) => s + (l.valueNumeric ?? 0), 0);
        const media = h.tipo === "boolean" ? null : programadas.length > 0 ? total / programadas.length : null;
        return { habito: h, total, media, consistencia, streaks };
      });
      setEstatisticas(novasEstatisticas);
    } finally {
      setLoading(false);
    }
  }, [user, loadingHabitos, habitosAtivos, inicioStr, fimStr]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { estatisticas, loading: loading || loadingHabitos, inicioStr, fimStr };
}
