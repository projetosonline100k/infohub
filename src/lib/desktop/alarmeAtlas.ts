// Alarme no Atlas (18/10/2026, Davi: "na hora, a orbe aparece grande, toca um som de alarme até
// você tocar em Parar ou Soneca 5 min, e passa por cima de qualquer janela — legal isso").
// Quem sabe a hora é a janela principal (useAlarmesAgenda); ela pede ao Atlas para tocar e o
// Atlas responde com o que o Davi escolheu. Se o Atlas não confirmar em 1,5 s (fechado,
// travado), a principal toca sozinha como antes.
import { isDesktop } from "@/lib/platform";

export type AcaoAlarme = "parar" | "soneca" | "concluir";
export interface PedidoAlarme { id: string; titulo: string; descricao: string; podeConcluir: boolean }

const EV_TOCAR = "alarme-atlas";
const EV_OK = "alarme-atlas-ok";
const EV_RESPOSTA = "alarme-atlas-resposta";
const EV_FECHAR = "alarme-atlas-fechar";

/** Janela principal: pede ao Atlas. Devolve false se o Atlas não confirmou (toque você mesmo). */
export async function pedirAlarmeAoAtlas(pedido: PedidoAlarme, aoResponder: (acao: AcaoAlarme) => void): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    const { emitTo, listen } = await import("@tauri-apps/api/event");
    let confirmou = false;
    const soltarOk = await listen<{ id: string }>(EV_OK, (e) => { if (e.payload.id === pedido.id) confirmou = true; });
    const soltarResposta = await listen<{ id: string; acao: AcaoAlarme }>(EV_RESPOSTA, (e) => {
      if (e.payload.id !== pedido.id) return;
      soltarResposta();
      aoResponder(e.payload.acao);
    });
    await emitTo("jarvis", EV_TOCAR, pedido);
    await new Promise((r) => setTimeout(r, 1500));
    soltarOk();
    if (!confirmou) soltarResposta();
    return confirmou;
  } catch {
    return false;
  }
}

/** Janela principal: o Davi resolveu pelo aviso de lá — o Atlas fecha o dele. */
export async function fecharAlarmeNoAtlas(id: string): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo("jarvis", EV_FECHAR, { id });
  } catch { /* sem Atlas */ }
}

/** Atlas: recebe os pedidos. Devolve a função que para de ouvir. */
export async function ouvirAlarmes(aoTocar: (p: PedidoAlarme) => void, aoFechar: (id: string) => void): Promise<() => void> {
  const { emitTo, listen } = await import("@tauri-apps/api/event");
  const a = await listen<PedidoAlarme>(EV_TOCAR, (e) => {
    void emitTo("main", EV_OK, { id: e.payload.id });
    aoTocar(e.payload);
  });
  const b = await listen<{ id: string }>(EV_FECHAR, (e) => aoFechar(e.payload.id));
  return () => { a(); b(); };
}

/** Atlas: o Davi escolheu (Parar, Soneca, Concluir). */
export async function responderAlarme(id: string, acao: AcaoAlarme): Promise<void> {
  const { emitTo } = await import("@tauri-apps/api/event");
  await emitTo("main", EV_RESPOSTA, { id, acao });
}
