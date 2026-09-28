import { useCallback, useEffect, useState } from "react";
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { usePerformanceHabits } from "./usePerformanceHabits";
import { buscarLogsDoIntervalo } from "@/lib/performance/PerformanceHabitService";
import { calcularAutomaticoDoIntervalo, type AutomaticKey, type ResultadoAutomatico } from "@/lib/performance/PerformanceAutomaticSources";
import { montarLinhaDoHabito, type LinhaHabito } from "@/lib/performance/PerformanceMetricsService";

// Grid/circular mensal (item 11/12) — uma "coluna" de LinhaHabito por
// hábito, cobrindo o mês inteiro, calculada com UMA query por chave
// automática (não 30 por hábito) via calcularAutomaticoDoIntervalo.
export function usePerformanceMonth(mesRef: Date) {
  const { user } = useAuth();
  const { habitosAtivos, loading: loadingHabitos } = usePerformanceHabits();
  const [linhasPorHabito, setLinhasPorHabito] = useState<Map<string, LinhaHabito[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const inicioStr = format(startOfMonth(mesRef), "yyyy-MM-dd");
  const fimStr = format(endOfMonth(mesRef), "yyyy-MM-dd");
  const dias = eachDayOfInterval({ start: startOfMonth(mesRef), end: endOfMonth(mesRef) }).map((d) => format(d, "yyyy-MM-dd"));

  const carregar = useCallback(async () => {
    if (!user || loadingHabitos) return;
    setLoading(true);
    try {
      const manuais = habitosAtivos.filter((h) => h.source === "manual");
      const automaticos = habitosAtivos.filter((h) => h.source === "automatic");

      const logs = manuais.length > 0 ? await buscarLogsDoIntervalo(user.id, inicioStr, fimStr) : [];
      const logsPorChave = new Map(logs.map((l) => [`${l.habit_id}:${l.date}`, l]));

      const automaticoPorHabito = new Map<string, Map<string, ResultadoAutomatico>>();
      for (const h of automaticos) {
        const mapa = await calcularAutomaticoDoIntervalo(h.automatic_key as AutomaticKey, user.id, inicioStr, fimStr);
        automaticoPorHabito.set(h.id, mapa);
      }

      const novoMapa = new Map<string, LinhaHabito[]>();
      habitosAtivos.forEach((h) => {
        const linhas = dias.map((d) =>
          montarLinhaDoHabito(h, d, logsPorChave.get(`${h.id}:${d}`) ?? null, automaticoPorHabito.get(h.id)?.get(d) ?? null)
        );
        novoMapa.set(h.id, linhas);
      });
      setLinhasPorHabito(novoMapa);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadingHabitos, habitosAtivos, inicioStr, fimStr]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { habitos: habitosAtivos, dias, linhasPorHabito, loading: loading || loadingHabitos, refetch: carregar };
}
