// Visão "Semana" das atividades (24/10, Davi: dias da semana à esquerda, a lista do dia no meio, calendário à
// direita e o Kanban embaixo). Aqui fica só a regra, sem tela: em que dia cai cada tarefa e em que situação ela
// está — testada em tests/semanaAtividades.test.mjs.

export type Situacao = "atrasada" | "andamento" | "revisao" | "afazer" | "concluida";

export interface TarefaSemana {
  concluida: boolean;
  status: string;
  data_vencimento: string | null;
  concluida_em?: string | null;
  timer_iniciado_em?: string | null;
  progresso?: number | null;
  situacao?: string | null;
}

export interface ColunaSemana { status_key: string; nome: string; eh_conclusao: boolean }

const DIAS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "Terça feira", "quinta-feira", "SÁBADO" → 0 (domingo) a 6 (sábado); outra coluna → null. */
export function diaDaColuna(nome: string | null | undefined): number | null {
  if (!nome) return null;
  const n = normalizar(nome);
  const i = DIAS.findIndex((d) => n.startsWith(d));
  return i >= 0 ? i : null;
}

/** "2026-10-24" no fuso local (sem virar o dia anterior por UTC). */
export function dataLocal(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d);
}
export const chaveDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Segunda-feira da semana de `d` (00:00). */
export function inicioDaSemana(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

/**
 * Dia da tarefa (chave "aaaa-mm-dd") ou null (sem data):
 * 1. concluída: o dia em que concluiu (concluida_em) — 24/10, Davi: "Concluídas" do dia é o que foi feito
 * naquele dia, não o que tinha prazo nele (ex.: "Programar reel" do sábado feito na terça conta na terça);
 * 2. a data de entrega (data_vencimento; data_atividade é só quando foi criada); 3. sem data, numa coluna com
 * nome de dia ("Terça feira", como o Davi usa no Kanban): esse dia na semana de hoje.
 */
export function diaDaTarefa(t: TarefaSemana, coluna: ColunaSemana | undefined, hoje: Date): string | null {
  if (t.concluida && t.concluida_em) return chaveDia(new Date(t.concluida_em));
  if (t.data_vencimento) return t.data_vencimento.slice(0, 10);
  const dia = diaDaColuna(coluna?.nome);
  if (dia === null || t.concluida) return null;
  const seg = inicioDaSemana(hoje);
  const alvo = new Date(seg);
  alvo.setDate(seg.getDate() + ((dia + 6) % 7));
  return chaveDia(alvo);
}

export function situacaoDaTarefa(t: TarefaSemana, coluna: ColunaSemana | undefined, hoje: Date): Situacao {
  if (t.concluida || coluna?.eh_conclusao || t.situacao === "concluida") return "concluida";
  const nome = normalizar(coluna?.nome ?? "");
  if (t.status === "revisao" && diaDaColuna(nome) === null || nome.includes("revis") || t.situacao === "aguardando_aprovacao") return "revisao";
  if (t.data_vencimento && dataLocal(t.data_vencimento) < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) return "atrasada";
  if (t.timer_iniciado_em || (t.progresso ?? 0) > 0 || (t.status === "em_progresso" && diaDaColuna(nome) === null) || nome.includes("execu") || nome.includes("andamento") || nome.includes("fazendo")) return "andamento";
  return "afazer";
}

/** Dias de atraso (0 se não está atrasada). */
export function diasDeAtraso(t: TarefaSemana, hoje: Date): number {
  if (t.concluida || !t.data_vencimento) return 0;
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.max(0, Math.round((h.getTime() - dataLocal(t.data_vencimento).getTime()) / 86400000));
}
