// Embaixadores (19/11/2026). Funções puras: o link que cada embaixador divulga leva a marca dele (utm_content = aff_<código>),
// a mesma usada pelos afiliados do quiz, e é ela que liga visita → lead → venda a ele.
import { codigoAfiliado, marcaDoAfiliado } from "@/lib/quiz/afiliados";

export const codigoEmbaixador = codigoAfiliado;

/** Endereço com a marca do embaixador; mantém o que já existir na URL (outras UTM, parâmetros da oferta). */
export function linkDoEmbaixador(destino: string, codigo: string): string {
  try {
    const u = new URL(destino);
    u.searchParams.set("utm_source", "embaixador");
    u.searchParams.set("utm_medium", "link");
    if (!u.searchParams.has("utm_campaign")) u.searchParams.set("utm_campaign", "embaixador");
    u.searchParams.set("utm_content", marcaDoAfiliado(codigo));
    return u.toString();
  } catch { return destino; }
}

export const conviteDoEmbaixador = (origem: string, token: string) => `${origem}/embaixador/convite/${token}`;

export const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
