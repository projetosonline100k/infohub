import { useEffect, useRef, useState } from "react";

export type AssistantEstadoPainel = "lista" | "recomendacao" | "selecionada" | "foco" | "pausado";

interface CobrancaSnapshot {
  panelAberto: boolean;
  estado: AssistantEstadoPainel;
  selecionadaEm: number | null;
  pausadoEm: number | null;
  // epoch (ms) de quando o run de foco atual começou (equivalente a
  // timer_iniciado_em convertido pra número).
  focoIniciadoEm: number | null;
  // segundos já acumulados antes desse run (timer_decorrido_segundos).
  focoAcumuladoAntesDoRunSegundos: number;
  atrasadasCount: number;
}

type Regra = "foco45" | "selecionadaParada" | "pausadoLongo" | "atrasada";

const COOLDOWN_MS = 15 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
const DURACAO_BOLHA_MS = 6000;
const LIMIAR_SELECIONADA_MS = 10 * 60 * 1000;
const LIMIAR_PAUSADO_MS = 15 * 60 * 1000;
const LIMIAR_SESSAO_LONGA_SEGUNDOS = 45 * 60;

// Cobranças proativas simples — só tarefa/sessão/tempo/atraso, sem IA.
// No máximo 1 aviso a cada ~15min (cooldown único pra tudo nesta v1) e só
// com o painel FECHADO (aberto = já está engajado, não precisa cutucar).
export function useAssistantCobranca(snapshot: CobrancaSnapshot) {
  const [mensagem, setMensagem] = useState<string | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const ultimoAvisoRef = useRef(0);
  const avisou45MinRef = useRef(false);
  const esconderRef = useRef<ReturnType<typeof setTimeout>>();

  // Sessão de foco nova (ou parada) — libera o aviso de "45 min" de novo.
  useEffect(() => {
    if (!snapshot.focoIniciadoEm) avisou45MinRef.current = false;
  }, [snapshot.focoIniciadoEm]);

  useEffect(() => {
    const id = setInterval(() => {
      const s = snapshotRef.current;
      if (s.panelAberto) return;
      const agora = Date.now();

      let candidata: { texto: string; regra: Regra } | null = null;

      if (s.estado === "foco" && s.focoIniciadoEm && !avisou45MinRef.current) {
        const totalSeg = s.focoAcumuladoAntesDoRunSegundos + (agora - s.focoIniciadoEm) / 1000;
        if (totalSeg >= LIMIAR_SESSAO_LONGA_SEGUNDOS) {
          candidata = { texto: "🔥 45 min de foco. Continua ou faz uma pausa?", regra: "foco45" };
        }
      }

      if (!candidata && s.estado === "selecionada" && s.selecionadaEm && agora - s.selecionadaEm >= LIMIAR_SELECIONADA_MS) {
        candidata = { texto: "👀 Vamos começar ou quer trocar?", regra: "selecionadaParada" };
      }

      if (!candidata && s.estado === "pausado" && s.pausadoEm && agora - s.pausadoEm >= LIMIAR_PAUSADO_MS) {
        const minutos = Math.round((agora - s.pausadoEm) / 60000);
        candidata = { texto: `Seu foco está pausado há ${minutos} min. Bora voltar?`, regra: "pausadoLongo" };
      }

      if (!candidata && s.atrasadasCount > 0) {
        candidata = { texto: "Você ainda tem uma tarefa atrasada esperando.", regra: "atrasada" };
      }

      if (!candidata) return;
      if (agora - ultimoAvisoRef.current < COOLDOWN_MS) return;

      ultimoAvisoRef.current = agora;
      if (candidata.regra === "foco45") avisou45MinRef.current = true;

      clearTimeout(esconderRef.current);
      setMensagem(candidata.texto);
      esconderRef.current = setTimeout(() => setMensagem(null), DURACAO_BOLHA_MS);
    }, CHECK_INTERVAL_MS);
    return () => {
      clearInterval(id);
      clearTimeout(esconderRef.current);
    };
  }, []);

  return mensagem;
}
