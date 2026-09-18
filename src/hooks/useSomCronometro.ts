import { useEffect, useState } from "react";

// Preferência global "tocar som de relógio enquanto o timer de uma
// atividade está rodando" — guardada no navegador (não é dado do negócio,
// então não vai pro banco) e compartilhada entre todos os cards do Kanban
// abertos ao mesmo tempo via um pub/sub bem simples em módulo.
const STORAGE_KEY = "atividades:timer-som-ativo";

type Listener = (valor: boolean) => void;
const listeners = new Set<Listener>();

function lerPreferenciaInicial(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let somAtivo = lerPreferenciaInicial();

function definirSomAtivo(valor: boolean) {
  somAtivo = valor;
  try {
    window.localStorage.setItem(STORAGE_KEY, valor ? "1" : "0");
  } catch {
    // Sem localStorage disponível (modo privado etc.) — a preferência só
    // não sobrevive a um reload, sem problema.
  }
  listeners.forEach((listener) => listener(valor));
}

export function useSomCronometro(): [boolean, (valor: boolean) => void] {
  const [valor, setValor] = useState(somAtivo);

  useEffect(() => {
    listeners.add(setValor);
    return () => {
      listeners.delete(setValor);
    };
  }, []);

  return [valor, definirSomAtivo];
}

// Um "tique" curto sintetizado na hora (sem depender de arquivo de áudio) —
// um clique agudo e curto, no estilo do ponteiro de um relógio analógico.
let audioCtx: AudioContext | null = null;

export function tocarTique() {
  try {
    const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    audioCtx = audioCtx || new AudioCtor();
    if (audioCtx.state === "suspended") void audioCtx.resume();

    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch {
    // Web Audio indisponível — ignora silenciosamente, o timer continua ok.
  }
}
