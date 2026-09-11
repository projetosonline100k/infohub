export const areasEquipe = [
  { id: 'clientes', label: 'Informações do cliente' },
  { id: 'pesquisa', label: 'Pesquisas' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'conteudo', label: 'Conteúdo' },
  { id: 'atividades', label: 'Atividades' },
  { id: 'produtos', label: 'Produtos e receita' },
] as const;
export type AreaEquipe = typeof areasEquipe[number]['id'];
export type AcaoEquipe = 'acessar' | 'criar' | 'editar';
export type PermissoesEquipe = Record<AreaEquipe, Record<AcaoEquipe, boolean>>;
export function permissoesVazias(): PermissoesEquipe {
  return Object.fromEntries(areasEquipe.map(({ id }) => [id, { acessar: false, criar: false, editar: false }])) as PermissoesEquipe;
}
export function lerPermissoes(value: unknown): PermissoesEquipe {
  const result = permissoesVazias();
  if (!value || typeof value !== 'object') return result;
  for (const { id } of areasEquipe) {
    const area = (value as Partial<PermissoesEquipe>)[id];
    result[id] = { acessar: area?.acessar === true, criar: area?.acessar === true && area?.criar === true, editar: area?.acessar === true && area?.editar === true };
  }
  return result;
}

// A propriedade é independente das permissões delegadas aos membros.
export function acessoProprietario(ownerId: string | null | undefined, userId: string | undefined) {
  if (!userId || !ownerId || ownerId !== userId) return null;
  return {
    proprietario: true,
    permissoes: Object.fromEntries(areasEquipe.map(({ id }) => [id, { acessar: true, criar: true, editar: true }])) as PermissoesEquipe,
  };
}

export function resolverAcesso(ownerId: string | null | undefined, userId: string | undefined, data: unknown) {
  const dono = acessoProprietario(ownerId, userId);
  if (dono) return dono;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const acesso = data as { proprietario?: boolean; permissoes?: unknown };
  // A função do banco também pode confirmar a propriedade.
  if (acesso.proprietario === true && userId) return acessoProprietario(userId, userId);
  return { proprietario: false, permissoes: lerPermissoes(acesso.permissoes) };
}
