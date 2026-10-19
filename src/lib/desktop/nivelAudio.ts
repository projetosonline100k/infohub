// Nível do microfone enquanto o Atlas ouve (18/10/2026, Davi: "uma órbita em volta do Atlas,
// vibrando no áudio que estou gravando"). Quem grava (useDitado, useAssistantVoz) chama
// medirAudio(stream); a orbe (OndaVoz) ouve as faixas a cada quadro, sem re-render do React.
export const FAIXAS = 48;

type Ouvinte = (faixas: Float32Array, volume: number) => void;
const ouvintes = new Set<Ouvinte>();

export function ouvirNivel(f: Ouvinte): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/** Começa a medir o microfone; devolve a função que para. */
export function medirAudio(stream: MediaStream): () => void {
  let ctx: AudioContext;
  try { ctx = new AudioContext(); } catch { return () => {}; }
  const fonte = ctx.createMediaStreamSource(stream);
  const analisador = ctx.createAnalyser();
  analisador.fftSize = 512;
  analisador.smoothingTimeConstant = 0.72;
  fonte.connect(analisador);
  const bins = new Uint8Array(analisador.frequencyBinCount);
  const faixas = new Float32Array(FAIXAS);
  let quadro = 0;
  const passo = () => {
    analisador.getByteFrequencyData(bins);
    // Voz fica nas faixas baixas/médias: usa os ~100 primeiros bins (até ~9 kHz), espelhados
    // para o anel ficar simétrico (metade de cima = metade de baixo).
    const metade = FAIXAS / 2;
    let soma = 0;
    for (let i = 0; i < metade; i++) {
      const a = Math.floor((i / metade) ** 1.4 * 100), b = Math.max(a + 1, Math.floor(((i + 1) / metade) ** 1.4 * 100));
      let m = 0;
      for (let k = a; k < b; k++) m = Math.max(m, bins[k]);
      const v = Math.min(1, (m / 255) ** 1.6 * 1.35);
      faixas[i] = v;
      faixas[FAIXAS - 1 - i] = v;
      soma += v;
    }
    const volume = Math.min(1, (soma / metade) * 1.8);
    ouvintes.forEach((f) => f(faixas, volume));
    quadro = requestAnimationFrame(passo);
  };
  quadro = requestAnimationFrame(passo);
  return () => {
    cancelAnimationFrame(quadro);
    ouvintes.forEach((f) => f(new Float32Array(FAIXAS), 0));
    try { fonte.disconnect(); } catch { /* já desligado */ }
    void ctx.close();
  };
}
