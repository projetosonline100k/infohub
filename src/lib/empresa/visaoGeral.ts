// Visão geral da empresa (Conteúdo → Visão geral): tudo calculado a partir
// dos vídeos, das pessoas e das tarefas (atividades) do projeto. Lógica pura,
// sem Supabase, pra ser testada (tests/empresaVisaoGeral.test.mjs).

export interface VideoResumo {
  id: string;
  titulo: string;
  status: string;
  data_postagem: string | null;
  plataforma: "vertical" | "youtube";
  capa?: string | null;
}

export interface MembroResumo {
  id: string;
  nome: string;
  funcao: string | null;
  setor_id: string | null;
  conta_id: string | null;
  eh_ia: boolean;
  link_ia?: string | null; // conversa do ChatGPT (IA que trabalha pelo Davi)
}

// IA "operária" (ex.: Danilo/Roy = ChatGPT): tem fila, mas quem leva o
// trabalho até ela é o Davi. O Jarvis só coordena.
export const ehIaOperaria = (m: MembroResumo) => m.eh_ia && m.nome !== "Jarvis";

export interface SetorResumo {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  icone: string | null;
}

export interface TarefaResumo {
  id: string;
  titulo: string;
  responsavel_id: string | null;
  setor_id: string | null;
  situacao: string | null;
  tipo: string | null;
  data_vencimento: string | null;
  concluida: boolean;
  progresso: number | null;
}

export interface Indicadores {
  ideias: number; roteiros: number; paraGravar: number; editando: number; agendados: number; postados: number;
}

// Etapas dos vídeos (VerticalView/YoutubeView): ideia → roteiro → gravacao →
// edicao → pronto → postado. "Agendado" = ainda não postado com data marcada,
// ou pronto (só falta programar).
export function contarIndicadores(videos: VideoResumo[]): Indicadores {
  const n: Indicadores = { ideias: 0, roteiros: 0, paraGravar: 0, editando: 0, agendados: 0, postados: 0 };
  for (const v of videos) {
    if (v.status === "postado") n.postados++;
    else if (v.status === "pronto" || v.data_postagem) n.agendados++;
    else if (v.status === "ideia") n.ideias++;
    else if (v.status === "roteiro") n.roteiros++;
    else if (v.status === "gravacao") n.paraGravar++;
    else if (v.status === "edicao") n.editando++;
  }
  return n;
}

export const tarefaAberta = (t: TarefaResumo) => !t.concluida && t.situacao !== "concluida";
export const tarefaAtrasada = (t: TarefaResumo, hoje: string) => tarefaAberta(t) && !!t.data_vencimento && t.data_vencimento < hoje;

// Ordem da fila: em andamento → aguardando aprovação → fila; dentro, prazo mais cedo.
const PESO_SITUACAO: Record<string, number> = { andamento: 0, aguardando_aprovacao: 1, fila: 2 };
export function ordenarFila(tarefas: TarefaResumo[]): TarefaResumo[] {
  return [...tarefas].sort((a, b) =>
    (PESO_SITUACAO[a.situacao ?? "fila"] ?? 2) - (PESO_SITUACAO[b.situacao ?? "fila"] ?? 2)
    || (a.data_vencimento ?? "9999").localeCompare(b.data_vencimento ?? "9999"));
}

export type ItemPrecisa =
  | { tipo: "gravar"; quantidade: number }
  | { tipo: "aprovar"; tarefas: TarefaResumo[] }
  | { tipo: "levar_ia"; membro: MembroResumo; tarefas: TarefaResumo[] }
  | { tipo: "tarefa"; tarefa: TarefaResumo; atrasada: boolean };

// "Precisa de você": o que depende do dono da conta — gravar, aprovar e as
// tarefas atribuídas a ele. Nada mais.
export function precisaDeVoce(contaId: string, videos: VideoResumo[], membros: MembroResumo[], tarefas: TarefaResumo[], hoje: string): ItemPrecisa[] {
  const meus = new Set(membros.filter((m) => m.conta_id === contaId).map((m) => m.id));
  const itens: ItemPrecisa[] = [];
  const gravar = videos.filter((v) => v.status === "gravacao").length;
  if (gravar) itens.push({ tipo: "gravar", quantidade: gravar });
  const aprovar = tarefas.filter((t) => tarefaAberta(t) && t.situacao === "aguardando_aprovacao");
  if (aprovar.length) itens.push({ tipo: "aprovar", tarefas: aprovar });
  // Tarefas na fila de uma IA operária: o Davi precisa levar até ela.
  for (const ia of membros.filter(ehIaOperaria)) {
    const fila = ordenarFila(tarefas.filter((t) => tarefaAberta(t) && t.responsavel_id === ia.id && (t.situacao ?? "fila") === "fila"));
    if (fila.length) itens.push({ tipo: "levar_ia", membro: ia, tarefas: fila });
  }
  for (const t of ordenarFila(tarefas.filter((t) => tarefaAberta(t) && t.responsavel_id && meus.has(t.responsavel_id) && t.situacao !== "aguardando_aprovacao"))) {
    itens.push({ tipo: "tarefa", tarefa: t, atrasada: tarefaAtrasada(t, hoje) });
  }
  return itens;
}

