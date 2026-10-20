// Bloqueador (20/10): regras puras de quando está ligado e quando pede motivo.
export interface SessaoBloqueio {
  id: string; origem: "manual" | "foco"; atividade_id: string | null; inicio: string;
  fim_previsto: string | null; encerrado_em: string | null; motivo_saida: string | null; bloqueios: number;
}
export interface ConfigBloqueio { apps: string[]; sites: string[]; no_foco: boolean }

export const CONFIG_PADRAO: ConfigBloqueio = { apps: [], sites: [], no_foco: true };
export const MOTIVO_MINIMO = 5;

/** A sessão aberta que vale agora (manual dentro do prazo, ou de foco sem prazo). */
export function sessaoAtiva(sessoes: SessaoBloqueio[], agora: Date): SessaoBloqueio | null {
  return sessoes.find((s) => !s.encerrado_em && (!s.fim_previsto || new Date(s.fim_previsto) > agora)) ?? null;
}

/** Sessões manuais abertas cujo prazo já passou: encerram sozinhas no fim previsto, sem motivo. */
export function vencidas(sessoes: SessaoBloqueio[], agora: Date): SessaoBloqueio[] {
  return sessoes.filter((s) => !s.encerrado_em && !!s.fim_previsto && new Date(s.fim_previsto) <= agora);
}

/** Desligar agora pede motivo? Só quando ainda falta tempo no prazo. */
export function precisaMotivo(s: SessaoBloqueio, agora: Date): boolean {
  return !!s.fim_previsto && new Date(s.fim_previsto) > agora;
}

/** "instagram.com" a partir do que o Davi digitar ("https://www.instagram.com/reels"). */
export function limparSite(texto: string): string {
  return texto.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0];
}

export function textoAte(s: SessaoBloqueio | null): string {
  if (!s) return "";
  if (!s.fim_previsto) return "enquanto o cronômetro roda";
  const d = new Date(s.fim_previsto);
  return `até ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
