import { forwardRef, memo } from "react";
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
  // Tarefa atual pausada — olhos ficam fechados (ver AssistantEyes).
  pausado?: boolean;
}

// Rodada 7, itens 3/4: isolado num componente memoizado à parte,
// dependendo SÓ de `pulse`/`pausado` — o timer de foco (Assistant.tsx)
// atualiza `ring`/`elapsedSegundos` a cada segundo, o que já forçava
// AssistantOrb inteiro a re-renderizar; sem esse memo, o React ficava
// reaplicando estilo no MESMO elemento que roda a animação de respiração a
// cada tick, o que competia com a CSS animation (mistura de `animation` +
// `transition` na mesma propriedade, ver comentário abaixo) e fazia parecer
// que o glow reiniciava/acelerava. Com o memo, nada relacionado ao
// cronômetro/anel chega aqui — só pulse (celebração) e pausado (piscar).
const AssistantOrbGlowFace = memo(function AssistantOrbGlowFace({ pulse, pausado }: { pulse?: "green" | null; pausado?: boolean }) {
  return (
    // OrbGlow: SÓ a respiração contínua (filter: drop-shadow + scale via
    // @keyframes, animate-orb-glow-*). Nenhuma `transition-*` pode viver
    // neste MESMO elemento — misturar uma CSS transition e uma CSS
    // animation que mexem na mesma propriedade (transform) no mesmo
    // elemento faz o motor recalcular a interpolação a cada mudança de
    // estilo, o que parecia "pulso acelerado". Por isso o hover/active mora
    // num elemento FILHO (OrbFace) separado. NUNCA leva overflow-hidden
    // aqui: filter + overflow-hidden + border-radius no mesmo elemento é um
    // bug conhecido do WebKit (motor do Tauri no macOS) — o backing store
    // do filtro ignora o recorte e desenha um quadrado.
    <div className={cn("relative h-full w-full rounded-full", pulse === "green" ? "animate-orb-glow-green" : "animate-orb-glow-pulse")}>
      {/* OrbFace: só o hover/active scale (transition, não animation) —
          escala só a face, nunca o wrapper/ring, senão o relógio de
          progresso escala junto e passa dos limites físicos da janela no
          hover. */}
      <div className="relative h-full w-full rounded-full transition-transform duration-300 ease-out hover:scale-110 active:scale-95">
        {/* EyesLayer: só o recorte circular, sem filter/animation/
            transition — blindagem contra cantos quadrados nos PNGs dos
            olhos. */}
        <div className="relative h-full w-full overflow-hidden rounded-full">
          <AssistantEyes className="relative h-full w-full" pausado={pausado} />
        </div>
      </div>
    </div>
  );
});

// A face inteira (aro ciano + núcleo escuro + brilho) já vem pronta nas
// imagens de olhos (ver AssistantEyes) — aqui só sobra o "respirar"
// (drop-shadow + leve scale) e a interação (hover no botão externo,
// arraste via onPointerDown vindo de fora).
export const AssistantOrb = forwardRef<HTMLButtonElement, AssistantOrbProps>(
  ({ open, pulse, ring, pausado, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={open ? "Fechar assistente" : "Abrir assistente"}
      aria-expanded={open}
      className={cn(
        // Rodada 8, item 8: face ~64px (era 60px) — janela da orbe agora é
        // 140x140, com sobra de verdade pro anel (~100px) + halo + hover.
        "relative flex h-16 w-16 shrink-0 cursor-grab select-none items-center justify-center rounded-full",
        "active:cursor-grabbing",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      {...props}
    >
      {/* ProgressRing: FORA de qualquer wrapper com overflow-hidden ou
          scale, e fora do componente memoizado acima — é exatamente o que
          precisa atualizar a cada segundo (progresso do foco), sem
          contaminar o glow/eyes com re-renders. Ela mesma já vaza de
          propósito além do círculo de 60px (ver AssistantOrbRing.tsx). */}
      {ring && <AssistantOrbRing progress={ring.progress} estado={ring.estado} />}
      <AssistantOrbGlowFace pulse={pulse} pausado={pausado} />
    </button>
  ),
);
AssistantOrb.displayName = "AssistantOrb";
