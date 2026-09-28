import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { aoGanharFocoJanela } from "@/lib/desktop/window";

const CHAVE_STORAGE = (dataStr: string) => `jarvis-sono-lembrete:${dataStr}`;

// "Bom dia. Antes de começar, quer registrar como foi sua noite?" (item 15)
// — mesmo desenho de useStartDayPrompt.ts: dispensa por localStorage/dia
// (nunca cobra de novo no mesmo dia), reconfere ao ganhar foco (relevante
// no desktop, onde o painel do Jarvis nunca desmonta). `jaTemRegistro` vem
// de fora (useSleepToday) — null enquanto ainda está carregando.
export function useSleepMorningPrompt(jaTemRegistro: boolean | null) {
  const [dispensadoHoje, setDispensadoHoje] = useState(false);
  const [tick, setTick] = useState(0);
  const dataStr = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    try {
      setDispensadoHoje(!!localStorage.getItem(CHAVE_STORAGE(dataStr)));
    } catch {
      setDispensadoHoje(false);
    }
  }, [dataStr, tick]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelado = false;
    aoGanharFocoJanela(() => setTick((t) => t + 1)).then((fn) => {
      if (cancelado) fn();
      else unlisten = fn;
    });
    return () => {
      cancelado = true;
      unlisten?.();
    };
  }, []);

  const dispensar = useCallback(() => {
    try {
      localStorage.setItem(CHAVE_STORAGE(format(new Date(), "yyyy-MM-dd")), "1");
    } catch {
      /* sem localStorage: só reaparece na próxima abertura, aceitável */
    }
    setDispensadoHoje(true);
  }, []);

  const mostrar = jaTemRegistro === false && !dispensadoHoje;

  return { mostrar, dispensar };
}
