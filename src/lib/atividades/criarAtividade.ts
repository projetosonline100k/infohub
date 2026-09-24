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
}

// Única função de criação de atividade do app inteiro — usada pelo Kanban
// (AtividadesView.tsx: adicionarAtividade/adicionarAtividadeNoStatus/
// adicionarAtividadeRapida) E pelo Jarvis (useAssistantAtividades.ts).
// Mesma tabela, mesmo payload, sem lógica paralela: quem quiser mudar como
// uma atividade é criada muda só aqui.
export async function criarAtividade(input: CriarAtividadeInput): Promise<Tables<"atividades">> {
  const { data, error } = await supabase
    .from("atividades")
    .insert({
      titulo: input.titulo,
      cliente_id: input.clienteId,
      pasta_id: input.pastaId,
      data_atividade: input.dataAtividade,
      status: input.statusKey,
      concluida: input.concluida,
      ordem: input.ordem,
      tempo_estimado: input.tempoEstimado ?? null,
      prioridade: input.prioridade ?? "media",
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
