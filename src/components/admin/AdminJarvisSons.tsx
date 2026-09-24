import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useJarvisConfig } from "@/hooks/useJarvisConfig";

// Item 7 do refinamento: ON/OFF do som de conclusão (sintetizado, ver
// src/lib/assistant/sound.ts). Guardado em jarvis_configuracoes, com
// Realtime — reflete entre as janelas main/jarvis sem reload.
export function AdminJarvisSons() {
  const { somAtivado, loading, setSomAtivado } = useJarvisConfig();

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Sons do Jarvis</h2>
        <p className="text-sm text-muted-foreground">Som curto e discreto ao concluir uma atividade.</p>
      </div>
      <Card className="flex items-center justify-between gap-4 p-4">
        <Label htmlFor="jarvis-som" className="!mt-0">
          Tocar som ao concluir tarefas
        </Label>
        <Switch id="jarvis-som" checked={somAtivado} disabled={loading} onCheckedChange={setSomAtivado} />
      </Card>
    </div>
  );
}
