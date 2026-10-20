// Aviso do Atlas no canto de cima da tela (20/10). Primeiro era a notificação nativa do Mac;
// o Davi pediu "mais bonita, com o símbolo do Infopro e do Atlas; WhatsApp verde": agora é a
// janelinha /aviso (src/pages/AvisoWindow.tsx), criada pelo comando Rust mostrar_aviso.
// No-op na web. Clicar no aviso emite "aviso-clicado" com o id.
import { isDesktop } from "@/lib/platform";

export type TipoAviso = "whatsapp" | "revisar" | "resposta" | "urgente";
export interface Aviso { id: string; titulo: string; quem?: string; corpo?: string; tipo: TipoAviso }

const DURACAO_MS = 9500;          // um pouco mais que a página fica aberta (AvisoWindow)
let ocupadas: number[] = [];      // vagas na pilha (0 = topo), liberadas quando o aviso some

// Cópia na Central de Notificações do Mac (20/10: "as notificações não estão ficando salvas aqui").
// Para não aparecer em dobro na tela, o Davi deixa o estilo do app como "Nenhum" em Ajustes ›
// Notificações: aí ela vai direto para a Central, e na tela fica só o aviso bonito.
let permitido: boolean | null = null;
async function guardarNaCentral(a: Aviso): Promise<void> {
  try {
    const n = await import("@tauri-apps/plugin-notification");
    if (permitido === null) {
      permitido = await n.isPermissionGranted();
      if (!permitido) permitido = (await n.requestPermission()) === "granted";
    }
    if (permitido) n.sendNotification({ title: a.titulo, body: a.corpo });
  } catch { /* sem plugin ou recusado */ }
}

export async function mostrarAviso(a: Aviso): Promise<void> {
  if (!isDesktop()) return;
  void guardarNaCentral(a);
  let vaga = 0;
  while (ocupadas.includes(vaga)) vaga++;
  if (vaga > 3) return;           // no máximo 4 empilhados
  ocupadas.push(vaga);
  setTimeout(() => { ocupadas = ocupadas.filter((v) => v !== vaga); }, DURACAO_MS);
  const q = new URLSearchParams({ id: a.id, t: a.titulo, k: a.tipo, ...(a.quem ? { q: a.quem } : {}), ...(a.corpo ? { c: a.corpo } : {}) });
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("mostrar_aviso", { rota: `/aviso?${q.toString()}`, vaga });
  } catch {
    ocupadas = ocupadas.filter((v) => v !== vaga);
  }
}

export async function onAvisoClicado(handler: (id: string) => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<{ id: string }>("aviso-clicado", (e) => handler(e.payload.id));
  } catch {
    return () => {};
  }
}
