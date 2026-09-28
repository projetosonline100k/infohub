import { differenceInCalendarDays, parseISO } from "date-fns";
import type { RelatorioDiario } from "./DailyReportService";

// Item 12 do pedido: SEM IA externa — só regras/matemática sobre o
// histórico de relatórios. Cada insight só aparece com amostra mínima
// (constantes nomeadas abaixo, não números soltos no meio da lógica) — o
// objetivo é nunca "inventar" uma conclusão a partir de pouco dado.
const MINIMO_RELATORIOS_PARA_QUALQUER_INSIGHT = 3;
const MINIMO_DIAS_PRIORIDADE = 4; // de até 7 dias considerados
const MINIMO_DIAS_POR_GRUPO_FOCO = 5; // precisa de grupo "3h+" E "menos de 3h", 5 cada
const HORAS_FOCO_ALTO_SEGUNDOS = 3 * 60 * 60;
const MINIMO_DIAS_COM_OVERTIME = 3;

export interface TarefaComEstimativaHistorico {
  estimadoSegundos: number;
  realSegundos: number;
}

function horas(segundos: number): string {
  return (segundos / 3600).toFixed(1).replace(".0", "");
}

// "Você concluiu sua prioridade principal em X dos últimos Y dias." — Y é
// quantos dias REALMENTE têm relatório (não força a janela de 7 se só
// existirem 4).
function insightPrioridade(relatorios: RelatorioDiario[]): string | null {
  const ultimos7 = relatorios.slice(0, 7);
  if (ultimos7.length < MINIMO_DIAS_PRIORIDADE) return null;
  const concluiu = ultimos7.filter((r) => r.completed_main_priority).length;
  return `Você concluiu sua prioridade principal em ${concluiu} dos últimos ${ultimos7.length} dias.`;
}

// "Nos dias com 3h+ de foco, sua nota média foi X (contra Y nos outros
// dias)." — precisa de amostra nos dois grupos, senão a comparação não
// significa nada.
function insightFocoENota(relatorios: RelatorioDiario[]): string | null {
  const comFocoAlto = relatorios.filter((r) => r.focused_seconds >= HORAS_FOCO_ALTO_SEGUNDOS);
  const comFocoBaixo = relatorios.filter((r) => r.focused_seconds < HORAS_FOCO_ALTO_SEGUNDOS);
  if (comFocoAlto.length < MINIMO_DIAS_POR_GRUPO_FOCO || comFocoBaixo.length < MINIMO_DIAS_POR_GRUPO_FOCO) return null;
  const media = (lista: RelatorioDiario[]) => lista.reduce((s, r) => s + r.productivity_score, 0) / lista.length;
  const mediaAlta = media(comFocoAlto);
  const mediaBaixa = media(comFocoBaixo);
  return `Nos dias em que você fez ${horas(HORAS_FOCO_ALTO_SEGUNDOS)}h+ de foco, sua nota média foi ${mediaAlta.toFixed(1)} (contra ${mediaBaixa.toFixed(1)} nos outros dias).`;
}

// "Sua energia caiu nos últimos 3 dias." — exige 3 dias CALENDÁRIO
// consecutivos (sem buraco) com energia estritamente decrescente, não só
// "3 de N dias quaisquer".
function insightEnergiaCaindo(relatorios: RelatorioDiario[]): string | null {
  const ultimos3 = relatorios.slice(0, 3);
  if (ultimos3.length < 3) return null;
  const consecutivos =
    differenceInCalendarDays(parseISO(ultimos3[0].date), parseISO(ultimos3[1].date)) === 1 &&
    differenceInCalendarDays(parseISO(ultimos3[1].date), parseISO(ultimos3[2].date)) === 1;
  if (!consecutivos) return null;
  const estritamenteDecrescente = ultimos3[0].energy_score < ultimos3[1].energy_score && ultimos3[1].energy_score < ultimos3[2].energy_score;
  return estritamenteDecrescente ? "Sua energia caiu nos últimos 3 dias." : null;
}

// "Você passou da estimativa em X dos últimos Y dias, quase Zh a mais no
// total." — usa o overtime_seconds já congelado em cada relatório (não dá
// pra calcular um "% médio" sem o total estimado por dia, que não é
// guardado — esta é a versão honesta que dá pra afirmar com o que existe).
function insightTempoAcimaDaEstimativa(relatorios: RelatorioDiario[]): string | null {
  const diasComOvertime = relatorios.filter((r) => r.overtime_seconds > 0);
  if (diasComOvertime.length < MINIMO_DIAS_COM_OVERTIME) return null;
  const totalSegundos = diasComOvertime.reduce((s, r) => s + r.overtime_seconds, 0);
  return `Você passou da estimativa em ${diasComOvertime.length} dos últimos ${relatorios.length} dias, ${horas(totalSegundos)}h a mais no total.`;
}

// `relatorios` deve vir ordenado do mais recente pro mais antigo (mesma
// ordem que DailyReportService.buscarHistorico já devolve).
export function gerarInsights(relatorios: RelatorioDiario[]): string[] {
  if (relatorios.length < MINIMO_RELATORIOS_PARA_QUALQUER_INSIGHT) return [];
  return [insightPrioridade(relatorios), insightFocoENota(relatorios), insightEnergiaCaindo(relatorios), insightTempoAcimaDaEstimativa(relatorios)].filter(
    (texto): texto is string => texto !== null
  );
}
