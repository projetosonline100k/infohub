// Alarmes da Agenda: decide quais eventos devem tocar agora e toca o som.
// O alarme de cada evento fica no próprio evento do Google (ver
// alarmeDoEvento em googleCalendar.ts); quem roda isto é useAlarmesAgenda.

export interface EventoComAlarme {
  chave: string;
  titulo: string;
  inicio: Date;
  minutosAntes: number;
}

// Alarme perdido há mais que isso (app fechado, Mac dormindo) não toca mais.
export const TOLERANCIA_ATRASO_MS = 10 * 60_000;

export const momentoDoAlarme = (evento: EventoComAlarme) => evento.inicio.getTime() - evento.minutosAntes * 60_000;

// Alarmes cujo horário já chegou (dentro da tolerância) e que ainda não tocaram.
export function alarmesParaTocar(eventos: EventoComAlarme[], agora: number, jaTocados: Set<string>): EventoComAlarme[] {
  return eventos.filter((evento) => {
    if (jaTocados.has(evento.chave)) return false;
    const momento = momentoDoAlarme(evento);
    return agora >= momento && agora - momento <= TOLERANCIA_ATRASO_MS;
  });
}

export const OPCOES_ALARME: { valor: number | null; nome: string }[] = [
  { valor: null, nome: "Sem alarme" },
  { valor: 0, nome: "Na hora" },
  { valor: 5, nome: "5 min antes" },
  { valor: 10, nome: "10 min antes" },
  { valor: 15, nome: "15 min antes" },
  { valor: 30, nome: "30 min antes" },
  { valor: 60, nome: "1 hora antes" },
];

// Som do alarme sintetizado (o projeto não tem arquivos de áudio): três
// bipes, repetidos até alguém parar ou por no máximo ~30s.
let audioContext: AudioContext | null = null;

function contexto(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = audioContext || new Ctor();
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

function bipe(ctx: AudioContext, inicio: number) {
  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 988;
  ganho.gain.setValueAtTime(0, inicio);
  ganho.gain.linearRampToValueAtTime(0.25, inicio + 0.01);
  ganho.gain.setValueAtTime(0.25, inicio + 0.12);
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.18);
  osc.connect(ganho);
  ganho.connect(ctx.destination);
  osc.start(inicio);
  osc.stop(inicio + 0.2);
}

export function tocarAlarme(duracaoMaximaMs = 30_000): () => void {
  let parado = false;
  const tocarRodada = () => {
    const ctx = contexto();
    if (!ctx || parado) return;
    const agora = ctx.currentTime;
    [0, 0.25, 0.5].forEach((atraso) => bipe(ctx, agora + atraso));
  };
  tocarRodada();
  const intervalo = window.setInterval(tocarRodada, 1500);
  const limite = window.setTimeout(() => parar(), duracaoMaximaMs);
  function parar() {
    parado = true;
    window.clearInterval(intervalo);
    window.clearTimeout(limite);
  }
  return parar;
}
