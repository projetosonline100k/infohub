import { AssistantRotinasSection } from "./AssistantRotinasSection";
import { AssistantSleepSection } from "./AssistantSleepSection";

interface AssistantPerformanceTabProps {
  onVerPerformance: () => void;
  onRegistrarSono: () => void;
}

// Guia própria pra Rotinas + Sono — antes viviam dentro de "Hoje", que
// tinha virado informação demais numa tela só. Mesmos componentes e dados
// de sempre (AssistantRotinasSection/AssistantSleepSection), só numa aba
// separada.
export function AssistantPerformanceTab({ onVerPerformance, onRegistrarSono }: AssistantPerformanceTabProps) {
  return (
    <div className="space-y-3">
      <AssistantRotinasSection onVerPerformance={onVerPerformance} />
      <AssistantSleepSection onRegistrar={onRegistrarSono} />
    </div>
  );
}
