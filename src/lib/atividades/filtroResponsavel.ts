export type FiltroResponsavel = "todas" | "minhas" | "outras" | "sem_responsavel";

const normalizar = (valor: string) => valor.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");

export function filtrarPorResponsavel<T extends { responsavel_nome: string | null; cliente_id?: string | null; user_id?: string | null }>(atividades: T[], filtro: FiltroResponsavel, meusNomes: string[], userId?: string): T[] {
  if (filtro === "todas") return atividades;
  const identidades = new Set(meusNomes.map(normalizar).filter(Boolean));
  return atividades.filter((atividade) => {
    const responsaveis = (atividade.responsavel_nome || "").split(",").map(normalizar).filter(Boolean);
    if (filtro === "sem_responsavel") return responsaveis.length === 0;
    const minha = responsaveis.some((nome) => identidades.has(nome))
      || (responsaveis.length === 0 && atividade.cliente_id === null && !!userId && atividade.user_id === userId);
    return filtro === "minhas" ? minha : responsaveis.length > 0 && !minha;
  });
}
