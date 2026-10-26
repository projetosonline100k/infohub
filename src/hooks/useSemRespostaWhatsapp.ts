import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { carregarEquipeWhatsapp } from "@/lib/whatsapp/equipe";
import { ehDaEquipe } from "@/lib/whatsapp/painel";
import { esperaSuaResposta, type ConversaResumo } from "@/lib/whatsapp/shirley";

// Quantas conversas do WhatsApp esperam resposta (26/10, Davi: "quando tiver mensagens que faltam ser
// respondidas, apareça no ícone"): a mesma conta do "Geral" da lista — conversas não arquivadas que esperam
// mesmo a resposta dele (esperaSuaResposta). Atualiza ao chegar mensagem nova (realtime) e a cada minuto.
const db = supabase as unknown as SupabaseClient;

export function useSemRespostaWhatsapp(clienteId: string | null): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!clienteId) return;
    let vivo = true;
    let conta = "principal";
    let espera: number | undefined;
    const contar = async () => {
      const [{ data: conversas }, { data: org }, equipe] = await Promise.all([
        db.rpc("whatsapp_conversas", { p_conta: conta }),
        db.from("whatsapp_organizacao").select("chat_id").eq("conta", conta).eq("arquivada", true),
        carregarEquipeWhatsapp(),
      ]);
      if (!vivo) return;
      const arquivadas = new Set(((org || []) as { chat_id: string }[]).map((o) => o.chat_id));
      const agora = new Date();
      const daEquipe = (nome: string | null) => ehDaEquipe(nome, equipe);
      setN(((conversas || []) as ConversaResumo[]).filter((c) => !arquivadas.has(c.chat_id) && esperaSuaResposta(c, agora, daEquipe)).length);
    };
    const depois = () => { window.clearTimeout(espera); espera = window.setTimeout(() => void contar(), 1500); };
    void db.from("clientes").select("whatsapp_conta").eq("id", clienteId).maybeSingle().then(({ data }) => {
      conta = (data as { whatsapp_conta?: string | null } | null)?.whatsapp_conta || "principal";
      void contar();
    });
    const canal = supabase.channel(`wa-sem-resposta-${clienteId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_mensagens" }, depois)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_organizacao" }, depois)
      .subscribe();
    const relogio = window.setInterval(() => void contar(), 60_000);
    return () => { vivo = false; window.clearTimeout(espera); window.clearInterval(relogio); void supabase.removeChannel(canal); };
  }, [clienteId]);
  return n;
}
