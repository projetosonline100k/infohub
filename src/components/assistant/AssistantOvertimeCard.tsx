import { JarvisNotificationCard, type JarvisNotificationAction } from "./JarvisNotificationCard";
import { formatarCronometro } from "./format";

interface AssistantOvertimeCardProps {
  estimadoMin: number;
  executadoSegundos: number;
  onContinuar: () => void;
  onEstender: () => void;
  onFinalizar: () => void;
}

// Overtime (item 5, rodada 7) — era um Dialog modal (Radix), centralizado
// na tela e sem participar do redimensionamento da janela `jarvis`, o que
// cortava tudo quando a janela estava no tamanho da orbe (80~120px). Agora
// é uma notificação normal, mesmo componente compartilhado (rodada 7, item
// 1) e mesmo mecanismo de balão/janela das outras (ver temBalaoVisivel em
// Assistant.tsx).
export function AssistantOvertimeCard({ estimadoMin, executadoSegundos, onContinuar, onEstender, onFinalizar }: AssistantOvertimeCardProps) {
  const executadoMin = Math.round(executadoSegundos / 60);
  const excedidoMin = Math.max(0, executadoMin - estimadoMin);
  const acoes: JarvisNotificationAction[] = [
    { label: "Continuar", onClick: onContinuar, variant: "default" },
    { label: "+10 min", onClick: onEstender, variant: "outline" },
    { label: "Concluir", onClick: onFinalizar, variant: "outline" },
  ];

  return (
    <JarvisNotificationCard titulo="⏰ Tempo previsto concluído" acoes={acoes}>
      <p>Você planejou {estimadoMin} min.</p>
      <p className="pt-1">
        Agora está em <span className="font-medium text-foreground">{formatarCronometro(executadoSegundos)}</span> (+{excedidoMin} min).
      </p>
    </JarvisNotificationCard>
  );
}
