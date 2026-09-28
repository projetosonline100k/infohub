import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { usePerformanceHabits } from "./usePerformanceHabits";
import { buscarLogsDoDia, salvarLog } from "@/lib/performance/PerformanceHabitService";
import { habitoProgramadoNoDia } from "@/lib/performance/PerformanceMetricsService";
import { buscarDestaqueDeMeta, type DestaqueMeta } from "@/lib/performance/PerformanceGoalService";

const CHECK_INTERVAL_MS = 60 * 1000;
const COOLDOWN_MS = 15 * 60 * 1000;
const CHAVE_LOCAL = (dataStr: string) => `jarvis-performance-lembrete:${dataStr}`;

export interface LembreteHabito {
  habitId: string;
  nome: string;
}

interface EstadoLocal {
  adiadoAte: Record<string, number>;
  ignorados: string[];
}

// "Academia ainda está pendente hoje" (item 19) — V1: os campos
// `lembrete_ativo`/`lembrete_horario` já existem no banco, mas NENHUM
// formulário ainda os define (corte de escopo deliberado e avisado) — este
// hook fica pronto e correto, só nunca encontra candidato até um próximo
// passo expor esse toggle no PerformanceHabitForm. Mesmo desenho de
// usePriorityOneNudge.ts: cooldown de 15min, "adiar" por tempo (1h),
// "não vou fazer hoje" por localStorage/dia. Também mostra, ocasionalmente
// e sob o mesmo cooldown, um destaque de meta (item 20) — nunca os dois
// juntos, nunca spam.
export function usePerformanceReminder(panelAberto: boolean) {
  const { user } = useAuth();
  const { habitosAtivos } = usePerformanceHabits();
  const [lembrete, setLembrete] = useState<LembreteHabito | null>(null);
  const [destaqueMeta, setDestaqueMeta] = useState<DestaqueMeta | null>(null);
  const ultimoAvisoRef = useRef(0);
  const estadoLocalRef = useRef<EstadoLocal>({ adiadoAte: {}, ignorados: [] });
  const dataStr = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_LOCAL(dataStr)) || "{}");
      estadoLocalRef.current = { adiadoAte: salvo.adiadoAte ?? {}, ignorados: salvo.ignorados ?? [] };
    } catch {
      estadoLocalRef.current = { adiadoAte: {}, ignorados: [] };
    }
  }, [dataStr]);

  const persistirLocal = useCallback(() => {
    try {
      localStorage.setItem(CHAVE_LOCAL(dataStr), JSON.stringify(estadoLocalRef.current));
    } catch {
      /* ignora — só perde o "adiar"/"ignorar" entre reloads */
    }
  }, [dataStr]);

  useEffect(() => {
    let cancelado = false;

    const checar = async () => {
      if (panelAberto || !user) return;
      const agora = Date.now();
      if (agora - ultimoAvisoRef.current < COOLDOWN_MS) return;

      const horaAtual = format(new Date(), "HH:mm:ss");
      const candidatos = habitosAtivos.filter(
        (h) =>
          h.source === "manual" &&
          h.lembrete_ativo &&
          h.lembrete_horario &&
          h.lembrete_horario <= horaAtual &&
          habitoProgramadoNoDia(h, dataStr) &&
          agora >= (estadoLocalRef.current.adiadoAte[h.id] ?? 0) &&
          !estadoLocalRef.current.ignorados.includes(h.id)
      );

      if (candidatos.length > 0) {
        const logs = await buscarLogsDoDia(user.id, dataStr);
        const logados = new Set(logs.map((l) => l.habit_id));
        const pendente = candidatos.find((h) => !logados.has(h.id));
        if (pendente && !cancelado) {
          setLembrete({ habitId: pendente.id, nome: pendente.nome });
          ultimoAvisoRef.current = agora;
          return;
        }
      }

      // Sem lembrete de hábito pendente — ocasionalmente mostra um destaque
      // de meta em vez disso (nunca os dois juntos), some sozinho depois de
      // alguns segundos (mesmo padrão da bolha de cobrança).
      if (Math.random() < 0.3) {
        const destaque = await buscarDestaqueDeMeta(user.id);
        if (destaque && !cancelado) {
          setDestaqueMeta(destaque);
          ultimoAvisoRef.current = agora;
          setTimeout(() => setDestaqueMeta(null), 8000);
        }
      }
    };

    const id = setInterval(checar, CHECK_INTERVAL_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [panelAberto, user, habitosAtivos, dataStr]);

  const marcarFeito = useCallback(async () => {
    if (!user || !lembrete) return;
    await salvarLog(user.id, lembrete.habitId, dataStr, { completed: true });
    setLembrete(null);
  }, [user, lembrete, dataStr]);

  const lembrarDepois = useCallback(() => {
    if (!lembrete) return;
    estadoLocalRef.current.adiadoAte[lembrete.habitId] = Date.now() + 60 * 60 * 1000;
    persistirLocal();
    setLembrete(null);
  }, [lembrete, persistirLocal]);

  const naoVouFazer = useCallback(() => {
    if (!lembrete) return;
    estadoLocalRef.current.ignorados.push(lembrete.habitId);
    persistirLocal();
    setLembrete(null);
  }, [lembrete, persistirLocal]);

  return {
    lembrete,
    marcarFeito,
    lembrarDepois,
    naoVouFazer,
    destaqueMeta,
    dispensarDestaque: () => setDestaqueMeta(null),
  };
}
