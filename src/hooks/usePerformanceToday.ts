import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { usePerformanceHabits } from "./usePerformanceHabits";
import { buscarLogsDoDia, salvarLog } from "@/lib/performance/PerformanceHabitService";
import { calcularAutomaticoDoDia, type AutomaticKey } from "@/lib/performance/PerformanceAutomaticSources";
import { habitoProgramadoNoDia, montarLinhaDoHabito, type LinhaHabito } from "@/lib/performance/PerformanceMetricsService";

// Hábitos programados hoje já mesclados com log/automático (item 6 do
// pedido) — consumido pela aba "Visão geral" da Performance E pela seção
// "ROTINAS" do Jarvis.
export function usePerformanceToday() {
  const { user } = useAuth();
  const { habitosAtivos, loading: loadingHabitos } = usePerformanceHabits();
  const [linhas, setLinhas] = useState<LinhaHabito[]>([]);
  const [loading, setLoading] = useState(true);
  const dataStr = format(new Date(), "yyyy-MM-dd");

  const carregar = useCallback(async () => {
    if (!user || loadingHabitos) return;
    setLoading(true);
    try {
      const programados = habitosAtivos.filter((h) => (h.source === "manual" ? habitoProgramadoNoDia(h, dataStr) : true));
      const manuais = programados.filter((h) => h.source === "manual");
      const automaticos = programados.filter((h) => h.source === "automatic");

      const logs = manuais.length > 0 ? await buscarLogsDoDia(user.id, dataStr) : [];
      const logsPorHabito = new Map(logs.map((l) => [l.habit_id, l]));

      const resultadosAutomaticos = await Promise.all(
        automaticos.map((h) => calcularAutomaticoDoDia(h.automatic_key as AutomaticKey, user.id, dataStr))
      );
      const automaticoPorHabito = new Map(automaticos.map((h, i) => [h.id, resultadosAutomaticos[i]]));

      const novasLinhas = programados
        .map((h) => montarLinhaDoHabito(h, dataStr, logsPorHabito.get(h.id) ?? null, automaticoPorHabito.get(h.id) ?? null))
        .sort((a, b) => a.habito.ordem - b.habito.ordem);
      setLinhas(novasLinhas);
    } finally {
      setLoading(false);
    }
  }, [user, loadingHabitos, habitosAtivos, dataStr]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const registrarBooleano = useCallback(async (habitId: string, completed: boolean) => {
    if (!user) return;
    await salvarLog(user.id, habitId, dataStr, { completed });
    void carregar();
  }, [user, dataStr, carregar]);

  const registrarNumero = useCallback(async (habitId: string, valueNumeric: number) => {
    if (!user) return;
    await salvarLog(user.id, habitId, dataStr, { valueNumeric });
    void carregar();
  }, [user, dataStr, carregar]);

  const linhasProgramadas = linhas.filter((l) => l.programado);
  const concluidasCount = linhasProgramadas.filter((l) => l.completed).length;

  return {
    linhas,
    linhasProgramadas,
    loading: loading || loadingHabitos,
    refetch: carregar,
    registrarBooleano,
    registrarNumero,
    concluidasCount,
    previstasCount: linhasProgramadas.length,
    dataStr,
  };
}
