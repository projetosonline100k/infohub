import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { AssistantEyes } from "./AssistantEyes";
import { AssistantOrbRing, type AssistantOrbRingEstado } from "./AssistantOrbRing";

interface AssistantOrbProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  open?: boolean;
  // "green" = pulso breve de brilho verde (ver Assistant.tsx, disparado ao
  // concluir uma tarefa) — some sozinho, quem chama volta a null depois.
  pulse?: "green" | null;
  // Anel de progresso (item 9) — null/undefined = sem foco ativo, some.
  ring?: { progress: number; estado: AssistantOrbRingEstado } | null;
}

// A face inteira (aro ciano + núcleo escuro + brilho) já vem pronta nas
// imagens de olhos (ver AssistantEyes) — aqui só sobra o "respirar"
// (drop-shadow + leve scale, num wrapper interno) e a interação (hover no
// botão externo, arraste via onPointerDown vindo de fora). Respirar e hover
// ficam em elementos DOM diferentes de propósito: os dois mexem em
// `transform`, e em elementos diferentes eles compõem em vez de brigar.
export const AssistantOrb = forwardRef<HTMLButtonElement, AssistantOrbProps>(
  ({ open, pulse, ring, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={open ? "Fechar assistente" : "Abrir assistente"}
      aria-expanded={open}
      className={cn(
        "relative flex h-[60px] w-[60px] shrink-0 cursor-grab select-none items-center justify-center rounded-full",
        "transition-transform duration-300 ease-out hover:scale-110 active:cursor-grabbing active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      {...props}
    >
      {ring && <AssistantOrbRing progress={ring.progress} estado={ring.estado} />}
      <div className={cn("relative h-full w-full", pulse === "green" ? "animate-orb-glow-green" : "animate-orb-glow-pulse")}>
        <AssistantEyes className="relative h-full w-full" />
      </div>
    </button>
  ),
);
AssistantOrb.displayName = "AssistantOrb";
