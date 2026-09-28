import { useCallback, useEffect, useState } from "react";
import { eachDayOfInterval, format, startOfWeek } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { usePerformanceHabits } from "./usePerformanceHabits";
import { buscarLogsDoIntervalo } from "@/lib/performance/PerformanceHabitService";
import { calcularAutomaticoDoIntervalo, type AutomaticKey, type ResultadoAutomatico } from "@/lib/performance/PerformanceAutomaticSources";
import { montarLinhaDoHabito } from "@/lib/performance/PerformanceMetricsService";
import { buscarMetas } from "@/lib/performance/PerformanceGoalService";

// Cards "Semana" da Visão geral (item 10) — consistência média, hábitos
// executados, metas em andamento. Janela: início da semana (segunda) até
// hoje, nunca dias futuros.
export function usePerformanceWeekSummary() {
  const { user } = useAuth();
  const { habitosAtivos, loading: loadingHabitos } = usePerformanceHabits();
  const [consistenciaMedia, setConsistenciaMedia] = useState<number | null>(null);
  const [habitosExecutados, setHabitosExecutados] = useState(0);
  const [metasEmAndamento, setMetasEmAndamento] = useState(0);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user || loadingHabitos) return;
    setLoading(true);
    try {
      const inicioDate = startOfWeek(new Date(), { weekStartsOn: 1 });
      const inicio = format(inicioDate, "yyyy-MM-dd");
      const fim = format(new Date(), "yyyy-MM-dd");
      const dias = eachDayOfInterval({ start: inicioDate, end: new Date() }).map((d) => format(d, "yyyy-MM-dd"));

      const manuais = habitosAtivos.filter((h) => h.source === "manual");
      const automaticos = habitosAtivos.filter((h) => h.source === "automatic");

      const logs = manuais.length > 0 ? await buscarLogsDoIntervalo(user.id, inicio, fim) : [];
      const logsPorChave = new Map(logs.map((l) => [`${l.habit_id}:${l.date}`, l]));

      const automaticoPorHabito = new Map<string, Map<string, ResultadoAutomatico>>();
      for (const h of automaticos) {
        const mapa = await calcularAutomaticoDoIntervalo(h.automatic_key as AutomaticKey, user.id, inicio, fim);
        automaticoPorHabito.set(h.id, mapa);
      }

      let totalConcluidos = 0;
      let totalProgramados = 0;
      habitosAtivos.forEach((h) => {
        dias.forEach((d) => {
          const log = logsPorChave.get(`${h.id}:${d}`) ?? null;
          const automatico = automaticoPorHabito.get(h.id)?.get(d) ?? null;
          const linha = montarLinhaDoHabito(h, d, log, automatico);
          if (linha.programado) {
            totalProgramados += 1;
            if (linha.completed) totalConcluidos += 1;
          }
        });
      });

      setConsistenciaMedia(totalProgramados > 0 ? (totalConcluidos / totalProgramados) * 100 : null);
      setHabitosExecutados(totalConcluidos);

      const metas = await buscarMetas(user.id);
      setMetasEmAndamento(metas.filter((m) => m.ativo).length);
    } finally {
      setLoading(false);
    }
  }, [user, loadingHabitos, habitosAtivos]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { consistenciaMedia, habitosExecutados, metasEmAndamento, loading: loading || loadingHabitos, refetch: carregar };
}
