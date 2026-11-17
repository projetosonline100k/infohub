// Visão da semana do Dash geral: contas puras (semana de segunda a domingo, progresso dos projetos, faturamento).
export interface TarefaSemana { id: string; titulo: string; cliente_id: string | null; concluida: boolean; data_vencimento: string | null; concluida_em: string | null }
export interface ItemMissao { id: string; texto: string; feito: boolean }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Segunda-feira (AAAA-MM-DD) da semana da data. */
export function segundaDe(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return iso(x);
}
export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  const x = new Date(a, m - 1, d + n);
  return iso(x);
}
export const domingoDe = (segunda: string) => somarDias(segunda, 6);
export const hojeIso = () => iso(new Date());

/** Tarefas que contam na semana: vencem nela, estão atrasadas e abertas, ou foram concluídas nela. */
export function tarefasDaSemana(ts: TarefaSemana[], segunda: string): TarefaSemana[] {
  const fim = domingoDe(segunda);
  return ts.filter((t) => {
    const venc = (t.data_vencimento ?? "").slice(0, 10);
    const feitaNaSemana = !!t.concluida_em && t.concluida_em.slice(0, 10) >= segunda && t.concluida_em.slice(0, 10) <= fim;
    if (t.concluida) return feitaNaSemana || (venc >= segunda && venc <= fim);
    return !!venc && venc <= fim;   // aberta: vence na semana ou já passou
  });
}

export function progresso(ts: TarefaSemana[]): { total: number; feitas: number; pct: number } {
  const feitas = ts.filter((t) => t.concluida).length;
  return { total: ts.length, feitas, pct: ts.length ? Math.round((feitas / ts.length) * 100) : 0 };
}

/** Abertas primeiro (mais atrasadas e as de hoje no topo), concluídas no fim. */
export function ordenar(ts: TarefaSemana[]): TarefaSemana[] {
  return [...ts].sort((a, b) => Number(a.concluida) - Number(b.concluida) || (a.data_vencimento ?? "9999").localeCompare(b.data_vencimento ?? "9999") || a.titulo.localeCompare(b.titulo));
}

export type FiltroTarefas = "todas" | "hoje" | "pendentes" | "concluidas";
export function filtrar(ts: TarefaSemana[], f: FiltroTarefas, hoje: string): TarefaSemana[] {
  if (f === "hoje") return ts.filter((t) => !t.concluida && (t.data_vencimento ?? "").slice(0, 10) <= hoje && !!t.data_vencimento);
  if (f === "pendentes") return ts.filter((t) => !t.concluida);
  if (f === "concluidas") return ts.filter((t) => t.concluida);
  return ts;
}

/** Mês da semana (o da quinta-feira dela, como no padrão ISO): primeiro e último dia. */
export function mesDaSemana(segunda: string): { inicio: string; fim: string; rotulo: string } {
  const q = somarDias(segunda, 3);
  const [a, m] = q.split("-").map(Number);
  const inicio = `${a}-${String(m).padStart(2, "0")}-01`;
  const ult = new Date(a, m, 0).getDate();
  const nomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return { inicio, fim: `${a}-${String(m).padStart(2, "0")}-${String(ult).padStart(2, "0")}`, rotulo: nomes[m - 1] };
}

export const saudacao = (hora: number) => (hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite");
export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** Meta digitada ("10000", "10.000,50", "10k") → número; vazio ou inválido = null. */
export function lerMeta(t: string): number | null {
  const s = t.trim().toLowerCase().replace(/r\$\s*/g, "");
  if (!s) return null;
  const mil = /k$/.test(s);
  const n = Number(s.replace(/k$/, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? (mil ? n * 1000 : n) : null;
}

/** Quanto falta para a meta (0 se já bateu) e quanto passou dela. */
export function faltaParaMeta(faturado: number, meta: number | null): { falta: number; passou: number } | null {
  if (!meta || meta <= 0) return null;
  return { falta: Math.max(0, Math.round((meta - faturado) * 100) / 100), passou: Math.max(0, Math.round((faturado - meta) * 100) / 100) };
}
/** Meta do mês = soma das metas dos projetos (se algum tiver meta); senão a meta total digitada. */
export function metaDoMes(metasProjetos: number[], metaTotal: number | null): number | null {
  const soma = metasProjetos.reduce((a, b) => a + b, 0);
  return soma > 0 ? soma : metaTotal;
}
/** Dias do mês (1..N) com o valor de cada projeto, para o gráfico empilhado. */
export function serieDiaria(linhas: { dia: string; cliente_id: string; valor: number }[], inicio: string, fim: string, ids: string[]): Record<string, number | string>[] {
  const n = Number(fim.slice(8, 10));
  const out: Record<string, number | string>[] = Array.from({ length: n }, (_, i) => ({ dia: String(i + 1), ...Object.fromEntries(ids.map((id) => [id, 0])) }));
  for (const l of linhas) {
    if (l.dia < inicio || l.dia > fim || !ids.includes(l.cliente_id)) continue;
    const linha = out[Number(l.dia.slice(8, 10)) - 1];
    linha[l.cliente_id] = Number(linha[l.cliente_id]) + l.valor;
  }
  return out;
}
