import { useEffect, useRef, useState } from "react";
import eye1 from "@/assets/assistant/eye-1.png";
import eye2 from "@/assets/assistant/eye-2.png";
import eye3 from "@/assets/assistant/eye-3.png";
import eye4 from "@/assets/assistant/eye-4.png";

// 1 = olhando de frente (estado padrão), 4 = piscando/olhos fechados. 2/3
// (olhar de lado) não são mais usados pelo loop de gestos — item 6 do
// refinamento removeu essa animação; os frames continuam definidos aqui
// só porque os arquivos já existem, sem custo em mantê-los.
const FRAMES: Record<1 | 2 | 3 | 4, string> = { 1: eye1, 2: eye2, 3: eye3, 4: eye4 };

const aleatorioEntre = (min: number, max: number) => min + Math.random() * (max - min);

interface AssistantEyesProps {
  className?: string;
  // Enquanto true, os olhos ficam fechados (frame 4) de forma estática — o
  // loop de gestos pausa. Usado quando a tarefa atual está pausada.
  pausado?: boolean;
}

// Ciclo "vivo" de gestos: a maior parte do tempo no frame 1, ocasionalmente
// pisca, sempre voltando pro 1 — com intervalos levemente variados pra não
// parecer mecânico. Usa setTimeout recursivo (não setInterval) justamente
// pra poder sortear uma duração diferente a cada rodada.
export function AssistantEyes({ className, pausado }: AssistantEyesProps) {
  const [frame, setFrame] = useState<1 | 2 | 3 | 4>(1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Pré-carrega os 4 frames uma única vez — troca instantânea depois, sem
  // flicker esperando o navegador buscar a imagem na hora do gesto.
  useEffect(() => {
    Object.values(FRAMES).forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  useEffect(() => {
    if (pausado) {
      clearTimeout(timeoutRef.current);
      setFrame(4);
      return;
    }

    setFrame(1);

    function agendarProximoGesto() {
      timeoutRef.current = setTimeout(() => {
        setFrame(4);
        timeoutRef.current = setTimeout(() => {
          setFrame(1);
          agendarProximoGesto();
        }, aleatorioEntre(120, 180));
      }, aleatorioEntre(2500, 6000));
    }

    agendarProximoGesto();
    return () => clearTimeout(timeoutRef.current);
  }, [pausado]);

  return (
    <div className={className}>
      {([1, 2, 3, 4] as const).map((f) => (
        <img
          key={f}
          src={FRAMES[f]}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-contain transition-opacity duration-75"
          style={{ opacity: frame === f ? 1 : 0 }}
        />
      ))}
    </div>
  );
}
