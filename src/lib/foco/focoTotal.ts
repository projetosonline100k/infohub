import { toast } from "sonner";
import { isDesktop } from "@/lib/platform";

// Foco total (27/10): Não Perturbe pelos atalhos do app Atalhos, só os sites de trabalho no navegador, a
// coluna do Modo Foco no canto direito (sempre por cima) com a janela do Infopro ao lado ocupando o resto — ou,
// se pedido, o Infopro em tela cheia numa área de trabalho só dele.
export const ATALHO_LIGAR = "Infopro Foco Ligar";
export const ATALHO_DESLIGAR = "Infopro Foco Desligar";
export const CHAVE_SITES = "modo-foco:sites";
export const lerSites = (): string[] => { try { return JSON.parse(localStorage.getItem(CHAVE_SITES) || "[]"); } catch { return []; } };

async function invocar(comando: string, args?: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(comando, args);
}

/** Liga o foco total. Devolve se o Não Perturbe ligou (atalho existe). */
export async function ligarFocoTotal(opcoes: { telaCheia?: boolean } = {}): Promise<{ naoPerturbe: boolean }> {
  if (!isDesktop()) { toast.info("O foco total é do app do Mac."); return { naoPerturbe: false }; }
  const sites = lerSites();
  let naoPerturbe = true;
  try { await invocar("rodar_atalho", { nome: ATALHO_LIGAR }); } catch { naoPerturbe = false; }
  if (sites.length) await invocar("foco_sites_ligar", { permitidos: sites }).catch(() => undefined);
  if (opcoes.telaCheia) await invocar("foco_tela_cheia", { ativo: true }).catch(() => undefined);
  else await invocar("foco_encostar", { ativo: true }).catch(() => undefined);
  await invocar("foco_lateral_abrir").catch(() => undefined);
  return { naoPerturbe };
}

export async function desligarFocoTotal() {
  if (!isDesktop()) return;
  await invocar("rodar_atalho", { nome: ATALHO_DESLIGAR }).catch(() => undefined);
  await invocar("foco_sites_desligar").catch(() => undefined);
  await invocar("foco_tela_cheia", { ativo: false }).catch(() => undefined);
  await invocar("foco_encostar", { ativo: false }).catch(() => undefined);
  await invocar("foco_lateral_fechar").catch(() => undefined);
}
