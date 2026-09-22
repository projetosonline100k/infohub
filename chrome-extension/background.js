// Service worker (MV3) — estado do Assistant na extensão, sempre baseado no
// Supabase (mesmas tabelas `atividades`/`colunas_atividade` do app web),
// nunca uma fonte paralela. Três vias de atualização, por ordem de
// prioridade:
// 1. Push (caminho rápido): o app web manda TASKS_SNAPSHOT/FOCUS_STATE via
//    bridge.js assim que o Realtime dele detecta uma mudança — aplicado na
//    hora, sem round-trip nenhum daqui.
// 2. Busca direta (caminho independente — item 11): se a extensão já tem
//    uma sessão salva mas NENHUM app web está aberto pra empurrar nada,
//    ela mesma consulta o Supabase (getTasks/getCurrentFocus/refreshTasks
//    abaixo) — só aqui no background, nunca autenticado no
//    orb.js/content script.
// 3. chrome.alarms a cada 30s (fallback/heartbeat): dispara a via 2 mesmo
//    sem nenhuma mensagem chegando, e é o que mantém a sessão renovada
//    (ver seção de autenticação) mesmo com o app inteiro fechado. Um
//    service worker MV3 pode ser encerrado e reiniciado a qualquer
//    momento — por isso nada aqui vive só em variável: tudo é lido/escrito
//    direto em chrome.storage a cada chamada, então acordar de uma
//    suspensão não perde nada.
//
// chrome.storage NÃO é fonte de verdade (item 14) — só cache/sessão/
// preferência, nunca um banco paralelo:
// - chrome.storage.local: `refreshToken` (precisa sobreviver a reiniciar o
//   Chrome — item 11/13, "não depender de manter o site aberto") + cache
//   de tarefas/foco, tarefa atual, projeto, posição da orbe, flag de
//   sessão expirada. Restrita a TRUSTED_CONTEXTS (ver abaixo) — orb.js e
//   bridge.js NUNCA leem essa área diretamente, só trocam mensagens com
//   este arquivo (por isso o broadcast manual via chrome.tabs.sendMessage
//   mais abaixo: content scripts não recebem mais chrome.storage.onChanged
//   de uma área que eles não têm permissão de ler).
// - chrome.storage.session: `accessToken`/`expiresAt` (o par de curto
//   prazo, o que vai no header Authorization de cada chamada) — também
//   TRUSTED_CONTEXTS (esse já é o padrão do Chrome pra essa área) e é
//   limpa quando o Chrome fecha.
importScripts("config.js");

const ALARM_NAME = "infopro-poll-focus";
const POLL_MINUTES = 0.5; // 30s
const TASKS_STALE_MS = 60_000; // só refaz a busca de tarefas no fallback se o último push foi há mais tempo que isso

// ---- autenticação (itens 12/14) ----
const MARGEM_REFRESH_MS = 5 * 60_000; // renova ~5min antes de expirar
const JANELA_PUSH_RECENTE_MS = 3 * 60_000; // se o app empurrou sessão fresca há pouco, deixa ele cuidar da renovação (evita os dois brigarem pelo mesmo refresh_token)

function log(...args) {
  console.log("[Assistant]", ...args);
}

// TRUSTED_CONTEXTS em AMBAS as áreas — explícito de propósito, não
// depende de nenhum default (o de `session` já nasce assim; `local` NÃO —
// por padrão ele é legível por content scripts, por isso essa chamada é a
// parte que de fato muda alguma coisa aqui). Content scripts (orb.js,
// bridge.js) ficam bloqueados PELO PRÓPRIO CHROME de ler qualquer uma das
// duas — não é só "o código não faz isso".
try {
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  log("storage restrito a TRUSTED_CONTEXTS (local + session)");
} catch (err) {
  log("setAccessLevel indisponível nesta versão do Chrome:", err.message);
}

chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_MINUTES });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) pollFallback();
});
chrome.runtime.onStartup.addListener(inicializar);
chrome.runtime.onInstalled.addListener(inicializar);

