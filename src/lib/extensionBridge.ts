import type { Session } from "@supabase/supabase-js";

// Ponte opcional com a extensão Chrome (ver chrome-extension/). Usa
// window.postMessage em vez de chrome.runtime.sendMessage direto — essa API
// só existe dentro de um contexto de extensão, então quem escuta aqui é o
// content script `bridge.js` da extensão, injetado SÓ na origem deste app
// (ver chrome-extension/manifest.json), que repassa pro background via
// chrome.runtime. O postMessage vai só pra própria origem
// (window.location.origin, nunca "*"), então nenhuma outra página consegue
// interceptar. Sem extensão instalada, essas chamadas não fazem nada (só
// existe alguém ouvindo se o content script estiver rodando).
const ORIGEM_MENSAGEM = "infopro-assistant";

export function enviarSessaoParaExtensao(session: Session | null) {
  if (typeof window === "undefined") return;
  window.postMessage(
    {
      source: ORIGEM_MENSAGEM,
      type: "SESSION",
      session: session
        ? { accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at }
        : null,
    },
    window.location.origin,
  );
}

export function enviarTarefaAtualParaExtensao(taskId: string | null) {
  if (typeof window === "undefined") return;
  window.postMessage({ source: ORIGEM_MENSAGEM, type: "CURRENT_TASK", taskId }, window.location.origin);
}
