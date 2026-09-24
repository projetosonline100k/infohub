import { JarvisNotificationCard, type JarvisNotificationAction } from "./JarvisNotificationCard";

interface AssistantHourAlertProps {
  hora: string; // ex.: "15:00"
  tarefaAtualTitulo: string | null;
  pausado: boolean;
  pendentesCount: number;
  onContinuar: () => void;
  onTrocarTarefa: () => void;
  onPausar: () => void;
  onRetomar: () => void;
}

// Alerta de troca de bloco de horário (item 5) — mesmo componente
// compartilhado de todas as notificações do Jarvis (rodada 7, item 1/6).
export function AssistantHourAlert({
  hora,
  tarefaAtualTitulo,
  pausado,
  pendentesCount,
  onContinuar,
  onTrocarTarefa,
  onPausar,
  onRetomar,
}: AssistantHourAlertProps) {
  const acoes: JarvisNotificationAction[] = tarefaAtualTitulo
    ? [
        { label: "Continuar", onClick: onContinuar, variant: "default" },
        { label: "Trocar tarefa", onClick: onTrocarTarefa, variant: "outline" },
        { label: pausado ? "Retomar" : "Pausar", onClick: pausado ? onRetomar : onPausar, variant: "outline" },
      ]
    : [{ label: "Ver tarefas", onClick: onTrocarTarefa, variant: "default" }];

  return (
    <JarvisNotificationCard titulo={hora} acoes={acoes}>
      <p>Nova hora começando.</p>
      {tarefaAtualTitulo ? (
        <p className="pt-1">
          Você quer continuar em: <span className="font-medium text-foreground">{tarefaAtualTitulo}</span>?
        </p>
      ) : (
        <p className="pt-1">
          {pendentesCount > 0
            ? `Você ainda tem ${pendentesCount} tarefa${pendentesCount > 1 ? "s" : ""} pendente${pendentesCount > 1 ? "s" : ""} hoje.`
            : "Sem tarefas pendentes por agora."}
        </p>
      )}
    </JarvisNotificationCard>
  );
}
