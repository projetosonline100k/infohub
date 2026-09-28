import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { useJarvisConfig } from "@/hooks/useJarvisConfig";
import { buscarHistorico, type RelatorioDiario } from "@/lib/productivity/DailyReportService";
import { calcularMetricasDoDia, type MetricasAutomaticasDia } from "@/lib/productivity/DailyProductivityMetrics";
import { gerarInsights } from "@/lib/productivity/ProductivityInsightsService";

// Dashboard "Produtividade" (itens 9-12) — hoje (relatório se já existir,
// senão métricas ao vivo calculadas na hora) + últimos 7 dias + insights
// (usa uma janela de 30 dias pra ter amostra melhor que os insights
// precisam, mesmo mostrando só 7 no resumo). Supabase é a fonte de
// verdade; Realtime cobre "Dashboard deve atualizar sem F5" (item 16) —
// mesmo padrão de canal já usado em useJarvisConfig.ts.
export function useProductivityDashboard() {
  const { user } = useAuth();
  const { monitorarAppAtivo } = useJarvisConfig();
  const [relatorioHoje, setRelatorioHoje] = useState<RelatorioDiario | null>(null);
  const [metricasHojeAoVivo, setMetricasHojeAoVivo] = useState<MetricasAutomaticasDia | null>(null);
  const [historico30dias, setHistorico30dias] = useState<RelatorioDiario[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const hoje = format(new Date(), "yyyy-MM-dd");
    const historico = await buscarHistorico(user.id, "30dias");
    setHistorico30dias(historico);
    const relHoje = historico.find((r) => r.date === hoje) ?? null;
    setRelatorioHoje(relHoje);

    if (!relHoje) {
      const inicio = startOfDay(new Date());
      const fim = addDays(inicio, 1);
      try {
        const metricas = await calcularMetricasDoDia(hoje, inicio.toISOString(), fim.toISOString(), monitorarAppAtivo);
        setMetricasHojeAoVivo(metricas);
      } catch {
        setMetricasHojeAoVivo(null);
      }
    } else {
      setMetricasHojeAoVivo(null);
    }
    setLoading(false);
  }, [user, monitorarAppAtivo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!user) return;
    const canal = supabase
      .channel(`daily-productivity-reports-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_productivity_reports", filter: `user_id=eq.${user.id}` },
        () => carregar()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [user, carregar]);

  const ultimos7dias = useMemo(() => historico30dias.slice(0, 7), [historico30dias]);

  const mediasUltimos7Dias = useMemo(() => {
    if (ultimos7dias.length === 0) return null;
    const soma = (fn: (r: RelatorioDiario) => number) => ultimos7dias.reduce((s, r) => s + fn(r), 0);
    const n = ultimos7dias.length;
    return {
      diasComRelatorio: n,
      mediaProdutividade: soma((r) => r.productivity_score) / n,
      mediaFoco: soma((r) => r.focus_score) / n,
      mediaEnergia: soma((r) => r.energy_score) / n,
      horasTotaisFocadas: soma((r) => r.focused_seconds) / 3600,
      tarefasConcluidas: soma((r) => r.completed_tasks),
      distracaoTotalSegundos: soma((r) => r.distraction_seconds),
      maiorSessaoSegundos: Math.max(...ultimos7dias.map((r) => r.longest_focus_seconds)),
      // Automaticamente mais precisa desde "Começar o dia": quando existe
      // plano, completed_main_priority é derivado da atividade real (ver
      // useEndOfDayFlow.finalizar) em vez de uma resposta manual solta.
      percentualPrioridadeConcluida: (ultimos7dias.filter((r) => r.completed_main_priority).length / n) * 100,
      // Aderência ao plano (Começar o dia): % médio do 80/20 concluído nos
      // dias em que existiu um plano — dias sem plano não contam (não é
      // "falha", é ausência de dado).
      aderenciaPlanoPercentual: (() => {
        const comPlano = ultimos7dias.filter((r) => (r.eighty_twenty_total_count ?? 0) > 0);
        if (comPlano.length === 0) return null;
        const soma = comPlano.reduce((s, r) => s + (r.eighty_twenty_completed_count ?? 0) / (r.eighty_twenty_total_count as number), 0);
        return (soma / comPlano.length) * 100;
      })(),
      porDia: [...ultimos7dias].reverse().map((r) => ({ data: r.date, nota: r.productivity_score })),
    };
  }, [ultimos7dias]);

  const insights = useMemo(() => gerarInsights(historico30dias), [historico30dias]);

  return {
    loading,
    relatorioHoje,
    metricasHojeAoVivo,
    mediasUltimos7Dias,
    insights,
    refetch: carregar,
  };
}
