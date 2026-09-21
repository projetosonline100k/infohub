// "responsavel_nome" guarda mais de uma pessoa como texto separado por
// vírgula (sem mudar a coluna no banco) — essas duas funções são o único
// lugar que sabe converter entre a lista de nomes e esse texto.
export function parseResponsaveis(valor: string | null | undefined): string[] {
  if (!valor) return [];
  return valor.split(",").map((nome) => nome.trim()).filter(Boolean);
}

export function formatResponsaveis(nomes: string[]): string | null {
  const unicos = Array.from(new Set(nomes.map((nome) => nome.trim()).filter(Boolean)));
  return unicos.length > 0 ? unicos.join(", ") : null;
}
