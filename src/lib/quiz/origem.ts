import type { UtmLida } from "./painel";
import { codigoDaMarca } from "./afiliados";

// De onde o lead veio (15/11/2026, Davi: "preciso saber se o lead veio por afiliado, instalivros, reels…"): sai da UTM que ficou guardada no lead.
// utm_content = aff_<código> → afiliado; senão origem · meio · campanha (ex.: instagram · reels · instalivrosapp); sem UTM → direto.
export interface OrigemLead { tipo: "afiliado" | "link" | "direto"; rotulo: string; detalhe: string }

export function origemDoLead(utm: UtmLida | undefined, afiliados: Map<string, string>): OrigemLead {
  const u = utm ?? {};
  const codigo = codigoDaMarca(u.utm_content);
  if (codigo) {
    const nome = afiliados.get(codigo);
    return { tipo: "afiliado", rotulo: `Afiliado: ${nome ?? codigo}`, detalhe: [u.utm_medium && u.utm_medium !== "link" ? u.utm_medium : "", nome ? "" : "código sem afiliado cadastrado"].filter(Boolean).join(" · ") };
  }
  const partes = [u.utm_source, u.utm_medium, u.utm_campaign].filter((x): x is string => !!x);
  if (!partes.length) return { tipo: "direto", rotulo: "Direto", detalhe: "abriu o endereço puro, sem link rastreado" };
  const [fonte, ...resto] = partes;
  return { tipo: "link", rotulo: partes.slice(0, 2).join(" · "), detalhe: [fonte, ...resto, u.utm_content].filter(Boolean).join(" · ") };
}
