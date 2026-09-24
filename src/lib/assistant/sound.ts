// Som de conclusão (item 7) — não existe nenhum arquivo de áudio no
// projeto, então sintetizo um "chime" curto (duas notas, sine, com
// envelope de volume) via Web Audio API em vez de depender de um asset
// binário. Fica isolado nesta função só — trocar por um .mp3 de verdade
// depois é uma troca pequena e local, sem mexer em quem chama isso.
let audioContext: AudioContext | null = null;

function obterAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioContext) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContext = new Ctor();
    }
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

function tocarNota(ctx: AudioContext, frequenciaHz: number, inicioSegundos: number, duracaoSegundos: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequenciaHz;
  gain.gain.setValueAtTime(0, inicioSegundos);
  gain.gain.linearRampToValueAtTime(volume, inicioSegundos + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, inicioSegundos + duracaoSegundos);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(inicioSegundos);
  osc.stop(inicioSegundos + duracaoSegundos + 0.05);
}

// Discreto de propósito: duas notas curtas (A5 → E6), ~0.3s no total,
// volume baixo. Chamado só se "Sons do Jarvis" estiver ligado (ver
// useJarvisConfig.ts).
export function playConclusaoSound(): void {
  const ctx = obterAudioContext();
  if (!ctx) return;
  const agora = ctx.currentTime;
  tocarNota(ctx, 880, agora, 0.18, 0.08);
  tocarNota(ctx, 1318.5, agora + 0.09, 0.22, 0.07);
}
