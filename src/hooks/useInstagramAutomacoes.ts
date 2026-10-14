import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import type { Database } from "@/integrations/supabase/types";

export type InstagramAutomacao = Database["public"]["Tables"]["instagram_automacoes"]["Row"];
export type InstagramDisparo = Database["public"]["Tables"]["instagram_automacao_disparos"]["Row"];
export type InstagramConexao = Database["public"]["Functions"]["instagram_conexao_status"]["Returns"][number];
export type AutomacaoForm = Pick<
  InstagramAutomacao,
  "nome" | "palavras_chave" | "correspondencia" | "gatilhos" | "mensagem_dm" | "respostas_comentario" | "media_ids" | "ativo" | "rastrear_links"
>;
export type InstagramPost = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  comments_count?: number;
};

export function useInstagramAutomacoes() {
  const { user } = useAuth();
  const [automacoes, setAutomacoes] = useState<InstagramAutomacao[]>([]);
  const [disparos, setDisparos] = useState<InstagramDisparo[]>([]);
  const [conexao, setConexao] = useState<InstagramConexao | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) return;
    const [a, d, c] = await Promise.all([
      supabase.from("instagram_automacoes").select("*").order("criado_em", { ascending: false }),
      // 90 dias: alimenta o histórico e os gráficos de Resultados.
      supabase.from("instagram_automacao_disparos").select("*")
        .gte("criado_em", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .order("criado_em", { ascending: false }).limit(5000),
      supabase.rpc("instagram_conexao_status"),
    ]);
    if (a.error) throw a.error;
    setAutomacoes(a.data ?? []);
    setDisparos(d.data ?? []);
    setConexao(c.data?.[0] ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    carregar().catch((e) => { console.error("automações:", e); setLoading(false); });
  }, [carregar]);

  const salvar = async (form: AutomacaoForm, id?: string) => {
    if (!user) return;
    const { error } = id
      ? await supabase.from("instagram_automacoes").update({ ...form, atualizado_em: new Date().toISOString() }).eq("id", id)
      : await supabase.from("instagram_automacoes").insert({ ...form, user_id: user.id });
    if (error) throw error;
    await carregar();
  };

  const alternar = async (automacao: InstagramAutomacao) => {
    setAutomacoes((lista) => lista.map((a) => (a.id === automacao.id ? { ...a, ativo: !a.ativo } : a)));
    const { error } = await supabase.from("instagram_automacoes")
      .update({ ativo: !automacao.ativo, atualizado_em: new Date().toISOString() }).eq("id", automacao.id);
    if (error) { await carregar(); throw error; }
  };

  const apagar = async (id: string) => {
    const { error } = await supabase.from("instagram_automacoes").delete().eq("id", id);
    if (error) throw error;
    setAutomacoes((lista) => lista.filter((a) => a.id !== id));
  };

  return { automacoes, disparos, conexao, loading, recarregar: carregar, salvar, alternar, apagar };
}

export async function buscarPostsInstagram(): Promise<InstagramPost[]> {
  const { data, error } = await supabase.functions.invoke("instagram-automacoes/posts", { body: {} });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.posts ?? [];
}
