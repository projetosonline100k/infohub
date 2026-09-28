import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSleepToday } from "@/hooks/useSleepToday";
import { formatarDuracao } from "@/lib/sleep/SleepService";

interface AssistantSleepSectionProps {
  onRegistrar: () => void;
}

// "SONO" no Jarvis (item 14) — pequeno, não ocupa muito espaço.
export function AssistantSleepSection({ onRegistrar }: AssistantSleepSectionProps) {
  const { log, loading } = useSleepToday();
  if (loading) return null;

  return (
    <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Sono</p>
      {log ? (
        <p className="text-sm text-foreground">
          {formatarDuracao(log.total_sleep_minutes)} <span className="text-xs text-muted-foreground">· Qualidade {log.quality_score}/10</span>
        </p>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Como foi sua noite?</p>
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={onRegistrar}>
            <Moon className="h-3 w-3" />
            Registrar
          </Button>
        </div>
      )}
    </div>
  );
}
