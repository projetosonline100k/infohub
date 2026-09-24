// Evento nativo Tauri emitido logo após criar uma atividade (ver
// src/lib/atividades/criarAtividade.ts) — atalho local entre as janelas
// main/jarvis, além do Supabase Realtime (que continua sendo a fonte de
// verdade e cobre qualquer origem, inclusive fora do app). No-op na web.
import { isDesktop } from "@/lib/platform";

const EVENTO_ATIVIDADE_CRIADA = "activity-created";

export async function emitActivityCreated(id: string): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(EVENTO_ATIVIDADE_CRIADA, { id });
  } catch {
    /* ignora — Realtime ainda cobre isso */
  }
}

// Retorna a função de cleanup (chamar no unmount) — no-op na web.
export async function onActivityCreated(handler: (id: string) => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<{ id: string }>(EVENTO_ATIVIDADE_CRIADA, (event) => handler(event.payload.id));
    return unlisten;
  } catch {
    return () => {};
  }
}

// Navegação da janela `main` pedida pelo Jarvis (item 1 da rodada 3: Ver
// todas, Notas completas, Expandir, abrir projeto) — a `main` já foi
// mostrada/maximizada/focada por openMainWindow() (ver desktop/window.ts);
// este evento só carrega PRA ONDE ela deve navegar. Substitui o antigo
// "jarvis-expand" (que só carregava projetoId/tarefaId) por uma rota
// genérica — serve pra qualquer ação, não só Expandir.
const EVENTO_MAIN_NAVIGATE = "main-navigate";

export async function emitMainNavigate(route: string): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(EVENTO_MAIN_NAVIGATE, { route });
  } catch {
    /* ignora — a janela main pelo menos já foi mostrada/focada */
  }
}

export async function onMainNavigate(handler: (route: string) => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<{ route: string }>(EVENTO_MAIN_NAVIGATE, (event) => handler(event.payload.route));
    return unlisten;
  } catch {
    return () => {};
  }
}
