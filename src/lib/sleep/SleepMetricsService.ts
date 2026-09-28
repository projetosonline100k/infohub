import type { SleepLog } from "./SleepService";
import { formatarDuracao } from "./SleepService";
import type { RelatorioDiario } from "@/lib/productivity/DailyReportService";

// Módulo puro — sem chamadas ao Supabase.

function paraMinutosDoDia(horaStr: string): number {
  const [h, m] = horaStr.split(":").map(Number);
  return h * 60 + m;
}

export function formatarHorario(minutosDoDia: number): string {
  const h = Math.floor(minutosDoDia / 60);
  const m = minutosDoDia % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Média "circular": a maioria dos horários de dormir cruza a meia-noite
// (23:40 e 00:10 são "próximos", não opostos) — desloca cada horário 12h
// antes de tirar a média ingênua, pra 23:40/00:10 não se cancelarem, e volta
// pro intervalo 0-1439 no final.
function mediaCircular(minutosDoDia: number[]): number | null {
  if (minutosDoDia.length === 0) return null;
  const ajustados = minutosDoDia.map((m) => (m + 12 * 60) % (24 * 60));
  const media = ajustados.reduce((s, m) => s + m, 0) / ajustados.length;
  return Math.round((media - 12 * 60 + 24 * 60) % (24 * 60));
}

// Distância média até a média circular, pela menor volta do relógio —
// usado só pra "seu horário de dormir variou em média Xmin".
function desvioMedioCircular(minutosDoDia: number[]): number | null {
  const media = mediaCircular(minutosDoDia);
  if (media == null || minutosDoDia.length < 2) return null;
  const desvios = minutosDoDia.map((m) => {
    const d = Math.abs(m - media);
    return Math.min(d, 24 * 60 - d);
  });
  return Math.round(desvios.reduce((s, d) => s + d, 0) / desvios.length);
}

export interface MetricasSono {
  totalNoites: number;
  mediaMinutos: number;
  noitesDentroDaMeta: number;
  maiorMinutos: number;
  menorMinutos: number;
  mediaQualidade: number;
  horarioMedioDormirMinutos: number | null;
  horarioMedioAcordarMinutos: number | null;
}

export function calcularMetricasDeSono(logs: SleepLog[], metaMinutos: number): MetricasSono {
  if (logs.length === 0) {
    return {
      totalNoites: 0,
      mediaMinutos: 0,
      noitesDentroDaMeta: 0,
      maiorMinutos: 0,
      menorMinutos: 0,
      mediaQualidade: 0,
      horarioMedioDormirMinutos: null,
      horarioMedioAcordarMinutos: null,
    };
  }
  const duracoes = logs.map((l) => l.total_sleep_minutes);
  const qualidades = logs.map((l) => l.quality_score);
  return {
    totalNoites: logs.length,
    mediaMinutos: Math.round(duracoes.reduce((s, d) => s + d, 0) / logs.length),
    noitesDentroDaMeta: duracoes.filter((d) => d >= metaMinutos).length,
    maiorMinutos: Math.max(...duracoes),
    menorMinutos: Math.min(...duracoes),
    mediaQualidade: Math.round((qualidades.reduce((s, q) => s + q, 0) / logs.length) * 10) / 10,
    horarioMedioDormirMinutos: mediaCircular(logs.map((l) => paraMinutosDoDia(l.bed_time))),
    horarioMedioAcordarMinutos: mediaCircular(logs.map((l) => paraMinutosDoDia(l.wake_time))),
  };
}

// Mesmo estilo de ProductivityInsightsService.ts: descrição estatística
// simples, amostra mínima nomeada, NUNCA causal ("nos dias com X, Y foi Z" —
// nunca "Y por causa de X", item 13 do pedido).
const MINIMO_NOITES_PARA_INSIGHT = 7;
const MINIMO_NOITES_PARA_VARIACAO = 3;
const MINIMO_DIAS_POR_GRUPO_CRUZAMENTO = 3;
const LIMIAR_SONO_ALTO_MINUTOS = 7 * 60 + 30;

export function gerarInsightsSono(logsRecentes: SleepLog[], relatorios: RelatorioDiario[]): string[] {
  const insights: string[] = [];

  if (logsRecentes.length >= MINIMO_NOITES_PARA_INSIGHT) {
    const metricas = calcularMetricasDeSono(logsRecentes, 0);
    insights.push(`Nos últimos ${logsRecentes.length} dias você dormiu em média ${formatarDuracao(metricas.mediaMinutos)}.`);
  }

  if (logsRecentes.length >= MINIMO_NOITES_PARA_VARIACAO) {
    const variacao = desvioMedioCircular(logsRecentes.map((l) => paraMinutosDoDia(l.bed_time)));
    if (variacao != null && variacao > 0) {
      insights.push(`Seu horário de dormir variou em média ${formatarDuracao(variacao)} esta semana.`);
    }
  }

  // Cruzamento sono × produtividade — só entra com amostra nos dois grupos,
  // usando dias com sono E relatório de produtividade sobrepostos.
  const relatorioPorData = new Map(relatorios.map((r) => [r.date, r]));
  const pares = logsRecentes
    .map((log) => ({ log, relatorio: relatorioPorData.get(log.sleep_date) }))
    .filter((p): p is { log: SleepLog; relatorio: RelatorioDiario } => !!p.relatorio);

  const comSonoAlto = pares.filter((p) => p.log.total_sleep_minutes >= LIMIAR_SONO_ALTO_MINUTOS);
  if (comSonoAlto.length >= MINIMO_DIAS_POR_GRUPO_CRUZAMENTO) {
    const media = comSonoAlto.reduce((s, p) => s + p.relatorio.productivity_score, 0) / comSonoAlto.length;
    insights.push(`Nos dias em que você dormiu pelo menos ${formatarDuracao(LIMIAR_SONO_ALTO_MINUTOS)}, sua produtividade média foi ${media.toFixed(1)}/10.`);
  }

  const comSonoBaixo = pares.filter((p) => p.log.total_sleep_minutes < LIMIAR_SONO_ALTO_MINUTOS);
  if (comSonoBaixo.length >= MINIMO_DIAS_POR_GRUPO_CRUZAMENTO) {
    const mediaFocoHoras = comSonoBaixo.reduce((s, p) => s + p.relatorio.focused_seconds, 0) / comSonoBaixo.length / 3600;
    insights.push(`Nos dias com menos de ${formatarDuracao(LIMIAR_SONO_ALTO_MINUTOS)} de sono, seu tempo médio de foco foi ${mediaFocoHoras.toFixed(1)}h.`);
  }

  return insights;
}
