import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatarTempo } from "@/lib/utils";
import { isDesktop } from "@/lib/platform";
import { MacSleepConfirmDialog } from "./MacSleepConfirmDialog";
import type { RelatorioDiario } from "@/lib/productivity/DailyReportService";

interface EndOfDaySummaryProps {
  relatorio: RelatorioDiario;
  onFechar: () => void;
  onVerRelatorioCompleto: () => void;
}

function Estatistica({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

// Resumo final (item 6) — mesmo tom "só fatos, sem nota secreta" de
// AssistantSessionSummary.tsx, calmo de propósito (item 8).
export function EndOfDaySummary({ relatorio, onFechar, onVerRelatorioCompleto }: EndOfDaySummaryProps) {
  const [confirmandoRepouso, setConfirmandoRepouso] = useState(false);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto px-1 py-4 text-center">
      <p className="text-4xl" aria-hidden="true">🌙</p>
      <h2 className="text-lg font-semibold text-foreground">Seu dia está encerrado.</h2>

      <div className="grid w-full grid-cols-2 gap-2 text-left">
        <Estatistica label="Produtividade" value={`${relatorio.productivity_score}/10`} />
        <Estatistica label="Foco" value={formatarTempo(Math.round(relatorio.focused_seconds / 60))} />
        <Estatistica label="Tarefas concluídas" value={String(relatorio.completed_tasks)} />
        <Estatistica label="Distrações" value={relatorio.distraction_seconds > 0 ? formatarTempo(Math.round(relatorio.distraction_seconds / 60)) : "—"} />
        <Estatistica label="Maior sessão" value={relatorio.longest_focus_seconds > 0 ? formatarTempo(Math.round(relatorio.longest_focus_seconds / 60)) : "—"} />
        <Estatistica label="Prioridade de hoje" value={relatorio.completed_main_priority ? "Concluída" : "Não concluída"} />
      </div>

      {relatorio.main_win && (
        <p className="text-sm text-muted-foreground">
          Principal vitória
          <br />
          <span className="text-foreground">"{relatorio.main_win}"</span>
        </p>
      )}
      {relatorio.tomorrow_main_priority && (
        <p className="text-sm text-muted-foreground">
          Prioridade de amanhã
          <br />
          <span className="text-foreground">"{relatorio.tomorrow_main_priority}"</span>
        </p>
      )}

      <div className="flex w-full flex-col gap-2 pt-2">
        {isDesktop() && (
          <Button type="button" variant="outline" onClick={() => setConfirmandoRepouso(true)}>
            Repousar Mac
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onVerRelatorioCompleto}>
          Ver relatório completo
        </Button>
        <Button type="button" onClick={onFechar}>
          Voltar ao Jarvis
        </Button>
      </div>

      <MacSleepConfirmDialog open={confirmandoRepouso} onOpenChange={setConfirmandoRepouso} />
    </div>
  );
}
