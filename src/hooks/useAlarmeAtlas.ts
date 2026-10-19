import { useCallback, useEffect, useRef, useState } from "react";
import { isDesktop } from "@/lib/platform";
import { tocarAlarme } from "@/lib/agendaAlarmes";
import { ouvirAlarmes, responderAlarme, type AcaoAlarme, type PedidoAlarme } from "@/lib/desktop/alarmeAtlas";

// Atlas: o alarme que a janela principal mandou tocar (ver lib/desktop/alarmeAtlas.ts).
// Toca até o Davi escolher (no máximo 10 min), traz o Atlas para a frente de tudo.
export function useAlarmeAtlas(ativo: boolean) {
  const [atual, setAtual] = useState<PedidoAlarme | null>(null);
  const pararSom = useRef<(() => void) | null>(null);

  const silenciar = useCallback(() => { pararSom.current?.(); pararSom.current = null; }, []);

  useEffect(() => {
    if (!ativo || !isDesktop()) return;
    let vivo = true;
    let soltar = () => {};
    void ouvirAlarmes((p) => {
      silenciar();
      pararSom.current = tocarAlarme(10 * 60_000);
      setAtual(p);
      void (async () => {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const j = getCurrentWindow();
          await j.show();
          await j.setAlwaysOnTop(true);
          await j.setVisibleOnAllWorkspaces(true);
        } catch { /* segue só com o som */ }
      })();
    }, (id) => {
      setAtual((a) => (a?.id === id ? null : a));
      silenciar();
    }).then((f) => { if (vivo) soltar = f; else f(); });
    return () => { vivo = false; soltar(); silenciar(); };
  }, [ativo, silenciar]);

  const responder = useCallback((acao: AcaoAlarme) => {
    setAtual((a) => {
      if (a) void responderAlarme(a.id, acao);
      return null;
    });
    silenciar();
  }, [silenciar]);

  return { atual, responder };
}
