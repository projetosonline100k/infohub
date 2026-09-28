import { supabase } from "@/integrations/supabase/client";

export interface AppUsado {
  nome: string;
  segundos: number;
}

export interface ProjetoTrabalhado {
  clienteId: string | null;
  segundos: number;
}

export interface TarefaAcimaEstimativa {
  id: string;
  titulo: string;
  estimadoSegundos: number;
  realSegundos: number;
}

export interface MetricasAutomaticasDia {
  focusedSeconds: number;
  focusSessionsCount: number;
  longestFocusSeconds: number;
  pausedSeconds: number;
  pauseCount: number;
  completedTasks: number;
  startedTasks: number;
  unfinishedTasks: number;
  overdueTasks: number;
  overtimeSeconds: number;
  tasksOverEstimate: TarefaAcimaEstimativa[];
  topProjects: ProjetoTrabalhado[];
  // Distração/apps só existem se o usuário ligou "monitorar app ativo" nas
  // configurações de privacidade — quando falso, os 3 campos abaixo são
  // "sem dado", NUNCA um zero fabricado (zero leria como "distração
  // perfeita", o que seria uma mentira pra quem nunca ativou o monitor).
  monitoramentoAtivo: boolean;
  distractionSeconds: number;
  possibleDistractionSeconds: number;
  topApps: AppUsado[];
}

function metricasVazias(monitoramentoAtivo: boolean): MetricasAutomaticasDia {
  return {
    focusedSeconds: 0,
    focusSessionsCount: 0,
    longestFocusSeconds: 0,
    pausedSeconds: 0,
    pauseCount: 0,
    completedTasks: 0,
    startedTasks: 0,
    unfinishedTasks: 0,
    overdueTasks: 0,
    overtimeSeconds: 0,
    tasksOverEstimate: [],
    topProjects: [],
    monitoramentoAtivo,
    distractionSeconds: 0,
    possibleDistractionSeconds: 0,
    topApps: [],
  };
}

