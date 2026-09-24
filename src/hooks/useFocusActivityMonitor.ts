import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { startFocusMonitor, stopFocusMonitor, onFocusTick, type FocusTick } from "@/lib/desktop/focusMonitor";

type Classificacao = "work" | "neutral" | "possible_distraction" | "confirmed_distraction";

interface EventoAtual {
  appName: string;
  bundleId: string | null;
  windowTitle: string | null;
  startedAt: number;
  classification: Classificacao;
}

interface RegraAprendida {
  id: string;
  cliente_id: string | null;
  atividade_id: string | null;
  app_name: string | null;
  bundle_id: string | null;
  window_title_pattern: string | null;
  classification: "work" | "possible_distraction";
}

export interface PromptDesvio {
  appName: string;
  windowTitle: string | null;
  minutos: number;
}

export interface ResumoSessao {
  focoSegundos: number;
  distracaoSegundos: number;
  apps: { nome: string; segundos: number }[];
}

const LIMIAR_SEGUNDOS = 10 * 60; // ~10-12min pedido — sinaliza o desvio
const COOLDOWN_PROMPT_MS = 12 * 60_000; // dentro da faixa pedida de 10-15min

interface UseFocusActivityMonitorParams {
  // Ligado só durante foco ativo E com a preferência "Monitorar aplicativo
  // ativo" ligada (calculado por quem chama — este hook não sabe de estado
  // de painel, só liga/desliga).
  ativo: boolean;
  analisarTitulo: boolean;
  detectarDistracoes: boolean;
  clienteId: string | null;
  atividadeId: string | null;
}

