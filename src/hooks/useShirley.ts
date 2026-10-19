import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ADIAR_MIN, alertasDoWhatsapp, chegaramAgora, horarioDeCobrar, humorDaShirley, type AlertaShirley, type ConversaResumo, type Humor } from "@/lib/whatsapp/shirley";
import { calcularMetricas, ehDaEquipe, etiquetasDaConversa, type CardWhatsapp, type Historico } from "@/lib/whatsapp/painel";

// Shirley (CS) na orbe do Atlas (16/10): a cada 2 min olha as conversas do
// WhatsApp; cliente insatisfeito alerta na hora, quem espera há mais de 1h
// também. Enquanto continuar sem resposta, ela COBRA de novo a cada 30 min
// ("Davi… ele AINDA está esperando"). Quem já foi respondido sai sozinho
// (a última mensagem passa a ser do Davi). Cliente insatisfeito também pede
// a atualização do painel, para a sugestão de resposta já estar pronta.
const INTERVALO = 60_000;
const COBRAR_DE_NOVO_MIN = 30;
const CHAVE = "shirley-avisos";

interface Aviso { ultimaEm: string; ate: number; vezes: number }
const ler = (): Record<string, Aviso> => { try { return JSON.parse(localStorage.getItem(CHAVE) || "{}"); } catch { return {}; } };
const gravar = (v: Record<string, Aviso>) => { try { localStorage.setItem(CHAVE, JSON.stringify(v)); } catch { /* sem storage */ } };

export interface AlertaComCobranca extends AlertaShirley { vezes: number; outros: number; humor: Humor }

export function useShirley(meuId: string | undefined, ativo: boolean) {
  const [alertas, setAlertas] = useState<AlertaShirley[]>([]);
  // Órbita: só o que ACABOU de chegar (16/10: "não quero que apareça sempre, só quando mandarem mensagem").
  const [novas, setNovas] = useState<AlertaShirley[]>([]);
  const avisos = useRef<Record<string, Aviso>>(ler());
  const [, forcar] = useState(0);
  const pediuPainelEm = useRef(0);

  const buscar = useCallback(async () => {
    if (!meuId || !horarioDeCobrar(new Date())) { setAlertas([]); setNovas([]); return; }
    const { data, error } = await supabase.rpc("whatsapp_conversas");
    if (error || !data) return;
    // Grupo só é com o Davi quando o painel diz "Precisa responder" (o resto é do CS).
    const { data: pn } = await supabase.from("whatsapp_painel").select("cards, historico, respondidos").eq("user_id", meuId).maybeSingle();
    const h = pn?.historico && Object.keys(pn.historico as object).length ? (pn.historico as unknown as Historico) : null;
    const cards = (pn?.cards as unknown as CardWhatsapp[]) || [];
    const respondidos = (pn?.respondidos as Record<string, boolean>) || {};
    const agora = new Date();
    const metricas = h ? calcularMetricas(h, agora) : null;
    const precisa = (c: ConversaResumo) => etiquetasDaConversa(c, h, cards, respondidos, metricas, agora).some((e) => e.texto === "Precisa responder");
    const equipe = (nome: string | null) => ehDaEquipe(nome, h?.config?.equipe ?? ["Shirley Fidelis"]);
    const lista = alertasDoWhatsapp(data as unknown as ConversaResumo[], agora, 60, precisa, equipe);
    setAlertas(lista);
    setNovas(chegaramAgora(data as unknown as ConversaResumo[], agora, 20, precisa, equipe));
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
  const vezes = primeiro && avisos.current[primeiro.chatId]?.ultimaEm === primeiro.ultimaEm ? avisos.current[primeiro.chatId].vezes : 0;
  const atual: AlertaComCobranca | null = primeiro
    ? { ...primeiro, vezes, outros: devidos.length - 1, humor: humorDaShirley(vezes, primeiro.minutos, primeiro.motivo === "insatisfeito") }
    : null;

  // Quanto mais brava, menos ela deixa adiar (furiosa: volta em 5 min mesmo se ele abrir e não responder).
  const adiar = useCallback((minutos?: number) => {
    if (!atual) return;
    minutos ??= ADIAR_MIN[atual.humor] || 5;
    const v = { ...avisos.current, [atual.chatId]: { ultimaEm: atual.ultimaEm, ate: Date.now() + minutos * 60_000, vezes: atual.vezes + 1 } };
    // Limpa conversas que já não estão na lista (foram respondidas).
    for (const id of Object.keys(v)) if (!alertas.some((a) => a.chatId === id)) delete v[id];
    avisos.current = v;
    gravar(v);
    forcar((n) => n + 1);
  }, [atual, alertas]);

  // "Depois" vale para todos (17/10: "se eu clicar em depois, serve para todo o resto"): adia cada
  // conversa que está cobrando agora; cada uma conta mais um "depois" (a paciência dela cai igual).
  const adiarTodos = useCallback((minutos: number) => {
    const v = { ...avisos.current };
    for (const a of alertas) {
      const antes = v[a.chatId]?.ultimaEm === a.ultimaEm ? v[a.chatId].vezes : 0;
      v[a.chatId] = { ultimaEm: a.ultimaEm, ate: Date.now() + minutos * 60_000, vezes: antes + 1 };
    }
    for (const id of Object.keys(v)) if (!alertas.some((a) => a.chatId === id)) delete v[id];
    avisos.current = v; gravar(v); forcar((n) => n + 1);
  }, [alertas]);

  // "Já respondi por fora" (ligação, áudio no celular…): para de cobrar até chegar mensagem nova dela.
  const jaRespondi = useCallback(() => {
    if (!atual) return;
    const v = { ...avisos.current, [atual.chatId]: { ultimaEm: atual.ultimaEm, ate: Date.now() + 7 * 86400_000, vezes: 0 } };
    avisos.current = v; gravar(v); forcar((n) => n + 1);
  }, [atual]);

  return { atual, adiar, adiarTodos, jaRespondi, todos: alertas, novas };
}
