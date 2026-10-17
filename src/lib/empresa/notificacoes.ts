import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { filaAcabando } from "@/lib/empresa/visaoGeral";

// Avisos da equipe (pedido do Davi, 15/10/2026): "quando estiver conversando
// com a equipe… preciso que fique aparecendo uma notificação, porque se não eu
// esqueço" e "notifique o que o Danilo ou outra pessoa está fazendo (se já foi
// feito…)". Junta, desde a última olhada: respostas no chat, mudanças de
// situação das tarefas (historico_tarefas), versões do Danilo, carrosséis do
// Roy e melhorias do Pedro. O que o próprio Davi fez não vira aviso.
const db = supabase as unknown as SupabaseClient;   // várias tabelas novas ainda fora dos tipos gerados

export type TipoAviso = "resposta" | "comecou" | "entregou" | "concluiu" | "edicao" | "carrossel" | "melhoria" | "erro";
export interface Aviso {
  id: string; tipo: TipoAviso; quando: string; titulo: string; detalhe?: string;
  clienteId: string | null; projeto?: string | null; lido: boolean;
  /** Precisa do Davi revisar/decidir (o Atlas avisa: pedido de 16/10). */
  revisar?: boolean;
  /** Resposta no chat: de qual conversa (o Atlas não avisa se ela já está aberta e lida). */
  briefingId?: string;
  /** Quem respondeu: o Atlas abre direto a conversa com ele (?conversa=<membro>). */
  membroId?: string;
}

