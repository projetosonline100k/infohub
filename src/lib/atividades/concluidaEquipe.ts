// 19/10/2026 (Davi: "do nada apareceu um monte de atividade que eu nem sabia"): ~100 tarefas que a
// equipe (as IAs) já tinha entregado estavam com situacao = 'concluida', mas com a marca
// `concluida` desligada — e as telas de Atividades, que olham só a marca, mostravam todas como
// abertas. Aqui: o que a equipe concluiu conta como concluído também nas Atividades.
export function comConclusaoDaEquipe<T extends { concluida: boolean }>(lista: T[]): T[] {
  return lista.map((a) => {
    const situacao = (a as { situacao?: string | null }).situacao;
    return situacao === "concluida" && !a.concluida ? { ...a, concluida: true } : a;
  });
}
