import { addDays, format, startOfWeek } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// TV do escritório (pedido do Davi, 15/10): "atividades da semana" e "nosso
// resultado", alternando a cada 15 s. A semana vai de segunda a domingo.
const db = supabase as unknown as SupabaseClient;   // carrosseis ainda não está nos tipos gerados

export interface TarefaSemana {
  id: string; titulo: string; dia: string | null; concluida: boolean; situacao: string | null;
  responsavelId: string | null; responsavel: string | null; progresso: number | null;
}
export interface PostSemana { dia: string; titulo: string; tipo: "carrossel" | "video"; publicado: boolean }
export interface Resultado {
  concluidas: number; concluidasAntes: number;          // tarefas concluídas nesta semana / na anterior
  publicados: number; publicadosAntes: number;          // posts publicados (vídeos + carrosséis)
  abertasSemana: number;                                 // tarefas da semana ainda abertas
  atrasadas: number;
  receitaMes: number | null; vendasMes: number | null;   // financeiro do mês (se lançado)
  porPessoa: { nome: string; feitas: number }[];
}
export interface Semana { dias: string[]; tarefas: TarefaSemana[]; semData: TarefaSemana[]; posts: PostSemana[]; resultado: Resultado }

const iso = (d: Date) => format(d, "yyyy-MM-dd");

export function diasDaSemana(base = new Date()): string[] {
  const seg = startOfWeek(base, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, k) => iso(addDays(seg, k)));
}

export async function carregarSemana(clienteId: string, base = new Date()): Promise<Semana> {
  const dias = diasDaSemana(base);
  const ini = dias[0], fim = dias[6];
  const iniAntes = iso(addDays(new Date(`${ini}T12:00:00`), -7));
  const hoje = iso(new Date());
  const inicioMes = format(new Date(), "yyyy-MM-01");
  const [membros, tarefas, semData, feitas, vids, cars, produtos] = await Promise.all([
    supabase.from("membros").select("id, nome").eq("cliente_id", clienteId),
    supabase.from("atividades").select("id, titulo, data_vencimento, concluida, situacao, responsavel_id, progresso")
      .eq("cliente_id", clienteId).is("deleted_at", null).gte("data_vencimento", ini).lte("data_vencimento", fim).order("created_at"),
    supabase.from("atividades").select("id, titulo, data_vencimento, concluida, situacao, responsavel_id, progresso")
      .eq("cliente_id", clienteId).is("deleted_at", null).is("data_vencimento", null).eq("concluida", false)
      .not("responsavel_id", "is", null).order("created_at", { ascending: false }).limit(30),
    supabase.from("atividades").select("concluida_em, responsavel_id").eq("cliente_id", clienteId).is("deleted_at", null)
      .eq("concluida", true).gte("concluida_em", `${iniAntes}T00:00:00`),
    supabase.from("videos_vertical").select("titulo, status, data_postagem").eq("cliente_id", clienteId)
      .gte("data_postagem", iniAntes).lte("data_postagem", fim),
    db.from("carrosseis").select("tema, status, programado_para, publicado_em").eq("cliente_id", clienteId)
      .in("status", ["programado", "publicando", "publicado"]),
    supabase.from("produtos_cliente").select("id").eq("cliente_id", clienteId),
  ]);
  const nomes = new Map((membros.data || []).map((m) => [m.id, m.nome]));
  const paraTarefa = (t: { id: string; titulo: string; data_vencimento: string | null; concluida: boolean; situacao: string | null; responsavel_id: string | null; progresso: number | null }): TarefaSemana => ({
    id: t.id, titulo: t.titulo, dia: t.data_vencimento, concluida: t.concluida, situacao: t.situacao,
    responsavelId: t.responsavel_id, responsavel: t.responsavel_id ? nomes.get(t.responsavel_id) ?? null : null, progresso: t.progresso,
  });

  const posts: PostSemana[] = [];
  let publicadosAntes = 0;
  for (const v of (vids.data || []) as { titulo: string; status: string; data_postagem: string }[]) {
    const dia = v.data_postagem.slice(0, 10);
    if (dia >= ini) posts.push({ dia, titulo: v.titulo, tipo: "video", publicado: v.status === "postado" });
    else if (v.status === "postado") publicadosAntes++;
  }
  for (const c of (cars.data || []) as { tema: string; status: string; programado_para: string | null; publicado_em: string | null }[]) {
    const quando = c.publicado_em ?? c.programado_para;
    if (!quando) continue;
    const dia = iso(new Date(quando));
    if (dia >= ini && dia <= fim) posts.push({ dia, titulo: c.tema, tipo: "carrossel", publicado: c.status === "publicado" });
    else if (dia >= iniAntes && dia < ini && c.status === "publicado") publicadosAntes++;
  }

  const listaFeitas = (feitas.data || []) as { concluida_em: string | null; responsavel_id: string | null }[];
  const nestaSemana = listaFeitas.filter((f) => f.concluida_em && iso(new Date(f.concluida_em)) >= ini);
  const contagem = new Map<string, number>();
  for (const f of nestaSemana) if (f.responsavel_id) contagem.set(f.responsavel_id, (contagem.get(f.responsavel_id) ?? 0) + 1);

  let receitaMes: number | null = null, vendasMes: number | null = null;
  const ids = (produtos.data || []).map((p) => p.id);
  if (ids.length) {
    const { data: fin } = await supabase.from("produto_financeiro_diario").select("receita, vendas_quantidade")
      .in("produto_id", ids).gte("data", inicioMes);
    if (fin?.length) {
      receitaMes = fin.reduce((s, f) => s + Number(f.receita ?? 0), 0);
      vendasMes = fin.reduce((s, f) => s + Number(f.vendas_quantidade ?? 0), 0);
    }
  }

  const daSemana = (tarefas.data || []).map(paraTarefa);
  return {
    dias,
    tarefas: daSemana,
    semData: (semData.data || []).map(paraTarefa),
    posts: posts.sort((a, b) => a.dia.localeCompare(b.dia)),
    resultado: {
      concluidas: nestaSemana.length,
      concluidasAntes: listaFeitas.length - nestaSemana.length,
      publicados: posts.filter((p) => p.publicado).length,
      publicadosAntes,
      abertasSemana: daSemana.filter((t) => !t.concluida).length,
      atrasadas: daSemana.filter((t) => !t.concluida && t.dia != null && t.dia < hoje).length,
      receitaMes, vendasMes,
      porPessoa: [...contagem.entries()].map(([id, feitas]) => ({ nome: nomes.get(id) ?? "?", feitas })).sort((a, b) => b.feitas - a.feitas).slice(0, 4),
    },
  };
}

export async function moverParaDia(tarefaId: string, dia: string | null) {
  const { error } = await supabase.from("atividades").update({ data_vencimento: dia }).eq("id", tarefaId);
  if (error) throw error;
}
