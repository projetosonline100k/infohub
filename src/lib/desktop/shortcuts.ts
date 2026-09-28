// Estado dos atalhos globais (Administração → Jarvis → Atalhos, item 14/15).
// O registro em si acontece só no Rust (ver global_shortcut.rs) — aqui só
// se pergunta se deu certo, pra avisar sem quebrar o app se ⌘+Shift+E já
// estiver em uso por outro programa.
import { isDesktop } from "@/lib/platform";

export async function atalhoEncerrarDiaRegistrado(): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("atalho_encerrar_dia_registrado");
  } catch {
    return false;
  }
}