// Sequência dos 4 passos do item 14 sempre que o Chrome (re)inicia ou a
// extensão é instalada/atualizada:
// 1. o cache (chrome.storage.local) já está lá — orb.js mostra o Jarvis
//    com ele assim que pedir GET_ASSISTANT_STATE, sem esperar nada daqui;
// 2. recupera/renova a sessão — o access_token foi zerado pelo restart
//    (chrome.storage.session), mas o refresh_token sobreviveu em
//    chrome.storage.local, então garantirSessaoValida() já consegue tirar
//    um access_token novo sozinha, SEM precisar que o app web esteja
//    aberto (só não recupera nada se você nunca logou nesta extensão);
// 3. com sessão válida, consulta o Supabase de verdade;
// 4. substitui o cache pelos dados atuais.
async function inicializar() {
  log("iniciando — mostrando cache local enquanto isso");
  const sessao = await garantirSessaoValida();
  if (!sessao?.accessToken) {
    log("sem sessão recuperável ainda — cache local fica valendo até logar no app pelo menos uma vez");
    return;
  }
  await pollFocus();
  await getTasks({ forcar: true });
  log("cache substituído pelos dados atuais do Supabase");
}

// ---- broadcast pra content scripts (substitui chrome.storage.onChanged,
// que não dispara mais em orb.js/bridge.js depois de local virar
// TRUSTED_CONTEXTS) ----
async function transmitirParaAbas(mensagem) {
  let abas = [];
  try {
    abas = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  } catch (err) {
    log("falha ao listar abas pro broadcast:", err.message);
    return;
  }
  for (const aba of abas) {
    if (aba.id === undefined) continue;
    chrome.tabs.sendMessage(aba.id, mensagem).catch(() => {
      // aba sem orb.js carregado (chrome://, Web Store, ou ainda
      // injetando) — sem problema, ignora.
    });
  }
}

// Grava um patch no cache local E avisa toda orbe aberta (item 7/8) com o
// estado consolidado atual — usado sempre que `focus`/`tasks`/
// `sessionExpired` mudam.
async function salvarCache(patch) {
  await chrome.storage.local.set(patch);
  const { focus, tasks, sessionExpired } = await chrome.storage.local.get(["focus", "tasks", "sessionExpired"]);
  await transmitirParaAbas({
    type: "ASSISTANT_STATE_CHANGED",
    focus: focus || null,
    tasks: tasks || [],
    sessionExpired: !!sessionExpired,
  });
}

// `refreshToken` em chrome.storage.local (sobrevive a reiniciar o Chrome);
// `accessToken`/`expiresAt` em chrome.storage.session (curto prazo, área
// mais isolada) — ver comentário no topo do arquivo. Se o Supabase mandou
// um refresh_token NOVO (rotação — item 4), ele já substitui o anterior
// aqui, na hora.
async function armazenarSessao(session, origem) {
  await chrome.storage.local.set({ refreshToken: session.refreshToken ?? null, sessionExpired: false });
  await chrome.storage.session.set({
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    sessionUpdatedAt: Date.now(),
  });
  log(`sessão ${origem} (expira em ${session?.expiresAt ? Math.round((session.expiresAt - Date.now()) / 60000) : "?"} min)`);
}

// Limpa a sessão de vez (refresh_token inválido/revogado — item 5): o
// Jarvis continua de pé visualmente (olhos, respiração, cache de
// tarefas/foco intactos), só passa a mostrar "Sessão expirada" no lugar
// das ações que precisam de dado fresco.
async function limparSessaoInvalida(motivo) {
  await chrome.storage.local.set({ refreshToken: null, sessionExpired: true });
  await chrome.storage.session.remove(["accessToken", "expiresAt", "sessionUpdatedAt"]);
  log("sessão inválida, limpa:", motivo);
  const { focus, tasks } = await chrome.storage.local.get(["focus", "tasks"]);
  await transmitirParaAbas({ type: "ASSISTANT_STATE_CHANGED", focus: focus || null, tasks: tasks || [], sessionExpired: true });
}

