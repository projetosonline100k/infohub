import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDesktop } from "@/lib/platform";
import { abrirLinkExterno } from "@/lib/abrirLink";

const URL_RELEASES = "https://github.com/projetosonline100k/infohub/releases/latest";
const API_ULTIMA_VERSAO = "https://api.github.com/repos/projetosonline100k/infohub/releases/latest";

const ehWindows = () => /win/i.test(navigator.userAgent) && !/darwin|mac/i.test(navigator.userAgent);

// Link direto do instalador da última versão publicada, pro sistema de quem
// clicou: .dmg no Mac, instalador .exe (ou .msi) no Windows. O nome do arquivo
// muda a cada versão, então pergunta pra API do GitHub. Sem resposta (ou sem
// instalador pra esse sistema), cai na página da versão.
async function urlDoInstalador(): Promise<string> {
  try {
    const resposta = await fetch(API_ULTIMA_VERSAO, { headers: { Accept: "application/vnd.github+json" } });
    if (!resposta.ok) return URL_RELEASES;
    const versao = (await resposta.json()) as { assets?: { name: string; browser_download_url: string }[] };
    const arquivos = versao.assets || [];
    const escolhido = ehWindows()
      ? arquivos.find((a) => /setup\.exe$/i.test(a.name)) ?? arquivos.find((a) => /\.exe$/i.test(a.name)) ?? arquivos.find((a) => /\.msi$/i.test(a.name))
      : (() => { const dmgs = arquivos.filter((a) => a.name.endsWith(".dmg")); return dmgs.find((a) => /aarch64|arm64/i.test(a.name)) ?? dmgs[0]; })();
    return escolhido?.browser_download_url ?? URL_RELEASES;
  } catch {
    return URL_RELEASES;
  }
}

// Convite pra baixar a versão desktop — só na web. Baixa direto o .dmg da
// última versão publicada no GitHub (antes abria a página da versão, onde
// ainda era preciso achar o arquivo).
export function DownloadDesktopAppButton() {
  const [buscando, setBuscando] = useState(false);
  if (isDesktop()) return null;

  const baixar = async () => {
    setBuscando(true);
    const url = await urlDoInstalador();
    setBuscando(false);
    // Arquivo do instalador: navegar até ele inicia o download direto.
    if (/\.(dmg|exe|msi)$/i.test(url)) window.location.href = url;
    else void abrirLinkExterno(url);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      title="Baixa o instalador pro seu computador (Mac ou Windows). No Mac, na primeira abertura: botão direito no app → Abrir."
      disabled={buscando}
      onClick={() => void baixar()}
    >
      {buscando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      Baixar app desktop
    </Button>
  );
}
