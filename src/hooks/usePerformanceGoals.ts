import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { usePerformanceHabits } from "./usePerformanceHabits";
import { buscarLogsDoIntervalo } from "@/lib/performance/PerformanceHabitService";
import { calcularAutomaticoDoIntervalo, type AutomaticKey } from "@/lib/performance/PerformanceAutomaticSources";
import { calcularProgressoDeMeta, type ProgressoMeta } from "@/lib/performance/PerformanceMetricsService";
import {
  atualizarMeta as atualizarMetaService,
  buscarMetas,
  criarMeta,
  excluirMeta as excluirMetaService,
  type AtualizarMetaInput,
  type CriarMetaInput,
  type Meta,
} from "@/lib/performance/PerformanceGoalService";

// Metas + progresso já calculado (item 9 do pedido) — vinculado a um hábito
// manual (soma/conta os logs do período) ou a uma fonte automática (soma/
// conta via PerformanceAutomaticSources), nunca as duas.
export function usePerformanceGoals() {
  const { user } = useAuth();
  const { habitos } = usePerformanceHabits();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [progressos, setProgressos] = useState<Map<string, ProgressoMeta>>(new Map());
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const lista = await buscarMetas(user.id);
      setMetas(lista);

      const novosProgressos = new Map<string, ProgressoMeta>();
      await Promise.all(
        lista
          .filter((m) => m.ativo)
          .map(async (meta) => {
            if (meta.automatic_source) {
              const mapa = await calcularAutomaticoDoIntervalo(meta.automatic_source as AutomaticKey, user.id, meta.start_date, meta.end_date);
              novosProgressos.set(meta.id, calcularProgressoDeMeta(meta, { automaticoIntervalo: mapa }));
              return;
            }
            if (meta.linked_habit_id) {
              const habitoVinculado = habitos.find((h) => h.id === meta.linked_habit_id) ?? null;
              const logs = await buscarLogsDoIntervalo(user.id, meta.start_date, meta.end_date);
              const logsDoHabito = logs.filter((l) => l.habit_id === meta.linked_habit_id);
              novosProgressos.set(meta.id, calcularProgressoDeMeta(meta, { habitoVinculado, logsDoHabito }));
              return;
            }
            novosProgressos.set(meta.id, { atual: 0, alvo: meta.target_value, percentual: 0 });
          })
      );
      setProgressos(novosProgressos);
    } finally {
      setLoading(false);
    }
  }, [user, habitos]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const criar = useCallback(async (input: CriarMetaInput) => {
    if (!user) throw new Error("Sem usuário autenticado");
    const nova = await criarMeta(user.id, input);
    setMetas((prev) => [nova, ...prev]);
    void carregar();
    return nova;
  }, [user, carregar]);

  const atualizar = useCallback(async (id: string, patch: AtualizarMetaInput) => {
    const atualizada = await atualizarMetaService(id, patch);
    setMetas((prev) => prev.map((m) => (m.id === atualizada.id ? atualizada : m)));
    void carregar();
    return atualizada;
  }, [carregar]);

  const excluir = useCallback(async (id: string) => {
    await excluirMetaService(id);
    setMetas((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { metas, progressos, loading, refetch: carregar, criar, atualizar, excluir };
}
