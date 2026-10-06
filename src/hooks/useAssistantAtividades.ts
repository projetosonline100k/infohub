import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import type { Tables } from "@/integrations/supabase/types";
import { criarAtividade as criarAtividadeService, lerPastaAtivaSalva, pastaValidaOuPadrao } from "@/lib/atividades/criarAtividade";
import { onActivityCreated } from "@/lib/desktop/events";

export type AssistantTarefa = Tables<"atividades">;

export interface ColunaAtividade {
  id: string;
  nome: string;
  status_key: string;
  eh_conclusao: boolean;
  ordem: number;
}

export interface NovaAtividadeInput {
  titulo: string;
  clienteId: string | null;
  dataAtividade: string;
  tempoEstimado: number | null;
  prioridade: string;
  statusKey: string;
  pastaId?: string | null;
  tempoDescanso?: number | null;
}

// Rede de segurança, não a fonte principal de atualização (essa agora é o
// Supabase Realtime, ver assinatura mais abaixo). Cobre reconexões de canal
// e o raro caso de um evento se perder — por isso o intervalo é bem mais
// longo do que o polling "de verdade" que existia antes do Realtime.
const INTERVALO_REFETCH_SEGURANCA_MS = 2 * 60_000;

export type AssistantCategoria = "atrasada" | "hoje" | "proxima";

// Mesmas 4 colunas padrão usadas em AtividadesView.tsx/MindMapEditor.tsx —
// só entram em jogo se aquele escopo (cliente ou pessoal) nunca abriu um
// quadro Kanban antes.
const COLUNAS_PADRAO = [
  { nome: "Backlog", status_key: "backlog", eh_conclusao: false },
  { nome: "Em Execução", status_key: "em_progresso", eh_conclusao: false },
  { nome: "Revisão", status_key: "revisao", eh_conclusao: false },
  { nome: "Finalizado", status_key: "finalizado", eh_conclusao: true },
];
const ORDEM_STATUS_PADRAO = COLUNAS_PADRAO.map((c) => c.status_key);

const PESO_PRIORIDADE: Record<string, number> = { urgente: 4, alta: 3, media: 2, baixa: 1 };

const chaveColuna = (clienteId: string | null) => clienteId ?? "__pessoal__";

const hojeStr = () => format(new Date(), "yyyy-MM-dd");

// "Atrasada" = venceu antes de hoje. "Hoje" = vence hoje, ou (sem data de
// vencimento) está agendada pra hoje. O resto é "próxima".
export function categoriaTarefa(t: Pick<AssistantTarefa, "data_vencimento" | "data_atividade">, hoje = hojeStr()): AssistantCategoria {
  if (t.data_vencimento) {
    if (t.data_vencimento < hoje) return "atrasada";
    if (t.data_vencimento === hoje) return "hoje";
    return "proxima";
  }
  return t.data_atividade === hoje ? "hoje" : "proxima";
}

const ORDEM_CATEGORIA: Record<AssistantCategoria, number> = { atrasada: 0, hoje: 1, proxima: 2 };

// Critério pedido originalmente era atrasada > vence hoje > maior prioridade
// > prazo mais próximo > ordem manual. Virou atrasada > vence hoje > ORDEM
// MANUAL > prioridade > prazo — senão arrastar uma tarefa pra reordenar
// (Home do Jarvis) nunca "grudava": prioridade/prazo sempre reclassificavam
// tudo de volta antes da posição arrastada valer pra alguma coisa.
// Prioridade/prazo continuam como desempate pra tarefas que nunca foram
// arrastadas (mesma `ordem`, ex.: ambas 0 na criação).
function compararTarefas(a: AssistantTarefa, b: AssistantTarefa, hoje: string): number {
  const catA = categoriaTarefa(a, hoje);
  const catB = categoriaTarefa(b, hoje);
  if (catA !== catB) return ORDEM_CATEGORIA[catA] - ORDEM_CATEGORIA[catB];

  const ordemDiff = (a.ordem ?? 0) - (b.ordem ?? 0);
  if (ordemDiff !== 0) return ordemDiff;

  const prioDiff = (PESO_PRIORIDADE[b.prioridade] ?? 2) - (PESO_PRIORIDADE[a.prioridade] ?? 2);
  if (prioDiff !== 0) return prioDiff;

  const dataA = a.data_vencimento ?? "9999-99-99";
  const dataB = b.data_vencimento ?? "9999-99-99";
  return dataA < dataB ? -1 : dataA > dataB ? 1 : 0;
}

