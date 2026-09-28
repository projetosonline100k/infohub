import { useCallback, useEffect, useRef, useState } from "react";
import { startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const CHAVE_LOCAL = (dataStr: string) => `jarvis-nudge-p1:${dataStr}`;
const LIMIAR_HORAS = 2;
const CHECK_INTERVAL_MS = 60 * 1000;

interface UsePriorityOneNudgeParams {
  panelAberto: boolean;
  mainPriorityActivityId: string | null;
  mainPriorityTitulo: string | null;
  mainPriorityConcluida: boolean;
  // estado === "foco" na tarefa certa — trava o nudge na hora, sem esperar
  // o round-trip de focus_sessions (correção #2/#3 do plano).
  emFocoNaPrioridade: boolean;
  dataStr: string;
}

// Cartão "sua prioridade #1 ainda não começou" — nunca usa
// timer_decorrido_segundos (vitalício, não por dia); consulta
// focus_sessions filtrado por hoje pra saber se ela já rodou. O relógio de
// "há quantas horas" mora só nesta sessão do componente (ref em memória,
// não persistido) e REINICIA sempre que a prioridade #1 muda — "Ajustar
// plano" trocando a #1 no meio do dia não deve herdar o relógio da escolha
// anterior. "Adiar"/"Existe um bloqueio" só em localStorage, por dia —
// nunca gravam no banco.
export function usePriorityOneNudge({
  panelAberto,
  mainPriorityActivityId,
  mainPriorityTitulo,
  mainPriorityConcluida,
  emFocoNaPrioridade,
  dataStr,
}: UsePriorityOneNudgeParams) {
  const [mostrar, setMostrar] = useState(false);
  const [jaIniciadaHojeDb, setJaIniciadaHojeDb] = useState(false);
  const [adiadoAte, setAdiadoAte] = useState(0);
  const [existeBloqueio, setExisteBloqueio] = useState(false);
  const desdeRef = useRef<number>(Date.now());
  const idAnteriorRef = useRef<string | null>(null);

  useEffect(() => {
    if (mainPriorityActivityId !== idAnteriorRef.current) {
      idAnteriorRef.current = mainPriorityActivityId;
      desdeRef.current = Date.now();
      setMostrar(false);
      setJaIniciadaHojeDb(false);
      setExisteBloqueio(false);
      setAdiadoAte(0);
    }
  }, [mainPriorityActivityId]);

  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_LOCAL(dataStr)) || "{}");
      if (typeof salvo?.adiadoAte === "number") setAdiadoAte(salvo.adiadoAte);
      if (salvo?.bloqueio) setExisteBloqueio(true);
    } catch {
      /* ignora — sem localStorage, só perde o "adiar" entre reloads */
    }
  }, [dataStr, mainPriorityActivityId]);

  useEffect(() => {
    if (!mainPriorityActivityId) return;
    let cancelado = false;
    supabase
      .from("focus_sessions")
      .select("id")
      .eq("atividade_id", mainPriorityActivityId)
      .gte("started_at", startOfDay(new Date()).toISOString())
      .limit(1)
      .then(({ data }) => {
        if (!cancelado) setJaIniciadaHojeDb(!!data && data.length > 0);
      });
    return () => {
      cancelado = true;
    };
  }, [mainPriorityActivityId]);

  useEffect(() => {
    const checar = () => {
      if (panelAberto || !mainPriorityActivityId || mainPriorityConcluida || jaIniciadaHojeDb || emFocoNaPrioridade || existeBloqueio) {
        setMostrar(false);
        return;
      }
      if (Date.now() < adiadoAte) {
        setMostrar(false);
        return;
      }
      const horasDesde = (Date.now() - desdeRef.current) / 3_600_000;
      setMostrar(horasDesde >= LIMIAR_HORAS);
    };
    checar();
    const id = setInterval(checar, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [panelAberto, mainPriorityActivityId, mainPriorityConcluida, jaIniciadaHojeDb, emFocoNaPrioridade, existeBloqueio, adiadoAte]);

  const salvarLocal = useCallback((patch: Record<string, unknown>) => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_LOCAL(dataStr)) || "{}");
      localStorage.setItem(CHAVE_LOCAL(dataStr), JSON.stringify({ ...salvo, ...patch }));
    } catch {
      /* ignora */
    }
  }, [dataStr]);

  const adiar = useCallback(() => {
    const ate = Date.now() + 60 * 60 * 1000;
    setAdiadoAte(ate);
    setMostrar(false);
    salvarLocal({ adiadoAte: ate });
  }, [salvarLocal]);

  const marcarBloqueio = useCallback(() => {
    setExisteBloqueio(true);
    setMostrar(false);
    salvarLocal({ bloqueio: true });
  }, [salvarLocal]);

  return {
    mostrar: mostrar && !!mainPriorityTitulo,
    titulo: mainPriorityTitulo,
    adiar,
    marcarBloqueio,
  };
}
