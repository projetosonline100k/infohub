import { SleepRegisterForm } from "@/components/sleep/SleepRegisterForm";
import type { SalvarSleepLogInput, SleepLog } from "@/lib/sleep/SleepService";

interface StartDaySleepStepProps {
  onSalvar: (input: SalvarSleepLogInput) => Promise<SleepLog>;
  onContinuar: () => void;
}

// "Como foi sua noite?" (item 10) — só aparece quando ainda não existe
// sleep_log de hoje. Perguntas rápidas numa tela só (não uma por tela, item
// "não deixar o ritual muito longo"), reaproveitando SleepRegisterForm.tsx
// em modo compacto (sem observação). Pulável — "Cancelar" avança sem
// registrar, mesmo espírito calmo do resto do ritual.
export function StartDaySleepStep({ onSalvar, onContinuar }: StartDaySleepStepProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
        <div className="space-y-1 text-center">
          <p className="text-3xl" aria-hidden="true">🌙</p>
          <h2 className="text-lg font-semibold text-foreground">Como foi sua noite?</h2>
        </div>
        <SleepRegisterForm compacto onSalvar={onSalvar} onSalvo={onContinuar} onCancelar={onContinuar} />
      </div>
    </div>
  );
}
