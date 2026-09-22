import { useEffect, useRef, useState } from "react";
import eye1 from "@/assets/assistant/eye-1.png";
import eye2 from "@/assets/assistant/eye-2.png";
import eye3 from "@/assets/assistant/eye-3.png";
import eye4 from "@/assets/assistant/eye-4.png";

// 1 = olhando de frente (estado padrão), 2/3 = olhando pro lado, 4 = piscando.
const FRAMES: Record<1 | 2 | 3 | 4, string> = { 1: eye1, 2: eye2, 3: eye3, 4: eye4 };

const aleatorioEntre = (min: number, max: number) => min + Math.random() * (max - min);

// Ciclo "vivo" de gestos: a maior parte do tempo no frame 1, ocasionalmente
// pisca (rápido) ou olha de lado (um pouco mais devagar), sempre voltando
// pro 1 — com intervalos levemente variados pra não parecer mecânico.
// Usa setTimeout recursivo (não setInterval) justamente pra poder sortear
// uma duração diferente a cada rodada.
export function AssistantEyes({ className }: { className?: string }) {
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
    function agendarProximoGesto() {
      timeoutRef.current = setTimeout(() => {
        const piscar = Math.random() < 0.7; // pisca é bem mais comum que olhar de lado
        if (piscar) {
          setFrame(4);
          timeoutRef.current = setTimeout(() => {
            setFrame(1);
            agendarProximoGesto();
          }, aleatorioEntre(120, 180));
        } else {
          setFrame(Math.random() < 0.5 ? 2 : 3);
          timeoutRef.current = setTimeout(() => {
            setFrame(1);
            agendarProximoGesto();
          }, aleatorioEntre(450, 700));
        }
      }, aleatorioEntre(2500, 6000));
    }

    agendarProximoGesto();
    return () => clearTimeout(timeoutRef.current);
  }, []);

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
