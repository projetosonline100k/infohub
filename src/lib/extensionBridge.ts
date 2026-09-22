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

// `session.expires_at` do supabase-js vem em SEGUNDOS desde epoch (mesma
// convenção do claim `exp` do JWT) — convertido pra milissegundos aqui,
// que é a unidade que Date.now() usa e que o background.js espera ao
// comparar pra decidir quando renovar sozinho (ver garantirSessaoValida em
// chrome-extension/background.js).
export function enviarSessaoParaExtensao(session: Session | null) {
  if (typeof window === "undefined") return;
  window.postMessage(
    {
      source: ORIGEM_MENSAGEM,
      type: "SESSION",
      session: session
        ? {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            expiresAt: session.expires_at ? session.expires_at * 1000 : null,
          }
        : null,
    },
    window.location.origin,
  );
}

export function enviarTarefaAtualParaExtensao(taskId: string | null) {
  if (typeof window === "undefined") return;
  window.postMessage({ source: ORIGEM_MENSAGEM, type: "CURRENT_TASK", taskId }, window.location.origin);
}

export interface FocoParaExtensao {
  taskId: string;
  titulo: string;
  status: "active" | "paused";
  startedAt: string | null;
  baseSegundos: number;
  tempoEstimadoMin: number | null;
  projeto: string | null;
}

// Empurra o estado de foco pra extensão IMEDIATAMENTE (criada/editada/
// concluída/movida/pausada/retomada) — o polling de 30s do background.js
// vira só um fallback (cobre o caso de nenhuma aba do app estar aberta),
// não a via principal pra mudanças feitas pelo próprio sistema.
export function enviarEstadoFocoParaExtensao(foco: FocoParaExtensao | null) {
  if (typeof window === "undefined") return;
  window.postMessage({ source: ORIGEM_MENSAGEM, type: "FOCUS_STATE", focus: foco }, window.location.origin);
}

// Campos mínimos que a extensão precisa pra mostrar a mesma lista de
// tarefas do Assistant web (item 1) — nada além disso (sem descrição,
// checklist etc.), pra manter o payload leve.
export interface TarefaParaExtensao {
  id: string;
  titulo: string;
  clienteId: string | null;
  projeto: string | null;
  status: string;
  concluida: boolean;
  dataVencimento: string | null;
  dataAtividade: string;
  prioridade: string;
  tempoEstimadoMin: number | null;
  timerIniciadoEm: string | null;
  timerDecorridoSegundos: number;
  ordem: number;
}

// Empurra a lista inteira de tarefas pendentes pra extensão — chamado
// sempre que `tarefas` muda no Assistant web (carga inicial, Realtime,
// BroadcastChannel ou uma mutação local), pra extensão nunca depender de
// consultar o Supabase sozinha enquanto o app está aberto em algum lugar.
export function enviarSnapshotTarefasParaExtensao(tarefas: TarefaParaExtensao[], projetoAtual: string | null) {
  if (typeof window === "undefined") return;
  window.postMessage({ source: ORIGEM_MENSAGEM, type: "TASKS_SNAPSHOT", tasks: tarefas, project: projetoAtual }, window.location.origin);
}
