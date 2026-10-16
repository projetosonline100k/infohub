import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { alertasDoWhatsapp, horarioDeCobrar, type AlertaShirley, type ConversaResumo } from "@/lib/whatsapp/shirley";

// Shirley (CS) na orbe do Atlas (16/10): a cada 2 min olha as conversas do
// WhatsApp; cliente insatisfeito alerta na hora, quem espera há mais de 1h
// também. Enquanto continuar sem resposta, ela COBRA de novo a cada 30 min
// ("Davi… ele AINDA está esperando"). Quem já foi respondido sai sozinho
// (a última mensagem passa a ser do Davi). Cliente insatisfeito também pede
// a atualização do painel, para a sugestão de resposta já estar pronta.
const INTERVALO = 120_000;
const COBRAR_DE_NOVO_MIN = 30;
const CHAVE = "shirley-avisos";

interface Aviso { ultimaEm: string; ate: number; vezes: number }
const ler = (): Record<string, Aviso> => { try { return JSON.parse(localStorage.getItem(CHAVE) || "{}"); } catch { return {}; } };
const gravar = (v: Record<string, Aviso>) => { try { localStorage.setItem(CHAVE, JSON.stringify(v)); } catch { /* sem storage */ } };

export interface AlertaComCobranca extends AlertaShirley { vezes: number; outros: number }

export function useShirley(meuId: string | undefined, ativo: boolean) {
  const [alertas, setAlertas] = useState<AlertaShirley[]>([]);
  const avisos = useRef<Record<string, Aviso>>(ler());
  const [, forcar] = useState(0);
  const pediuPainelEm = useRef(0);

  const buscar = useCallback(async () => {
    if (!meuId || !horarioDeCobrar(new Date())) { setAlertas([]); return; }
    const { data, error } = await supabase.rpc("whatsapp_conversas");
    if (error || !data) return;
    const lista = alertasDoWhatsapp(data as unknown as ConversaResumo[], new Date());
    setAlertas(lista);
    // Cliente insatisfeito: pede o painel atualizado (no máximo 1 vez a cada 20 min).
    if (lista.some((a) => a.motivo === "insatisfeito") && Date.now() - pediuPainelEm.current > 20 * 60_000) {
      pediuPainelEm.current = Date.now();
      const { data: p } = await supabase.from("whatsapp_painel").select("atualizado_em, atualizacao_status").eq("user_id", meuId).maybeSingle();
      const ocupado = p?.atualizacao_status === "pedida" || p?.atualizacao_status === "rodando";
      if (p && !ocupado && Date.now() - new Date(p.atualizado_em).getTime() > 20 * 60_000) {
        await supabase.from("whatsapp_painel").update({ atualizacao_pedida_em: new Date().toISOString(), atualizacao_status: "pedida", atualizacao_mensagem: null }).eq("user_id", meuId);
      }
    }
  }, [meuId]);

  useEffect(() => {
    if (!ativo) return;
    void buscar();
    const t = window.setInterval(() => void buscar(), INTERVALO);
    return () => window.clearInterval(t);
  }, [ativo, buscar]);

  // O que mostrar agora: um alerta novo (mensagem nova) ou um que já passou da hora de cobrar de novo.
  const agora = Date.now();
  const devidos = alertas.filter((a) => {
    const av = avisos.current[a.chatId];
    return !av || av.ultimaEm !== a.ultimaEm || agora >= av.ate;
  });
  const primeiro = devidos[0];
  const atual: AlertaComCobranca | null = primeiro
    ? { ...primeiro, vezes: avisos.current[primeiro.chatId]?.ultimaEm === primeiro.ultimaEm ? avisos.current[primeiro.chatId].vezes : 0, outros: devidos.length - 1 }
    : null;

  const adiar = useCallback((minutos = COBRAR_DE_NOVO_MIN) => {
    if (!atual) return;
    const v = { ...avisos.current, [atual.chatId]: { ultimaEm: atual.ultimaEm, ate: Date.now() + minutos * 60_000, vezes: atual.vezes + 1 } };
    // Limpa conversas que já não estão na lista (foram respondidas).
    for (const id of Object.keys(v)) if (!alertas.some((a) => a.chatId === id)) delete v[id];
    avisos.current = v;
    gravar(v);
    forcar((n) => n + 1);
  }, [atual, alertas]);

  return { atual, adiar };
}
