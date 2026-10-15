import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { criarAtividade } from "@/lib/atividades/criarAtividade";
import { colunasDoProjeto } from "@/lib/empresa/colunas";
import { aprovarEntrega } from "@/lib/empresa/entregas";

// Esboço de quiz feito por outro funcionário (ex.: Ítalo) e aprovado pelo
// Davi: vira tarefa do Roy do projeto já na etapa 2 (criar o quiz), com o
// esboço anexado (📎). Mesmo que scripts/quiz/quiz.py de-esboco.
const db = supabase as unknown as SupabaseClient;   // quizzes ainda não está nos tipos gerados

export const pareceEsbocoDeQuiz = (...textos: (string | null | undefined)[]) => textos.some((t) => /\bquiz/i.test(t ?? ""));

export async function aprovarEPassarParaRoy(tarefaId: string, clienteId: string): Promise<string> {
  const [{ data: origem }, { data: doc }, { data: roy }] = await Promise.all([
    supabase.from("atividades").select("titulo, data_vencimento").eq("id", tarefaId).maybeSingle(),
    supabase.from("documentos").select("id, titulo").eq("atividade_id", tarefaId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("membros").select("id, nome").eq("cliente_id", clienteId).eq("eh_ia", true).eq("ativo", true).ilike("nome", "roy").limit(1).maybeSingle(),
  ]);
  if (!roy) throw new Error("Este projeto não tem o Roy (IA)");
  if (!doc) throw new Error("Não achei o documento do esboço");
  await aprovarEntrega(tarefaId, clienteId);
  const nome = (origem?.titulo ?? "quiz").replace(/^\s*esbo[cç]o d[oa]s?\s*/i, "").trim();
  const nomeBonito = nome.charAt(0).toUpperCase() + nome.slice(1);
  const { inicial } = await colunasDoProjeto(clienteId);
  const nova = await criarAtividade({
    titulo: `Criar o quiz: ${nomeBonito}`.slice(0, 200), clienteId, pastaId: null,
    dataAtividade: origem?.data_vencimento ?? new Date().toISOString().slice(0, 10), statusKey: inicial, concluida: false, ordem: 0,
  });
  const descricao = `Criar no Infopro o quiz do esboço APROVADO pelo Davi (origem ${tarefaId}).\n`
    + "O esboço já está pronto e aprovado: não refaça o esboço, vá direto para a etapa 2 (docs/QUIZ.md) e siga o que ele diz "
    + "(nome, palavras, perguntas, opções, perfis e ponte para a oferta).\n\n"
    + `📎 Para ler: "${doc.titulo}" (documento ${doc.id})`;
  const { error } = await supabase.from("atividades").update({
    responsavel_id: roy.id, situacao: "fila", tipo: "quiz", descricao, data_vencimento: origem?.data_vencimento ?? null,
  }).eq("id", nova.id);
  if (error) throw error;
  const { error: e2 } = await db.from("quizzes").insert({
    id: crypto.randomUUID(), cliente_id: clienteId, atividade_id: nova.id, titulo: nomeBonito.slice(0, 150), pedido: `Esboço aprovado: ${doc.titulo}`, status: "criando",
  });
  if (e2) throw e2;
  return `Aprovado: o ${roy.nome} começa a criar o quiz (aba Quiz)`;
}
