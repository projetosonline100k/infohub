import confetti from "canvas-confetti";

// Confete discreto ao concluir uma tarefa (item 7) — burst curto a partir
// da posição da orbe. `origem` em frações da viewport (0..1, mesma
// convenção do canvas-confetti); sem isso, dispara do canto inferior
// direito (onde a orbe normalmente fica, tanto no card embutido quanto na
// janela nativa do Jarvis — dentro dela o "viewport" é a própria janela
// pequena, então o burst fica naturalmente contido nela).
export function dispararConfete(origem?: { x: number; y: number }): void {
  try {
    void confetti({
      particleCount: 36,
      spread: 55,
      startVelocity: 28,
      gravity: 1.1,
      scalar: 0.8,
      ticks: 120,
      origin: origem ?? { x: 0.85, y: 0.85 },
      colors: ["#22d3ee", "#34d399", "#fbbf24", "#f472b6"],
      disableForReducedMotion: true,
    });
  } catch {
    /* ignora — a celebração ainda tem o halo verde + som */
  }
}
