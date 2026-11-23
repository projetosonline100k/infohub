/** O servidor entrega no máximo 1000 linhas por pedido (`.limit(100000)` não vale): busca em páginas até acabar ou chegar em `max`.
 * Sem isso o painel do quiz perdia os eventos mais antigos e sumia com "terminaram" e "clicaram na oferta" (23/11/2026). */
export async function paginar<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null }>, max = 200000): Promise<{ data: T[] }> {
  const tudo: T[] = [];
  for (let de = 0; de < max; de += 1000) {
    const { data } = await consulta(de, de + 999);
    tudo.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return { data: tudo };
}
