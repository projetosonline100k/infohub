import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useJarvisConfig } from "@/hooks/useJarvisConfig";

// Item 3 (rodada 3): privacidade do monitoramento de foco nativo — 3
// switches, todos desligados por padrão (opt-in). Reaproveita
// jarvis_configuracoes (mesma tabela de "Sons do Jarvis").
export function AdminJarvisPrivacidade() {
  const { monitorarAppAtivo, setMonitorarAppAtivo, analisarTituloJanela, setAnalisarTituloJanela, detectarDistracoes, setDetectarDistracoes, loading } =
    useJarvisConfig();

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Privacidade</h2>
        <p className="text-sm text-muted-foreground">
          Monitoramento de foco nativo — o Jarvis só olha qual aplicativo/janela está ativo durante uma sessão de
          foco, pra identificar possível desvio. Nunca coleta teclado, senhas, screenshots, mensagens, câmera,
          microfone, conteúdo de formulários ou texto da tela.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="jarvis-monitorar" className="!mt-0">Monitorar aplicativo ativo</Label>
            <p className="text-xs text-muted-foreground">Nome do app em foco (ex.: "Google Chrome") — nunca exige permissão especial.</p>
          </div>
          <Switch id="jarvis-monitorar" checked={monitorarAppAtivo} disabled={loading} onCheckedChange={setMonitorarAppAtivo} />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <div>
            <Label htmlFor="jarvis-titulo" className="!mt-0">Analisar título da janela</Label>
            <p className="text-xs text-muted-foreground">
              Ex.: qual aba do Chrome está aberta. Precisa da permissão de Accessibility do macOS — sem ela, o
              Jarvis segue usando só o nome do app.
            </p>
          </div>
          <Switch id="jarvis-titulo" checked={analisarTituloJanela} disabled={loading} onCheckedChange={setAnalisarTituloJanela} />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <div>
            <Label htmlFor="jarvis-distracoes" className="!mt-0">Detectar possíveis distrações</Label>
            <p className="text-xs text-muted-foreground">
              Depois de um tempo num app ainda não classificado, o Jarvis pergunta se aquilo faz parte da tarefa.
            </p>
          </div>
          <Switch id="jarvis-distracoes" checked={detectarDistracoes} disabled={loading} onCheckedChange={setDetectarDistracoes} />
        </div>
      </Card>
    </div>
  );
}
