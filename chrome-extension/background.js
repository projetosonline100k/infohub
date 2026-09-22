// Service worker (MV3) — estado de foco da extensão, sempre baseado no
// Supabase (mesma tabela `atividades` do app web), nunca duplicado como uma
// fonte paralela. Duas vias de atualização:
// 1. Push (principal): o app web manda FOCUS_STATE via bridge.js assim que
//    algo muda por lá (criar/pausar/concluir/mudar prazo etc.) — aplicado
//    na hora, sem esperar nada.
// 2. chrome.alarms a cada 30s (fallback): cobre mudanças feitas com
//    nenhuma aba do app aberta (direto no banco, ou um push perdido). Um
//    service worker MV3 pode ser encerrado e reiniciado a qualquer
//    momento, então não dá pra manter uma conexão Realtime própria aqui —
//    por isso o fallback é polling via chrome.alarms (que sobrevive ao
//    worker ser recriado), não WebSocket.
importScripts("config.js");

const ALARM_NAME = "infopro-poll-focus";
const POLL_MINUTES = 0.5; // 30s — só o fallback; mudanças do próprio app chegam via push (FOCUS_STATE)

chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_MINUTES });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) poll();
});
chrome.runtime.onStartup.addListener(poll);
chrome.runtime.onInstalled.addListener(poll);

async function getEstadoLocal() {
  const { session, currentTaskId } = await chrome.storage.local.get(["session", "currentTaskId"]);
  return { session: session || null, currentTaskId: currentTaskId || null };
}

async function fetchAtividade(taskId, accessToken) {
  const res = await fetch(`${INFOPRO_CONFIG.SUPABASE_URL}/rest/v1/atividades?id=eq.${taskId}&select=*`, {
    headers: { apikey: INFOPRO_CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const linhas = await res.json();
  return linhas[0] || null;
}

// Mesmo cálculo de elapsed que useAssistantAtividades.ts (frontend) e
// KanbanCard.tsx já fazem: base acumulada + tempo desde timer_iniciado_em,
// se estiver rodando.
function paraFoco(atividade) {
  if (!atividade || atividade.concluida) return null;
  const base = atividade.timer_decorrido_segundos || 0;
  const rodando = !!atividade.timer_iniciado_em;
  const elapsedSegundos = rodando ? base + (Date.now() - new Date(atividade.timer_iniciado_em).getTime()) / 1000 : base;
  return {
    taskId: atividade.id,
    titulo: atividade.titulo,
    status: rodando ? "active" : "paused",
    startedAt: atividade.timer_iniciado_em,
    elapsedSegundos,
    tempoEstimadoMin: atividade.tempo_estimado || null,
  };
}

async function poll() {
  const { session, currentTaskId } = await getEstadoLocal();
  if (!session?.accessToken || !currentTaskId) {
    await chrome.storage.local.set({ focus: null });
    return;
  }
  const atividade = await fetchAtividade(currentTaskId, session.accessToken);
  await chrome.storage.local.set({ focus: paraFoco(atividade) });
}

async function patch(taskId, body) {
  const { session } = await getEstadoLocal();
  if (!session?.accessToken) return false;
  const res = await fetch(`${INFOPRO_CONFIG.SUPABASE_URL}/rest/v1/atividades?id=eq.${taskId}`, {
    method: "PATCH",
    headers: {
      apikey: INFOPRO_CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

// Mesma semântica de pausarTimer em useAssistantAtividades.ts: soma o
// decorrido desde timer_iniciado_em em timer_decorrido_segundos e zera
// timer_iniciado_em.
async function pausar(taskId) {
  const { focus } = await chrome.storage.local.get("focus");
  if (!focus || focus.taskId !== taskId || focus.status !== "active") return;
  await patch(taskId, { timer_iniciado_em: null, timer_decorrido_segundos: Math.round(focus.elapsedSegundos) });
  await poll();
}

async function retomar(taskId) {
  await patch(taskId, { timer_iniciado_em: new Date().toISOString() });
  await poll();
}

// Mesma sequência de concluir() em useAssistantAtividades.ts: acha a coluna
// "eh_conclusao" do cliente dessa tarefa (mesma tabela colunas_atividade) e
// marca concluída + zera o timer.
async function concluir(taskId) {
  const { session } = await getEstadoLocal();
  if (!session?.accessToken) return;
  const atividade = await fetchAtividade(taskId, session.accessToken);
  let novoStatus = "finalizado";
  if (atividade) {
    const filtroCliente = atividade.cliente_id ? `cliente_id=eq.${atividade.cliente_id}` : "cliente_id=is.null";
    const res = await fetch(
      `${INFOPRO_CONFIG.SUPABASE_URL}/rest/v1/colunas_atividade?${filtroCliente}&eh_conclusao=is.true&select=status_key&limit=1`,
      { headers: { apikey: INFOPRO_CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } },
    );
    if (res.ok) {
      const colunas = await res.json();
      if (colunas[0]?.status_key) novoStatus = colunas[0].status_key;
    }
  }
  await patch(taskId, { concluida: true, status: novoStatus, timer_iniciado_em: null, timer_decorrido_segundos: 0 });
  await chrome.storage.local.set({ focus: null, currentTaskId: null });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "SESSION":
        await chrome.storage.local.set({ session: message.session });
        if (message.session) await poll();
        else await chrome.storage.local.set({ focus: null });
        sendResponse({ ok: true });
        break;
      case "CURRENT_TASK":
        await chrome.storage.local.set({ currentTaskId: message.taskId });
        await poll();
        sendResponse({ ok: true });
        break;
      case "FOCUS_STATE": {
        // Push imediato vindo do app web (src/lib/extensionBridge.ts) — não
        // espera o alarme de 30s. Mesmo cálculo de elapsed que paraFoco()
        // usa no fallback, só que a partir do que o app já mandou pronto.
        const f = message.focus;
        if (!f) {
          await chrome.storage.local.set({ focus: null });
        } else {
          const rodando = f.status === "active";
          const elapsedSegundos = rodando && f.startedAt
            ? f.baseSegundos + (Date.now() - new Date(f.startedAt).getTime()) / 1000
            : f.baseSegundos;
          await chrome.storage.local.set({
            focus: {
              taskId: f.taskId,
              titulo: f.titulo,
              status: f.status,
              startedAt: f.startedAt,
              elapsedSegundos,
              tempoEstimadoMin: f.tempoEstimadoMin,
            },
          });
        }
        sendResponse({ ok: true });
        break;
      }
      case "GET_FOCUS": {
        const { focus } = await chrome.storage.local.get("focus");
        sendResponse({ focus: focus || null });
        break;
      }
      case "PAUSE":
        await pausar(message.taskId);
        sendResponse({ ok: true });
        break;
      case "RESUME":
        await retomar(message.taskId);
        sendResponse({ ok: true });
        break;
      case "COMPLETE":
        await concluir(message.taskId);
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ ok: false, error: "tipo desconhecido" });
    }
  })();
  return true; // mantém o canal aberto pra resposta assíncrona
});
