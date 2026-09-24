import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface NotaPasta {
  id: string;
  nome: string;
  ordem: number;
}

// Pastas de notas (item 2) — mesma tabela `pastas_atividade` que Atividades
// e Documentos já usam pras próprias pastas, só com `origem: "notas"`
// (coluna pensada exatamente pra isolar listas por feature sobre a mesma
// tabela — ver migração 20260921000000_pastas_atividade_origem.sql). Nada
// de tabela nova.
export function useNotasPastas(clienteId: string | null) {
  const [pastas, setPastas] = useState<NotaPasta[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clienteId) {
      setPastas([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("pastas_atividade")
      .select("id, nome, ordem")
      .eq("cliente_id", clienteId)
      .eq("origem", "notas")
      .is("deleted_at", null)
      .order("ordem", { ascending: true });
    if (!error) setPastas(data || []);
    setLoading(false);
  }, [clienteId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criarPasta = useCallback(async (nome: string) => {
    if (!clienteId) return;
    const { data, error } = await supabase
      .from("pastas_atividade")
      .insert({ nome, cliente_id: clienteId, ordem: pastas.length, origem: "notas" })
      .select("id, nome, ordem")
      .single();
    if (error || !data) throw error || new Error("Falha ao criar pasta");
    setPastas((prev) => [...prev, data]);
    return data;
  }, [clienteId, pastas.length]);

  const renomearPasta = useCallback(async (id: string, novoNome: string) => {
    setPastas((prev) => prev.map((p) => (p.id === id ? { ...p, nome: novoNome } : p)));
    const { error } = await supabase.from("pastas_atividade").update({ nome: novoNome }).eq("id", id);
    if (error) await carregar();
  }, [carregar]);

  const excluirPasta = useCallback(async (id: string) => {
    setPastas((prev) => prev.filter((p) => p.id !== id));
    const { error } = await supabase
      .from("pastas_atividade")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) await carregar();
  }, [carregar]);

  return { pastas, loading, criarPasta, renomearPasta, excluirPasta, refetch: carregar };
}