const curto = (t: string | null | undefined, n = 110) => {
  const s = (t ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

export async function buscarAvisos(desde: string, meuId: string): Promise<Aviso[]> {
  const [hist, msgs, eds, cars, mels, clientes, reels] = await Promise.all([
    db.from("historico_tarefas").select("id, atividade_id, cliente_id, para_membro_id, de_situacao, para_situacao, autor_id, criado_em")
      .eq("acao", "situacao").gt("criado_em", desde).in("para_situacao", ["andamento", "aguardando_aprovacao", "concluida"]).limit(100),
    db.from("briefing_mensagens").select("id, briefing_id, cliente_id, texto, membro_id, criada_em")
      .eq("papel", "funcionario").gt("criada_em", desde).limit(100),
    db.from("edicoes_video").select("id, cliente_id, titulo, status, versao, mensagem, atualizado_em")
      .gt("atualizado_em", desde).in("status", ["revisar", "erro"]).limit(50),
    db.from("carrosseis").select("id, cliente_id, tema, status, atualizado_em")
      .gt("atualizado_em", desde).in("status", ["revisar", "erro"]).limit(50),
    db.from("melhorias_sistema").select("id, cliente_id, titulo, status, resultado, atualizado_em")
      .gt("atualizado_em", desde).in("status", ["fazendo", "feito", "erro", "pendente"]).limit(50),
    db.from("clientes").select("id, nome_especialista"),
    db.from("reels").select("id, cliente_id, titulo, status, atualizado_em").gt("atualizado_em", desde).eq("status", "pronto").limit(50),
  ]);
  const projeto = new Map(((clientes.data || []) as { id: string; nome_especialista: string }[]).map((c) => [c.id, c.nome_especialista]));
  const h = (hist.data || []) as { id: string; atividade_id: string; cliente_id: string | null; para_membro_id: string | null; para_situacao: string; autor_id: string | null; criado_em: string }[];
  const m = (msgs.data || []) as { id: string; briefing_id: string; cliente_id: string; texto: string; membro_id: string | null; criada_em: string }[];

  // Nomes das tarefas, das pessoas e de quem é cada conversa.
  const idsTarefa = [...new Set(h.map((x) => x.atividade_id))];
  const idsBriefing = [...new Set(m.map((x) => x.briefing_id))];
  const [tarefas, briefings] = await Promise.all([
    idsTarefa.length ? db.from("atividades").select("id, titulo, responsavel_id").in("id", idsTarefa) : Promise.resolve({ data: [] }),
    idsBriefing.length ? db.from("briefings").select("id, membro_id").in("id", idsBriefing) : Promise.resolve({ data: [] }),
  ]);
  const tituloDe = new Map(((tarefas.data || []) as { id: string; titulo: string }[]).map((t) => [t.id, t.titulo]));
  const donoDe = new Map(((briefings.data || []) as { id: string; membro_id: string }[]).map((b) => [b.id, b.membro_id]));
  const idsMembro = [...new Set([...h.map((x) => x.para_membro_id), ...m.map((x) => x.membro_id ?? donoDe.get(x.briefing_id))].filter(Boolean) as string[])];
  const { data: ms } = idsMembro.length ? await db.from("membros").select("id, nome, conta_id").in("id", idsMembro) : { data: [] };
  const membro = new Map(((ms || []) as { id: string; nome: string; conta_id: string | null }[]).map((x) => [x.id, x]));

  const avisos: Aviso[] = [];
  for (const x of h) {
    const p = x.para_membro_id ? membro.get(x.para_membro_id) : undefined;
    // O que o próprio Davi mexeu (ou tarefa dele mesmo) não avisa.
    if (x.autor_id === meuId || !p || p.conta_id === meuId) continue;
    const t = curto(tituloDe.get(x.atividade_id), 90);
    const tipo: TipoAviso = x.para_situacao === "andamento" ? "comecou" : x.para_situacao === "aguardando_aprovacao" ? "entregou" : "concluiu";
    const verbo = tipo === "comecou" ? "começou" : tipo === "entregou" ? "entregou (esperando você)" : "concluiu";
    avisos.push({ id: `h-${x.id}`, tipo, quando: x.criado_em, titulo: `${p.nome} ${verbo}`, detalhe: t, clienteId: x.cliente_id, projeto: projeto.get(x.cliente_id ?? ""), lido: false,
      revisar: tipo === "entregou" });
  }
  for (const x of m) {
    const p = membro.get(x.membro_id ?? donoDe.get(x.briefing_id) ?? "");
    avisos.push({ id: `m-${x.id}`, tipo: "resposta", quando: x.criada_em, titulo: `${p?.nome ?? "A equipe"} respondeu`, detalhe: curto(x.texto), clienteId: x.cliente_id, projeto: projeto.get(x.cliente_id), lido: false,
      briefingId: x.briefing_id, membroId: p?.id });
  }
  for (const x of (eds.data || []) as { id: string; cliente_id: string; titulo: string; status: string; versao: number; mensagem: string | null; atualizado_em: string }[]) {
    avisos.push({ id: `e-${x.id}-${x.versao}-${x.status}`, tipo: x.status === "erro" ? "erro" : "edicao", quando: x.atualizado_em,
      titulo: x.status === "erro" ? "Danilo teve um problema na edição" : `Danilo terminou a versão ${x.versao}`, detalhe: curto(x.status === "erro" ? x.mensagem : x.titulo), clienteId: x.cliente_id, projeto: projeto.get(x.cliente_id), lido: false,
      revisar: x.status === "revisar" });
  }
  for (const x of (cars.data || []) as { id: string; cliente_id: string; tema: string; status: string; atualizado_em: string }[]) {
    avisos.push({ id: `c-${x.id}-${x.status}-${x.atualizado_em}`, tipo: x.status === "erro" ? "erro" : "carrossel", quando: x.atualizado_em,
      titulo: x.status === "erro" ? "Roy teve um problema no carrossel" : "Roy terminou um carrossel (revisar)", detalhe: curto(x.tema), clienteId: x.cliente_id, projeto: projeto.get(x.cliente_id), lido: false,
      revisar: x.status === "revisar" });
  }
  for (const x of (mels.data || []) as { id: string; cliente_id: string; titulo: string; status: string; resultado: string | null; atualizado_em: string }[]) {
    avisos.push({ id: `p-${x.id}-${x.status}`, tipo: x.status === "erro" || x.status === "pendente" ? "erro" : x.status === "fazendo" ? "comecou" : "melhoria", quando: x.atualizado_em,
      titulo: x.status === "erro" ? "Pedro não conseguiu implementar" : x.status === "pendente" ? "Pedro precisa de você para continuar"
        : x.status === "fazendo" ? "Pedro começou a implementar" : "Pedro implementou uma melhoria", detalhe: curto(x.titulo), clienteId: x.cliente_id, projeto: projeto.get(x.cliente_id), lido: false,
      revisar: x.status === "feito" || x.status === "pendente" });
  }
  for (const x of (reels.data || []) as { id: string; cliente_id: string; titulo: string; atualizado_em: string }[]) {
    avisos.push({ id: `r-${x.id}-pronto`, tipo: "edicao", quando: x.atualizado_em, titulo: "Reel pronto: escolha a data (Dalila)", detalhe: curto(x.titulo),
      clienteId: x.cliente_id, projeto: projeto.get(x.cliente_id), lido: false, revisar: true });
  }
  return avisos.sort((a, b) => a.quando.localeCompare(b.quando));
}

// Fila da Dalila acabando (16/10): por projeto que já usa a Dalila, menos de 3 dias
// de reels ou carrosséis programados vira aviso no Atlas (um por dia, ver useParaRevisar).
export async function buscarFilasAcabando(agora = new Date()): Promise<Aviso[]> {
  const [reels, cars, eds, clientes] = await Promise.all([
    db.from("reels").select("cliente_id, status, programado_para").in("status", ["programado", "publicando", "publicado", "pronto"]).limit(500),
    db.from("carrosseis").select("cliente_id, status, programado_para").in("status", ["programado", "publicando", "publicado", "revisar"]).limit(500),
    db.from("edicoes_video").select("cliente_id").eq("status", "revisar").limit(200),
    db.from("clientes").select("id, nome_especialista"),
  ]);
  type Post = { cliente_id: string; status: string; programado_para: string | null };
  const projeto = new Map(((clientes.data || []) as { id: string; nome_especialista: string }[]).map((c) => [c.id, c.nome_especialista]));
  const edicoes = (eds.data || []) as { cliente_id: string }[];
  const dia = agora.toISOString().slice(0, 10);
  const avisos: Aviso[] = [];
  for (const [tipo, posts] of [["reel", (reels.data || []) as Post[]], ["carrossel", (cars.data || []) as Post[]]] as const) {
    for (const clienteId of new Set(posts.map((p) => p.cliente_id))) {
      const meus = posts.filter((p) => p.cliente_id === clienteId);
      const fila = meus.filter((p) => p.status === "programado" || p.status === "publicando");
      const prontos = tipo === "reel"
        ? meus.filter((p) => p.status === "pronto").length + edicoes.filter((e) => e.cliente_id === clienteId).length
        : meus.filter((p) => p.status === "revisar").length;
      const aviso = filaAcabando(tipo, fila, prontos, agora);
      if (!aviso) continue;
      avisos.push({ id: `fila-${tipo}-${clienteId}-${dia}`, tipo: "erro", quando: agora.toISOString(), titulo: `${aviso.texto} (Dalila)`,
        detalhe: prontos ? "Abra o Escritório e programe para o perfil não ficar sem post" : `Peça ${tipo === "reel" ? "uma edição ao Danilo" : "um carrossel ao Roy"}`,
        clienteId, projeto: projeto.get(clienteId), lido: false, revisar: true });
    }
  }
  return avisos;
}

// ---- Conversas lidas (bolinha de não lida na gaveta da equipe) ----
const chaveLida = (briefingId: string) => `conversa-lida:${briefingId}`;
export function marcarConversaLida(briefingId: string) {
  try { localStorage.setItem(chaveLida(briefingId), new Date().toISOString()); } catch { /* sem storage */ }
  window.dispatchEvent(new Event("conversa-lida"));
}
// Conversa nunca aberta: vale a partir de quando os avisos foram ligados (nada antigo vira "não lida").
function avisosDesde(): string {
  try {
    const v = localStorage.getItem("conversas-lidas-desde");
    if (v) return v;
    const agora = new Date().toISOString();
    localStorage.setItem("conversas-lidas-desde", agora);
    return agora;
  } catch { return new Date().toISOString(); }
}
export function conversaLidaEm(briefingId: string): string {
  try { return localStorage.getItem(chaveLida(briefingId)) ?? avisosDesde(); } catch { return avisosDesde(); }
}

// Respostas não lidas por funcionário (conversas abertas: pedido e revisão).
export async function naoLidasPorMembro(clienteId: string): Promise<Map<string, number>> {
  const { data: bs } = await db.from("briefings").select("id, membro_id, participantes").eq("cliente_id", clienteId).in("status", ["conversando", "revisando"]);
  const lista = (bs || []) as { id: string; membro_id: string; participantes: string[] | null }[];
  const r = new Map<string, number>();
  if (!lista.length) return r;
  const { data: ms } = await db.from("briefing_mensagens").select("briefing_id, membro_id, criada_em").eq("papel", "funcionario")
    .in("briefing_id", lista.map((b) => b.id)).order("criada_em", { ascending: false }).limit(500);
  for (const x of (ms || []) as { briefing_id: string; membro_id: string | null; criada_em: string }[]) {
    if (x.criada_em <= conversaLidaEm(x.briefing_id)) continue;
    const quem = x.membro_id ?? lista.find((b) => b.id === x.briefing_id)?.membro_id;
    if (quem) r.set(quem, (r.get(quem) ?? 0) + 1);
  }
  return r;
}
