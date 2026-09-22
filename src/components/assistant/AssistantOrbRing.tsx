import { cn } from "@/lib/utils";

export type AssistantOrbRingEstado = "foco" | "pausado" | "concluido";

interface AssistantOrbRingProps {
  // 0..1 — elapsedSegundos / (tempo_estimado ?? 25min), capado em 1.
  progress: number;
  estado: AssistantOrbRingEstado;
}

const N_PONTOS = 40;
const RAIO_PX = 38;

const CORES: Record<AssistantOrbRingEstado, string> = {
  foco: "bg-cyan-400 shadow-[0_0_4px_1px_rgba(34,211,238,0.9)]",
  pausado: "bg-amber-400 shadow-[0_0_4px_1px_rgba(251,191,36,0.9)]",
  concluido: "bg-emerald-400 shadow-[0_0_4px_1px_rgba(52,211,153,0.9)]",
};

// Relógio circular de pontinhos ao redor da orbe — acende no sentido
// horário conforme o foco avança. Fica FORA do círculo de 60px da orbe
// (raio 38px do centro), então nunca cobre os olhos. Puramente decorativo
// (pointer-events-none), não interfere no drag/clique da orbe.
export function AssistantOrbRing({ progress, estado }: AssistantOrbRingProps) {
  const fracaoAcesa = Math.max(0, Math.min(1, progress));

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {Array.from({ length: N_PONTOS }).map((_, i) => {
        const fracao = i / N_PONTOS;
        const aceso = fracao <= fracaoAcesa;
        // -90° pra começar às 12h, sentido horário conforme fracao cresce.
        const angulo = fracao * 360 - 90;
        const rad = (angulo * Math.PI) / 180;
        const x = Math.cos(rad) * RAIO_PX;
        const y = Math.sin(rad) * RAIO_PX;
        return (
          <span
            key={i}
            className={cn(
              "absolute left-1/2 top-1/2 h-[3px] w-[3px] rounded-full transition-colors duration-300",
              aceso ? CORES[estado] : "bg-foreground/15",
            )}
            style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
          />
        );
      })}
    </div>
  );
}
