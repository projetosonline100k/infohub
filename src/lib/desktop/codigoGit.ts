// Código do app no Mac → GitHub (18/11/2026). Só no desktop; comandos em src-tauri/src/codigo_git.rs.
import { isDesktop } from "@/lib/platform";

export type EstadoCodigo = { pendentes: number; commit_local: string; branch: string };

async function chamar<T>(comando: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(comando, args);
}

export async function estadoDoCodigo(buscar = false): Promise<EstadoCodigo | null> {
  if (!isDesktop()) return null;
  try { return await chamar<EstadoCodigo>("codigo_estado", { buscar }); } catch { return null; }
}

/** Envia o main ao GitHub. Lança Error com a mensagem clara se não der. */
export async function enviarCodigo(): Promise<EstadoCodigo> {
  try { return await chamar<EstadoCodigo>("codigo_enviar"); }
  catch (e) { throw new Error(typeof e === "string" ? e : e instanceof Error ? e.message : "não consegui enviar o código"); }
}
