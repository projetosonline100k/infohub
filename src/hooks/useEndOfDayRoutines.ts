import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { buscarHabitos, buscarLogsDoDia, salvarLog } from "@/lib/performance/PerformanceHabitService";
import { habitoProgramadoNoDia, montarLinhaDoHabito, type LinhaHabito } from "@/lib/performance/PerformanceMetricsService";

export interface RespostaRotina {
  habitId: string;
  completed?: boolean;
  valueNumeric?: number;
}

// Hábitos MANUAIS programados hoje e ainda sem log (item 18 do pedido) —
// automáticos ficam de fora por completo (já visíveis em Jarvis/
// Performance; perguntar de novo, mesmo que só como leitura, poluiria o
// ritual). Busca dispara ao montar — o mesmo momento em que EndOfDayFlow.tsx
// chama flow.abrir(), então por ora que a pessoa responde as 8 perguntas
// isto já está pronto (correção #9: nunca só na hora de clicar "Concluir").
export function useEndOfDayRoutines() {
  const { user } = useAuth();
  const [pendentes, setPendentes] = useState<LinhaHabito[]>([]);
  const [loading, setLoading] = useState(true);
  const [respostas, setRespostas] = useState<Map<string, RespostaRotina>>(new Map());
  const carregamentoRef = useRef<Promise<void> | null>(null);
  const dataStr = format(new Date(), "yyyy-MM-dd");

  const carregar = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const habitos = await buscarHabitos(user.id);
      const manuaisProgramados = habitos.filter((h) => h.ativo && h.source === "manual" && habitoProgramadoNoDia(h, dataStr));
      if (manuaisProgramados.length === 0) {
        setPendentes([]);
        return;
      }
      const logs = await buscarLogsDoDia(user.id, dataStr);
      const logsPorHabito = new Map(logs.map((l) => [l.habit_id, l]));
      const linhas = manuaisProgramados
        .map((h) => montarLinhaDoHabito(h, dataStr, logsPorHabito.get(h.id) ?? null, null))
        // Já registrado hoje (independente de ter batido a meta) não pergunta de novo.
        .filter((l) => !l.registrado);
      setPendentes(linhas);
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

  const responderBooleano = useCallback((habitId: string, completed: boolean) => {
    setRespostas((prev) => new Map(prev).set(habitId, { habitId, completed }));
  }, []);

  const responderNumero = useCallback((habitId: string, valueNumeric: number) => {
    setRespostas((prev) => new Map(prev).set(habitId, { habitId, valueNumeric }));
  }, []);

  // Tudo opcional/pulável — só grava o que a pessoa de fato respondeu.
  const salvarTudo = useCallback(async () => {
    if (!user) return;
    const entradas = Array.from(respostas.values());
    await Promise.all(entradas.map((r) => salvarLog(user.id, r.habitId, dataStr, { completed: r.completed, valueNumeric: r.valueNumeric })));
  }, [user, respostas, dataStr]);

  return {
    pendentes,
    loading,
    temPendencias: pendentes.length > 0,
    aguardarCarregamento,
    respostas,
    responderBooleano,
    responderNumero,
    salvarTudo,
  };
}
