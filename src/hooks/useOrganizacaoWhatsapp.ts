import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

// Arquivar conversas e pastas do WhatsApp no Infopro (20/10, Davi). Tabelas whatsapp_organizacao e
// whatsapp_pastas (migração 20261020060000), por número (conta). É só do Infopro: o celular não muda.
const db = supabase as unknown as SupabaseClient;   // tabelas novas, fora dos tipos gerados

export interface PastaWhatsapp { id: string; nome: string }
interface Org { arquivada: boolean; pasta_id: string | null }

export function useOrganizacaoWhatsapp(conta: string) {
  const { user } = useAuth();
  const [pastas, setPastas] = useState<PastaWhatsapp[]>([]);
  const [org, setOrg] = useState<Record<string, Org>>({});

  const carregar = useCallback(async () => {
    if (!user) return;
    const [p, o] = await Promise.all([
      db.from("whatsapp_pastas").select("id, nome").eq("conta", conta).order("ordem").order("criada_em"),
      db.from("whatsapp_organizacao").select("chat_id, arquivada, pasta_id").eq("conta", conta),
    ]);
    setPastas((p.data || []) as PastaWhatsapp[]);
    setOrg(Object.fromEntries(((o.data || []) as ({ chat_id: string } & Org)[]).map((x) => [x.chat_id, { arquivada: x.arquivada, pasta_id: x.pasta_id }])));
  }, [user, conta]);

  useEffect(() => { void carregar(); }, [carregar]);

  const gravar = useCallback(async (chatId: string, patch: Partial<Org>) => {
    if (!user) return;
    const atual = org[chatId] ?? { arquivada: false, pasta_id: null };
    const novo = { ...atual, ...patch };
    setOrg((o) => ({ ...o, [chatId]: novo }));
    const { error } = await db.from("whatsapp_organizacao")
      .upsert({ user_id: user.id, conta, chat_id: chatId, ...novo, atualizado_em: new Date().toISOString() });
    if (error) { toast.error("Não consegui salvar. Tente de novo."); void carregar(); }
  }, [user, conta, org, carregar]);

  const arquivar = useCallback((chatId: string, arquivada: boolean) => gravar(chatId, { arquivada }), [gravar]);
  const moverParaPasta = useCallback((chatId: string, pastaId: string | null) => gravar(chatId, { pasta_id: pastaId }), [gravar]);

  const criarPasta = useCallback(async (nome: string): Promise<string | null> => {
    if (!user || !nome.trim()) return null;
    const { data, error } = await db.from("whatsapp_pastas")
      .insert({ user_id: user.id, conta, nome: nome.trim(), ordem: pastas.length }).select("id, nome").single();
    if (error || !data) { toast.error(error?.code === "23505" ? "Já existe uma pasta com esse nome." : "Não consegui criar a pasta."); return null; }
    setPastas((p) => [...p, data as PastaWhatsapp]);
    return (data as PastaWhatsapp).id;
  }, [user, conta, pastas.length]);

  const apagarPasta = useCallback(async (id: string) => {
    setPastas((p) => p.filter((x) => x.id !== id));
    setOrg((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.pasta_id === id ? { ...v, pasta_id: null } : v])));
    await db.from("whatsapp_pastas").delete().eq("id", id);
  }, []);

  const renomearPasta = useCallback(async (id: string, nome: string) => {
    if (!nome.trim()) return;
    setPastas((p) => p.map((x) => (x.id === id ? { ...x, nome: nome.trim() } : x)));
    const { error } = await db.from("whatsapp_pastas").update({ nome: nome.trim() }).eq("id", id);
    if (error) { toast.error("Não consegui renomear."); void carregar(); }
  }, [carregar]);

  return {
    pastas,
    arquivada: (chatId: string) => !!org[chatId]?.arquivada,
    pastaDe: (chatId: string) => org[chatId]?.pasta_id ?? null,
    arquivar, moverParaPasta, criarPasta, apagarPasta, renomearPasta,
  };
}
