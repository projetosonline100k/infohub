import { JarvisNotificationCard, type JarvisNotificationAction } from "./JarvisNotificationCard";

interface AssistantAccessibilityPromptProps {
  onAbrirAjustes: () => void;
  onDispensar: () => void;
}

// Permissão de Accessibility ausente (item 3, rodada 3) — só aparece quando
// "Analisar título da janela" está ligado em Administração → Jarvis →
// Privacidade mas a permissão ainda não foi concedida. Nunca contorna —
// só atalho pra tela certa de Ajustes do Sistema. Mesmo componente
// compartilhado de todas as notificações do Jarvis (rodada 7, item 1).
export function AssistantAccessibilityPrompt({ onAbrirAjustes, onDispensar }: AssistantAccessibilityPromptProps) {
  const acoes: JarvisNotificationAction[] = [
    { label: "Abrir Ajustes", onClick: onAbrirAjustes, variant: "default" },
    { label: "Agora não", onClick: onDispensar, variant: "ghost" },
  ];

  return (
    <JarvisNotificationCard titulo="🔐 Permissão necessária" acoes={acoes}>
      <p>O Jarvis precisa de permissão para identificar a janela ativa.</p>
    </JarvisNotificationCard>
  );
}
