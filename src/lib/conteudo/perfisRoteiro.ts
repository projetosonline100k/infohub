// Perfis do roteiro (14/11/2026, Davi: "dentro daqui tenham os perfis Instalivros / Insta_insights / Eu.davi / Jaci, em bolinhas"):
// o mesmo vídeo guarda um roteiro por perfil. O perfil padrão (Instalivros) é a coluna `roteiro`; os outros ficam em `roteiros_perfis`.
export interface PerfilRoteiro { chave: string; nome: string; sigla: string; cor: string }
export const PERFIL_PADRAO = "instalivros";
export const PERFIS_ROTEIRO: PerfilRoteiro[] = [
  { chave: "instalivros", nome: "Instalivros", sigla: "IL", cor: "bg-blue-500" },
  { chave: "insta_insights", nome: "Insta_insights", sigla: "II", cor: "bg-violet-500" },
  { chave: "eu_davi", nome: "Eu.davi", sigla: "D", cor: "bg-emerald-500" },
  { chave: "jaci", nome: "Jaci", sigla: "J", cor: "bg-rose-500" },
];
export type RoteirosPerfis = Record<string, string>;

const vazio = (html: string | null | undefined) => !(html ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

/** O roteiro (HTML) de um perfil: o padrão vem da coluna `roteiro`; os outros, do mapa. Perfil sem nada começa zerado. */
export function roteiroDoPerfil(chave: string, roteiroPadrao: string | null | undefined, perfis: RoteirosPerfis | null | undefined): string {
  return chave === PERFIL_PADRAO ? roteiroPadrao ?? "" : perfis?.[chave] ?? "";
}

/** Guarda o HTML editado no lugar certo: o padrão na coluna `roteiro`, os outros no mapa (sem mexer nos demais). */
export function guardarRoteiro(chave: string, html: string, atual: { roteiro?: string | null; roteiros_perfis?: RoteirosPerfis | null }): { roteiro?: string | null; roteiros_perfis?: RoteirosPerfis } {
  return chave === PERFIL_PADRAO ? { roteiro: html } : { roteiros_perfis: { ...(atual.roteiros_perfis ?? {}), [chave]: html } };
}

/** Quais perfis já têm texto (a bolinha mostra um pontinho). */
export function perfisComTexto(roteiroPadrao: string | null | undefined, perfis: RoteirosPerfis | null | undefined): Set<string> {
  const s = new Set<string>();
  if (!vazio(roteiroPadrao)) s.add(PERFIL_PADRAO);
  for (const [k, v] of Object.entries(perfis ?? {})) if (!vazio(v)) s.add(k);
  return s;
}
