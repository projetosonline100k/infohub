// Tela da Ponte (fila ponte_pedidos: Claude de voz → Claude Code). Lógica pura: duração, saúde do serviço
// do Mac e números dos gráficos. Os dados vêm da função ponte_painel() (só o login do Davi).

export type PonteStatus = "pendente" | "aguardando_aprovacao" | "em_andamento" | "concluido" | "erro";

export type PontePedido = {
  id: string;
  criado_em: string;
  origem: string;
  titulo: string;
  descricao: string;
  prioridade: "baixa" | "normal" | "alta";
  status: PonteStatus;
  requer_aprovacao: boolean;
  aprovado: boolean;
  resultado: string | null;
  erro: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
};

export const STATUS_PONTE: { chave: PonteStatus; rotulo: string }[] = [
  { chave: "pendente", rotulo: "Pendente" },
  { chave: "aguardando_aprovacao", rotulo: "Aguardando aprovação" },
  { chave: "em_andamento", rotulo: "Em andamento" },
  { chave: "concluido", rotulo: "Concluído" },
  { chave: "erro", rotulo: "Erro" },
];

// Serviço do Mac pega um pedido por minuto: aprovado e parado há mais que isso = serviço caiu.
export const LIMITE_PARADO_MS = 5 * 60 * 1000;

/** "1h 02min", "3min 05s", "12s". */
export function duracaoTexto(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60;
  const dois = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}h ${dois(m)}min`;
  if (m > 0) return `${m}min ${dois(seg)}s`;
  return `${seg}s`;
}

/** Duração de um pedido: concluído/erro = início→fim; em andamento = início→agora. */
export function duracaoMs(p: PontePedido, agora: number): number | null {
  if (!p.iniciado_em) return null;
  const fim = p.concluido_em ? Date.parse(p.concluido_em) : p.status === "em_andamento" ? agora : null;
  return fim == null ? null : fim - Date.parse(p.iniciado_em);
}

/** Pronto para o serviço pegar (mesma regra de pegar() em scripts/ponte.py). */
export function prontoParaRodar(p: PontePedido): boolean {
  return (p.status === "pendente" && (!p.requer_aprovacao || p.aprovado)) || (p.status === "aguardando_aprovacao" && p.aprovado);
}

const ORDEM_PRIORIDADE: Record<PontePedido["prioridade"], number> = { alta: 0, normal: 1, baixa: 2 };

/** Ordem da fila do serviço: prioridade (alta, normal, baixa) e depois o mais antigo. */
function ordemFila(a: PontePedido, b: PontePedido): number {
  return ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade] || Date.parse(a.criado_em) - Date.parse(b.criado_em);
}

/** O pedido que o serviço está rodando (o mais antigo em andamento, se houver mais de um). */
export function pedidoEmAndamento(pedidos: PontePedido[]): PontePedido | null {
  return pedidos.filter((p) => p.status === "em_andamento")
    .sort((a, b) => Date.parse(a.iniciado_em ?? a.criado_em) - Date.parse(b.iniciado_em ?? b.criado_em))[0] ?? null;
}

/** Próximo da fila: o primeiro pronto (regra de pegar()); se nenhum estiver pronto, o primeiro que espera aprovação. */
export function proximoDaFila(pedidos: PontePedido[]): { pedido: PontePedido; pronto: boolean } | null {
  const prontos = pedidos.filter(prontoParaRodar).sort(ordemFila);
  if (prontos.length) return { pedido: prontos[0], pronto: true };
  const esperando = pedidos.filter((p) => (p.status === "pendente" || p.status === "aguardando_aprovacao") && !p.aprovado).sort(ordemFila);
  return esperando.length ? { pedido: esperando[0], pronto: false } : null;
}

/** Pedidos prontos e parados há mais de 5 min: se houver algum, a bolinha fica vermelha. */
export function pedidosParados(pedidos: PontePedido[], agora: number): PontePedido[] {
  return pedidos.filter((p) => prontoParaRodar(p) && agora - Date.parse(p.criado_em) > LIMITE_PARADO_MS);
}

export function contagemPorStatus(pedidos: PontePedido[]): Record<PonteStatus, number> {
  const c = { pendente: 0, aguardando_aprovacao: 0, em_andamento: 0, concluido: 0, erro: 0 };
  for (const p of pedidos) c[p.status] += 1;
  return c;
}

const chaveDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Concluídos por dia (pelo concluido_em, no fuso local), dos últimos `dias` dias até hoje. */
export function concluidosPorDia(pedidos: PontePedido[], agora: number, dias = 7): { dia: string; total: number }[] {
  const serie = new Map<string, number>();
  const hoje = new Date(agora);
  for (let i = dias - 1; i >= 0; i--) serie.set(chaveDia(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i)), 0);
  for (const p of pedidos) {
    if (p.status !== "concluido" || !p.concluido_em) continue;
    const k = chaveDia(new Date(p.concluido_em));
    if (serie.has(k)) serie.set(k, (serie.get(k) ?? 0) + 1);
  }
  return Array.from(serie, ([dia, total]) => ({ dia, total }));
}

/** Tempo médio (início→fim) dos concluídos; null se ainda não há nenhum. */
export function tempoMedioMs(pedidos: PontePedido[]): number | null {
  const tempos = pedidos.filter((p) => p.status === "concluido").map((p) => duracaoMs(p, 0)).filter((t): t is number => t != null);
  return tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;
}
