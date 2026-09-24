import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import type { Tables } from "@/integrations/supabase/types";

export type JarvisMensagem = Tables<"jarvis_mensagens">;
export type JarvisMensagemTipo = "motivacao" | "alerta" | "retorno_foco" | "pausa" | "conclusao";

export interface JarvisMensagemInput {
  mensagem: string;
  tipo: JarvisMensagemTipo;
  ativo: boolean;
  intervaloMinimoMinutos: number;
  contexto: string | null;
}

// CRUD completo (usado por Administração → Jarvis) + Realtime — o Jarvis
// (useAssistantCobranca, via Assistant.tsx) lê a mesma lista já carregada
// aqui, sem outra assinatura de canal pra mesma tabela.
export function useJarvisMensagens() {
  const { user } = useAuth();
  const [mensagens, setMensagens] = useState<JarvisMensagem[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("jarvis_mensagens")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setMensagens(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!user?.id) return;
    const canal = supabase
      .channel(`jarvis-mensagens-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jarvis_mensagens", filter: `user_id=eq.${user.id}` },
        () => carregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [user?.id, carregar]);

  const criar = useCallback(async (input: JarvisMensagemInput) => {
    const { error } = await supabase.from("jarvis_mensagens").insert({
      mensagem: input.mensagem,
      tipo: input.tipo,
      ativo: input.ativo,
      intervalo_minimo_minutos: input.intervaloMinimoMinutos,
      contexto: input.contexto,
    });
    if (error) throw error;
    await carregar();
  }, [carregar]);

  const atualizar = useCallback(async (id: string, input: JarvisMensagemInput) => {
    const { error } = await supabase
      .from("jarvis_mensagens")
      .update({
        mensagem: input.mensagem,
        tipo: input.tipo,
        ativo: input.ativo,
        intervalo_minimo_minutos: input.intervaloMinimoMinutos,
        contexto: input.contexto,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
    await carregar();
  }, [carregar]);

  const alternarAtivo = useCallback(async (id: string, ativo: boolean) => {
    setMensagens((prev) => prev.map((m) => (m.id === id ? { ...m, ativo } : m)));
    const { error } = await supabase.from("jarvis_mensagens").update({ ativo }).eq("id", id);
    if (error) await carregar();
  }, [carregar]);

  const excluir = useCallback(async (id: string) => {
    const { error } = await supabase.from("jarvis_mensagens").delete().eq("id", id);
    if (error) throw error;
    await carregar();
  }, [carregar]);

  return { mensagens, loading, criar, atualizar, alternarAtivo, excluir, refetch: carregar };
}

// Seletor puro (sem estado) — usado pelo Jarvis pra sortear entre as
// mensagens ativas de um tipo, sobre a mesma lista já carregada acima.
export function mensagensAtivasPorTipo(mensagens: JarvisMensagem[], tipo: JarvisMensagemTipo): JarvisMensagem[] {
  return mensagens.filter((m) => m.ativo && m.tipo === tipo);
}
