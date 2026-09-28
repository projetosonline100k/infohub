import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import {
  buscarHabitos,
  buscarPilares,
  criarHabito,
  criarPilar,
  garantirPilaresPadrao,
  atualizarHabito,
  atualizarPilar,
  excluirPilar,
  type AtualizarHabitoInput,
  type CriarHabitoInput,
  type Habito,
  type Pilar,
} from "@/lib/performance/PerformanceHabitService";

// Pilares + hábitos do usuário, com Realtime (registrar um hábito no Jarvis
// precisa refletir na página Performance sem F5, e vice-versa).
export function usePerformanceHabits() {
  const { user } = useAuth();
  const [pilares, setPilares] = useState<Pilar[]>([]);
  const [habitos, setHabitos] = useState<Habito[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [p, h] = await Promise.all([buscarPilares(user.id), buscarHabitos(user.id)]);
      setPilares(p);
      setHabitos(h);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!user) return;
    const canal = supabase
      .channel(`performance-habits-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "performance_habits", filter: `user_id=eq.${user.id}` }, () => void carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [user, carregar]);

  const habitosAtivos = useMemo(() => habitos.filter((h) => h.ativo), [habitos]);

  const criar = useCallback(async (input: CriarHabitoInput) => {
    if (!user) throw new Error("Sem usuário autenticado");
    const novo = await criarHabito(user.id, input);
    setHabitos((prev) => [...prev, novo]);
    return novo;
  }, [user]);

  const atualizar = useCallback(async (id: string, patch: AtualizarHabitoInput) => {
    const atualizado = await atualizarHabito(id, patch);
    setHabitos((prev) => prev.map((h) => (h.id === atualizado.id ? atualizado : h)));
    return atualizado;
  }, []);

  const arquivar = useCallback((id: string, ativo: boolean) => atualizar(id, { ativo }), [atualizar]);

  const criarNovoPilar = useCallback(async (nome: string) => {
    if (!user) throw new Error("Sem usuário autenticado");
    const novo = await criarPilar(user.id, nome, pilares.length);
    setPilares((prev) => [...prev, novo]);
    return novo;
  }, [user, pilares.length]);

  const renomearPilar = useCallback(async (id: string, nome: string) => {
    const atualizado = await atualizarPilar(id, { nome });
    setPilares((prev) => prev.map((p) => (p.id === atualizado.id ? atualizado : p)));
    return atualizado;
  }, []);

  const removerPilar = useCallback(async (id: string) => {
    await excluirPilar(id);
    setPilares((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Só chamado por uma ação explícita (onboarding / "+ novo pilar" com a
  // lista vazia) — nunca sozinho ao montar o hook.
  const garantirPadrao = useCallback(async () => {
    if (!user) return [];
    const lista = await garantirPilaresPadrao(user.id);
    setPilares(lista);
    return lista;
  }, [user]);

  return {
    pilares,
    habitos,
    habitosAtivos,
    loading,
    refetch: carregar,
    criar,
    atualizar,
    arquivar,
    criarNovoPilar,
    renomearPilar,
    removerPilar,
    garantirPadrao,
  };
}