// Todo o cálculo é feito no cliente, sobre queries paralelas simples — mesmo
// estilo já usado em DashGeral.tsx/FaturamentoGeral.tsx (nenhuma RPC existe
// nesse projeto pra agregação de dados, então não introduzo uma aqui).
//
// `inicioIso`/`fimIso` delimitam o dia (meia-noite a meia-noite local,
// calculado por quem chama) — passado como parâmetro em vez de calculado
// aqui pra manter esta função pura/testável e sem depender de fuso horário
// implícito.
export async function calcularMetricasDoDia(
  dataStr: string,
  inicioIso: string,
  fimIso: string,
  monitorarAppAtivo: boolean
): Promise<MetricasAutomaticasDia> {
  const [sessoesRes, concluidasRes, iniciadasRes, pendentesRes, atrasadasRes, eventosRes] = await Promise.all([
    supabase.from("focus_sessions").select("atividade_id, cliente_id, started_at, ended_at, duration_seconds, ended_reason").gte("started_at", inicioIso).lt("started_at", fimIso).order("started_at", { ascending: true }),
    supabase.from("atividades").select("id").is("deleted_at", null).gte("concluida_em", inicioIso).lt("concluida_em", fimIso),
    supabase.from("atividades").select("id").is("deleted_at", null).gte("created_at", inicioIso).lt("created_at", fimIso),
    supabase.from("atividades").select("id").is("deleted_at", null).eq("concluida", false).eq("data_atividade", dataStr),
    supabase.from("atividades").select("id").is("deleted_at", null).eq("concluida", false).lt("data_vencimento", dataStr),
    monitorarAppAtivo
      ? supabase.from("focus_activity_events").select("app_name, duration_seconds, classification").gte("started_at", inicioIso).lt("started_at", fimIso)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const metricas = metricasVazias(monitorarAppAtivo);

  metricas.completedTasks = concluidasRes.data?.length ?? 0;
  metricas.startedTasks = iniciadasRes.data?.length ?? 0;
  metricas.unfinishedTasks = pendentesRes.data?.length ?? 0;
  metricas.overdueTasks = atrasadasRes.data?.length ?? 0;

  const sessoes = sessoesRes.data ?? [];
  metricas.focusSessionsCount = sessoes.length;
  metricas.focusedSeconds = sessoes.reduce((soma, s) => soma + (s.duration_seconds || 0), 0);
  metricas.longestFocusSeconds = sessoes.reduce((max, s) => Math.max(max, s.duration_seconds || 0), 0);
  metricas.pauseCount = sessoes.filter((s) => s.ended_reason === "pause").length;

  // "Tempo pausado" = intervalo entre uma pausa e a retomada da MESMA
  // tarefa (não entre tarefas diferentes — terminar uma e começar outra na
  // sequência não é "pausa"). Aproximação documentada, não uma medição
  // perfeita de ociosidade.
  const porTarefa = new Map<string, typeof sessoes>();
  sessoes.forEach((s) => {
    if (!s.atividade_id) return;
    const lista = porTarefa.get(s.atividade_id) ?? [];
    lista.push(s);
    porTarefa.set(s.atividade_id, lista);
  });
  let pausadoTotal = 0;
  porTarefa.forEach((lista) => {
    for (let i = 0; i < lista.length - 1; i++) {
      if (lista[i].ended_reason !== "pause") continue;
      const gapSegundos = (new Date(lista[i + 1].started_at).getTime() - new Date(lista[i].ended_at).getTime()) / 1000;
      if (gapSegundos > 0) pausadoTotal += gapSegundos;
    }
  });
  metricas.pausedSeconds = Math.round(pausadoTotal);

  const porProjeto = new Map<string | null, number>();
  sessoes.forEach((s) => {
    porProjeto.set(s.cliente_id, (porProjeto.get(s.cliente_id) ?? 0) + (s.duration_seconds || 0));
  });
  metricas.topProjects = Array.from(porProjeto.entries())
    .map(([clienteId, segundos]) => ({ clienteId, segundos }))
    .sort((a, b) => b.segundos - a.segundos);

  // Tempo acima da estimativa: tarefas tocadas hoje, comparando o total
  // acumulado (vitalício, propriedade da tarefa) contra a estimativa —
  // faz sentido ser vitalício aqui, a estimativa não é "por dia".
  const idsHoje = Array.from(new Set(sessoes.map((s) => s.atividade_id).filter((id): id is string => !!id)));
  if (idsHoje.length > 0) {
    const { data: tarefasHoje } = await supabase
      .from("atividades")
      .select("id, titulo, tempo_estimado, timer_decorrido_segundos")
      .in("id", idsHoje);
    (tarefasHoje ?? []).forEach((t) => {
      if (!t.tempo_estimado) return;
      const estimadoSegundos = t.tempo_estimado * 60;
      const realSegundos = t.timer_decorrido_segundos || 0;
      if (realSegundos > estimadoSegundos) {
        metricas.overtimeSeconds += realSegundos - estimadoSegundos;
        metricas.tasksOverEstimate.push({ id: t.id, titulo: t.titulo, estimadoSegundos, realSegundos });
      }
    });
  }

  if (monitorarAppAtivo && eventosRes.data) {
    const porApp = new Map<string, number>();
    eventosRes.data.forEach((e) => {
      const segundos = e.duration_seconds || 0;
      if (e.classification === "possible_distraction") metricas.possibleDistractionSeconds += segundos;
      else if (e.classification === "confirmed_distraction") metricas.distractionSeconds += segundos;
      porApp.set(e.app_name, (porApp.get(e.app_name) ?? 0) + segundos);
    });
    metricas.topApps = Array.from(porApp.entries())
      .map(([nome, segundos]) => ({ nome, segundos }))
      .sort((a, b) => b.segundos - a.segundos)
      .slice(0, 5);
  }

  return metricas;
}
