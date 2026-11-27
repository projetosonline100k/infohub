/** Som curto de acerto (três notas subindo), gerado na hora, sem arquivo. Chamar dentro do toque da pessoa; sem áudio disponível, não faz nada. */
export function tocarSomDeAcerto(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const audio = new Ctx();
    void audio.resume?.();
    [659.25, 830.61, 1318.51].forEach((hz, k) => {
      const nota = audio.createOscillator(), volume = audio.createGain();
      const inicio = audio.currentTime + k * 0.09;
      nota.type = "triangle";
      nota.frequency.value = hz;
      volume.gain.setValueAtTime(0.0001, inicio);
      volume.gain.exponentialRampToValueAtTime(0.22, inicio + 0.015);
      volume.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.32);
      nota.connect(volume).connect(audio.destination);
      nota.start(inicio);
      nota.stop(inicio + 0.34);
    });
    window.setTimeout(() => void audio.close().catch(() => {}), 900);
  } catch { /* o som é enfeite: nunca trava o treino */ }
}