// POST /auth/v1/token?grant_type=refresh_token — troca o refresh_token por
// um access_token novo (e, com rotação de refresh token — padrão do
// Supabase — por um refresh_token novo também, que já substitui o antigo
// via armazenarSessao logo abaixo).
async function atualizarSessao(refreshToken) {
  try {
    const res = await fetch(`${INFOPRO_CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: INFOPRO_CONFIG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      // 400/401 do endpoint de refresh do GoTrue = refresh_token
      // inválido/expirado/revogado (ex.: rotacionado em outro lugar, ou
      // revogado manualmente) — não adianta tentar de novo com o mesmo
      // token, então limpa tudo em vez de deixar em estado incerto.
      const invalido = res.status === 400 || res.status === 401;
      log("renovação de sessão falhou:", res.status, invalido ? "(refresh_token inválido/revogado)" : "");
      if (invalido) await limparSessaoInvalida(`HTTP ${res.status} ao renovar`);
      return null;
    }
    const dados = await res.json();
    const novaSessao = {
      accessToken: dados.access_token,
      refreshToken: dados.refresh_token || refreshToken,
      expiresAt: dados.expires_at ? dados.expires_at * 1000 : Date.now() + (dados.expires_in || 3600) * 1000,
    };
    await armazenarSessao(novaSessao, "renovada (extensão)");
    return novaSessao;
  } catch (err) {
    // Erro de rede — não mexe na sessão salva, pode ser só falta de
    // internet momentânea; tenta de novo no próximo alarme.
    log("erro de rede ao renovar sessão:", err.message);
    return null;
  }
}

// Junta as duas metades (refreshToken de local + accessToken/expiresAt de
// session) e decide se precisa renovar. Só renova aqui se: (a) não tem
// access_token válido (ex.: acabou de reiniciar o Chrome — session foi
// zerada) ou está perto de expirar, e (b) nenhuma sessão fresca chegou via
// push recentemente — se o app web está aberto, ele mesmo já teria
// empurrado uma sessão renovada (supabase-js tem autoRefreshToken);
// renovar os dois lados ao mesmo tempo pro MESMO refresh_token é uma
// corrida real (Supabase rotaciona o refresh_token a cada troca — quem
// chegar depois usando o token antigo falha). Sem push recente =
// provavelmente o app está fechado (ou acabou de reiniciar o Chrome), aí a
// extensão assume sozinha.
async function garantirSessaoValida() {
  const { refreshToken } = await chrome.storage.local.get("refreshToken");
  if (!refreshToken) return null; // nunca logou nesta extensão, ou deslogou/sessão foi invalidada

  const { accessToken, expiresAt, sessionUpdatedAt } = await chrome.storage.session.get(["accessToken", "expiresAt", "sessionUpdatedAt"]);
  const sessaoAtual = accessToken ? { accessToken, refreshToken, expiresAt } : null;

  if (sessaoAtual && expiresAt) {
    const faltam = expiresAt - Date.now();
    if (faltam > MARGEM_REFRESH_MS) return sessaoAtual;
    const pushRecente = sessionUpdatedAt && Date.now() - sessionUpdatedAt < JANELA_PUSH_RECENTE_MS;
    if (faltam > 0 && pushRecente) return sessaoAtual;
  }

  return (await atualizarSessao(refreshToken)) || sessaoAtual;
}

// Wrapper único pra toda chamada autenticada ao Supabase: garante sessão
// válida antes (renovando se preciso) e, se mesmo assim vier 401 (ex.: o
// token expirou entre a checagem e a chamada), tenta renovar mais uma vez
// e repete — rede de segurança em cima da checagem proativa.
async function chamarSupabase(path, options = {}) {
  const sessao = await garantirSessaoValida();
  if (!sessao?.accessToken) return null;

  const fazer = (token) =>
    fetch(`${INFOPRO_CONFIG.SUPABASE_URL}${path}`, {
      ...options,
      headers: { apikey: INFOPRO_CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });

  let res = await fazer(sessao.accessToken);
  if (res.status === 401 && sessao.refreshToken) {
    log("401 do Supabase, tentando renovar e repetir uma vez");
    const renovada = await atualizarSessao(sessao.refreshToken);
    if (renovada?.accessToken) res = await fazer(renovada.accessToken);
  }
  return res;
}

async function getEstadoLocal() {
  const { currentTaskId, tasksUpdatedAt } = await chrome.storage.local.get(["currentTaskId", "tasksUpdatedAt"]);
  return { currentTaskId: currentTaskId || null, tasksUpdatedAt: tasksUpdatedAt || 0 };
}

async function fetchAtividade(taskId) {
  const res = await chamarSupabase(`/rest/v1/atividades?id=eq.${taskId}&select=*`);
  if (!res?.ok) return null;
  const linhas = await res.json();
  return linhas[0] || null;
}

// Busca direta no PostgREST (caminho independente — item 11: a extensão
// não depende do app estar aberto). Embed `clientes(nome_especialista)`
// traz o nome do projeto numa única ida. A ordenação aqui é uma
// aproximação (data + ordem) do critério completo que o app web usa
// (atrasada > hoje > prioridade > prazo > ordem) — o PostgREST não expressa
// "categoria" numa única cláusula ORDER BY; pra quem só está vendo o
// caminho independente (app fechado em todas as abas) essa aproximação já
// cobre bem.
async function fetchTarefasDireto() {
  const campos = [
    "id", "titulo", "cliente_id", "status", "concluida", "data_vencimento", "data_atividade",
    "prioridade", "tempo_estimado", "timer_iniciado_em", "timer_decorrido_segundos", "ordem",
    "clientes(nome_especialista)",
  ].join(",");
  const res = await chamarSupabase(
    `/rest/v1/atividades?deleted_at=is.null&concluida=is.false&select=${campos}&order=data_vencimento.asc.nullslast&order=ordem.asc`,
  );
  if (!res?.ok) {
    log("fetchTarefasDireto falhou", res?.status);
    return null;
  }
  const linhas = await res.json();
  return linhas.map((a) => ({
    id: a.id,
    titulo: a.titulo,
    clienteId: a.cliente_id,
    projeto: a.clientes?.nome_especialista ?? null,
    status: a.status,
    concluida: a.concluida,
    dataVencimento: a.data_vencimento,
    dataAtividade: a.data_atividade,
    prioridade: a.prioridade,
    tempoEstimadoMin: a.tempo_estimado,
    timerIniciadoEm: a.timer_iniciado_em,
    timerDecorridoSegundos: a.timer_decorrido_segundos,
    ordem: a.ordem,
  }));
}

// Mesmo cálculo de elapsed que useAssistantAtividades.ts (frontend) e
// KanbanCard.tsx já fazem: base acumulada + tempo desde timer_iniciado_em,
// se estiver rodando.
function paraFoco(atividade, projeto) {
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
    projeto: projeto ?? null,
  };
}

// getCurrentFocus(): recalcula o foco cacheado a partir da tarefa atual.
async function pollFocus() {
  const { currentTaskId } = await getEstadoLocal();
  if (!currentTaskId) {
    await salvarCache({ focus: null });
    return;
  }
  const atividade = await fetchAtividade(currentTaskId);
  const { tasks } = await chrome.storage.local.get("tasks");
  const projeto = (tasks || []).find((t) => t.id === currentTaskId)?.projeto ?? null;
  await salvarCache({ focus: paraFoco(atividade, projeto) });
  log("storage atualizado (focus, via poll)");
}

// getTasks(): usa o cache se ele ainda estiver "fresco" (chegou um push
// recentemente); senão busca direto — caminho independente do item 11.
async function getTasks({ forcar = false } = {}) {
  const { tasksUpdatedAt } = await getEstadoLocal();
  const fresco = Date.now() - tasksUpdatedAt < TASKS_STALE_MS;
  if (!forcar && fresco) {
    const { tasks } = await chrome.storage.local.get("tasks");
    return tasks || [];
  }
  const tarefas = await fetchTarefasDireto();
  if (tarefas === null) {
    const { tasks } = await chrome.storage.local.get("tasks");
    return tasks || [];
  }
  await salvarCache({ tasks: tarefas, tasksUpdatedAt: Date.now() });
  log("storage atualizado (tasks, via busca direta):", tarefas.length);
  return tarefas;
}

// Heartbeat do chrome.alarms — mantém a sessão renovada (via
// garantirSessaoValida, chamado dentro de chamarSupabase) e só refaz a
// consulta de tarefas se faz tempo que não chega um TASKS_SNAPSHOT.
async function pollFallback() {
  await pollFocus();
  await getTasks({ forcar: false });
}

async function patch(taskId, body) {
  const res = await chamarSupabase(`/rest/v1/atividades?id=eq.${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  return !!res?.ok;
}

async function iniciarFoco(taskId) {
  await chrome.storage.local.set({ currentTaskId: taskId });
  await patch(taskId, { timer_iniciado_em: new Date().toISOString() });
  await pollFocus();
}

// Mesma semântica de pausarTimer em useAssistantAtividades.ts: soma o
// decorrido desde timer_iniciado_em em timer_decorrido_segundos e zera
// timer_iniciado_em.
async function pausar(taskId) {
  const { focus } = await chrome.storage.local.get("focus");
  if (!focus || focus.taskId !== taskId || focus.status !== "active") return;
  await patch(taskId, { timer_iniciado_em: null, timer_decorrido_segundos: Math.round(focus.elapsedSegundos) });
  await pollFocus();
}

async function retomar(taskId) {
  await patch(taskId, { timer_iniciado_em: new Date().toISOString() });
  await pollFocus();
}

// Mesma sequência de concluir() em useAssistantAtividades.ts: acha a coluna
// "eh_conclusao" do cliente dessa tarefa (mesma tabela colunas_atividade) e
// marca concluída + zera o timer.
async function concluir(taskId) {
  const atividade = await fetchAtividade(taskId);
  let novoStatus = "finalizado";
  if (atividade) {
    const filtroCliente = atividade.cliente_id ? `cliente_id=eq.${atividade.cliente_id}` : "cliente_id=is.null";
    const res = await chamarSupabase(`/rest/v1/colunas_atividade?${filtroCliente}&eh_conclusao=is.true&select=status_key&limit=1`);
    if (res?.ok) {
      const colunas = await res.json();
      if (colunas[0]?.status_key) novoStatus = colunas[0].status_key;
    }
  }
  await patch(taskId, { concluida: true, status: novoStatus, timer_iniciado_em: null, timer_decorrido_segundos: 0 });
  await chrome.storage.local.set({ currentTaskId: null });
  // Tira da lista/foco local na hora — o próximo TASKS_SNAPSHOT (Realtime
  // no app, se alguma aba estiver aberta) ou o próximo poll confirma; não
  // precisa esperar por nenhum dos dois pra sumir.
  const { tasks } = await chrome.storage.local.get("tasks");
  await salvarCache({ focus: null, tasks: (tasks || []).filter((t) => t.id !== taskId) });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "SESSION":
        if (message.session) {
          await armazenarSessao(message.session, "recebida (push do app)");
          await pollFocus();
          await getTasks({ forcar: true });
        } else {
          // Logout (item 6): limpa access/refresh token e dados de sessão;
          // preferências visuais (posição da orbe) ficam intocadas.
          await chrome.storage.local.set({ refreshToken: null, currentTaskId: null, project: null, sessionExpired: false });
          await chrome.storage.session.remove(["accessToken", "expiresAt", "sessionUpdatedAt"]);
          await salvarCache({ focus: null, tasks: [] });
        }
        sendResponse({ ok: true });
        break;

      case "CURRENT_TASK":
        await chrome.storage.local.set({ currentTaskId: message.taskId });
        await pollFocus();
        sendResponse({ ok: true });
        break;

      case "FOCUS_STATE": {
        // Push imediato vindo do app web — não espera o alarme de 30s.
        const f = message.focus;
        if (!f) {
          await salvarCache({ focus: null });
        } else {
          const rodando = f.status === "active";
          const elapsedSegundos = rodando && f.startedAt
            ? f.baseSegundos + (Date.now() - new Date(f.startedAt).getTime()) / 1000
            : f.baseSegundos;
          await salvarCache({
            focus: {
              taskId: f.taskId,
              titulo: f.titulo,
              status: f.status,
              startedAt: f.startedAt,
              elapsedSegundos,
              tempoEstimadoMin: f.tempoEstimadoMin,
              projeto: f.projeto ?? null,
            },
          });
        }
        log("focus recebido (push do app)");
        sendResponse({ ok: true });
        break;
      }

      case "TASKS_SNAPSHOT": {
        // Push imediato vindo do app web toda vez que a lista muda (criar/
        // editar/mover/concluir/reabrir/Realtime de outra aba etc.) —
        // caminho rápido do item 13.
        const tarefas = Array.isArray(message.tasks) ? message.tasks : [];
        log("tasks recebidas:", tarefas.length);
        await chrome.storage.local.set({ project: message.project ?? null });
        await salvarCache({ tasks: tarefas, tasksUpdatedAt: Date.now() });
        log("storage atualizado (tasks, via push)");
        sendResponse({ ok: true });
        break;
      }

      case "GET_TASKS": {
        const tarefas = await getTasks({ forcar: false });
        sendResponse({ tasks: tarefas });
        break;
      }

      case "REFRESH_TASKS": {
        const tarefas = await getTasks({ forcar: true });
        sendResponse({ tasks: tarefas });
        break;
      }

      case "GET_FOCUS":
      case "GET_CURRENT_FOCUS": {
        const { focus } = await chrome.storage.local.get("focus");
        sendResponse({ focus: focus || null });
        break;
      }

      case "GET_ASSISTANT_STATE": {
        // Estado completo de uma vez, pra uma orbe recém-injetada não
        // esperar o próximo polling (item 8) — inclui posição salva da
        // orbe e a flag de sessão expirada (item 5), nunca token nenhum.
        log("GET_ASSISTANT_STATE");
        const { focus, tasks, project, orbPosition, sessionExpired } = await chrome.storage.local.get([
          "focus", "tasks", "project", "orbPosition", "sessionExpired",
        ]);
        sendResponse({
          focus: focus || null,
          tasks: tasks || [],
          project: project || null,
          orbPosition: orbPosition || null,
          sessionExpired: !!sessionExpired,
          updatedAt: Date.now(),
        });
        break;
      }

      case "SET_ORB_POSITION":
        await chrome.storage.local.set({ orbPosition: message.position });
        sendResponse({ ok: true });
        break;

      case "START_FOCUS":
        await iniciarFoco(message.taskId);
        sendResponse({ ok: true });
        break;

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
