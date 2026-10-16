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
// trabalho até ela é o Davi. O Atlas só coordena; a Dalila publica sozinha
// na nuvem (edge dalila-publicar), então a fila dela não depende do Davi.
// IAs que pegam as tarefas da fila sozinhas (ouvinte do Atlas, serviços do
// Roy/Danilo): a tarefa delas não é do Davi (15/10: "tem coisa que não sou eu
// que faço, a própria pessoa já está fazendo"). As outras IAs (via ChatGPT)
// ainda dependem do Davi levar a tarefa.
// O coordenador da empresa (robô): Atlas desde 15/10 (antes "Jarvis").
export const ehNomeCoordenador = (nome: string) => /^(atlas|jarvis)$/i.test(nome.trim());
export const ehCoordenador = (m: { eh_ia: boolean; nome: string }) => m.eh_ia && ehNomeCoordenador(m.nome);
const IAS_AUTONOMAS = new Set(["atlas", "jarvis", "dalila", "ítalo", "italo", "gabriel", "roy", "danilo"]);
export const ehIaOperaria = (m: MembroResumo) => m.eh_ia && !IAS_AUTONOMAS.has(m.nome.toLowerCase());

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
  andamento_desde?: string | null;   // quando entrou em andamento (trigger no banco)
  previsao_fim?: string | null;      // quando o próprio funcionário acha que termina
}

// Quanto falta (pedido do Davi, 15/10: "além da porcentagem, o tempo estimado"):
// a previsão que o funcionário informou; sem ela, o ritmo até aqui (tempo
// gasto ÷ % feita). Antes de 10% o ritmo ainda não diz nada.
export function minutosRestantes(t: Pick<TarefaResumo, "progresso" | "andamento_desde" | "previsao_fim">, agora = Date.now()): number | null {
  if (t.previsao_fim) {
    const falta = (new Date(t.previsao_fim).getTime() - agora) / 60000;
    if (falta > 0) return Math.max(1, Math.round(falta));
  }
  const p = t.progresso ?? 0;
  if (!t.andamento_desde || p < 10 || p >= 100) return null;
  const gasto = (agora - new Date(t.andamento_desde).getTime()) / 60000;
  if (gasto < 1) return null;
  return Math.max(1, Math.round((gasto * (100 - p)) / p));
}
// "~12 min", "~1h20", "menos de 1 min".
export function textoRestante(min: number): string {
  if (min <= 1) return "menos de 1 min";
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `~${h}h${m ? String(m).padStart(2, "0") : ""}`;
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

// "Atlas está cuidando": o que a operação está tocando sem o dono da conta
// (tarefas abertas de outras pessoas + vídeos em edição), agrupado por tipo.
// "Tarefas sendo executadas" (15/10, no lugar de "Atlas está cuidando"): o que
// a equipe está tocando sem o Davi — fazendo agora primeiro (mais adiantadas
// antes), depois a fila. Fica de fora o que é do próprio Davi e o que espera a
// aprovação dele (isso está em "Precisa de você").
export interface TarefaEmExecucao { tarefa: TarefaResumo; membro: MembroResumo; agora: boolean }
export function tarefasEmExecucao(contaId: string, membros: MembroResumo[], tarefas: TarefaResumo[]): TarefaEmExecucao[] {
  const porId = new Map(membros.map((m) => [m.id, m]));
  const linhas: TarefaEmExecucao[] = [];
  for (const t of tarefas) {
    const m = t.responsavel_id ? porId.get(t.responsavel_id) : undefined;
    if (!m || m.conta_id === contaId || !tarefaAberta(t) || t.situacao === "aguardando_aprovacao") continue;
    if (ehIaOperaria(m) && (t.situacao ?? "fila") === "fila") continue;   // ainda depende do Davi levar
    linhas.push({ tarefa: t, membro: m, agora: t.situacao === "andamento" });
  }
  return linhas.sort((a, b) => Number(b.agora) - Number(a.agora) || (b.tarefa.progresso ?? 0) - (a.tarefa.progresso ?? 0));
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
      // Entregue e esperando o Davi aprovar: o atraso não é da pessoa (não fica vermelho).
      atrasadas: minhas.filter((t) => tarefaAtrasada(t, hoje) && t.situacao !== "aguardando_aprovacao").length,
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

// Sinal de cada pessoa no mapa: verde = trabalhando, cinza = parada,
// amarelo = esperando resposta/revisão do Davi, vermelho = algum problema
// (trabalho com erro ou tarefa atrasada). Vale o mais grave.
export type Sinal = "trabalhando" | "parado" | "esperando" | "problema";

export interface TrabalhoIa {
  trabalhando: number; // carrossel/edição sendo feito agora
  esperando: number;   // pronto, esperando o Davi revisar
  problema: number;    // parou com erro
  atual?: string;      // o que está fazendo agora (balão)
}

// O trabalho das IAs que não vira tarefa: carrosséis (Roy) e edições (Danilo).
export function trabalhoDasIas(
  membros: MembroResumo[],
  carrosseis: { status: string; tema: string }[],
  edicoes: { status: string; titulo: string }[],
): Map<string, TrabalhoIa> {
  const mapa = new Map<string, TrabalhoIa>();
  const contar = (nome: string, itens: { status: string; nome: string }[], fazendo: string[], verbo: string) => {
    const m = membros.find((x) => x.eh_ia && x.nome.toLowerCase() === nome);
    if (!m) return;
    const agora = itens.filter((i) => fazendo.includes(i.status));
    mapa.set(m.id, {
      trabalhando: agora.length,
      esperando: itens.filter((i) => i.status === "revisar").length,
      problema: itens.filter((i) => i.status === "erro").length,
      atual: agora[0] ? `${verbo}: ${agora[0].nome}` : undefined,
    });
  };
  contar("roy", carrosseis.map((c) => ({ status: c.status, nome: c.tema })), ["produzindo", "ajuste"], "Criando carrossel");
  contar("danilo", edicoes.map((e) => ({ status: e.status, nome: e.titulo })), ["na_fila", "editando", "renderizando", "aprovando"], "Editando");
  return mapa;
}

export const postProgramado = (t: TarefaResumo) => t.tipo === "programacao" && t.situacao === "andamento";

export function sinalDoMembro(estado: EstadoMembro, tarefas: TarefaResumo[], ia?: TrabalhoIa): Sinal {
  const minhas = tarefas.filter((t) => t.responsavel_id === estado.membro.id && tarefaAberta(t));
  if (estado.atrasadas > 0 || (ia?.problema ?? 0) > 0) return "problema";
  if (minhas.some((t) => t.situacao === "aguardando_aprovacao") || (ia?.esperando ?? 0) > 0) return "esperando";
  // Post programado (Dalila): já está tudo certo, só esperando a hora de publicar → amarelo.
  if (minhas.some(postProgramado)) return "esperando";
  if (estado.ocupado || (ia?.trabalhando ?? 0) > 0) return "trabalhando";
  return "parado";
}
