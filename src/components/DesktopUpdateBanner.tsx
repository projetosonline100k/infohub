import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDesktop } from "@/lib/platform";
import { checkForUpdate, installUpdateAndRelaunch, type UpdateInfo } from "@/lib/desktop/updater";

const INTERVALO_CHECAGEM_MS = 4 * 60 * 60 * 1000; // 4h — sessão pode ficar aberta o dia inteiro (fechar a janela só esconde, ver docs/DESKTOP.md)

// Auto-update de verdade (reaproveita checkForUpdate/installUpdateAndRelaunch
// de src/lib/desktop/updater.ts, sem alterá-los) — só aparece no desktop, só
// quando existe atualização de verdade disponível no endpoint configurado em
// tauri.conf.json. "Depois" dispensa só a notificação atual; a próxima
// checagem periódica avisa de novo se ainda estiver desatualizado.
export function DesktopUpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [instalando, setInstalando] = useState(false);
  const [dispensado, setDispensado] = useState(false);

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelado = false;
    const checar = () => {
      checkForUpdate().then((info) => {
        if (!cancelado && info) {
          setUpdate(info);
          setDispensado(false);
        }
      });
    };
    checar();
    const id = setInterval(checar, INTERVALO_CHECAGEM_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, []);

  if (!update || dispensado) return null;

  const atualizar = async () => {
    setInstalando(true);
    try {
      await installUpdateAndRelaunch();
    } catch {
      setInstalando(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-cyan-500/30 bg-cyan-500/10 px-6 py-2 text-sm">
      <span className="text-foreground">
        Nova versão do Infopro Hub Desktop disponível{update.version ? ` (v${update.version})` : ""}.
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" size="sm" className="gap-1.5" onClick={atualizar} disabled={instalando}>
          <Download className="h-3.5 w-3.5" />
          {instalando ? "Instalando..." : "Atualizar agora"}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDispensado(true)} aria-label="Dispensar">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
