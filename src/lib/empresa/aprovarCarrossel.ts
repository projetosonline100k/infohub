import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { criarAtividade } from "@/lib/atividades/criarAtividade";
import { colunasDoProjeto } from "@/lib/empresa/colunas";
import { acharProgramador, tarefaDaDalila, type CarrosselResumo } from "@/lib/empresa/carrossel";

// Aprovar = o carrossel inteiro (todas as páginas e a legenda) fica pronto e
// vira tarefa "Programar carrossel" na fila da Dalila. Usado pela tela de
// revisão (um) e pelo "Aprovar todos" do Precisa de você (o lote).
export async function aprovarCarrosseis(clienteId: string, carrosseis: CarrosselResumo[]): Promise<{ aprovados: number; programador: string | null }> {
  const { data: membros } = await supabase.from("membros").select("id, nome, funcao, eh_ia, setor_id")
    .eq("cliente_id", clienteId).eq("ativo", true);
  const dalila = acharProgramador(membros || []);
  const { inicial, conclusao } = await colunasDoProjeto(clienteId);
  const hoje = format(new Date(), "yyyy-MM-dd");
  let aprovados = 0;
  for (const c of carrosseis) {
    let atividadeId: string | null = c.atividade_id;
    if (dalila && !atividadeId) {
      const nova = await criarAtividade({
        titulo: tarefaDaDalila(c), clienteId, pastaId: null, dataAtividade: hoje, statusKey: inicial, concluida: false, ordem: 0,
      });
      const descricao = [
        "Carrossel do Roy aprovado pelo Davi. Programar 1 por dia, às 10h.",
        c.pasta_drive ? `Páginas no Drive: ${c.pasta_drive}` : "",
        ...c.paginas.map((u, i) => `${String(i + 1).padStart(2, "0")}: ${u}`),
        `\nLegenda:\n${c.legenda ?? ""}`,
      ].filter(Boolean).join("\n");
      const { error } = await supabase.from("atividades").update({
        responsavel_id: dalila.id, setor_id: dalila.setor_id, situacao: "fila", tipo: "programacao", descricao,
      }).eq("id", nova.id);
      if (error) throw error;
      atividadeId = nova.id;
    }
    const agora = new Date().toISOString();
    const { error } = await supabase.from("carrosseis").update({
      status: "aprovado", revisado_em: agora, atividade_id: atividadeId, atualizado_em: agora,
    }).eq("id", c.id).eq("status", "revisar");
    if (error) throw error;
    aprovados++;
    await concluirTarefaDoRoy(c.id, conclusao);
  }
  return { aprovados, programador: dalila?.nome ?? null };
}

// A tarefa que o Davi passou pro Roy termina quando todos os carrosséis dela
// forem aprovados (o serviço do Roy faz o mesmo em roy.concluir_tarefa_roy).
async function concluirTarefaDoRoy(carrosselId: string, colunaConclusao: string) {
  const { data } = await supabase.from("carrosseis").select("atividade_roy_id").eq("id", carrosselId).maybeSingle();
  const tarefa = data?.atividade_roy_id;
  if (!tarefa) return;
  const { data: irmaos } = await supabase.from("carrosseis").select("status").eq("atividade_roy_id", tarefa);
  if ((irmaos || []).some((x) => !["aprovado", "programado", "publicado"].includes(x.status))) return;
  await supabase.from("atividades").update({
    situacao: "concluida", concluida: true, progresso: 100, status: colunaConclusao,
    observacao: "Carrossel aprovado pelo Davi e enviado para a Dalila programar.",
  }).eq("id", tarefa).eq("concluida", false);
}
