import { useCallback, useEffect, useMemo, useState } from "react";
import { endOfMonth, format, startOfMonth, subDays, subMonths } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { buscarLogsDoIntervalo, buscarMeta, type SleepLog } from "@/lib/sleep/SleepService";
import { calcularMetricasDeSono, type MetricasSono } from "@/lib/sleep/SleepMetricsService";
import type { FiltroHistorico, PeriodoPersonalizado } from "./usePerformanceHistory";

// Mesma lógica de intervalo de usePerformanceHistory.ts — duplicada de
// propósito (função pura de poucas linhas; não vale acoplar os dois hooks
// só por isso).
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

// Histórico de sono (item 8) — reaproveita o MESMO enum de filtro de
// usePerformanceHistory.ts, pra ficar no mesmo controle de filtro na UI.
export function useSleepHistory(filtro: FiltroHistorico, personalizado?: PeriodoPersonalizado) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<SleepLog[]>([]);
  const [metaMinutos, setMetaMinutos] = useState(450);
  const [loading, setLoading] = useState(true);

  const { inicioStr, fimStr } = useMemo(() => calcularIntervalo(filtro, personalizado), [filtro, personalizado]);

  const carregar = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [logsIntervalo, meta] = await Promise.all([buscarLogsDoIntervalo(user.id, inicioStr, fimStr), buscarMeta(user.id)]);
      setLogs(logsIntervalo);
      setMetaMinutos(meta?.target_sleep_minutes ?? 450);
    } finally {
      setLoading(false);
    }
  }, [user, inicioStr, fimStr]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const metricas: MetricasSono = useMemo(() => calcularMetricasDeSono(logs, metaMinutos), [logs, metaMinutos]);

  return { logs, metricas, metaMinutos, loading, inicioStr, fimStr, refetch: carregar };
}
