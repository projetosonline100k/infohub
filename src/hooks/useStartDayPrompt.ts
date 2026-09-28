import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { aoGanharFocoJanela } from "@/lib/desktop/window";

const CHAVE_STORAGE = (dataStr: string) => `jarvis-comecar-dia:${dataStr}`;

// Substitui useMorningPriorityGreeting.ts — gate pra mostrar "Bom dia...
// vamos definir o que importa hoje?" (item "Começar o dia"). O sinal
// DEFINITIVO é a existência do daily_plans de hoje (calculado por
// useDailyPlan e passado aqui — evita uma segunda consulta em paralelo);
// enquanto não existe, um dismiss manual (localStorage, com data) evita
// reaparecer repetidamente na mesma sessão. Reconfere ao ganhar foco —
// necessário no desktop, onde o painel do Jarvis nunca desmonta e por isso
// precisa "acordar" sozinho pra um novo dia sem precisar de F5.
export function useStartDayPrompt(planoJaExiste: boolean | null) {
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

  const mostrar = planoJaExiste === false && !dispensadoHoje;

  return { mostrar, dispensar };
}
