import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";

// Cronômetro do Modo Foco (27/10), o mesmo na página /foco e na janelinha lateral do foco total: o estado
// fica no armazenamento do app (as duas janelas leem o mesmo) e cada mudança avisa a outra janela.
// O tempo de foco do dia só soma quando um bloco para (pausa, fim ou troca) — nada de somar por segundo,
// senão as duas janelas contariam em dobro.

export type Ciclo = { id: string; rotulo: string; foco: number; pausa: number };
export const CICLOS: Ciclo[] = [
  { id: "50/10", rotulo: "50/10", foco: 50, pausa: 10 },
  { id: "25/5", rotulo: "25/5", foco: 25, pausa: 5 },
  { id: "90/15", rotulo: "90/15", foco: 90, pausa: 15 },
];
export interface EstadoFoco {
  ciclo: Ciclo; fase: "foco" | "pausa";
  /** Rodando: quando termina (ms) e quando começou este trecho (ms). Parado: quanto falta (s). */
  terminaEm: number | null; iniciadoEm: number | null; restante: number;
  tarefaId: string | null;
  focoHoje: { dia: string; segundos: number };
  /** Foco total ligado (Não Perturbe, só os sites de trabalho, janelinha lateral). */
  total: boolean;
}
export const CHAVE_FOCO = "modo-foco:estado";
const hoje = () => format(new Date(), "yyyy-MM-dd");
const inicial = (): EstadoFoco => ({ ciclo: CICLOS[0], fase: "foco", terminaEm: null, iniciadoEm: null, restante: CICLOS[0].foco * 60, tarefaId: null, focoHoje: { dia: hoje(), segundos: 0 }, total: false });
function ler(): EstadoFoco {
  try {
    const e = { ...inicial(), ...(JSON.parse(localStorage.getItem(CHAVE_FOCO) || "null") ?? {}) } as EstadoFoco;
    return e.focoHoje?.dia === hoje() ? e : { ...e, focoHoje: { dia: hoje(), segundos: 0 } };
  } catch { return inicial(); }
}
export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function tocarFim() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
  } catch { /* sem áudio */ }
}

/** Soma o trecho de foco que estava rodando (até `ate`) no total do dia. */
function fechandoTrecho(e: EstadoFoco, ate: number): EstadoFoco["focoHoje"] {
  const base = e.focoHoje.dia === hoje() ? e.focoHoje.segundos : 0;
  if (e.fase !== "foco" || e.iniciadoEm == null) return { dia: hoje(), segundos: base };
  return { dia: hoje(), segundos: base + Math.max(0, Math.min(ate, e.terminaEm ?? ate) - e.iniciadoEm) / 1000 };
}

export function useFocoTimer(acoes: { iniciarTimer?: (id: string) => unknown; pausarTimer?: (id: string) => unknown } = {}) {
  const [estado, setEstadoBruto] = useState<EstadoFoco>(ler);
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const acoesRef = useRef(acoes);
  acoesRef.current = acoes;
  const setEstado = useCallback((f: (e: EstadoFoco) => EstadoFoco) => {
    const novo = f(ler());   // sempre a partir do que está salvo (a outra janela pode ter mudado)
    estadoRef.current = novo;
    setEstadoBruto(novo);
    try { localStorage.setItem(CHAVE_FOCO, JSON.stringify(novo)); } catch { /* sem storage */ }
  }, []);
  // A outra janela mudou: acompanha.
  useEffect(() => {
    const ouvir = (e: StorageEvent) => { if (e.key === CHAVE_FOCO) setEstadoBruto(ler()); };
    window.addEventListener("storage", ouvir);
    return () => window.removeEventListener("storage", ouvir);
  }, []);

  const [agora, setAgora] = useState(Date.now());
  const rodando = estado.terminaEm != null;
  useEffect(() => {
    if (!rodando) return;
    const t = window.setInterval(() => setAgora(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [rodando]);

  // Fim do bloco: troca de fase (quem perceber primeiro; a outra janela já recebe o estado novo).
  useEffect(() => {
    const e = ler();
    if (e.terminaEm == null || agora < e.terminaEm) return;
    tocarFim();
    const proxima = e.fase === "foco" ? "pausa" : "foco";
    if (e.fase === "foco" && e.tarefaId) void acoesRef.current.pausarTimer?.(e.tarefaId);
    toast.success(proxima === "pausa" ? `Bloco de foco feito! Pausa de ${e.ciclo.pausa} min.` : "Pausa acabou. Bora para o próximo bloco?");
    setEstado((x) => ({ ...x, focoHoje: fechandoTrecho(x, Date.now()), fase: proxima, terminaEm: null, iniciadoEm: null, restante: (proxima === "foco" ? x.ciclo.foco : x.ciclo.pausa) * 60 }));
  }, [agora, setEstado]);

  const parar = (x: EstadoFoco, restante?: number): EstadoFoco => {
    if (x.terminaEm != null && x.fase === "foco" && x.tarefaId) void acoesRef.current.pausarTimer?.(x.tarefaId);
    return { ...x, focoHoje: fechandoTrecho(x, Date.now()), terminaEm: null, iniciadoEm: null, restante: restante ?? x.restante };
  };
  const tocar = useCallback(() => setEstado((x) => {
    if (x.terminaEm != null) return parar(x, Math.max(1, Math.round((x.terminaEm - Date.now()) / 1000)));
    if (x.fase === "foco" && x.tarefaId) void acoesRef.current.iniciarTimer?.(x.tarefaId);
    return { ...x, terminaEm: Date.now() + x.restante * 1000, iniciadoEm: Date.now() };
  }), [setEstado]);
  const comecar = useCallback(() => { if (ler().terminaEm == null) tocar(); }, [tocar]);
  const reiniciar = useCallback(() => setEstado((x) => ({ ...parar(x), restante: (x.fase === "foco" ? x.ciclo.foco : x.ciclo.pausa) * 60 })), [setEstado]);
  const pular = useCallback(() => setEstado((x) => {
    const f = x.fase === "foco" ? "pausa" : "foco";
    return { ...parar(x), fase: f, restante: (f === "foco" ? x.ciclo.foco : x.ciclo.pausa) * 60 };
  }), [setEstado]);
  const escolherCiclo = useCallback((c: Ciclo) => setEstado((x) => ({ ...parar(x), ciclo: c, fase: "foco", restante: c.foco * 60 })), [setEstado]);
  const escolherTarefa = useCallback((id: string | null) => setEstado((x) => {
    if (x.terminaEm != null && x.fase === "foco") {
      if (x.tarefaId) void acoesRef.current.pausarTimer?.(x.tarefaId);
      if (id) void acoesRef.current.iniciarTimer?.(id);
    }
    return { ...x, tarefaId: id };
  }), [setEstado]);
  const marcarTotal = useCallback((total: boolean) => setEstado((x) => ({ ...x, total })), [setEstado]);

  const restante = rodando ? Math.max(0, (estado.terminaEm! - agora) / 1000) : estado.restante;
  const total = (estado.fase === "foco" ? estado.ciclo.foco : estado.ciclo.pausa) * 60;
  const focoHojeSeg = (estado.focoHoje.dia === hoje() ? estado.focoHoje.segundos : 0)
    + (rodando && estado.fase === "foco" && estado.iniciadoEm ? Math.max(0, agora - estado.iniciadoEm) / 1000 : 0);
  return { estado, rodando, restante, total, focoHojeMin: Math.round(focoHojeSeg / 60), tocar, comecar, reiniciar, pular, escolherCiclo, escolherTarefa, marcarTotal };
}
