// "Repousar Mac" (Encerrar o dia, item 7) — só chama o comando Rust depois
// que quem chamou já confirmou com o usuário; este arquivo não decide nada
// sozinho, só invoca. No-op na web (nunca deve nem aparecer o botão lá).
import { isDesktop } from "@/lib/platform";

export async function dormirMac(): Promise<{ ok: boolean; erro?: string }> {
  if (!isDesktop()) return { ok: false, erro: "Recurso disponível só no app desktop" };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("dormir_mac");
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}
