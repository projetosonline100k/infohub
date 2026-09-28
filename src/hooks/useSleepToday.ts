import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import {
  buscarLogDoDia,
  buscarMeta,
  salvarLog,
  salvarMeta,
  type SalvarSleepGoalInput,
  type SalvarSleepLogInput,
  type SleepGoal,
  type SleepLog,
} from "@/lib/sleep/SleepService";

// Log de hoje + meta, com Realtime em sleep_logs (Jarvis registrando
// precisa refletir na Visão geral sem F5, e vice-versa — item de teste 9).
export function useSleepToday() {
  const { user } = useAuth();
  const [log, setLog] = useState<SleepLog | null>(null);
  const [meta, setMeta] = useState<SleepGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const dataStr = format(new Date(), "yyyy-MM-dd");

  const carregar = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [logHoje, metaAtual] = await Promise.all([buscarLogDoDia(user.id, dataStr), buscarMeta(user.id)]);
      setLog(logHoje);
      setMeta(metaAtual);
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
      .channel(`sleep-logs-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sleep_logs", filter: `user_id=eq.${user.id}` }, () => void carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [user, carregar]);

  const registrar = useCallback(
    async (input: SalvarSleepLogInput) => {
      if (!user) throw new Error("Sem usuário autenticado");
      const salvo = await salvarLog(user.id, dataStr, input);
      setLog(salvo);
      return salvo;
    },
    [user, dataStr]
  );

  const salvarMetaSono = useCallback(
    async (input: SalvarSleepGoalInput) => {
      if (!user) throw new Error("Sem usuário autenticado");
      const salvo = await salvarMeta(user.id, input);
      setMeta(salvo);
      return salvo;
    },
    [user]
  );

  return { log, meta, loading, refetch: carregar, registrar, salvarMeta: salvarMetaSono, dataStr };
}
