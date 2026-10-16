import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { aoGanharFocoJanela } from "@/lib/desktop/window";
import { buscarRelatorioDoDia } from "@/lib/productivity/DailyReportService";
import { deveLembrarDeEncerrar } from "@/lib/productivity/RascunhoRelatorio";

const CHAVE_STORAGE = (dataStr: string) => `jarvis-encerrar-dia:${dataStr}`;
const INTERVALO_MS = 5 * 60 * 1000;

// "Seu relatório do dia está pronto" — par noturno de useStartDayPrompt.ts.
// A partir de HORA_LEMBRETE_ENCERRAR, se ainda não existe relatório de hoje,
// o Atlas avisa e abre o rascunho montado sozinho. Dispensa por
// localStorage/dia. Reconfere a cada 5 min e ao ganhar foco, porque o
// painel do Atlas nunca desmonta no desktop.
export function useEndOfDayPrompt() {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), INTERVALO_MS);
    let unlisten: (() => void) | undefined;
    let cancelado = false;
    aoGanharFocoJanela(() => setTick((t) => t + 1)).then((fn) => {
      if (cancelado) fn();
      else unlisten = fn;
    });
    return () => {
      cancelado = true;
      clearInterval(id);
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    const agora = new Date();
    const dataStr = format(agora, "yyyy-MM-dd");
    let dispensado = false;
    try {
      dispensado = !!localStorage.getItem(CHAVE_STORAGE(dataStr));
    } catch {
      dispensado = false;
    }
    // Só consulta o banco quando o resto já permite mostrar.
    if (!deveLembrarDeEncerrar(agora, false, dispensado)) {
      setMostrar(false);
      return;
    }
    buscarRelatorioDoDia(user.id, dataStr)
      .then((relatorio) => {
        if (!cancelado) setMostrar(deveLembrarDeEncerrar(agora, !!relatorio, dispensado));
      })
      .catch(() => {
        if (!cancelado) setMostrar(false);
      });
    return () => {
      cancelado = true;
    };
  }, [user, tick]);

  const dispensar = useCallback(() => {
    try {
      localStorage.setItem(CHAVE_STORAGE(format(new Date(), "yyyy-MM-dd")), "1");
    } catch {
      /* sem localStorage: só reaparece na próxima checagem, aceitável */
    }
    setMostrar(false);
  }, []);

  return { mostrar, dispensar };
}
