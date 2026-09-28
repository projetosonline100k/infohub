import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SalvarSleepGoalInput, SleepGoal } from "@/lib/sleep/SleepService";

interface SleepGoalFormProps {
  meta: SleepGoal | null;
  onSalvar: (input: SalvarSleepGoalInput) => Promise<SleepGoal>;
}

// Meta pessoal (item 7) — nunca uma recomendação médica, só o número que a
// pessoa escolheu.
export function SleepGoalForm({ meta, onSalvar }: SleepGoalFormProps) {
  const [horasMeta, setHorasMeta] = useState(String(Math.floor((meta?.target_sleep_minutes ?? 450) / 60)));
  const [minutosMeta, setMinutosMeta] = useState(String((meta?.target_sleep_minutes ?? 450) % 60));
  const [idealBedTime, setIdealBedTime] = useState(meta?.ideal_bed_time?.slice(0, 5) ?? "");
  const [idealWakeTime, setIdealWakeTime] = useState(meta?.ideal_wake_time?.slice(0, 5) ?? "");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    try {
      await onSalvar({
        targetSleepMinutes: (Number(horasMeta) || 0) * 60 + (Number(minutosMeta) || 0),
        idealBedTime: idealBedTime || null,
        idealWakeTime: idealWakeTime || null,
      });
      toast.success("Meta de sono salva");
    } catch {
      toast.error("Não foi possível salvar a meta");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Meta de sono</h3>
      <div className="space-y-1.5">
        <Label className="text-xs">Meta diária de sono</Label>
        <div className="flex items-center gap-1.5">
          <Input type="number" min={0} max={12} value={horasMeta} onChange={(e) => setHorasMeta(e.target.value)} className="w-16" />
          <span className="text-xs text-muted-foreground">h</span>
          <Input type="number" min={0} max={59} value={minutosMeta} onChange={(e) => setMinutosMeta(e.target.value)} className="w-16" />
          <span className="text-xs text-muted-foreground">min</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Horário ideal pra dormir (opcional)</Label>
          <Input type="time" value={idealBedTime} onChange={(e) => setIdealBedTime(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Horário ideal pra acordar (opcional)</Label>
          <Input type="time" value={idealWakeTime} onChange={(e) => setIdealWakeTime(e.target.value)} />
        </div>
      </div>
      <Button type="button" size="sm" disabled={salvando} onClick={salvar}>
        {salvando ? "Salvando..." : "Salvar meta"}
      </Button>
    </div>
  );
}
