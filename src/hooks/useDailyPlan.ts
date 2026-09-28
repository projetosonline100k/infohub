import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { buscarProgressoDoDia, type AtividadeDoPlano, type PlanoDiario } from "@/lib/productivity/DailyPlanService";

// Plano do dia (80/20 + prioridade #1) + progresso — consumido por
// Assistant.tsx (cobrança/"o que faço agora"), AssistantHojeTab ("Foco de
// hoje") e o Dashboard. Canal Realtime em daily_plans (a linha de resumo);
// daily_plan_activities e o `concluida` de cada atividade não têm Realtime
// próprio aqui — refetch() cobre os dois (chamado depois de concluir uma
// tarefa, ver Assistant.tsx).
export function useDailyPlan() {
  const { user } = useAuth();
  const [plano, setPlano] = useState<PlanoDiario | null>(null);
  const [atividades, setAtividades] = useState<AtividadeDoPlano[]>([]);
  const [loading, setLoading] = useState(true);

  const dataStr = format(new Date(), "yyyy-MM-dd");

  const carregar = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const progresso = await buscarProgressoDoDia(user.id, dataStr);
      setPlano(progresso?.plano ?? null);
      setAtividades(progresso?.atividades ?? []);
    } catch {
      setPlano(null);
      setAtividades([]);
    } finally {
      setLoading(false);
    }
  }, [user, dataStr]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!user) return;
    const canal = supabase
      .channel(`daily-plans-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_plans", filter: `user_id=eq.${user.id}` },
        () => void carregar()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [user, carregar]);

  const prioridadeUm = plano?.main_priority_activity_id
    ? atividades.find((a) => a.id === plano.main_priority_activity_id) ?? null
    : null;
  const concluidasCount = atividades.filter((a) => a.concluida).length;

  return {
    plano,
    atividades,
    prioridadeUm,
    concluidasCount,
    totalCount: atividades.length,
    loading,
    refetch: carregar,
    dataStr,
  };
}
