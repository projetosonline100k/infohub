import { JarvisNotificationCard, type JarvisNotificationAction } from "./JarvisNotificationCard";

interface AssistantFocusPromptProps {
  appName: string;
  minutos: number;
  tarefaTitulo: string;
  onFazParte: () => void;
  onMeDistraiu: () => void;
  onPausar: () => void;
}

// "Possível desvio" (item 3, rodada 3) — mesmo componente compartilhado de
// todas as notificações do Jarvis (rodada 7, item 1). Nunca assume sozinho
// que um app é procrastinação — só pergunta depois de tempo sustentado num
// contexto ainda não classificado (ver useFocusActivityMonitor.ts).
export function AssistantFocusPrompt({ appName, minutos, tarefaTitulo, onFazParte, onMeDistraiu, onPausar }: AssistantFocusPromptProps) {
  const acoes: JarvisNotificationAction[] = [
    { label: "Faz parte", onClick: onFazParte, variant: "default" },
    { label: "Me distraí", onClick: onMeDistraiu, variant: "outline" },
    { label: "Pausar", onClick: onPausar, variant: "outline" },
  ];

  return (
    <JarvisNotificationCard titulo="👀 Possível desvio" acoes={acoes}>
      <p>
        Você está há {minutos} min em <span className="font-medium text-foreground">{appName}</span>.
      </p>
      {tarefaTitulo && (
        <p className="pt-1">
          Isso faz parte de: <span className="font-medium text-foreground">"{tarefaTitulo}"</span>?
        </p>
      )}
    </JarvisNotificationCard>
  );
}
