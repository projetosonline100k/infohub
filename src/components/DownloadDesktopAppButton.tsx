import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDesktop } from "@/lib/platform";
import { abrirLinkExterno } from "@/lib/abrirLink";

const URL_RELEASES = "https://github.com/projetosonline100k/infohub/releases/latest";

// Convite pra baixar a versão desktop — só na web (mesmo padrão de
// isDesktop() já usado em DashboardLayout.tsx pro <Assistant/>). Aponta pra
// "latest release" do GitHub, que o próprio GitHub mantém sempre
// atualizada — sem precisar de uma página de download própria.
export function DownloadDesktopAppButton() {
  if (isDesktop()) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      title="O macOS ainda não está notarizado pela Apple — na primeira abertura, clique com o botão direito no app → Abrir."
      onClick={() => void abrirLinkExterno(URL_RELEASES)}
    >
      <Download className="h-3.5 w-3.5" />
      Baixar app desktop
    </Button>
  );
}
