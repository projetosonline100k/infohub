import { useCallback, useEffect, useRef, useState } from "react";
import {
  lerTamanhoPainel, limitarTamanhoPainel, redimensionarPainelJarvis, salvarTamanhoPainel, tamanhoMaximoNaTela,
} from "@/lib/desktop/window";

type Tamanho = { width: number; height: number };

// Tamanho do painel do Jarvis, ajustável arrastando o canto superior
// esquerdo (o oposto da orbe, que fica parada). O tamanho escolhido fica
// salvo e vale pras próximas aberturas. No desktop a janela nativa
// acompanha (redimensionarPainelJarvis); na web só a caixa muda.
// `aberto`/`janelaNativa`: ao abrir o painel no desktop, aplica na janela o
// tamanho escolhido — o mesmo caminho do arraste, que já funciona. (Só o
// redimensionamento da abertura deixava a janela no tamanho padrão.)
export function useTamanhoPainelJarvis(aberto = false, janelaNativa = false) {
  const [tamanho, setTamanho] = useState<Tamanho>(lerTamanhoPainel);
  const [redimensionando, setRedimensionando] = useState(false);
  const quadro = useRef(0);
  // Último tamanho escolhido nesta sessão (o salvo no navegador é só pra
  // quando o app reabre do zero).
  const tamanhoRef = useRef(tamanho);
  tamanhoRef.current = tamanho;

  useEffect(() => {
    if (!aberto || !janelaNativa) return;
    let cancelado = false;
    void (async () => {
      const salvo = tamanhoRef.current;
      const maximo = await tamanhoMaximoNaTela();
      const alvo = { width: Math.min(salvo.width, Math.max(380, maximo.width)), height: Math.min(salvo.height, Math.max(460, maximo.height)) };
      if (cancelado) return;
      setTamanho(alvo);
      await redimensionarPainelJarvis(alvo);
    })();
    return () => { cancelado = true; };
  }, [aberto, janelaNativa]);

  const iniciarRedimensionamento = useCallback(async (evento: React.PointerEvent<HTMLElement>) => {
    if (evento.button !== 0) return;
    evento.preventDefault();
    evento.stopPropagation();
    const alvo = evento.currentTarget;
    alvo.setPointerCapture(evento.pointerId);
    // Coordenadas de TELA: a janela se move enquanto cresce, então as
    // relativas à janela "andariam" junto com o ponteiro.
    const inicio = { x: evento.screenX, y: evento.screenY };
    const base = tamanho;
    const maximo = await tamanhoMaximoNaTela();
    let atual = base;
    setRedimensionando(true);

    const mover = (e: PointerEvent) => {
      // Arrastar pra esquerda/pra cima aumenta (o canto oposto é fixo).
      const desejado = limitarTamanhoPainel({ width: base.width - (e.screenX - inicio.x), height: base.height - (e.screenY - inicio.y) });
      atual = { width: Math.min(desejado.width, Math.max(380, maximo.width)), height: Math.min(desejado.height, Math.max(460, maximo.height)) };
      cancelAnimationFrame(quadro.current);
      quadro.current = requestAnimationFrame(() => {
        setTamanho(atual);
        void redimensionarPainelJarvis(atual);
        // Salva já durante o arraste: a janela se move enquanto cresce e o
        // "soltou" às vezes nem chega (o ponteiro sai da alça / a captura se
        // perde) — antes disso o tamanho não era salvo e reabria no original.
        salvarTamanhoPainel(atual);
      });
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      setRedimensionando(false);
      salvarTamanhoPainel(atual);
    };
    // Na janela toda (não só na alça), pelo mesmo motivo acima.
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }, [tamanho]);

  return { tamanho, redimensionando, iniciarRedimensionamento };
}
