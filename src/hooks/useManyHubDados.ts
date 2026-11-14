import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ExecucaoMH } from "@/lib/automacoes/manyhub";

const db = supabase as unknown as SupabaseClient;
export interface MensagemMH { id: string; contato_id: string; de_mim: boolean; origem: string; tipo: string; texto: string | null; enviada_em: string }
export interface ContatoMH { contato_id: string; username: string | null; nome: string | null }

/** Dados do Many Hub (migrações 20261113170000 e 20261114020000): execuções dos fluxos, @ dos contatos e a última mensagem de cada pessoa. */
export function useManyHubDados(igUserId: string | undefined) {
  const [execs, setExecs] = useState<ExecucaoMH[]>([]);
  const [contatos, setContatos] = useState<Map<string, ContatoMH>>(new Map());
  const [ultimas, setUltimas] = useState<Map<string, MensagemMH>>(new Map());
  const [carregou, setCarregou] = useState(false);

  const carregar = useCallback(async () => {
    if (!igUserId) { setExecs([]); setContatos(new Map()); setUltimas(new Map()); setCarregou(true); return; }
    const [e, c, m] = await Promise.all([
      db.from("instagram_fluxo_execucoes").select("id, fluxo_id, contato_id, contato_username, estado, no_atual, historico, erro, criado_em, respondeu").eq("ig_user_id", igUserId).order("criado_em", { ascending: false }).limit(3000),
      db.from("instagram_contatos").select("contato_id, username, nome").eq("ig_user_id", igUserId).limit(5000),
      db.from("instagram_mensagens").select("id, contato_id, de_mim, origem, tipo, texto, enviada_em").eq("ig_user_id", igUserId).order("enviada_em", { ascending: false }).limit(3000),
    ]);
    setExecs((e.data ?? []) as ExecucaoMH[]);
    setContatos(new Map(((c.data ?? []) as ContatoMH[]).map((x) => [x.contato_id, x])));
    const u = new Map<string, MensagemMH>();
    for (const x of (m.data ?? []) as MensagemMH[]) if (!u.has(x.contato_id)) u.set(x.contato_id, x);
    setUltimas(u);
    setCarregou(true);
  }, [igUserId]);
  useEffect(() => {
    setCarregou(false); void carregar();
    const t = window.setInterval(() => { if (!document.hidden) void carregar(); }, 15000);
    return () => window.clearInterval(t);
  }, [carregar]);
  return { execs, contatos, ultimas, carregou, recarregar: carregar };
}

/** A conversa de uma pessoa, ao vivo (a Meta entrega pelo webhook e a tela recebe pelo canal em tempo real). */
export function useConversaMH(igUserId: string | undefined, contatoId: string | null) {
  const [msgs, setMsgs] = useState<MensagemMH[]>([]);
  const [carregando, setCarregando] = useState(false);
  const carregar = useCallback(async () => {
    if (!igUserId || !contatoId) { setMsgs([]); return; }
    const { data } = await db.from("instagram_mensagens").select("id, contato_id, de_mim, origem, tipo, texto, enviada_em").eq("ig_user_id", igUserId).eq("contato_id", contatoId).order("enviada_em", { ascending: true }).limit(400);
    setMsgs((data ?? []) as MensagemMH[]); setCarregando(false);
  }, [igUserId, contatoId]);
  useEffect(() => {
    setMsgs([]); setCarregando(true); void carregar();
    if (!igUserId || !contatoId) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase.channel(`manyhub-${igUserId}-${contatoId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "instagram_mensagens", filter: `ig_user_id=eq.${igUserId}` }, () => { clearTimeout(t); t = setTimeout(() => void carregar(), 400); })
      .subscribe();
    const ciclo = window.setInterval(() => void carregar(), 20000);
    return () => { clearTimeout(t); window.clearInterval(ciclo); void supabase.removeChannel(canal); };
  }, [carregar, igUserId, contatoId]);
  return { msgs, carregando, recarregar: carregar };
}