interface MensagemSync {
  tipo: "upsert" | "remover";
  linha?: AssistantTarefa;
  id?: string;
}

// Mesma fonte de dados do Kanban (tabela `atividades`) — SEM filtro de
// cliente: a RLS (`user_id = auth.uid()`, ver
// supabase/migrations/20260827000000_add_account_ownership.sql) já garante
// que só voltam as tarefas do próprio usuário, então aqui basta buscar tudo
// que não está concluído/excluído, iguais às que aparecem nos quadros de
// qualquer cliente + "Minhas atividades". Iniciar/pausar/concluir são
// cópias fiéis da lógica já usada em AtividadesView.tsx
// (timer_iniciado_em/timer_decorrido_segundos, status via coluna de
// conclusão do CLIENTE DA TAREFA), operando na mesma linha/id.
//
// Sincronização ao vivo em duas camadas:
// 1. Supabase Realtime (postgres_changes em `atividades`/`colunas_atividade`)
//    — fonte oficial, cobre qualquer origem (Kanban principal, outra aba,
//    a extensão Chrome via PATCH direto no PostgREST).
// 2. BroadcastChannel("assistant-sync") — atalho só entre abas do MESMO
//    navegador, aplica a mudança antes mesmo do Realtime ir e voltar pela
//    rede. O Realtime sempre confirma/corrige depois; o banco continua
//    sendo a única fonte de verdade, o Broadcast só acelera a percepção
//    local.
export function useAssistantAtividades() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [tarefasBrutas, setTarefasBrutas] = useState<AssistantTarefa[]>([]);
  const [colunasPorCliente, setColunasPorCliente] = useState<Record<string, ColunaAtividade[]>>({});
  const [colunasVersion, setColunasVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const canalRef = useRef<BroadcastChannel | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("atividades")
      .select("*")
      .is("deleted_at", null)
      .eq("concluida", false)
      .order("data_vencimento", { ascending: true, nullsFirst: false })
      .order("ordem", { ascending: true });
    if (!error) setTarefasBrutas(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Rede de segurança (ver comentário na constante) — não é mais a forma
  // principal de atualizar.
  useEffect(() => {
    const id = setInterval(() => void carregar(), INTERVALO_REFETCH_SEGURANCA_MS);
    return () => clearInterval(id);
  }, [carregar]);

  // Aplica uma linha vinda de fora (Realtime ou BroadcastChannel) — nunca
  // re-transmite (só as mutações locais transmitem, ver mais abaixo), então
  // não tem risco de eco entre abas.
  const aplicarLinhaLocalmente = useCallback((linha: AssistantTarefa) => {
    setTarefasBrutas((prev) => {
      if (linha.deleted_at || linha.concluida) {
        return prev.some((t) => t.id === linha.id) ? prev.filter((t) => t.id !== linha.id) : prev;
      }
      const existe = prev.some((t) => t.id === linha.id);
      return existe ? prev.map((t) => (t.id === linha.id ? linha : t)) : [...prev, linha];
    });
  }, []);

  const removerLinhaLocalmente = useCallback((id: string) => {
    setTarefasBrutas((prev) => (prev.some((t) => t.id === id) ? prev.filter((t) => t.id !== id) : prev));
  }, []);

  // Mutação local: aplica no estado + transmite pra outras abas via
  // BroadcastChannel (o Realtime também vai confirmar isso um pouco
  // depois, é esperado e inofensivo aplicar duas vezes o mesmo dado).
  const emitirAtualizacao = useCallback((linha: AssistantTarefa) => {
    aplicarLinhaLocalmente(linha);
    canalRef.current?.postMessage({ tipo: "upsert", linha } satisfies MensagemSync);
  }, [aplicarLinhaLocalmente]);

  const emitirRemocao = useCallback((id: string) => {
    removerLinhaLocalmente(id);
    canalRef.current?.postMessage({ tipo: "remover", id } satisfies MensagemSync);
  }, [removerLinhaLocalmente]);

  // ---- BroadcastChannel: sincronização instantânea entre abas do mesmo navegador ----
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const canal = new BroadcastChannel("assistant-sync");
    canalRef.current = canal;
    canal.onmessage = (event: MessageEvent<MensagemSync>) => {
      const msg = event.data;
      if (msg?.tipo === "upsert" && msg.linha) aplicarLinhaLocalmente(msg.linha);
      else if (msg?.tipo === "remover" && msg.id) removerLinhaLocalmente(msg.id);
    };
    return () => {
      canal.close();
      canalRef.current = null;
    };
  }, [aplicarLinhaLocalmente, removerLinhaLocalmente]);

  // ---- Supabase Realtime: fonte oficial, cobre qualquer origem (Kanban
  // principal, outra aba, a extensão Chrome) ----
  useEffect(() => {
    if (!userId) return;
    const canal = supabase
      .channel(`assistant-atividades-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "atividades", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const antiga = payload.old as { id?: string };
            if (antiga.id) removerLinhaLocalmente(antiga.id);
            return;
          }
          aplicarLinhaLocalmente(payload.new as AssistantTarefa);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "colunas_atividade", filter: `user_id=eq.${userId}` },
        (payload) => {
          const linha = (payload.eventType === "DELETE" ? payload.old : payload.new) as ColunaAtividade & { cliente_id: string | null };
          if (!linha?.id) return;
          const chave = chaveColuna(linha.cliente_id ?? null);
          setColunasPorCliente((prev) => {
            const atual = prev[chave];
            if (!atual) return prev; // nunca buscamos esse cliente ainda — nada pra atualizar em cache
            const semEla = atual.filter((c) => c.id !== linha.id);
            const nova = payload.eventType === "DELETE" ? semEla : [...semEla, linha as ColunaAtividade];
            return { ...prev, [chave]: nova.sort((a, b) => a.ordem - b.ordem) };
          });
          setColunasVersion((v) => v + 1);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const tarefas = useMemo(() => {
    const hoje = hojeStr();
    return [...tarefasBrutas].sort((a, b) => compararTarefas(a, b, hoje));
  }, [tarefasBrutas]);

  const atrasadas = useMemo(() => tarefas.filter((t) => categoriaTarefa(t) === "atrasada"), [tarefas]);

  // Busca (e cria, se ainda não existirem) as colunas do Kanban do cliente
  // dessa tarefa — cada cliente (e o escopo pessoal) tem seu próprio jogo de
  // colunas, por isso o cache é por cliente_id, não global.
  const garantirColunas = useCallback(async (clienteId: string | null): Promise<ColunaAtividade[]> => {
    const chave = chaveColuna(clienteId);
    const emCache = colunasPorCliente[chave];
    if (emCache?.length) return emCache;

    let query = supabase.from("colunas_atividade").select("id, nome, status_key, eh_conclusao, ordem").order("ordem", { ascending: true });
    query = clienteId ? query.eq("cliente_id", clienteId) : query.is("cliente_id", null);
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      setColunasPorCliente((prev) => ({ ...prev, [chave]: data }));
      return data;
    }

    const { data: inseridas, error: erroInsert } = await supabase
      .from("colunas_atividade")
      .insert(COLUNAS_PADRAO.map((c, i) => ({ ...c, cliente_id: clienteId, ordem: i })))
      .select("id, nome, status_key, eh_conclusao, ordem");
    if (erroInsert || !inseridas) return [];
    const ordenadas = [...inseridas].sort((a, b) => a.ordem - b.ordem);
    setColunasPorCliente((prev) => ({ ...prev, [chave]: ordenadas }));
    return ordenadas;
  }, [colunasPorCliente]);

  // Colunas agregadas de TODOS os clientes (+ pessoal) do usuário, deduplicadas
  // por status_key — usada pelo Kanban compacto quando nenhum projeto está
  // selecionado ("Todos os projetos"), já que cada cliente tem seu próprio
  // jogo de colunas e não faria sentido usar só o de um deles. Sem cache
  // (a lista de clientes muda pouco, mas prefiro sempre fresco aqui).
  const colunasTodas = useCallback(async (): Promise<ColunaAtividade[]> => {
    const { data, error } = await supabase
      .from("colunas_atividade")
      .select("id, nome, status_key, eh_conclusao, ordem, cliente_id")
      .order("ordem", { ascending: true });
    if (error || !data || data.length === 0) {
      return COLUNAS_PADRAO.map((c, i) => ({ id: c.status_key, ...c, ordem: i }));
    }
    const vistos = new Set<string>();
    const agregadas: ColunaAtividade[] = [];
    data.forEach((c) => {
      if (vistos.has(c.status_key)) return;
      vistos.add(c.status_key);
      agregadas.push({ id: c.id, nome: c.nome, status_key: c.status_key, eh_conclusao: c.eh_conclusao, ordem: c.ordem });
    });
    agregadas.sort((a, b) => {
      const ia = ORDEM_STATUS_PADRAO.indexOf(a.status_key);
      const ib = ORDEM_STATUS_PADRAO.indexOf(b.status_key);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.ordem - b.ordem;
    });
    return agregadas;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colunasVersion]);

  // `duracaoMin`, quando informado (usuário escolheu um tempo específico ao
  // iniciar foco, ou confirmou a estimativa já existente), também grava em
  // `tempo_estimado` — é o que dá ao cronômetro uma referência pra contar
  // REGRESSIVO (ring + AssistantHojeTab passam a mostrar tempo restante, não
  // mais só elapsed). Omitido (undefined) em retomar/recomendação rápida —
  // aí a estimativa da tarefa não muda.
  const iniciarTimer = useCallback(async (id: string, duracaoMin?: number | null) => {
    const atual = tarefasBrutas.find((t) => t.id === id);
    if (!atual) return;
    const agora = new Date().toISOString();
    const novaEstimativa = typeof duracaoMin === "number" && duracaoMin > 0 ? duracaoMin : atual.tempo_estimado;
    emitirAtualizacao({ ...atual, timer_iniciado_em: agora, tempo_estimado: novaEstimativa });
    const { error } = await supabase.from("atividades").update({ timer_iniciado_em: agora, tempo_estimado: novaEstimativa }).eq("id", id);
    if (error) await carregar();
  }, [tarefasBrutas, emitirAtualizacao, carregar]);

  // "Encerrar o dia" precisa saber quantas sessões de foco aconteceram HOJE
  // e qual foi a maior — timer_decorrido_segundos é um acumulador vitalício
  // por tarefa, não dá pra saber por dia. Grava um registro em
  // focus_sessions toda vez que um timer que estava rodando para, nos
  // mesmos 4 lugares abaixo onde isso já acontecia — puramente aditivo,
  // não muda nada do comportamento existente do timer/acumulador. Melhor
  // esforço: falha aqui nunca deve impedir a ação principal (pausar/
  // concluir/zerar), por isso não tem `await` nem tratamento de erro que
  // propague.
  const registrarSessaoFoco = useCallback((atividade: AssistantTarefa, terminoIso: string, motivo: "pause" | "complete" | "reset") => {
    if (!atividade.timer_iniciado_em) return;
    const duracao = Math.max(0, Math.round((new Date(terminoIso).getTime() - new Date(atividade.timer_iniciado_em).getTime()) / 1000));
    if (duracao <= 0) return;
    void supabase.from("focus_sessions").insert({
      atividade_id: atividade.id,
      cliente_id: atividade.cliente_id,
      started_at: atividade.timer_iniciado_em,
      ended_at: terminoIso,
      duration_seconds: duracao,
      ended_reason: motivo,
    });
  }, []);

  const pausarTimer = useCallback(async (id: string) => {
    const atual = tarefasBrutas.find((t) => t.id === id);
    if (!atual?.timer_iniciado_em) return;
    const agora = new Date().toISOString();
    const decorridoAgora = (new Date(agora).getTime() - new Date(atual.timer_iniciado_em).getTime()) / 1000;
    const novoDecorrido = Math.round((atual.timer_decorrido_segundos || 0) + decorridoAgora);
    registrarSessaoFoco(atual, agora, "pause");
    emitirAtualizacao({ ...atual, timer_iniciado_em: null, timer_decorrido_segundos: novoDecorrido });
    const { error } = await supabase
      .from("atividades")
      .update({ timer_iniciado_em: null, timer_decorrido_segundos: novoDecorrido })
      .eq("id", id);
    if (error) await carregar();
  }, [tarefasBrutas, emitirAtualizacao, carregar, registrarSessaoFoco]);

  // Marca concluída (mesma coluna "eh_conclusao" que o Kanban usa, do
  // cliente dessa tarefa) e zera o timer — mesma sequência de
  // concluirViaTimer em AtividadesView.tsx. A tarefa sai da lista local
  // (ela só traz não-concluídas).
  const concluir = useCallback(async (id: string) => {
    const tarefa = tarefasBrutas.find((t) => t.id === id);
    // Fora da lista atual (ex.: filtro de projeto no Jarvis, mas está no
    // "Foco de hoje"): busca o projeto, pra concluir na coluna certa dele.
    let clienteId = tarefa?.cliente_id ?? null;
    if (!tarefa) {
      const { data } = await supabase.from("atividades").select("cliente_id").eq("id", id).maybeSingle();
      clienteId = data?.cliente_id ?? null;
    }
    const cols = await garantirColunas(clienteId);
    const colunaConclusao = cols.find((c) => c.eh_conclusao);
    const novoStatus = colunaConclusao?.status_key || "finalizado";
    if (tarefa) registrarSessaoFoco(tarefa, new Date().toISOString(), "complete");
    emitirRemocao(id);
    const { error } = await supabase
      .from("atividades")
      .update({ concluida: true, status: novoStatus, timer_iniciado_em: null, timer_decorrido_segundos: 0 })
      .eq("id", id);
    if (error) {
      await carregar();
      throw error;
    }
  }, [tarefasBrutas, garantirColunas, emitirRemocao, carregar, registrarSessaoFoco]);

  // Zera o cronômetro sem mexer em mais nada (mesmo padrão de zerarTimer em
  // AtividadesView.tsx:1002-1016) — a tarefa continua exatamente onde
  // estava, só o tempo decorrido some.
  const zerarTimer = useCallback(async (id: string) => {
    const atual = tarefasBrutas.find((t) => t.id === id);
    if (!atual) return;
    if (atual.timer_iniciado_em) registrarSessaoFoco(atual, new Date().toISOString(), "reset");
    emitirAtualizacao({ ...atual, timer_iniciado_em: null, timer_decorrido_segundos: 0 });
    const { error } = await supabase
      .from("atividades")
      .update({ timer_iniciado_em: null, timer_decorrido_segundos: 0 })
      .eq("id", id);
    if (error) await carregar();
  }, [tarefasBrutas, emitirAtualizacao, carregar, registrarSessaoFoco]);

  // Edição genérica (título/estimativa/descanso/prioridade/data/projeto/
  // pasta/status) — usada pelo formulário de editar atividade do Jarvis.
  const atualizarAtividade = useCallback(async (id: string, patch: Partial<Pick<AssistantTarefa,
    "titulo" | "tempo_estimado" | "tempo_descanso" | "prioridade" | "data_atividade" | "cliente_id" | "pasta_id" | "status" | "concluida"
  >>) => {
    const atual = tarefasBrutas.find((t) => t.id === id);
    if (!atual) return;
    // Mudou de projeto (ou de pasta): a pasta tem que ser do projeto final —
    // sem pasta, ou com pasta de outro projeto, a tarefa ficava invisível.
    if ((patch.cliente_id !== undefined && patch.cliente_id !== atual.cliente_id) || patch.pasta_id !== undefined) {
      const clienteFinal = patch.cliente_id !== undefined ? patch.cliente_id : atual.cliente_id;
      patch = { ...patch, pasta_id: await pastaValidaOuPadrao(clienteFinal, patch.pasta_id ?? null) };
    }
    if (patch.concluida) {
      emitirRemocao(id);
    } else {
      emitirAtualizacao({ ...atual, ...patch });
    }
    const { error } = await supabase.from("atividades").update(patch).eq("id", id);
    if (error) await carregar();
  }, [tarefasBrutas, emitirAtualizacao, emitirRemocao, carregar]);

  // Muda status (+ordem, pro card ir pro fim da coluna de destino) — usada
  // pelo Kanban compacto (seletor rápido e o drag entre colunas). Versão
  // simplificada do handleDragEnd de AtividadesView.tsx: sempre acrescenta
  // ao final da coluna de destino, sem recalcular a ordem fina dos outros
  // cards (aceitável pra uma visão compacta secundária).
  const moverParaStatus = useCallback(async (id: string, statusKey: string, ehConclusao: boolean) => {
    const atual = tarefasBrutas.find((t) => t.id === id);
    if (!atual) return;
    const maiorOrdem = Math.max(0, ...tarefasBrutas.filter((t) => t.status === statusKey).map((t) => t.ordem || 0));
    const novaOrdem = maiorOrdem + 1;
    if (ehConclusao) {
      emitirRemocao(id);
    } else {
      emitirAtualizacao({ ...atual, status: statusKey, concluida: false, ordem: novaOrdem });
    }
    const { error } = await supabase
      .from("atividades")
      .update({ status: statusKey, concluida: ehConclusao, ordem: novaOrdem })
      .eq("id", id);
    if (error) await carregar();
  }, [tarefasBrutas, emitirAtualizacao, emitirRemocao, carregar]);

  // Reordena dentro da MESMA coluna (arrastar pra cima/baixo sem mudar de
  // status) — o Kanban compacto do Jarvis só sabia mover entre colunas
  // (moverParaStatus, sempre pro fim da lista de destino); soltar um card
  // no meio da própria coluna não fazia nada, e a única forma de mudar a
  // posição de uma tarefa era editando o número de "ordem" diretamente.
  // Mesma lógica do handleDragEnd de AtividadesView.tsx: recalcula a
  // "ordem" de toda a coluna afetada, não só da tarefa arrastada.
  const reordenarNaColuna = useCallback(async (statusKey: string, tarefaId: string, novoIndex: number) => {
    const daColuna = tarefasBrutas.filter((t) => t.status === statusKey).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const indiceAtual = daColuna.findIndex((t) => t.id === tarefaId);
    if (indiceAtual === -1 || indiceAtual === novoIndex) return;

    const [removida] = daColuna.splice(indiceAtual, 1);
    daColuna.splice(novoIndex, 0, removida);

    const novaOrdem = new Map<string, number>();
    daColuna.forEach((t, i) => novaOrdem.set(t.id, i + 1));
    daColuna.forEach((t) => {
      const ordem = novaOrdem.get(t.id);
      if (ordem !== undefined) emitirAtualizacao({ ...t, ordem });
    });

    try {
      for (const [id, ordem] of novaOrdem) {
        const { error } = await supabase.from("atividades").update({ ordem }).eq("id", id);
        if (error) throw error;
      }
    } catch {
      await carregar();
    }
  }, [tarefasBrutas, emitirAtualizacao, carregar]);

  // Versão genérica: recebe a sequência final de ids já pronta (calculada
  // por quem chama) e grava `ordem = posição` pra cada um. Usada pela Home
  // do Jarvis pra reordenar tarefas dentro de uma categoria (Hoje/Atrasadas)
  // e pra mover um grupo de projeto inteiro pra cima/baixo (recalcula a
  // categoria toda de uma vez, na nova sequência de grupos).
  const reordenarPorIds = useCallback(async (ids: string[]) => {
    const novaOrdem = new Map(ids.map((id, i) => [id, i + 1]));
    tarefasBrutas.forEach((t) => {
      const ordem = novaOrdem.get(t.id);
      if (ordem !== undefined && ordem !== t.ordem) emitirAtualizacao({ ...t, ordem });
    });
    try {
      for (const [id, ordem] of novaOrdem) {
        const { error } = await supabase.from("atividades").update({ ordem }).eq("id", id);
        if (error) throw error;
      }
    } catch {
      await carregar();
    }
  }, [tarefasBrutas, emitirAtualizacao, carregar]);

  // Cria a atividade pela MESMA função que o Kanban usa (ver
  // src/lib/atividades/criarAtividade.ts — adicionarAtividadeNoStatus em
  // AtividadesView.tsx chama exatamente a mesma), então aparece lá porque É
  // a mesma linha, não uma cópia. O Jarvis não tem seletor de pasta próprio
  // — lerPastaAtivaSalva lê a mesma pasta que o Kanban já lembra ter
  // deixado ativa pra esse cliente (senão a atividade nasce em "Sem pasta"
  // e some do quadro enquanto uma pasta específica estiver selecionada).
  const criarAtividade = useCallback(async (input: NovaAtividadeInput) => {
    const cols = await garantirColunas(input.clienteId);
    const coluna = cols.find((c) => c.status_key === input.statusKey);
    const data = await criarAtividadeService({
      titulo: input.titulo,
      clienteId: input.clienteId,
      pastaId: input.pastaId !== undefined ? input.pastaId : lerPastaAtivaSalva(input.clienteId),
      dataAtividade: input.dataAtividade,
      tempoEstimado: input.tempoEstimado,
      prioridade: input.prioridade,
      statusKey: input.statusKey,
      concluida: !!coluna?.eh_conclusao,
      ordem: tarefasBrutas.length + 1,
      tempoDescanso: input.tempoDescanso,
    });
    if (!data.concluida) emitirAtualizacao(data);
    return data;
  }, [garantirColunas, tarefasBrutas.length, emitirAtualizacao]);

  // Atalho local (desktop): quando a OUTRA janela (main <-> jarvis) cria
  // uma atividade, refaz a busca na hora em vez de esperar o Realtime ir e
  // voltar pela rede. No-op na web (ver src/lib/desktop/events.ts).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onActivityCreated(() => void carregar()).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [carregar]);

  return {
    tarefas,
    atrasadas,
    loading,
    refetch: carregar,
    iniciarTimer,
    pausarTimer,
    concluir,
    colunasDoProjeto: garantirColunas,
    colunasTodas,
    colunasVersion,
    moverParaStatus,
    reordenarNaColuna,
    reordenarPorIds,
    criarAtividade,
    zerarTimer,
    atualizarAtividade,
  };
}
