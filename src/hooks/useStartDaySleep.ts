import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { buscarLogDoDia, salvarLog, type SalvarSleepLogInput, type SleepLog } from "@/lib/sleep/SleepService";

// Registro de sono de hoje — checado em paralelo com flow.abrir() (mesma
// correção #9 do plano, já usada em useEndOfDayRoutines.ts), pra
// StartDayFlow.tsx saber, sem esperar um novo round-trip, se deve entrar no
// passo "Como foi sua noite?" ou pular direto pro resto do ritual.
export function useStartDaySleep() {
  const { user } = useAuth();
  const [log, setLog] = useState<SleepLog | null>(null);
  const [loading, setLoading] = useState(true);
  const carregamentoRef = useRef<Promise<void> | null>(null);
  const dataStr = format(new Date(), "yyyy-MM-dd");

  const carregar = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const existente = await buscarLogDoDia(user.id, dataStr);
      setLog(existente);
    } finally {
      setLoading(false);
    }
  }, [user, dataStr]);

  useEffect(() => {
    carregamentoRef.current = carregar();
  }, [carregar]);

  const aguardarCarregamento = useCallback(async () => {
    if (carregamentoRef.current) await carregamentoRef.current;
  }, []);

  const registrar = useCallback(
    async (input: SalvarSleepLogInput) => {
      if (!user) throw new Error("Sem usuário autenticado");
      const salvo = await salvarLog(user.id, dataStr, input);
      setLog(salvo);
      return salvo;
    },
    [user, dataStr]
  );

  return { log, loading, temRegistro: !!log, aguardarCarregamento, registrar };
}
