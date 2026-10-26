import { useEffect, useRef, type RefObject } from "react";
import { useAbaAtiva } from "@/lib/workspace/abaAtiva";

// As abas do app ficam montadas em segundo plano (não recarregam ao trocar
// de aba). Telas que mostram dados que mudam por fora (Atlas, outra aba,
// outra pessoa) chamam isto pra buscar de novo quando a pessoa VOLTA pra
// elas: ao ativar a aba onde estão ou ao voltar pra janela do app.
// O realtime continua valendo; isto cobre quando ele não chega.
export function useRecarregarAoVoltar(ref: RefObject<HTMLElement>, recarregar: () => void) {
  // A visibilidade da PRÓPRIA guia (26/10): com a guia ativa global, a tela era redesenhada a cada troca.
  const abaAtiva = useAbaAtiva();
  const recarregarRef = useRef(recarregar);
  recarregarRef.current = recarregar;
  const primeiraVez = useRef(true);

  // `offsetParent` é null quando a tela está escondida (aba inativa).
  const visivel = () => !!ref.current && ref.current.offsetParent !== null;

  useEffect(() => {
    if (primeiraVez.current) { primeiraVez.current = false; return; }
    if (!abaAtiva) return;
    // Espera o layout aplicar a troca de aba antes de checar a visibilidade.
    const quadro = requestAnimationFrame(() => { if (visivel()) recarregarRef.current(); });
    return () => cancelAnimationFrame(quadro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva]);

  useEffect(() => {
    let ultima = 0;
    const aoFocar = () => {
      // Evita rajadas (foco + visibilidade disparam juntos).
      if (Date.now() - ultima < 2000 || !visivel()) return;
      ultima = Date.now();
      recarregarRef.current();
    };
    const aoMudarVisibilidade = () => { if (document.visibilityState === "visible") aoFocar(); };
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
