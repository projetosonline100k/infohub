// Código no ar x código do Mac (18/11/2026): o site (Vercel) devolve o commit em /api/versao.
import { estadoDoCodigo } from "@/lib/desktop/codigoGit";
import { isDesktop } from "@/lib/platform";

export async function commitNoAr(): Promise<string | null> {
  try {
    const r = await fetch(`https://infopro-hub.vercel.app/api/versao?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j?.commit === "string" ? j.commit : null;
  } catch { return null; }
}

export type ResultadoEspera = "ok" | "tempo" | "cancelado" | "sem_checagem";

/** Espera o site subir com o commit enviado (até ~6 min). Se a checagem falhar 3 vezes seguidas, desiste ("sem_checagem"). */
export async function esperarSiteNoAr(commit: string, opcoes: { cancelado?: () => boolean } = {}): Promise<ResultadoEspera> {
  let falhas = 0;
  for (let i = 0; i < 72; i++) {
    if (opcoes.cancelado?.()) return "cancelado";
    const noAr = await commitNoAr();
    if (noAr === commit) return "ok";
    falhas = noAr === null ? falhas + 1 : 0;
    if (falhas >= 3) return "sem_checagem";
    await new Promise((ok) => setTimeout(ok, 5000));
  }
  return opcoes.cancelado?.() ? "cancelado" : "tempo";
}

export type SituacaoCodigo =
  | { tipo: "ok" }
  | { tipo: "pendente"; pendentes: number }   // desktop: commits só no Mac
  | { tipo: "subindo" }                        // desktop: enviado, Vercel ainda não está no commit
  | { tipo: "desconhecido" };

export async function situacaoDoCodigo(): Promise<SituacaoCodigo> {
  if (!isDesktop()) return { tipo: "desconhecido" };
  const est = await estadoDoCodigo(true);
  if (!est) return { tipo: "desconhecido" };
  if (est.pendentes > 0) return { tipo: "pendente", pendentes: est.pendentes };
  const noAr = await commitNoAr();
  if (noAr && noAr !== est.commit_local) return { tipo: "subindo" };
  return { tipo: "ok" };
}
