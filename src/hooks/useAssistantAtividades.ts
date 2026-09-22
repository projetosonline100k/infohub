import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AssistantTarefa = Tables<"atividades">;

export interface ColunaAtividade {
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
}

// Refetch periódico leve — mesma cadência do polling da extensão Chrome
// (ver chrome-extension/background.js), pra tarefas pausadas/concluídas por
// lá (ou em outra aba do próprio navegador) aparecerem aqui sem precisar de
// F5. Não é realtime de verdade, é um trade-off deliberado (ver plano).
const INTERVALO_REFETCH_MS = 30_000;

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

// Ordena exatamente pelos critérios pedidos: atrasada > vence hoje > maior
// prioridade > prazo mais próximo > ordem atual do Kanban.
function compararTarefas(a: AssistantTarefa, b: AssistantTarefa, hoje: string): number {
  const catA = categoriaTarefa(a, hoje);
  const catB = categoriaTarefa(b, hoje);
  if (catA !== catB) return ORDEM_CATEGORIA[catA] - ORDEM_CATEGORIA[catB];

  const prioDiff = (PESO_PRIORIDADE[b.prioridade] ?? 2) - (PESO_PRIORIDADE[a.prioridade] ?? 2);
  if (prioDiff !== 0) return prioDiff;

  const dataA = a.data_vencimento ?? "9999-99-99";
  const dataB = b.data_vencimento ?? "9999-99-99";
  if (dataA !== dataB) return dataA < dataB ? -1 : 1;

  return (a.ordem ?? 0) - (b.ordem ?? 0);
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
export function useAssistantAtividades() {
  const [tarefasBrutas, setTarefasBrutas] = useState<AssistantTarefa[]>([]);
  const [colunasPorCliente, setColunasPorCliente] = useState<Record<string, ColunaAtividade[]>>({});
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    const id = setInterval(() => void carregar(), INTERVALO_REFETCH_MS);
    return () => clearInterval(id);
  }, [carregar]);

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

    let query = supabase.from("colunas_atividade").select("nome, status_key, eh_conclusao, ordem").order("ordem", { ascending: true });
    query = clienteId ? query.eq("cliente_id", clienteId) : query.is("cliente_id", null);
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      setColunasPorCliente((prev) => ({ ...prev, [chave]: data }));
      return data;
    }

    const { data: inseridas, error: erroInsert } = await supabase
      .from("colunas_atividade")
      .insert(COLUNAS_PADRAO.map((c, i) => ({ ...c, cliente_id: clienteId, ordem: i })))
      .select("nome, status_key, eh_conclusao, ordem");
    if (erroInsert || !inseridas) return [];
    const ordenadas = [...inseridas].sort((a, b) => a.ordem - b.ordem);
    setColunasPorCliente((prev) => ({ ...prev, [chave]: ordenadas }));
    return ordenadas;
  }, [colunasPorCliente]);

  const iniciarTimer = useCallback(async (id: string) => {
    const agora = new Date().toISOString();
    setTarefasBrutas((prev) => prev.map((t) => (t.id === id ? { ...t, timer_iniciado_em: agora } : t)));
    const { error } = await supabase.from("atividades").update({ timer_iniciado_em: agora }).eq("id", id);
    if (error) await carregar();
  }, [carregar]);

  const pausarTimer = useCallback(async (id: string) => {
    setTarefasBrutas((prev) => {
      const atual = prev.find((t) => t.id === id);
      if (!atual?.timer_iniciado_em) return prev;
      const decorridoAgora = (Date.now() - new Date(atual.timer_iniciado_em).getTime()) / 1000;
      const novoDecorrido = Math.round((atual.timer_decorrido_segundos || 0) + decorridoAgora);
      void supabase
        .from("atividades")
        .update({ timer_iniciado_em: null, timer_decorrido_segundos: novoDecorrido })
        .eq("id", id)
        .then(({ error }) => { if (error) void carregar(); });
      return prev.map((t) => (t.id === id ? { ...t, timer_iniciado_em: null, timer_decorrido_segundos: novoDecorrido } : t));
    });
  }, [carregar]);

  // Marca concluída (mesma coluna "eh_conclusao" que o Kanban usa, do
  // cliente dessa tarefa) e zera o timer — mesma sequência de
  // concluirViaTimer em AtividadesView.tsx. A tarefa sai da lista local
  // (ela só traz não-concluídas).
  const concluir = useCallback(async (id: string) => {
    const tarefa = tarefasBrutas.find((t) => t.id === id);
    const cols = await garantirColunas(tarefa?.cliente_id ?? null);
    const colunaConclusao = cols.find((c) => c.eh_conclusao);
    const novoStatus = colunaConclusao?.status_key || "finalizado";
    setTarefasBrutas((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase
      .from("atividades")
      .update({ concluida: true, status: novoStatus, timer_iniciado_em: null, timer_decorrido_segundos: 0 })
      .eq("id", id);
    if (error) {
      await carregar();
      throw error;
    }
  }, [tarefasBrutas, garantirColunas, carregar]);

  // Muda status (+ordem, pro card ir pro fim da coluna de destino) — usada
  // pelo Kanban compacto (seletor rápido e o drag entre colunas). Versão
  // simplificada do handleDragEnd de AtividadesView.tsx: sempre acrescenta
  // ao final da coluna de destino, sem recalcular a ordem fina dos outros
  // cards (aceitável pra uma visão compacta secundária).
  const moverParaStatus = useCallback(async (id: string, statusKey: string, ehConclusao: boolean) => {
    setTarefasBrutas((prev) => {
      const maiorOrdem = Math.max(0, ...prev.filter((t) => t.status === statusKey).map((t) => t.ordem || 0));
      const novaOrdem = maiorOrdem + 1;
      void supabase
        .from("atividades")
        .update({ status: statusKey, concluida: ehConclusao, ordem: novaOrdem })
        .eq("id", id)
        .then(({ error }) => { if (error) void carregar(); });
      return ehConclusao
        ? prev.filter((t) => t.id !== id)
        : prev.map((t) => (t.id === id ? { ...t, status: statusKey, concluida: ehConclusao, ordem: novaOrdem } : t));
    });
  }, [carregar]);

  // Cria uma atividade de verdade na mesma tabela (mesmos campos/defaults
  // usados por adicionarAtividadeNoStatus em AtividadesView.tsx) — aparece
  // no Kanban principal porque É a mesma linha, não uma cópia.
  const criarAtividade = useCallback(async (input: NovaAtividadeInput) => {
    const cols = await garantirColunas(input.clienteId);
    const coluna = cols.find((c) => c.status_key === input.statusKey);
    const { data, error } = await supabase
      .from("atividades")
      .insert({
        titulo: input.titulo,
        cliente_id: input.clienteId,
        data_atividade: input.dataAtividade,
        tempo_estimado: input.tempoEstimado,
        prioridade: input.prioridade,
        status: input.statusKey,
        concluida: !!coluna?.eh_conclusao,
        ordem: tarefasBrutas.length + 1,
      })
      .select("*")
      .single();
    if (error || !data) throw error || new Error("Falha ao criar atividade");
    if (!data.concluida) setTarefasBrutas((prev) => [...prev, data]);
    return data;
  }, [garantirColunas, tarefasBrutas.length]);

  return {
    tarefas,
    atrasadas,
    loading,
    refetch: carregar,
    iniciarTimer,
    pausarTimer,
    concluir,
    colunasDoProjeto: garantirColunas,
    moverParaStatus,
    criarAtividade,
  };
}
