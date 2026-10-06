import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { atividadeDoEvento, chamarGoogleCalendar, type GoogleCalendarEvent } from "@/lib/googleCalendar";

export type AtividadeVinculada = Tables<"atividades"> & { clienteNome: string };

// Atividade em aberto com vencimento antes de hoje.
export function estaAtrasada(vencimento: string | null | undefined, concluida: boolean): boolean {
  if (!vencimento || concluida) return false;
  return vencimento.slice(0, 10) < format(new Date(), "yyyy-MM-dd");
}

const inicioDoEvento = (event: GoogleCalendarEvent) => new Date(event.start.dateTime || `${event.start.date}T00:00:00`);

// Liga a Agenda às atividades que foram arrastadas pra ela (o id fica no
// próprio evento do Google, ver atividadeDoEvento):
// - `agendadas`: atividade → quando está na agenda (pintar de marrom no painel);
// - `porId`: os dados de cada atividade vinculada (atraso, card ao clicar).
// Com o painel aberto, busca também uma janela larga do calendário principal,
// pra marcar atividades agendadas fora do mês que está na tela.
export function useAtividadesDaAgenda(eventos: GoogleCalendarEvent[], painelAberto: boolean) {
  const [eventosAmplos, setEventosAmplos] = useState<GoogleCalendarEvent[]>([]);
  const [porId, setPorId] = useState<Record<string, AtividadeVinculada>>({});
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    if (!painelAberto) return;
    let cancelado = false;
    const hoje = new Date();
    chamarGoogleCalendar<{ events: GoogleCalendarEvent[] }>({
      action: "events",
      calendarIds: ["primary"],
      timeMin: subDays(hoje, 60).toISOString(),
      timeMax: addDays(hoje, 180).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).then((resposta) => {
      if (!cancelado) setEventosAmplos(resposta.events.filter((e) => e.status !== "cancelled" && atividadeDoEvento(e)));
    }).catch(() => { /* fica só com os eventos da tela */ });
    return () => { cancelado = true; };
  }, [painelAberto, versao]);

  const agendadas = useMemo(() => {
    const mapa = new Map<string, Date>();
    for (const evento of [...eventosAmplos, ...eventos]) {
      const id = atividadeDoEvento(evento);
      if (!id) continue;
      const inicio = inicioDoEvento(evento);
      const atual = mapa.get(id);
      // Mostra o agendamento mais próximo de agora (o futuro, se houver).
      if (!atual || (inicio >= new Date() && (atual < new Date() || inicio < atual))) mapa.set(id, inicio);
    }
    return mapa;
  }, [eventos, eventosAmplos]);

  const idsVinculados = useMemo(() => [...new Set(eventos.map(atividadeDoEvento).filter(Boolean) as string[])].sort().join(","), [eventos]);

  useEffect(() => {
    if (!idsVinculados) { setPorId({}); return; }
    let cancelado = false;
    (async () => {
      const ids = idsVinculados.split(",");
      const { data } = await supabase.from("atividades").select("*").in("id", ids).is("deleted_at", null);
      const clienteIds = [...new Set((data || []).map((a) => a.cliente_id).filter(Boolean))] as string[];
      let nomes: Record<string, string> = {};
      if (clienteIds.length) {
        const { data: clientes } = await supabase.from("clientes").select("id, nome_especialista").in("id", clienteIds);
        nomes = Object.fromEntries((clientes || []).map((c) => [c.id, c.nome_especialista]));
      }
      if (cancelado) return;
      setPorId(Object.fromEntries((data || []).map((a) => [a.id, { ...a, clienteNome: a.cliente_id ? nomes[a.cliente_id] || "Projeto" : "Pessoal" }])));
    })();
    return () => { cancelado = true; };
  }, [idsVinculados, versao]);

  return { agendadas, porId, recarregar };
}