const ROTULO_TIPO: Record<string, [string, string]> = {
  edicao: ["vídeo em edição", "vídeos em edição"],
  carrossel: ["carrossel em criação", "carrosséis em criação"],
  pagina: ["página em desenvolvimento", "páginas em desenvolvimento"],
  programacao: ["post sendo programado", "posts sendo programados"],
  copy: ["copy sendo escrita", "copys sendo escritas"],
  metricas: ["análise de métricas", "análises de métricas"],
};

export interface LinhaCuidando { rotulo: string; quantidade: number; setor_id: string | null }

// "Jarvis está cuidando": o que a operação está tocando sem o dono da conta
// (tarefas abertas de outras pessoas + vídeos em edição), agrupado por tipo.
export function jarvisCuidando(contaId: string, videos: VideoResumo[], membros: MembroResumo[], setores: SetorResumo[], tarefas: TarefaResumo[]): LinhaCuidando[] {
  const meus = new Set(membros.filter((m) => m.conta_id === contaId).map((m) => m.id));
  // Na fila de uma IA operária ainda depende do Davi (está em "Precisa de você").
  const ias = new Set(membros.filter(ehIaOperaria).map((m) => m.id));
  const grupos = new Map<string, LinhaCuidando>();
  const somar = (chave: string, rotulos: [string, string], setor: string | null) => {
    const g = grupos.get(chave) ?? { rotulo: "", quantidade: 0, setor_id: setor };
    g.quantidade++;
    g.rotulo = `${g.quantidade} ${g.quantidade === 1 ? rotulos[0] : rotulos[1]}`;
    grupos.set(chave, g);
  };
  const edicaoEmTarefa = tarefas.some((t) => tarefaAberta(t) && t.tipo === "edicao");
  if (!edicaoEmTarefa) {
    for (const v of videos) if (v.status === "edicao") somar("tipo:edicao", ROTULO_TIPO.edicao, null);
  }
  for (const t of tarefas) {
    if (!tarefaAberta(t) || t.situacao === "aguardando_aprovacao" || !t.responsavel_id || meus.has(t.responsavel_id)) continue;
    if (ias.has(t.responsavel_id) && (t.situacao ?? "fila") === "fila") continue;
    if (t.tipo && ROTULO_TIPO[t.tipo]) { somar(`tipo:${t.tipo}`, ROTULO_TIPO[t.tipo], t.setor_id); continue; }
    const setor = setores.find((s) => s.id === t.setor_id);
    somar(`setor:${t.setor_id}`, [`tarefa no ${setor?.nome ?? "time"}`, `tarefas no ${setor?.nome ?? "time"}`], t.setor_id);
  }
  return [...grupos.values()].sort((a, b) => b.quantidade - a.quantidade);
}

export interface EstadoMembro {
  membro: MembroResumo;
  abertas: number;
  atrasadas: number;
  atual: TarefaResumo | null;
  ocupado: boolean;
}

// Mapa da operação: o que cada pessoa está fazendo agora.
export function estadoDosMembros(membros: MembroResumo[], tarefas: TarefaResumo[], hoje: string): EstadoMembro[] {
  return membros.map((membro) => {
    const minhas = ordenarFila(tarefas.filter((t) => t.responsavel_id === membro.id && tarefaAberta(t)));
    return {
      membro,
      abertas: minhas.length,
      atrasadas: minhas.filter((t) => tarefaAtrasada(t, hoje)).length,
      atual: minhas[0] ?? null,
      ocupado: minhas.some((t) => t.situacao === "andamento"),
    };
  });
}

// Próximos a publicar: não postados com data de hoje em diante, mais cedo primeiro.
export function videosProgramados(videos: VideoResumo[], hoje: string, limite = 8): VideoResumo[] {
  return videos
    .filter((v) => v.status !== "postado" && v.data_postagem && v.data_postagem >= hoje)
    .sort((a, b) => a.data_postagem!.localeCompare(b.data_postagem!))
    .slice(0, limite);
}