// DistractionDetectionService + JarvisInterventionService (item 3, rodada
// 3) — em TS de propósito: o Rust só descobre app/janela ativa (ver
// src/lib/desktop/focusMonitor.ts), tudo que precisa de Supabase (gravar
// eventos, aprender regras, decidir quando perguntar) mora aqui, onde já
// vive o resto do acesso a dados do app.
export function useFocusActivityMonitor({ ativo, analisarTitulo, detectarDistracoes, clienteId, atividadeId }: UseFocusActivityMonitorParams) {
  const { user } = useAuth();
  const [promptDesvio, setPromptDesvio] = useState<PromptDesvio | null>(null);

  const eventoAtualRef = useRef<EventoAtual | null>(null);
  const tempoNaoClassificadoRef = useRef(0);
  const ultimoPromptEmRef = useRef(0);
  const regrasRef = useRef<RegraAprendida[]>([]);
  const contextoRef = useRef({ clienteId, atividadeId });
  contextoRef.current = { clienteId, atividadeId };

  // Regras aprendidas — carregadas uma vez por sessão de foco (não por
  // tick), casadas client-side a cada evento.
  useEffect(() => {
    if (!ativo || !user?.id) return;
    let cancelado = false;
    supabase
      .from("focus_learned_rules")
      .select("id, cliente_id, atividade_id, app_name, bundle_id, window_title_pattern, classification")
      .then(({ data }) => {
        if (!cancelado) regrasRef.current = (data as RegraAprendida[]) || [];
      });
    return () => {
      cancelado = true;
    };
  }, [ativo, user?.id]);

  const classificarPorRegra = useCallback((appName: string | null, bundleId: string | null, windowTitle: string | null): "work" | "possible_distraction" | null => {
    const { clienteId: cId, atividadeId: aId } = contextoRef.current;
    const candidatas = regrasRef.current.filter((r) => {
      if (r.atividade_id && r.atividade_id !== aId) return false;
      if (r.cliente_id && r.cliente_id !== cId) return false;
      if (r.app_name && r.app_name !== appName) return false;
      if (r.bundle_id && r.bundle_id !== bundleId) return false;
      if (r.window_title_pattern && !(windowTitle ?? "").toLowerCase().includes(r.window_title_pattern.toLowerCase())) return false;
      return true;
    });
    if (candidatas.length === 0) return null;
    const especificidade = (r: RegraAprendida) =>
      [r.atividade_id, r.cliente_id, r.app_name, r.bundle_id, r.window_title_pattern].filter(Boolean).length;
    candidatas.sort((a, b) => especificidade(b) - especificidade(a));
    return candidatas[0].classification;
  }, []);

  const gravarEvento = useCallback(async (evento: EventoAtual, endedAt: number) => {
    if (!user?.id) return;
    const duration = Math.max(1, Math.round((endedAt - evento.startedAt) / 1000));
    await supabase.from("focus_activity_events").insert({
      atividade_id: contextoRef.current.atividadeId,
      app_name: evento.appName,
      bundle_id: evento.bundleId,
      window_title: evento.windowTitle,
      started_at: new Date(evento.startedAt).toISOString(),
      ended_at: new Date(endedAt).toISOString(),
      duration_seconds: duration,
      classification: evento.classification,
    });
  }, [user?.id]);

  const fecharEventoAtual = useCallback(() => {
    const evento = eventoAtualRef.current;
    eventoAtualRef.current = null;
    if (evento) void gravarEvento(evento, Date.now());
  }, [gravarEvento]);

  const onTick = useCallback((tick: FocusTick) => {
    const appName = tick.appName ?? "Desconhecido";
    const chaveAtual = eventoAtualRef.current ? `${eventoAtualRef.current.appName}|${eventoAtualRef.current.windowTitle ?? ""}` : null;
    const chaveNova = `${appName}|${tick.windowTitle ?? ""}`;

    if (chaveAtual !== chaveNova) {
      fecharEventoAtual();
      const regra = classificarPorRegra(tick.appName, tick.bundleId, tick.windowTitle);
      eventoAtualRef.current = {
        appName,
        bundleId: tick.bundleId,
        windowTitle: tick.windowTitle,
        startedAt: Date.now(),
        classification: regra ?? "neutral",
      };
      tempoNaoClassificadoRef.current = 0;
      return;
    }

    tempoNaoClassificadoRef.current += 7; // mesmo intervalo do tick nativo (~7s)

    const evento = eventoAtualRef.current;
    if (!evento) return;
    if (evento.classification === "neutral") {
      const regra = classificarPorRegra(tick.appName, tick.bundleId, tick.windowTitle);
      if (regra) evento.classification = regra;
    }

    if (!detectarDistracoes) return;
    if (evento.classification !== "neutral") return; // já classificado (por regra) — não pergunta
    if (promptDesvio) return; // já tem prompt aberto
    if (tempoNaoClassificadoRef.current < LIMIAR_SEGUNDOS) return;
    if (Date.now() - ultimoPromptEmRef.current < COOLDOWN_PROMPT_MS) return;

    ultimoPromptEmRef.current = Date.now();
    setPromptDesvio({ appName, windowTitle: tick.windowTitle, minutos: Math.round(tempoNaoClassificadoRef.current / 60) });
  }, [detectarDistracoes, classificarPorRegra, fecharEventoAtual, promptDesvio]);

  // Liga/desliga o monitor nativo (Rust) junto com `ativo` — nunca continua
  // rodando pausado/concluído/desligado (item "Parar quando...").
  useEffect(() => {
    if (!ativo) {
      fecharEventoAtual();
      setPromptDesvio(null);
      return;
    }
    void startFocusMonitor(analisarTitulo);
    let unlisten: (() => void) | undefined;
    onFocusTick(onTick).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
      void stopFocusMonitor();
      fecharEventoAtual();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, analisarTitulo]);

  // "Faz parte" — classifica o contexto atual como trabalho e aprende uma
  // regra (a mais específica disponível: projeto+app) pra não perguntar de
  // novo nesse mesmo contexto. "Me distraí" — só confirma a distração,
  // sem aprender regra nenhuma.
  const resolverPrompt = useCallback(async (resposta: "faz_parte" | "me_distraiu") => {
    const evento = eventoAtualRef.current;
    setPromptDesvio(null);
    if (!evento) return;

    if (resposta === "faz_parte") {
      evento.classification = "work";
      if (user?.id) {
        await supabase.from("focus_learned_rules").insert({
          cliente_id: contextoRef.current.clienteId,
          atividade_id: null,
          app_name: evento.appName,
          bundle_id: evento.bundleId,
          window_title_pattern: null,
          classification: "work",
        });
        const { data } = await supabase
          .from("focus_learned_rules")
          .select("id, cliente_id, atividade_id, app_name, bundle_id, window_title_pattern, classification");
        regrasRef.current = (data as RegraAprendida[]) || [];
      }
    } else {
      evento.classification = "confirmed_distraction";
    }
  }, [user?.id]);

  const buscarResumoSessao = useCallback(async (desde: Date): Promise<ResumoSessao> => {
    fecharEventoAtual();
    if (!user?.id) return { focoSegundos: 0, distracaoSegundos: 0, apps: [] };
    const { data } = await supabase
      .from("focus_activity_events")
      .select("app_name, duration_seconds, classification")
      .gte("started_at", desde.toISOString());
    const linhas = data || [];
    let focoSegundos = 0;
    let distracaoSegundos = 0;
    const porApp = new Map<string, number>();
    linhas.forEach((l) => {
      const segundos = l.duration_seconds || 0;
      if (l.classification === "confirmed_distraction" || l.classification === "possible_distraction") {
        distracaoSegundos += segundos;
      } else {
        focoSegundos += segundos;
      }
      porApp.set(l.app_name, (porApp.get(l.app_name) || 0) + segundos);
    });
    const apps = Array.from(porApp.entries())
      .map(([nome, segundos]) => ({ nome, segundos }))
      .sort((a, b) => b.segundos - a.segundos);
    return { focoSegundos, distracaoSegundos, apps };
  }, [user?.id, fecharEventoAtual]);

  return { promptDesvio, resolverPrompt, buscarResumoSessao };
}
