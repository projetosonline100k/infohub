import { JarvisNotificationCard, type JarvisNotificationAction } from "./JarvisNotificationCard";

interface AssistantSessionSummaryProps {
  focoMinutos: number;
  distracaoMinutos: number;
  apps: { nome: string; minutos: number }[];
  onFechar: () => void;
}

// Resumo da sessão ao concluir (item 3, rodada 3) — só fatos, sem score
// (conforme pedido). Só aparece quando o monitoramento de foco estava
// ligado e realmente registrou algo nessa sessão. Mesmo componente
// compartilhado de todas as notificações do Jarvis (rodada 7, item 1).
export function AssistantSessionSummary({ focoMinutos, distracaoMinutos, apps, onFechar }: AssistantSessionSummaryProps) {
  const acoes: JarvisNotificationAction[] = [{ label: "Fechar", onClick: onFechar, variant: "ghost" }];

  return (
    <JarvisNotificationCard titulo="Sessão concluída 🎉" acoes={acoes} tone="success">
      <p>
        {focoMinutos} min de foco{distracaoMinutos > 0 ? ` · ${distracaoMinutos} min de distração` : ""}
      </p>
      {apps.length > 0 && (
        <div className="space-y-0.5 pt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Apps usados</p>
          {apps.slice(0, 5).map((a) => (
            <p key={a.nome} className="flex justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">{a.nome}</span>
              <span className="shrink-0">{a.minutos} min</span>
            </p>
          ))}
        </div>
      )}
    </JarvisNotificationCard>
  );
}
