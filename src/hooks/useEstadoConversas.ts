import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { conversaLidaEm } from "@/lib/empresa/notificacoes";

// Etiqueta da conversa de revisão de cada entrega (20/10/2026, Davi: "caso eu mande uma mensagem
// dentro do chat, preciso que apareça uma etiqueta: Roy pensando, Mensagem nova…"). Por tarefa
// (atividade): "pensando" = a última é do Davi, sem resposta ainda; "nova" = o funcionário
// respondeu e o Davi ainda não abriu o chat. Ao vivo (realtime de briefing_mensagens).
const db = supabase as unknown as SupabaseClient;
export type EstadoConversa = "pensando" | "nova";

// Os carrosséis de um lote dividem o mesmo chat com o Roy (20/10, Davi: "mandei mensagem para um e
// todos ficaram pensando"): guarda de qual carrossel foi a última mensagem; a etiqueta vai só nele.
const chaveDaVez = (atividadeId: string) => `conversa-carrossel:${atividadeId}`;
export function marcarCarrosselDaConversa(atividadeId: string, carrosselId: string) {
  try { localStorage.setItem(chaveDaVez(atividadeId), carrosselId); } catch { /* sem storage */ }
  window.dispatchEvent(new Event("conversa-lida"));
}
export function carrosselDaConversa(atividadeId: string): string | null {
  try { return localStorage.getItem(chaveDaVez(atividadeId)); } catch { return null; }
}

// 22/10 (Davi: "diz que está pensando, mas ele está ajustando; tudo precisa conversar"): junto do estado,
// o que ele está fazendo agora (briefings.proposta.agora, o mesmo texto do chat).
export function useEstadoConversas(clienteId: string, atividadeIds: string[]): { estados: Map<string, EstadoConversa>; agora: Map<string, string> } {
  const [estados, setEstados] = useState<Map<string, EstadoConversa>>(new Map());
  const [agora, setAgora] = useState<Map<string, string>>(new Map());
  const chave = [...new Set(atividadeIds)].sort().join(",");
  const carregar = useCallback(async () => {
    const ids = chave ? chave.split(",") : [];
    if (!ids.length) { setEstados(new Map()); return; }
    const { data: bs } = await db.from("briefings").select("id, atividade_id, proposta").eq("cliente_id", clienteId)
      .eq("status", "revisando").in("atividade_id", ids);
    const briefings = (bs || []) as { id: string; atividade_id: string; proposta: { agora?: string } | null }[];
    if (!briefings.length) { setEstados(new Map()); setAgora(new Map()); return; }
    const { data: ms } = await db.from("briefing_mensagens").select("briefing_id, papel, criada_em")
      .in("briefing_id", briefings.map((b) => b.id)).order("criada_em", { ascending: false }).limit(1000);
    const ultima = new Map<string, { papel: string; criada_em: string }>();
    for (const m of (ms || []) as { briefing_id: string; papel: string; criada_em: string }[]) if (!ultima.has(m.briefing_id)) ultima.set(m.briefing_id, m);
    const r = new Map<string, EstadoConversa>();
    const ag = new Map<string, string>();
    for (const b of briefings) {
      const u = ultima.get(b.id);
      if (!u) continue;
      if (u.papel === "davi") { r.set(b.atividade_id, "pensando"); if (b.proposta?.agora) ag.set(b.atividade_id, b.proposta.agora); }
      else if (u.criada_em > conversaLidaEm(b.id)) r.set(b.atividade_id, "nova");
    }
    setEstados(r);
    setAgora(ag);
  }, [clienteId, chave]);
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    let espera: number | undefined;
    const logo = () => { window.clearTimeout(espera); espera = window.setTimeout(() => void carregarRef.current(), 300); };
    const canal = supabase.channel(`estado-conversas-${clienteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "briefing_mensagens", filter: `cliente_id=eq.${clienteId}` }, logo)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "briefings", filter: `cliente_id=eq.${clienteId}` }, logo)
      .subscribe();
    window.addEventListener("conversa-lida", logo);
    // 22/10: o aviso do banco às vezes se perde e a tela ficava em "ajustando" com a versão pronta — confere a cada 15 s também.
    const t = window.setInterval(() => void carregarRef.current(), 15_000);
    return () => { window.clearTimeout(espera); window.clearInterval(t); void supabase.removeChannel(canal); window.removeEventListener("conversa-lida", logo); };
  }, [clienteId]);
  return { estados, agora };
}
