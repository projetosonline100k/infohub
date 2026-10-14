import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import type { Database } from "@/integrations/supabase/types";

export type InstagramAutomacao = Database["public"]["Tables"]["instagram_automacoes"]["Row"];
export type InstagramDisparo = Database["public"]["Tables"]["instagram_automacao_disparos"]["Row"];
export type InstagramConta = Database["public"]["Functions"]["instagram_contas"]["Returns"][number];
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

const CHAVE_CONTA = "automacoes:conta";

export const nomeDaConta = (c: InstagramConta) => c.cliente_nome ?? "Meu perfil";

export function useInstagramAutomacoes() {
  const { user } = useAuth();
  const [todasAutomacoes, setTodasAutomacoes] = useState<InstagramAutomacao[]>([]);
  const [todosDisparos, setTodosDisparos] = useState<InstagramDisparo[]>([]);
  const [contas, setContas] = useState<InstagramConta[]>([]);
  const [contaId, setContaIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(CHAVE_CONTA); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  const setContaId = (id: string) => {
    setContaIdState(id);
    try { localStorage.setItem(CHAVE_CONTA, id); } catch { /* sem storage */ }
  };

  const carregar = useCallback(async () => {
    if (!user) return;
    const [a, d, c] = await Promise.all([
      supabase.from("instagram_automacoes").select("*").order("criado_em", { ascending: false }),
      // 90 dias: alimenta o histórico e os gráficos de Resultados.
      supabase.from("instagram_automacao_disparos").select("*")
        .gte("criado_em", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .order("criado_em", { ascending: false }).limit(5000),
      supabase.rpc("instagram_contas"),
    ]);
    if (a.error) throw a.error;
    setTodasAutomacoes(a.data ?? []);
    setTodosDisparos(d.data ?? []);
    setContas(c.data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    carregar().catch((e) => { console.error("automações:", e); setLoading(false); });
  }, [carregar]);

  // Conta escolhida (lembrada entre aberturas); cai na primeira se sumiu.
  const conta = contas.find((c) => c.ig_user_id === contaId) ?? contas[0] ?? null;
  const automacoes = useMemo(
    () => todasAutomacoes.filter((a) => a.ig_user_id === conta?.ig_user_id), [todasAutomacoes, conta?.ig_user_id]);
  const disparos = useMemo(
    () => todosDisparos.filter((d) => d.ig_user_id === conta?.ig_user_id), [todosDisparos, conta?.ig_user_id]);

  const salvar = async (form: AutomacaoForm, id?: string) => {
    if (!user || !conta) throw new Error("Conecte uma conta do Instagram primeiro.");
    const { error } = id
      ? await supabase.from("instagram_automacoes").update({ ...form, atualizado_em: new Date().toISOString() }).eq("id", id)
      : await supabase.from("instagram_automacoes").insert({ ...form, user_id: user.id, ig_user_id: conta.ig_user_id });
    if (error) throw error;
    await carregar();
  };

  const alternar = async (automacao: InstagramAutomacao) => {
    setTodasAutomacoes((lista) => lista.map((a) => (a.id === automacao.id ? { ...a, ativo: !a.ativo } : a)));
    const { error } = await supabase.from("instagram_automacoes")
      .update({ ativo: !automacao.ativo, atualizado_em: new Date().toISOString() }).eq("id", automacao.id);
    if (error) { await carregar(); throw error; }
  };

  const apagar = async (id: string) => {
    const { error } = await supabase.from("instagram_automacoes").delete().eq("id", id);
    if (error) throw error;
    setTodasAutomacoes((lista) => lista.filter((a) => a.id !== id));
  };

  return {
    contas, conta, setContaId, automacoes, disparos, loading,
    recarregar: carregar, salvar, alternar, apagar,
  };
}

async function chamar<T>(caminho: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`instagram-automacoes/${caminho}`, { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function buscarPostsInstagram(igUserId: string): Promise<InstagramPost[]> {
  return (await chamar<{ posts?: InstagramPost[] }>("posts", { ig_user_id: igUserId })).posts ?? [];
}

/** Link (vale 7 dias) para a pessoa autorizar a conta do Instagram dela. */
export async function gerarLinkConexao(clienteId: string | null): Promise<string> {
  return (await chamar<{ url: string }>("link", { cliente_id: clienteId })).url;
}
