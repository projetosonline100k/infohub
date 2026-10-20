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

export function useEstadoConversas(clienteId: string, atividadeIds: string[]): Map<string, EstadoConversa> {
  const [estados, setEstados] = useState<Map<string, EstadoConversa>>(new Map());
  const chave = [...new Set(atividadeIds)].sort().join(",");
  const carregar = useCallback(async () => {
    const ids = chave ? chave.split(",") : [];
    if (!ids.length) { setEstados(new Map()); return; }
    const { data: bs } = await db.from("briefings").select("id, atividade_id").eq("cliente_id", clienteId)
      .eq("status", "revisando").in("atividade_id", ids);
    const briefings = (bs || []) as { id: string; atividade_id: string }[];
    if (!briefings.length) { setEstados(new Map()); return; }
    const { data: ms } = await db.from("briefing_mensagens").select("briefing_id, papel, criada_em")
      .in("briefing_id", briefings.map((b) => b.id)).order("criada_em", { ascending: false }).limit(1000);
    const ultima = new Map<string, { papel: string; criada_em: string }>();
    for (const m of (ms || []) as { briefing_id: string; papel: string; criada_em: string }[]) if (!ultima.has(m.briefing_id)) ultima.set(m.briefing_id, m);
    const r = new Map<string, EstadoConversa>();
    for (const b of briefings) {
      const u = ultima.get(b.id);
      if (!u) continue;
      if (u.papel === "davi") r.set(b.atividade_id, "pensando");
      else if (u.criada_em > conversaLidaEm(b.id)) r.set(b.atividade_id, "nova");
    }
    setEstados(r);
  }, [clienteId, chave]);
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    let espera: number | undefined;
    const logo = () => { window.clearTimeout(espera); espera = window.setTimeout(() => void carregarRef.current(), 300); };
    const canal = supabase.channel(`estado-conversas-${clienteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "briefing_mensagens", filter: `cliente_id=eq.${clienteId}` }, logo)
      .subscribe();
    window.addEventListener("conversa-lida", logo);
    return () => { window.clearTimeout(espera); void supabase.removeChannel(canal); window.removeEventListener("conversa-lida", logo); };
  }, [clienteId]);
  return estados;
}
