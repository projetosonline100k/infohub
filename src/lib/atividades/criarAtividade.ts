import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { VISAO_GERAL } from "@/components/atividades/PastasBar";
import { emitActivityCreated } from "@/lib/desktop/events";

export interface CriarAtividadeInput {
  titulo: string;
  clienteId: string | null;
  pastaId: string | null;
  dataAtividade: string;
  statusKey: string;
  concluida: boolean;
  ordem: number;
  tempoEstimado?: number | null;
  prioridade?: string;
  tempoDescanso?: number | null;
}

// Única função de criação de atividade do app inteiro — usada pelo Kanban
// (AtividadesView.tsx: adicionarAtividade/adicionarAtividadeNoStatus/
// adicionarAtividadeRapida) E pelo Jarvis (useAssistantAtividades.ts).
// Mesma tabela, mesmo payload, sem lógica paralela: quem quiser mudar como
// uma atividade é criada muda só aqui.
// A tela de Atividades só mostra tarefas que estão em alguma pasta — tarefa
// sem pasta ficava invisível dentro do projeto (ex.: criada pela Visão geral
// ou movida de projeto pelo Jarvis). Devolve a primeira pasta do projeto,
// criando "Geral" se ele ainda não tiver nenhuma.
export async function garantirPastaPadrao(clienteId: string | null): Promise<string | null> {
  let consulta = supabase.from("pastas_atividade").select("id").is("deleted_at", null).order("ordem", { ascending: true }).limit(1);
  consulta = clienteId ? consulta.eq("cliente_id", clienteId) : consulta.is("cliente_id", null);
  const { data } = await consulta;
  if (data && data.length > 0) return data[0].id;
  const { data: criada, error } = await supabase
    .from("pastas_atividade")
    .insert({ nome: "Geral", cliente_id: clienteId, ordem: 0, origem: "atividades" })
    .select("id")
    .single();
  return error || !criada ? null : criada.id;
}

// A pasta precisa ser do MESMO projeto (e não estar na lixeira). Pasta de
// outro projeto deixava a tarefa invisível — aconteceu ao trocar o projeto
// de uma tarefa no Jarvis, que mantinha a pasta do projeto antigo.
export async function pastaValidaOuPadrao(clienteId: string | null, pastaId: string | null | undefined): Promise<string | null> {
  if (pastaId) {
    const { data } = await supabase.from("pastas_atividade").select("cliente_id, deleted_at").eq("id", pastaId).maybeSingle();
    if (data && !data.deleted_at && (data.cliente_id ?? null) === (clienteId ?? null)) return pastaId;
  }
  return garantirPastaPadrao(clienteId);
}

export async function criarAtividade(input: CriarAtividadeInput): Promise<Tables<"atividades">> {
  const pastaId = await pastaValidaOuPadrao(input.clienteId, input.pastaId);
  const { data, error } = await supabase
    .from("atividades")
    .insert({
      titulo: input.titulo,
      cliente_id: input.clienteId,
      pasta_id: pastaId,
      data_atividade: input.dataAtividade,
      status: input.statusKey,
      concluida: input.concluida,
      ordem: input.ordem,
      tempo_estimado: input.tempoEstimado ?? null,
      prioridade: input.prioridade ?? "media",
      tempo_descanso: input.tempoDescanso ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Falha ao criar atividade");

  // No-op na web; no desktop avisa a OUTRA janela (main <-> jarvis) na hora,
  // sem esperar o round-trip do Supabase Realtime (que continua sendo a
  // fonte de verdade — isso é só um atalho local).
  void emitActivityCreated(data.id);

  return data;
}

// O quadro Kanban (AtividadesView.tsx) lembra, por cliente, qual pasta
// estava ativa (localStorage `atividades-view:<clienteId>` — ver o efeito
// que salva isso naquele arquivo). O Jarvis não tem seletor de pasta
// próprio (evita reimplementar essa navegação), mas roda na MESMA origem
// (web: mesma aba; desktop: mesma origem Tauri, storage compartilhado
// entre as janelas main/jarvis) — então lê essa mesma chave pra criar a
// atividade na pasta que o usuário está olhando agora, em vez de sempre
// cair em "Sem pasta" e ficar invisível quando uma pasta específica está
// selecionada.
export function lerPastaAtivaSalva(clienteId: string | null): string | null {
  try {
    const chave = `atividades-view:${clienteId || "pessoal"}`;
    const salvo = JSON.parse(localStorage.getItem(chave) || "{}");
    const pastaAtivaId = salvo?.pastaAtivaId;
    if (pastaAtivaId === VISAO_GERAL || pastaAtivaId === undefined) return null;
    return typeof pastaAtivaId === "string" ? pastaAtivaId : null;
  } catch {
    return null;
  }
}
