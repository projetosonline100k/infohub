import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { OPCOES_WAKE_FEELING, type SalvarSleepLogInput, type SleepLog, type WakeFeeling } from "@/lib/sleep/SleepService";

interface SleepRegisterFormProps {
  logExistente?: SleepLog | null;
  onSalvar: (input: SalvarSleepLogInput) => Promise<SleepLog>;
  onSalvo: (log: SleepLog) => void;
  onCancelar?: () => void;
  // Usado no passo de sono do Começar o dia — esconde observação, pra não
  // deixar o ritual longo (item 10 do pedido).
  compacto?: boolean;
}

// Formulário único de registro — reaproveitado na aba Sono, no diálogo
// rápido do Jarvis e no passo de sono do Começar o dia.
export function SleepRegisterForm({ logExistente, onSalvar, onSalvo, onCancelar, compacto }: SleepRegisterFormProps) {
  const [bedTime, setBedTime] = useState(logExistente?.bed_time?.slice(0, 5) ?? "23:00");
  const [wakeTime, setWakeTime] = useState(logExistente?.wake_time?.slice(0, 5) ?? "07:00");
  const [qualityScore, setQualityScore] = useState(logExistente?.quality_score ?? 7);
  const [nightAwakenings, setNightAwakenings] = useState(
    logExistente?.night_awakenings != null ? String(logExistente.night_awakenings) : ""
  );
  const [wakeFeeling, setWakeFeeling] = useState<WakeFeeling | null>((logExistente?.wake_feeling as WakeFeeling) ?? null);
  const [notes, setNotes] = useState(logExistente?.notes ?? "");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      const salvo = await onSalvar({
        bedTime,
        wakeTime,
        qualityScore,
        nightAwakenings: nightAwakenings ? Number(nightAwakenings) : null,
        wakeFeeling,
        notes: compacto ? null : notes,
      });
      toast.success("Sono registrado");
      onSalvo(salvo);
    } catch {
      toast.error("Não foi possível registrar o sono");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="sleep-bed-time" className="text-xs">Que horas você dormiu?</Label>
          <Input id="sleep-bed-time" type="time" value={bedTime} onChange={(e) => setBedTime(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sleep-wake-time" className="text-xs">Que horas acordou?</Label>
          <Input id="sleep-wake-time" type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Como você avalia seu sono? ({qualityScore}/10)</Label>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQualityScore(n)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium transition-colors",
                qualityScore === n ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Como você acordou?</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {OPCOES_WAKE_FEELING.map((op) => (
            <button
              key={op.valor}
              type="button"
              onClick={() => setWakeFeeling(op.valor)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                wakeFeeling === op.valor ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sleep-awakenings" className="text-xs">Quantas vezes acordou durante a noite? (opcional)</Label>
        <Input id="sleep-awakenings" type="number" min={0} value={nightAwakenings} onChange={(e) => setNightAwakenings(e.target.value)} className="w-24" />
      </div>

      {!compacto && (
        <div className="space-y-1.5">
          <Label htmlFor="sleep-notes" className="text-xs">Observação (opcional)</Label>
          <Textarea id="sleep-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none" />
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="button" className="flex-1" disabled={salvando} onClick={salvar}>
          {salvando ? "Salvando..." : "Salvar"}
        </Button>
        {onCancelar && (
          <Button type="button" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
