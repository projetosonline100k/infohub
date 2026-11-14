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

// ---------------------------------------------------------------- cérebro de cada perfil (14/11)
// "Eu preciso clicar em cada perfil e cadastrar as informações daquele perfil: são o cérebro dele." Cada perfil usa um cérebro do escritório
// (os mesmos cérebros do chat da IA, setores.cerebros). O cérebro do perfil é achado pelo id fixo `perfil-<chave>` ou por um nome conhecido
// (o cérebro "Davi" que já existe serve ao Eu.davi); se não existe, é criado com as seções em branco para o Davi preencher.
export interface CerebroMinimo { id: string; nome: string; secoes?: { titulo?: string; texto?: string }[] }
const normalizarNome = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const APELIDOS: Record<string, string[]> = { instalivros: ["instalivros"], insta_insights: ["insta insights", "instainsights"], eu_davi: ["eu davi", "davi"], jaci: ["jaci"] };
export const idCerebroDoPerfil = (chave: string) => `perfil-${chave}`;

export function acharCerebroDoPerfil<T extends CerebroMinimo>(cerebros: T[], perfil: { chave: string; nome: string }): T | null {
  const porId = cerebros.find((c) => c.id === idCerebroDoPerfil(perfil.chave));
  if (porId) return porId;
  const nomes = [normalizarNome(perfil.nome), ...(APELIDOS[perfil.chave] ?? [])];
  return cerebros.find((c) => nomes.includes(normalizarNome(c.nome))) ?? null;
}
export function novoCerebroDoPerfil(perfil: { chave: string; nome: string }): CerebroMinimo {
  return { id: idCerebroDoPerfil(perfil.chave), nome: perfil.nome, secoes: [
    { titulo: "Quem é o perfil", texto: "" }, { titulo: "Público", texto: "" }, { titulo: "Tom e jeito de falar", texto: "" },
    { titulo: "O que funciona e o que evitar", texto: "" }, { titulo: "Exemplos de roteiros que deram certo", texto: "" },
  ] };
}

/** Headlines de um roteiro (HTML) para puxar com o @: sem a linha de referência ("REF") nem títulos vazios. */
export function headlinesParaPuxar(headlines: { numero: number; titulo: string }[]): { numero: number; titulo: string }[] {
  return headlines.filter((h) => h.titulo.trim() && !/^(ref|refer[eê]ncia|link)\b/i.test(h.titulo.trim()) && !/^https?:\/\//i.test(h.titulo.trim()));
}
