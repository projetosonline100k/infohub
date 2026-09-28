import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { addDays, endOfWeek, format, parseISO, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { DocumentEditor } from "@/components/documentos/DocumentEditor";
import { AssistantOrb } from "./AssistantOrb";
import { AssistantPanel } from "./AssistantPanel";
import { JarvisNotificationCard } from "./JarvisNotificationCard";
import { AssistantHourAlert } from "./AssistantHourAlert";
import { AssistantFocusPrompt } from "./AssistantFocusPrompt";
import { AssistantOvertimeCard } from "./AssistantOvertimeCard";
import { capitalizar } from "./format";
import { AssistantAccessibilityPrompt } from "./AssistantAccessibilityPrompt";
import { AssistantSessionSummary } from "./AssistantSessionSummary";
import { AssistantEditarAtividadeForm, type PatchAtividade } from "./tabs/AssistantEditarAtividadeForm";
import { EndOfDayFlow } from "./enddoday/EndOfDayFlow";
import type { AssistantAba } from "./AssistantTopNav";
import { useAssistantAtividades, categoriaTarefa, type AssistantTarefa } from "@/hooks/useAssistantAtividades";
import { useAssistantCobranca, type AssistantEstadoPainel } from "@/hooks/useAssistantCobranca";
import { useAssistantProjeto, type AssistantFiltroData } from "@/hooks/useAssistantProjeto";
import { useAssistantDocumentos } from "@/hooks/useAssistantDocumentos";
import { useJarvisMensagens } from "@/hooks/useJarvisMensagens";
import { useJarvisConfig } from "@/hooks/useJarvisConfig";
import { useFocusActivityMonitor, type ResumoSessao } from "@/hooks/useFocusActivityMonitor";
import { useDailyPlan } from "@/hooks/useDailyPlan";
import { useStartDayPrompt } from "@/hooks/useStartDayPrompt";
import { usePriorityOneNudge } from "@/hooks/usePriorityOneNudge";
import { usePerformanceReminder } from "@/hooks/usePerformanceReminder";
import { useSleepToday } from "@/hooks/useSleepToday";
import { useSleepMorningPrompt } from "@/hooks/useSleepMorningPrompt";
import { SleepRegisterForm } from "@/components/sleep/SleepRegisterForm";
import { enviarSessaoParaExtensao, enviarTarefaAtualParaExtensao, enviarEstadoFocoParaExtensao, enviarSnapshotTarefasParaExtensao } from "@/lib/extensionBridge";
import { startWindowDrag, openMainWindow, setJarvisWindowMode, aoPerderFocoJanela, TAMANHO_CONTEUDO_PAINEL, type JarvisWindowMode } from "@/lib/desktop/window";
import { onClienteAtualMudou, onAbrirEncerrarDia } from "@/lib/desktop/events";
import { checkAccessibilityTrusted, openAccessibilitySettings } from "@/lib/desktop/focusMonitor";
import { dispararConfete } from "@/lib/assistant/confetti";
import { playConclusaoSound } from "@/lib/assistant/sound";
import { filtrarPorResponsavel, type FiltroResponsavel } from "@/lib/atividades/filtroResponsavel";
import { useIdentidadeResponsavel } from "@/hooks/useIdentidadeResponsavel";

const ORB_SIZE = 64;
const MARGEM_PADRAO = 24;
const CHAVE_POSICAO = "assistantPosition";
const CHAVE_TAREFA_ATUAL = "assistantCurrentTaskId";
const CHAVE_FILTRO_RESPONSAVEL = "jarvisFiltroResponsavel";
const LIMIAR_ARRASTE_PX = 6;
const REFERENCIA_SEM_ESTIMATIVA_SEGUNDOS = 25 * 60;

interface Posicao {
  x: number;
  y: number;
}

const clampPos = (x: number, y: number): Posicao => ({
  x: Math.min(Math.max(x, 0), Math.max(0, window.innerWidth - ORB_SIZE)),
  y: Math.min(Math.max(y, 0), Math.max(0, window.innerHeight - ORB_SIZE)),
});

const posicaoPadrao = (): Posicao => clampPos(window.innerWidth - MARGEM_PADRAO - ORB_SIZE, window.innerHeight - MARGEM_PADRAO - ORB_SIZE);

const lerPosicaoSalva = (): Posicao => {
  try {
    const salvo = localStorage.getItem(CHAVE_POSICAO);
    if (salvo) {
      const parsed = JSON.parse(salvo);
      if (typeof parsed?.x === "number" && typeof parsed?.y === "number") return clampPos(parsed.x, parsed.y);
    }
  } catch {
    /* localStorage indisponível ou corrompido — cai no padrão */
  }
  return posicaoPadrao();
};

// Uma tarefa "bate" o filtro de dia se a data agendada (data_atividade) cai
// no recorte escolhido — atrasadas sempre aparecem, não importa o filtro
// (são sempre relevantes).
function tarefaBateFiltroDia(t: AssistantTarefa, filtro: AssistantFiltroData): boolean {
  if (categoriaTarefa(t) === "atrasada") return true;
  const hoje = new Date();
  const ref = t.data_atividade;
  if (filtro.tipo === "hoje") return ref === format(hoje, "yyyy-MM-dd");
  if (filtro.tipo === "amanha") return ref === format(addDays(hoje, 1), "yyyy-MM-dd");
  if (filtro.tipo === "semana") {
    const inicio = format(startOfWeek(hoje, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const fim = format(endOfWeek(hoje, { weekStartsOn: 1 }), "yyyy-MM-dd");
    return ref >= inicio && ref <= fim;
  }
  return filtro.data ? ref === filtro.data : true;
}

function rotuloFiltroDia(filtro: AssistantFiltroData): string {
  const hoje = new Date();
  if (filtro.tipo === "hoje") {
    const diaSemana = format(hoje, "EEEE", { locale: ptBR });
    return `${capitalizar(diaSemana)}, ${format(hoje, "d 'de' MMMM", { locale: ptBR })}`;
  }
  if (filtro.tipo === "amanha") return `Amanhã, ${format(addDays(hoje, 1), "d 'de' MMMM", { locale: ptBR })}`;
  if (filtro.tipo === "semana") return "Esta semana";
  if (filtro.data) {
    try {
      return format(parseISO(filtro.data), "d 'de' MMMM", { locale: ptBR });
    } catch {
      return "Data específica";
    }
  }
  return "Data específica";
}

// Assistente virtual flutuante. Mini workspace: navegação por abas
// (Hoje/Projeto/Kanban/Docs/Notas), tudo sobre as mesmas fontes de dados já
// existentes (atividades, colunas_atividade, documentos, clientes). Também
// espelha sessão/tarefa atual pra extensão Chrome (ver src/lib/extensionBridge.ts).
//
// `variant`:
// - "embedded" (padrão): instância única montada no DashboardLayout, orbe
//   arrastável dentro da própria página (posição em localStorage).
// - "window": montada sozinha na janela nativa `jarvis` (Tauri, ver
//   src/pages/JarvisWindow.tsx) — quem se move é a janela do SO
//   (startWindowDrag), não um div, e abrir o painel expande a própria
//   janela em vez de um popover sobre a página.
export function Assistant({ variant = "embedded" }: { variant?: "embedded" | "window" } = {}) {
  const [open, setOpen] = useState(false);

  // Item 3, rodada 6: na janela nativa, redimensiona/reposiciona a janela
  // Tauri PRIMEIRO (aguardando terminar) e só ENTÃO troca `open` pra true.
  // Antes disso era o contrário — `open` virava true e o painel (h-full
  // w-full) já tentava renderizar dentro da janela ainda pequena/mal
  // posicionada de um frame anterior, cortando header/tabs até o resize
  // (assíncrono) terminar. Na versão embutida não existe essa janela
  // separada — só abre. Declarado logo aqui (não mais perto de onde era
  // usado antes) porque handlers de cartões de notificação (Começar o dia,
  // prioridade #1, sono) também precisam chamar isto, e ficam definidos bem
  // antes de onde essa função vivia originalmente no arquivo.
  const abrirPainel = useCallback(async () => {
    if (variant === "window") {
      await setJarvisWindowMode("panel");
    }
    setOpen(true);
  }, [variant]);
  const [aba, setAba] = useState<AssistantAba>("hoje");
  const [pos, setPos] = useState<Posicao>(lerPosicaoSalva);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moveu: boolean } | null>(null);
  const latestPosRef = useRef(pos);
  // Ref da orbe (item 3, rodada 4) — usada só pra dizer ao Radix "esse
  // clique é na orbe, não conta como clique-fora" (ver onPointerDownOutside
  // abaixo do Popover).
  const orbRef = useRef<HTMLButtonElement>(null);

  // "Clicar fora encolhe o Jarvis" — na janela nativa (variant="window")
  // não existe Popover/clique-fora de DOM (a janela inteira é o conteúdo),
  // então o equivalente é a janela perder o foco pro SO. Na versão
  // embutida (Popover normal) isso já acontece sozinho, sem precisar disto.
  useEffect(() => {
    if (variant !== "window") return;
    let unlisten: (() => void) | undefined;
    let cancelado = false;
    aoPerderFocoJanela(() => setOpen(false)).then((fn) => {
      if (cancelado) fn();
      else unlisten = fn;
    });
    return () => {
      cancelado = true;
      unlisten?.();
    };
  }, [variant]);

  // ⌘+Shift+E ("Encerrar o dia", itens 1/2) — o Rust já mostra/foca a
  // janela `jarvis` antes de emitir isto (ver src-tauri/src/global_shortcut.rs);
  // aqui só abre o painel (se já estiver aberto, isto é um no-op inofensivo
  // — satisfaz sozinho "se já estiver aberto, só navegar") e liga o fluxo.
  useEffect(() => {
    if (variant !== "window") return;
    let unlisten: (() => void) | undefined;
    let cancelado = false;
    onAbrirEncerrarDia(() => {
      setOpen(true);
      setFluxoComecarDiaAberto(false);
      setFluxoEncerrarDiaAberto(true);
    }).then((fn) => {
      if (cancelado) fn();
      else unlisten = fn;
    });
    return () => {
      cancelado = true;
      unlisten?.();
    };
  }, [variant]);

  const [currentTaskId, setCurrentTaskIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CHAVE_TAREFA_ATUAL);
    } catch {
      return null;
    }
  });
  const setCurrentTaskId = useCallback((id: string | null) => {
    setCurrentTaskIdState(id);
    try {
      if (id) localStorage.setItem(CHAVE_TAREFA_ATUAL, id);
      else localStorage.removeItem(CHAVE_TAREFA_ATUAL);
    } catch {
      /* ignora — só perde a persistência, não quebra o uso */
    }
  }, []);

  const [selecionadaEm, setSelecionadaEm] = useState<number | null>(null);
  const [pausadoEm, setPausadoEm] = useState<number | null>(null);
  const [recomendacaoId, setRecomendacaoId] = useState<string | null>(null);
  const [celebracao, setCelebracao] = useState<string | null>(null);
  const [pulseGreen, setPulseGreen] = useState(false);
  const [documentoAbertoId, setDocumentoAbertoId] = useState<string | null>(null);

  // "Encerrar o dia" (itens 1, 8) — botão manual funciona em qualquer
  // variant (web não tem atalho global, ver AssistantPanel.tsx); o atalho
  // ⌘+Shift+E só existe na janela nativa (efeito acima).
  const [fluxoEncerrarDiaAberto, setFluxoEncerrarDiaAberto] = useState(false);
  // "Começar o dia" — mesmo padrão do bloco acima, com exclusão mútua
  // explícita: só um ritual por vez no mesmo painel de 460x620.
  const [fluxoComecarDiaAberto, setFluxoComecarDiaAberto] = useState(false);
  const handleAbrirEncerrarDia = useCallback(() => {
    setFluxoComecarDiaAberto(false);
    setFluxoEncerrarDiaAberto(true);
  }, []);
  const handleAbrirComecarDia = useCallback(() => {
    setFluxoEncerrarDiaAberto(false);
    setFluxoComecarDiaAberto(true);
  }, []);
  // Estado visual temporário de "dia encerrado" (item 8) — volta sozinho ao
  // normal depois de um tempo, ou na hora se a pessoa abrir o Jarvis de novo
  // (interagir de novo já É "voltar ao normal").
  const [diaEncerrado, setDiaEncerrado] = useState(false);
  useEffect(() => {
    if (!diaEncerrado) return;
    const DURACAO_MS = 10 * 60 * 1000;
    const id = setTimeout(() => setDiaEncerrado(false), DURACAO_MS);
    return () => clearTimeout(id);
  }, [diaEncerrado]);
  useEffect(() => {
    if (open) setDiaEncerrado(false);
  }, [open]);
  const [editando, setEditando] = useState(false);
  const [horaAlerta, setHoraAlerta] = useState<string | null>(null);
  const horaVistaRef = useRef<number | null>(null);
  const [resumoSessao, setResumoSessao] = useState<ResumoSessao | null>(null);
  const [acessibilidadeFaltando, setAcessibilidadeFaltando] = useState(false);
  // Item 7 (rodada 4): diálogo de overtime — dispara uma vez por sessão de
  // foco (mesmo critério do avisou45MinRef/avisouEstourouRef que já existia
  // em useAssistantCobranca, só que aqui vira um diálogo modal de verdade
  // em vez de balão passivo).
  const [dialogoExcedido, setDialogoExcedido] = useState(false);
  const excedidoAvisadoRef = useRef(false);
  const sessaoMonitorRef = useRef<{ taskId: string; desde: Date } | null>(null);
  const [, forceTick] = useState(0);

  const navigate = useNavigate();
  const { id: clienteRotaId } = useParams<{ id: string }>();
  const { session, user } = useAuth();
  const meusNomesResponsavel = useIdentidadeResponsavel();
  const [filtroResponsavel, setFiltroResponsavel] = useState<FiltroResponsavel>(() => {
    const salvo = localStorage.getItem(CHAVE_FILTRO_RESPONSAVEL);
    return salvo === "minhas" || salvo === "outras" || salvo === "sem_responsavel" ? salvo : "todas";
  });
  const selecionarFiltroResponsavel = useCallback((filtro: FiltroResponsavel) => {
    setFiltroResponsavel(filtro);
    localStorage.setItem(CHAVE_FILTRO_RESPONSAVEL, filtro);
  }, []);
  // Saudação da Home global (item 4, rodada 4) — mesmo padrão de
  // usePresencaProjeto.ts: nome cadastrado, senão a parte antes do @ do
  // e-mail.
  const nomeUsuario = (() => {
    const nomeCompleto = (user?.user_metadata as Record<string, unknown> | undefined)?.nome as string | undefined;
    const primeiroNome = nomeCompleto?.trim().split(" ")[0];
    return primeiroNome || user?.email?.split("@")[0] || "";
  })();
  const {
    tarefas, atrasadas, loading, iniciarTimer, pausarTimer, concluir, colunasDoProjeto, colunasTodas,
    colunasVersion, moverParaStatus, reordenarNaColuna, reordenarPorIds, criarAtividade, zerarTimer, atualizarAtividade,
  } = useAssistantAtividades();
  const { projetos, loadingProjetos, projetoId, projetoAtual, setProjetoId, filtroDia, setFiltroDia } = useAssistantProjeto();
  const dailyPlan = useDailyPlan();

  // O Jarvis tem seu próprio "projeto selecionado" (localStorage,
  // independente da página) — sem isso, um card criado no quadro de um
  // cliente (/clientes/:id) só aparece na aba Kanban do Jarvis se o projeto
  // dele por acaso já estiver no mesmo cliente. Ao entrar/trocar de página
  // de cliente, sincroniza o Jarvis pra esse mesmo projeto uma vez; depois
  // disso o usuário pode trocar livremente dentro do Jarvis sem ser
  // sobrescrito (o efeito só reage a clienteRotaId mudar de novo). Cobre o
  // caso web (Assistant na mesma árvore/rota da página).
  useEffect(() => {
    if (clienteRotaId && clienteRotaId !== projetoId) setProjetoId(clienteRotaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteRotaId]);

  // Mesma sincronização, mas pro desktop: a janela `jarvis` (variant
  // "window") roda numa árvore/rota separada da `main`, então useParams()
  // acima nunca vê o cliente aberto lá — precisa do evento nativo que
  // DashboardLayout emite (ver src/lib/desktop/events.ts). No-op na web.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onClienteAtualMudou((clienteId) => setProjetoId(clienteId)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [setProjetoId]);
  const { documentos, notas, loading: loadingDocumentos, refetch: refetchDocumentos, criarDocumento, criarNota, atualizarNotaLocal, fixarNota, excluirNota } = useAssistantDocumentos(projetoId);
  const jarvisMensagens = useJarvisMensagens();
  const { somAtivado, monitorarAppAtivo, analisarTituloJanela, detectarDistracoes } = useJarvisConfig();

  const tarefaAtual = currentTaskId ? tarefas.find((t) => t.id === currentTaskId) ?? null : null;
  const recomendacao = recomendacaoId ? tarefas.find((t) => t.id === recomendacaoId) ?? null : null;

  const estado: AssistantEstadoPainel = tarefaAtual
    ? tarefaAtual.timer_iniciado_em
      ? "foco"
      : (tarefaAtual.timer_decorrido_segundos || 0) > 0
      ? "pausado"
      : "selecionada"
    : recomendacao
    ? "recomendacao"
    : "lista";

  // Aba "Hoje" (item 4, rodada 4): SEMPRE global — todas as tarefas de
  // todos os projetos, só recortadas por dia (atrasadas sempre aparecem). A
  // Home não fica presa ao último projeto selecionado nas outras abas
  // (Projeto/Kanban/Docs/Notas usam `projetoId`, que continua intacto pra
  // elas); o filtro opcional por projeto na Home é local a
  // AssistantHojeTab, nunca persiste.
  const tarefasFiltradas = filtrarPorResponsavel(tarefas, filtroResponsavel, meusNomesResponsavel, user?.id);
  const tarefasHoje = tarefasFiltradas.filter((t) => tarefaBateFiltroDia(t, filtroDia));

  // A tarefa "atual" sumiu da lista (concluída/excluída em outro lugar) —
  // solta a seleção pra não ficar presa num id que não existe mais.
  useEffect(() => {
    if (currentTaskId && !loading && !tarefaAtual) setCurrentTaskId(null);
  }, [currentTaskId, loading, tarefaAtual, setCurrentTaskId]);

  // Recalcula o cronômetro a cada segundo enquanto em foco.
  useEffect(() => {
    if (estado !== "foco") return;
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [estado]);

  const elapsedSegundos = (() => {
    if (!tarefaAtual) return 0;
    const base = tarefaAtual.timer_decorrido_segundos || 0;
    if (tarefaAtual.timer_iniciado_em) {
      return base + (Date.now() - new Date(tarefaAtual.timer_iniciado_em).getTime()) / 1000;
    }
    return base;
  })();

  // Excedeu a estimativa (item 7, rodada 4) — só conta quando existe uma
  // estimativa real do usuário; a referência de 25min (sem estimativa) é só
  // um valor visual pro anel, nunca gera overtime/diálogo.
  const estourou = !!tarefaAtual?.tempo_estimado && elapsedSegundos >= tarefaAtual.tempo_estimado * 60;

  // Anel de progresso (item 9, rodada 3 / item 7, rodada 4): estimativa da
  // tarefa como 100%, ou 25min de referência quando não há estimativa.
  // Passou da estimativa: fica vermelho e continua "vivo" (nunca parece
  // congelado — ver animate-pulse em AssistantOrbRing.tsx). Fica verde por
  // alguns segundos ao concluir (reaproveita o mesmo `pulseGreen` do brilho
  // da orbe).
  const ring = pulseGreen
    ? { progress: 1, estado: "concluido" as const }
    : (estado === "foco" || estado === "pausado") && tarefaAtual
    ? {
        progress: Math.min(1, elapsedSegundos / ((tarefaAtual.tempo_estimado || 0) * 60 || REFERENCIA_SEM_ESTIMATIVA_SEGUNDOS)),
        estado: estourou ? ("excedido" as const) : (estado as "foco" | "pausado"),
      }
    : null;

  // Libera o diálogo de overtime de novo a cada novo run de foco (mesmo
  // critério do avisou45MinRef em useAssistantCobranca) — inclusive depois
  // de um "+10 min" (handleEstenderEstimativa reabre a estimativa, então um
  // novo estouro depois disso deve avisar de novo).
  useEffect(() => {
    if (!tarefaAtual?.timer_iniciado_em) excedidoAvisadoRef.current = false;
  }, [tarefaAtual?.timer_iniciado_em]);

  // Regressão corrigida: o gatilho não checava `estado`, só `estourou` — uma
  // tarefa meramente selecionada ou pausada (nunca voltou a rodar nesta
  // visita) mas com tempo acumulado de sessões antigas já acima da
  // estimativa disparava esse diálogo MODAL na hora, bloqueando o painel
  // inteiro (Radix Dialog cobre tudo) e escondendo as abas por trás dele —
  // por isso "Kanban/Docs/Notas sumiam" especificamente em foco/pausado.
  // Só interrompe de verdade quando o cronômetro está rodando ao vivo.
  useEffect(() => {
    if (estado === "foco" && estourou && !excedidoAvisadoRef.current) {
      excedidoAvisadoRef.current = true;
      setDialogoExcedido(true);
    }
  }, [estado, estourou]);

  const handleFecharDialogoExcedido = useCallback(() => setDialogoExcedido(false), []);

  const handleEstenderEstimativa = useCallback(async () => {
    if (!tarefaAtual) return;
    excedidoAvisadoRef.current = false;
    setDialogoExcedido(false);
    await atualizarAtividade(tarefaAtual.id, { tempo_estimado: (tarefaAtual.tempo_estimado || 0) + 10 });
  }, [tarefaAtual, atualizarAtividade]);

  const { mensagem: cobranca, dispararMensagemPontual, escolherTexto } = useAssistantCobranca({
    panelAberto: open,
    estado,
    selecionadaEm,
    pausadoEm,
    focoIniciadoEm: tarefaAtual?.timer_iniciado_em ? new Date(tarefaAtual.timer_iniciado_em).getTime() : null,
    focoAcumuladoAntesDoRunSegundos: tarefaAtual?.timer_decorrido_segundos || 0,
    estimativaSegundos: tarefaAtual?.tempo_estimado ? tarefaAtual.tempo_estimado * 60 : null,
    atrasadasCount: atrasadas.length,
    // "Hoje" + "atrasada" = tudo que ainda está pendente (a lista já só tem
    // não concluídas) — usado pelo lembrete periódico (item 6).
    pendentesHojeCount: tarefas.filter((t) => categoriaTarefa(t) !== "proxima").length,
    // Mensagens cadastradas em Administração → Jarvis (item 2).
    mensagens: jarvisMensagens.mensagens,
    // "Começar o dia": sugestão moderada quando o foco atual não é a
    // prioridade #1 e ela ainda está pendente.
    tarefaAtualId: currentTaskId,
    prioridadeUmId: dailyPlan.prioridadeUm?.id ?? null,
    prioridadeUmConcluida: dailyPlan.prioridadeUm?.concluida ?? false,
  });

  // Item 3 (rodada 3): monitor de foco nativo — só roda em sessão de foco
  // ativa E com a preferência "Monitorar aplicativo ativo" ligada (opt-in,
  // desligada por padrão). Detecção em si vive no Rust (ver
  // src-tauri/src/focus_monitor.rs); aqui só classificação/aprendizado/
  // gravação (Supabase continua a fonte de verdade).
  const monitorAtivo = estado === "foco" && monitorarAppAtivo;
  const { promptDesvio, resolverPrompt, buscarResumoSessao } = useFocusActivityMonitor({
    ativo: monitorAtivo,
    analisarTitulo: analisarTituloJanela,
    detectarDistracoes,
    clienteId: tarefaAtual?.cliente_id ?? null,
    atividadeId: tarefaAtual?.id ?? null,
  });

  // "Analisar título da janela" ligado mas a permissão de Accessibility
  // ainda não foi concedida — avisa uma vez por sessão de monitor (nunca
  // contorna, só sinaliza).
  useEffect(() => {
    if (!analisarTituloJanela || !monitorAtivo) {
      setAcessibilidadeFaltando(false);
      return;
    }
    checkAccessibilityTrusted().then((confiavel) => setAcessibilidadeFaltando(!confiavel));
  }, [analisarTituloJanela, monitorAtivo]);

  // Marca o início da sessão monitorada desta tarefa (pra buscar o resumo
  // certo ao concluir) — não reseta em pausa/retomada da MESMA tarefa.
  useEffect(() => {
    if (!monitorAtivo || !tarefaAtual) return;
    if (sessaoMonitorRef.current?.taskId !== tarefaAtual.id) {
      sessaoMonitorRef.current = { taskId: tarefaAtual.id, desde: new Date() };
    }
  }, [monitorAtivo, tarefaAtual]);

  // Ponte com a extensão Chrome (itens 10-12) — manda sessão + tarefa atual
  // sempre que mudam; a extensão (se instalada) escuta via postMessage na
  // mesma origem (ver src/lib/extensionBridge.ts e chrome-extension/bridge.js).
  useEffect(() => {
    enviarSessaoParaExtensao(session);
  }, [session]);
  useEffect(() => {
    enviarTarefaAtualParaExtensao(currentTaskId);
  }, [currentTaskId]);

  // Empurra o estado de foco (não o cronômetro tiquetaqueando — só quando
  // algo estrutural muda: tarefa, status ativo/pausado, timestamp de
  // início, estimativa) pra extensão assim que muda, sem esperar o
  // polling de 30s dela (que fica só como rede de segurança).
  useEffect(() => {
    if (!tarefaAtual || (estado !== "foco" && estado !== "pausado")) {
      enviarEstadoFocoParaExtensao(null);
      return;
    }
    enviarEstadoFocoParaExtensao({
      taskId: tarefaAtual.id,
      titulo: tarefaAtual.titulo,
      status: estado === "foco" ? "active" : "paused",
      startedAt: tarefaAtual.timer_iniciado_em,
      baseSegundos: tarefaAtual.timer_decorrido_segundos || 0,
      tempoEstimadoMin: tarefaAtual.tempo_estimado,
      projeto: tarefaAtual.cliente_id ? projetos.find((p) => p.id === tarefaAtual.cliente_id)?.nome ?? null : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefaAtual?.id, tarefaAtual?.timer_iniciado_em, tarefaAtual?.timer_decorrido_segundos, tarefaAtual?.tempo_estimado, tarefaAtual?.titulo, tarefaAtual?.cliente_id, estado, projetos]);

  // Empurra a lista inteira de tarefas pendentes pra extensão (item 1) toda
  // vez que ela muda por qualquer via (carga inicial, Realtime,
  // BroadcastChannel, mutação local) — é a MESMA `tarefas` que a aba "Hoje"
  // já mostra, sem outra fonte/consulta.
  useEffect(() => {
    const snapshot = tarefas.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      clienteId: t.cliente_id,
      projeto: t.cliente_id ? projetos.find((p) => p.id === t.cliente_id)?.nome ?? null : null,
      status: t.status,
      concluida: t.concluida,
      dataVencimento: t.data_vencimento,
      dataAtividade: t.data_atividade,
      prioridade: t.prioridade,
      tempoEstimadoMin: t.tempo_estimado,
      timerIniciadoEm: t.timer_iniciado_em,
      timerDecorridoSegundos: t.timer_decorrido_segundos,
      ordem: t.ordem,
    }));
    enviarSnapshotTarefasParaExtensao(snapshot, projetoAtual?.nome ?? null);
  }, [tarefas, projetos, projetoAtual]);

  // Item 7: sorteia entre as mensagens tipo "conclusao" cadastradas em
  // Administração → Jarvis (cai no texto fixo se nada configurado) — halo
  // verde + confete + som (só se "Sons do Jarvis" estiver ligado), ~2s,
  // depois volta ao normal.
  const dispararCelebracao = useCallback(() => {
    setCelebracao(escolherTexto("conclusao", "Boa. Uma a menos. ✨"));
    setPulseGreen(true);
    dispararConfete();
    if (somAtivado) playConclusaoSound();
    setTimeout(() => setPulseGreen(false), 2000);
    setTimeout(() => setCelebracao(null), 4000);
  }, [escolherTexto, somAtivado]);

  const handleSelecionarTarefa = useCallback((id: string) => {
    setCurrentTaskId(id);
    setSelecionadaEm(Date.now());
    setPausadoEm(null);
    setRecomendacaoId(null);
    setAba("hoje");
  }, [setCurrentTaskId]);

  const handleVoltar = useCallback(() => {
    setCurrentTaskId(null);
    setSelecionadaEm(null);
    setRecomendacaoId(null);
  }, [setCurrentTaskId]);

  // "Começar o dia" (correção #4): a prioridade #1 do plano de hoje pesa
  // mais que o resto — só cai pro comportamento antigo (primeira da lista)
  // quando ela não existe, já foi concluída, ou saiu da lista de tarefas
  // abertas (ex.: apagada).
  const handleQueFacoAgora = useCallback(() => {
    const p1 = dailyPlan.prioridadeUm;
    if (p1 && !p1.concluida && tarefas.some((t) => t.id === p1.id)) {
      setRecomendacaoId(p1.id);
      return;
    }
    if (tarefasHoje.length === 0) return;
    setRecomendacaoId(tarefasHoje[0].id);
  }, [dailyPlan.prioridadeUm, tarefas, tarefasHoje]);

  const handleComecarRecomendacao = useCallback(async () => {
    if (!recomendacao) return;
    const id = recomendacao.id;
    setRecomendacaoId(null);
    setCurrentTaskId(id);
    setSelecionadaEm(null);
    setPausadoEm(null);
    await iniciarTimer(id);
  }, [recomendacao, setCurrentTaskId, iniciarTimer]);

  // "Bom dia... vamos definir o que importa hoje?" (Começar o dia) — gate
  // definitivo é a existência do plano de hoje (useDailyPlan); "Planejar meu
  // dia" abre o ritual completo (AssistantPanel/StartDayFlow), nunca cria
  // nada sozinho.
  const startDayPrompt = useStartDayPrompt(dailyPlan.loading ? null : !!dailyPlan.plano);
  const handleAbrirComecarDiaDaSaudacao = useCallback(() => {
    startDayPrompt.dispensar();
    handleAbrirComecarDia();
    void abrirPainel();
    setAba("hoje");
  }, [startDayPrompt, handleAbrirComecarDia, abrirPainel]);

  // "Foco de hoje": vai direto pro foco na prioridade #1, sem passar pela
  // tela "selecionada" no meio — mesmo padrão de handleComecarRecomendacao.
  // `abrirPainel()` (não `setOpen(true)` direto) — no desktop, redimensiona
  // a janela nativa PRIMEIRO; setar `open` sem esperar isso faz o painel
  // tentar renderizar dentro da janela ainda pequena de notificação/orbe,
  // ficando tudo achatado até o resize assíncrono terminar.
  const handleComecarPrioridadeUm = useCallback(async (tarefaId: string) => {
    setFluxoComecarDiaAberto(false);
    setCurrentTaskId(tarefaId);
    setSelecionadaEm(null);
    setPausadoEm(null);
    await abrirPainel();
    setAba("hoje");
    await iniciarTimer(tarefaId);
  }, [setCurrentTaskId, iniciarTimer, abrirPainel]);

  // Cartão "sua prioridade #1 ainda não começou" (usePriorityOneNudge) —
  // "Começar" tem o mesmo comportamento de handleComecarPrioridadeUm, mas
  // sem fechar um ritual (ele não está aberto quando esse cartão aparece).
  const priorityOneNudge = usePriorityOneNudge({
    panelAberto: open,
    mainPriorityActivityId: dailyPlan.prioridadeUm?.id ?? null,
    mainPriorityTitulo: dailyPlan.prioridadeUm?.titulo ?? null,
    mainPriorityConcluida: dailyPlan.prioridadeUm?.concluida ?? false,
    emFocoNaPrioridade: estado === "foco" && !!dailyPlan.prioridadeUm && currentTaskId === dailyPlan.prioridadeUm.id,
    dataStr: dailyPlan.dataStr,
  });

  // "Academia ainda está pendente hoje" / destaque de meta (itens 19/20) —
  // nesta V1 nunca dispara de verdade (nenhum formulário ainda liga
  // lembrete_ativo num hábito), mas já fica pronto.
  const performanceReminder = usePerformanceReminder(open);

  // Registro rápido de sono direto do Jarvis (item 14) + lembrete matinal
  // (item 15) — mesmo padrão de useStartDayPrompt.ts, dispensa por
  // localStorage/dia, sem cobrança repetida.
  const sono = useSleepToday();
  const [sonoDialogAberto, setSonoDialogAberto] = useState(false);
  const sleepMorningPrompt = useSleepMorningPrompt(sono.loading ? null : !!sono.log);
  // `abrirPainel()`, não `setOpen(true)` direto — mesmo motivo de
  // handleComecarPrioridadeUm: sem isso, no desktop, o diálogo de sono
  // tentava renderizar dentro da janela pequena de notificação/orbe.
  const handleAbrirRegistrarSono = useCallback(() => {
    sleepMorningPrompt.dispensar();
    void abrirPainel();
    setSonoDialogAberto(true);
  }, [sleepMorningPrompt, abrirPainel]);

  const handleIniciarFoco = useCallback(async (duracaoMin: number | null) => {
    if (!tarefaAtual) return;
    setSelecionadaEm(null);
    setPausadoEm(null);
    await iniciarTimer(tarefaAtual.id, duracaoMin);
  }, [tarefaAtual, iniciarTimer]);

  const handlePausar = useCallback(async () => {
    if (!tarefaAtual) return;
    await pausarTimer(tarefaAtual.id);
    setPausadoEm(Date.now());
    // Item 2: mensagem tipo "pausa" — feedback imediato, não compete com o
    // cooldown de 15min dos avisos periódicos (é reação a uma ação do
    // usuário, não um cutucão espontâneo).
    dispararMensagemPontual("pausa", "Pausa registrada. Volta quando puder.");
  }, [tarefaAtual, pausarTimer, dispararMensagemPontual]);

  const handleRetomar = useCallback(async () => {
    if (!tarefaAtual) return;
    setPausadoEm(null);
    await iniciarTimer(tarefaAtual.id);
  }, [tarefaAtual, iniciarTimer]);

  const handleTrocarTarefa = useCallback(() => {
    setCurrentTaskId(null);
    setSelecionadaEm(null);
    setPausadoEm(null);
    setRecomendacaoId(null);
  }, [setCurrentTaskId]);

  const handleConcluir = useCallback(async () => {
    if (!tarefaAtual) return;
    try {
      const sessaoInfo = sessaoMonitorRef.current?.taskId === tarefaAtual.id ? sessaoMonitorRef.current : null;
      await concluir(tarefaAtual.id);
      setCurrentTaskId(null);
      setSelecionadaEm(null);
      setPausadoEm(null);
      dispararCelebracao();
      // Item 3 (rodada 3): resumo da sessão — só se o monitor rodou de
      // verdade nela (nada de score, só os fatos).
      if (sessaoInfo) {
        sessaoMonitorRef.current = null;
        const resumo = await buscarResumoSessao(sessaoInfo.desde);
        if (resumo.focoSegundos > 0 || resumo.distracaoSegundos > 0) {
          setResumoSessao(resumo);
          setTimeout(() => setResumoSessao(null), 9000);
        }
      }
    } catch {
      toast.error("Não foi possível concluir a tarefa");
    }
  }, [tarefaAtual, concluir, setCurrentTaskId, dispararCelebracao, buscarResumoSessao]);

  const handleConcluirDireto = useCallback(async (id: string) => {
    try {
      await concluir(id);
      if (id === currentTaskId) setCurrentTaskId(null);
      dispararCelebracao();
    } catch {
      toast.error("Não foi possível concluir a tarefa");
    }
  }, [concluir, currentTaskId, setCurrentTaskId, dispararCelebracao]);

  // Fechar continua imediato (não precisa esperar nada) — quem encolhe a
  // janela de volta é o efeito reativo de `janelaModo` mais abaixo.
  const alternarPainel = useCallback(() => {
    if (open) {
      setOpen(false);
    } else {
      void abrirPainel();
    }
  }, [open, abrirPainel]);

  // Helper central (item 1, rodada 3): qualquer ação que precise mostrar o
  // Infopro Hub "de verdade" passa por aqui. Na janela nativa (variant
  // "window"), abre/maximiza/foca a janela `main` de verdade (nunca navega
  // localmente — isso só renderizaria o app inteiro espremido dentro da
  // janelinha do Jarvis); na web/embutido, não existe uma janela separada,
  // então só navega a própria página.
  const abrirNoAppPrincipal = useCallback((route: string) => {
    setOpen(false);
    if (variant === "window") {
      void openMainWindow(route);
    } else {
      navigate(route);
    }
  }, [variant, navigate]);

  const handleVerTodas = useCallback(() => {
    abrirNoAppPrincipal("/atividades");
  }, [abrirNoAppPrincipal]);

  const handleAbrirNotasCompleto = useCallback(() => {
    abrirNoAppPrincipal("/notas");
  }, [abrirNoAppPrincipal]);

  const handleVerPerformance = useCallback(() => {
    abrirNoAppPrincipal("/produtividade");
  }, [abrirNoAppPrincipal]);

  const handleMoverStatus = useCallback((id: string, statusKey: string, ehConclusao: boolean) => {
    moverParaStatus(id, statusKey, ehConclusao);
    if (ehConclusao) {
      if (id === currentTaskId) setCurrentTaskId(null);
      dispararCelebracao();
    }
  }, [moverParaStatus, currentTaskId, setCurrentTaskId, dispararCelebracao]);

  const handleCriarDocumento = useCallback(async () => {
    try {
      const doc = await criarDocumento("Documento sem título");
      // O documento é criado normalmente nos dois casos — só o jeito de
      // ABRIR muda: na janela nativa não dá pra abrir o editor full-screen
      // dentro da janelinha do Jarvis (mesmo bug do "Ver todas"), então leva
      // pro contexto certo na main em vez disso (abrir o documento exato lá
      // é uma melhoria futura, sem rota pra isso hoje).
      if (variant === "window") {
        abrirNoAppPrincipal(projetoId ? `/clientes/${projetoId}` : "/atividades");
      } else {
        setDocumentoAbertoId(doc.id);
      }
    } catch {
      toast.error("Não foi possível criar o documento");
    }
  }, [criarDocumento, variant, abrirNoAppPrincipal, projetoId]);

  const handleAbrirDocumento = useCallback((id: string) => {
    if (variant === "window") {
      abrirNoAppPrincipal(projetoId ? `/clientes/${projetoId}` : "/atividades");
    } else {
      setDocumentoAbertoId(id);
    }
  }, [variant, abrirNoAppPrincipal, projetoId]);

  // Item 4: zerar cronômetro (confirmação já acontece em AssistantHojeTab)
  // e abrir/salvar a edição completa da atividade atual.
  const handleZerarCronometro = useCallback(() => {
    if (!tarefaAtual) return;
    zerarTimer(tarefaAtual.id);
  }, [tarefaAtual, zerarTimer]);

  const handleAbrirEditar = useCallback(() => {
    if (!tarefaAtual) return;
    setEditando(true);
  }, [tarefaAtual]);

  const handleSalvarEdicao = useCallback(async (id: string, patch: PatchAtividade) => {
    await atualizarAtividade(id, patch);
  }, [atualizarAtividade]);

  // Item 3: "Expandir" mostra/maximiza/foca a janela main completa (não
  // recria o app dentro do Jarvis) e leva o projeto atual junto — só existe
  // na janela nativa (na web não há uma "janela main" separada).
  const handleExpandir = useCallback(() => {
    abrirNoAppPrincipal(projetoId ? `/clientes/${projetoId}` : "/atividades");
  }, [abrirNoAppPrincipal, projetoId]);

  // Item 5: alerta de troca de bloco de horário — só quando há sessão ativa
  // (foco/pausado) ou tarefas previstas pra hoje; nunca incomoda sem
  // contexto nenhum. Checa a cada 30s (granularidade suficiente pra pegar a
  // virada de hora sem precisar de um timer de precisão).
  useEffect(() => {
    const checar = () => {
      const horaAtual = new Date().getHours();
      if (horaVistaRef.current === null) {
        horaVistaRef.current = horaAtual;
        return;
      }
      if (horaAtual === horaVistaRef.current) return;
      horaVistaRef.current = horaAtual;
      const temSessaoOuPendencias = estado === "foco" || estado === "pausado" || tarefasHoje.length > 0;
      if (!temSessaoOuPendencias) return;
      setHoraAlerta(`${String(horaAtual).padStart(2, "0")}:00`);
    };
    const id = setInterval(checar, 30_000);
    return () => clearInterval(id);
  }, [estado, tarefasHoje.length]);

  // Some sozinho depois de 15s (mesmo padrão de auto-dismiss já usado no
  // resumo de sessão) — antes só sumia clicando num botão específico, e
  // clicar na orbe só reconhecia, não fechava até o painel de fato abrir.
  useEffect(() => {
    if (!horaAlerta) return;
    const id = setTimeout(() => setHoraAlerta(null), 15_000);
    return () => clearTimeout(id);
  }, [horaAlerta]);

  const handleHourContinuar = useCallback(() => setHoraAlerta(null), []);
  const handleHourVerTarefas = useCallback(() => {
    setHoraAlerta(null);
    void abrirPainel();
  }, [abrirPainel]);
  const handleHourPausar = useCallback(() => {
    setHoraAlerta(null);
    handlePausar();
  }, [handlePausar]);
  const handleHourRetomar = useCallback(() => {
    setHoraAlerta(null);
    handleRetomar();
  }, [handleRetomar]);

  // Item 3 (rodada 3): respostas ao "possível desvio" — "Pausar" não
  // resolve a classificação (fica neutra), só pausa o timer; desligar o
  // monitor (ativo vira false) já limpa o prompt sozinho.
  const handleFocusFazParte = useCallback(() => {
    void resolverPrompt("faz_parte");
  }, [resolverPrompt]);
  const handleFocusMeDistraiu = useCallback(() => {
    void resolverPrompt("me_distraiu");
  }, [resolverPrompt]);
  const handleFocusPausar = useCallback(() => {
    handlePausar();
  }, [handlePausar]);

  // Arraste da orbe — listeners imperativos em `window` enquanto dura (mesmo
  // padrão do connectionDrag em MindMapEditor.tsx), distinguindo clique de
  // arraste pela distância percorrida.
  const handleOrbPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moveu: false };
    setDragging(true);
  }, [pos]);

  // Dentro da janela nativa Jarvis (variant="window") quem se move é a
  // própria janela do SO — o mesmo limiar de distância decide clique vs.
  // arraste, mas ao cruzar o limiar a gente entrega o gesto pro
  // startDragging() nativo em vez de recalcular uma posição CSS.
  useEffect(() => {
    if (!dragging) return;

    if (variant === "window") {
      const onMove = (e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || drag.moveu) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.hypot(dx, dy) > LIMIAR_ARRASTE_PX) {
          drag.moveu = true;
          dragRef.current = null;
          setDragging(false);
          startWindowDrag();
        }
      };
      const onUp = () => {
        const drag = dragRef.current;
        setDragging(false);
        dragRef.current = null;
        if (drag && !drag.moveu) {
          // Clicar na orbe enquanto o aviso de "nova hora" está mostrando
          // conta como reconhecer ele — senão ele ficava voltando toda vez
          // que o painel fechava de novo, dando a impressão de que clicar
          // não fazia nada.
          if (horaAlerta) setHoraAlerta(null);
          alternarPainel();
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      return () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
    }

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moveu && Math.hypot(dx, dy) > LIMIAR_ARRASTE_PX) drag.moveu = true;
      const novo = clampPos(drag.origX + dx, drag.origY + dy);
      latestPosRef.current = novo;
      setPos(novo);
    };

    const onUp = () => {
      const drag = dragRef.current;
      setDragging(false);
      dragRef.current = null;
      if (!drag) return;
      if (drag.moveu) {
        try {
          localStorage.setItem(CHAVE_POSICAO, JSON.stringify(latestPosRef.current));
        } catch {
          /* ignora — a posição só não sobrevive a um reload */
        }
      } else {
        // Mesmo reconhecimento do aviso de "nova hora" ao clicar na orbe —
        // ver comentário equivalente no ramo variant==="window" acima.
        if (horaAlerta) setHoraAlerta(null);
        setOpen((v) => !v);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, variant, alternarPainel, horaAlerta]);

  // Modo real da janela nativa (rodada 8): "panel" quando o painel está
  // aberto (460x620, sempre — resize manual removido por enquanto, item 7
  // do pedido), "notification" quando fechado mas algum balão/aviso precisa
  // aparecer (380x230 — senão fica invisível, a orbe fechada é só 140x140),
  // "orb" (140x140) no resto do tempo. Cobre TODOS os balões existentes.
  // Se o painel JÁ está aberto, o modo continua "panel" mesmo com um balão
  // pendente — a notificação aparece flutuando sobre o painel (já cabe
  // dentro dos 460x620), nunca troca a janela pra modo notification com o
  // painel aberto (item 6 do pedido).
  const temBalaoVisivel = !!(
    dialogoExcedido || celebracao || cobranca || promptDesvio || horaAlerta || resumoSessao || acessibilidadeFaltando ||
    priorityOneNudge.mostrar || startDayPrompt.mostrar || performanceReminder.lembrete || performanceReminder.destaqueMeta ||
    sleepMorningPrompt.mostrar
  );
  const janelaModo: JarvisWindowMode = open ? "panel" : temBalaoVisivel ? "notification" : "orb";

  // ÚNICO ponto que troca o modo da janela nativa (item 4/9 do pedido) — a
  // versão embutida usa um Popover normal, que já cresce/encolhe sozinho,
  // nunca chama isso. Abrir o painel é tratado à parte, de forma proativa,
  // por `abrirPainel` (aguarda o resize terminar antes de `setOpen(true)`)
  // — `open` só vira true por ali. Este efeito reativo cuida só de fechar
  // (voltar pra orbe) e mostrar/esconder notificação; ignorar "panel" aqui
  // evita uma segunda chamada de resize redundante logo depois da
  // proativa. Não existe mais nenhum resize manual pelo usuário (item 7) —
  // os únicos gatilhos de tamanho são: abrir painel, fechar painel, e
  // aparecer/sumir notificação.
  useEffect(() => {
    if (variant !== "window" || janelaModo === "panel") return;
    void setJarvisWindowMode(janelaModo);
  }, [janelaModo, variant]);

  // Mantém a orbe dentro da viewport se a janela for redimensionada depois
  // de uma posição já salva.
  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p.x, p.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Rodada 8: na janela nativa a notificação preenche a janela inteira
  // (que já nasce 380x230, exatamente do tamanho dela — ver
  // setJarvisWindowMode) em vez de flutuar acima da orbe; na versão
  // embutida (sem janela própria) continua flutuando perto da orbe, que
  // segue visível na página.
  // Rodada 9, item 1/2: painel/notificação flutuando "acima/ao lado da
  // âncora" (Radix Popper: side/align/sideOffset/collisionPadding) fazia
  // sentido quando o conteúdo vivia dentro da MESMA página que a orbe. Na
  // janela nativa não existe isso — cada modo já É uma janela do SO do
  // tamanho exato do conteúdo (ver TAMANHOS em desktop/window.ts). Manter o
  // Popper ativo ali fazia o Radix recalcular a posição do card RELATIVA À
  // ÂNCORA (a orbe) toda vez que a janela mudava de tamanho — e como a orbe
  // passou a ficar centralizada (rodada 8), o "centro" se move a cada
  // resize, então o card branco nascia com posição/tamanho aparentemente
  // inconsistente dentro da janela (mesmo a janela já estando no tamanho
  // certo). Por isso: só a versão embutida (variant="embedded", sem janela
  // própria) usa Popover de verdade; na nativa, painel e notificação são
  // divs simples que preenchem a janela inteira, sem nenhuma matemática de
  // anchor.
  const painelJsx = (
    <AssistantPanel
      onClose={() => setOpen(false)}
      onExpandir={variant === "window" ? handleExpandir : undefined}
      aba={aba}
      onMudarAba={setAba}
      filtroResponsavel={filtroResponsavel}
      onMudarFiltroResponsavel={selecionarFiltroResponsavel}
      estado={estado}
      nomeUsuario={nomeUsuario}
      filtroDiaLabel={rotuloFiltroDia(filtroDia)}
      tarefasHoje={tarefasHoje}
      tarefaAtual={tarefaAtual}
      recomendacao={recomendacao}
      elapsedSegundos={elapsedSegundos}
      onSelecionarTarefa={handleSelecionarTarefa}
      onConcluirDireto={handleConcluirDireto}
      onVoltar={handleVoltar}
      onIniciarFoco={handleIniciarFoco}
      onPausar={handlePausar}
      onRetomar={handleRetomar}
      onConcluir={handleConcluir}
      onTrocarTarefa={handleTrocarTarefa}
      onVerTodas={handleVerTodas}
      onQueFacoAgora={handleQueFacoAgora}
      onComecarRecomendacao={handleComecarRecomendacao}
      projetos={projetos}
      loadingProjetos={loadingProjetos}
      projetoId={projetoId}
      onSelecionarProjeto={setProjetoId}
      filtroDia={filtroDia}
      onMudarFiltroDia={setFiltroDia}
      todasTarefas={tarefasFiltradas}
      colunasDoProjeto={colunasDoProjeto}
      colunasTodas={colunasTodas}
      colunasVersion={colunasVersion}
      onMoverStatus={handleMoverStatus}
      onReordenarNaColuna={reordenarNaColuna}
      onCriarAtividade={criarAtividade}
      onReordenarPorIds={reordenarPorIds}
      documentos={documentos}
      loadingDocumentos={loadingDocumentos}
      onCriarDocumento={handleCriarDocumento}
      onAbrirDocumento={handleAbrirDocumento}
      notas={notas}
      loadingNotas={loadingDocumentos}
      onCriarNota={criarNota}
      onFixarNota={fixarNota}
      onExcluirNota={excluirNota}
      onNotaAtualizada={atualizarNotaLocal}
      onAbrirNotasCompleto={handleAbrirNotasCompleto}
      onVerPerformance={handleVerPerformance}
      onRegistrarSono={() => setSonoDialogAberto(true)}
      onZerarCronometro={handleZerarCronometro}
      onEditarAtividade={handleAbrirEditar}
      headerArrastavel={variant === "window"}
      fluxoEncerrarDiaAberto={fluxoEncerrarDiaAberto}
      onAbrirEncerrarDia={handleAbrirEncerrarDia}
      onFecharEncerrarDia={() => setFluxoEncerrarDiaAberto(false)}
      onDiaEncerrado={() => setDiaEncerrado(true)}
      onVerRelatorioCompleto={() => abrirNoAppPrincipal("/produtividade")}
      fluxoComecarDiaAberto={fluxoComecarDiaAberto}
      onAbrirComecarDia={handleAbrirComecarDia}
      onFecharComecarDia={() => setFluxoComecarDiaAberto(false)}
      onPlanoSalvo={dailyPlan.refetch}
      onComecarPrioridadeUm={handleComecarPrioridadeUm}
      onCriarAtividadeParaPlano={criarAtividade}
      planoDoDia={dailyPlan.plano}
      atividadesDoPlano={dailyPlan.atividades}
      prioridadeUmDoPlano={dailyPlan.prioridadeUm}
    />
  );

  // Rodada 12: extraído numa variável só pra poder ser posicionado
  // diferente por variant (empilhado com a orbe na nativa — ver mais
  // abaixo — vs. flutuando acima dela na embutida, como sempre foi).
  const notificacaoJsx = dialogoExcedido && tarefaAtual ? (
    <AssistantOvertimeCard
      estimadoMin={tarefaAtual.tempo_estimado || 0}
      executadoSegundos={elapsedSegundos}
      onContinuar={handleFecharDialogoExcedido}
      onEstender={handleEstenderEstimativa}
      onFinalizar={() => {
        setDialogoExcedido(false);
        void handleConcluir();
      }}
    />
  ) : promptDesvio ? (
    <AssistantFocusPrompt
      appName={promptDesvio.appName}
      minutos={promptDesvio.minutos}
      tarefaTitulo={tarefaAtual?.titulo ?? ""}
      onFazParte={handleFocusFazParte}
      onMeDistraiu={handleFocusMeDistraiu}
      onPausar={handleFocusPausar}
    />
  ) : horaAlerta ? (
    <AssistantHourAlert
      hora={horaAlerta}
      tarefaAtualTitulo={tarefaAtual?.titulo ?? null}
      pausado={estado === "pausado"}
      pendentesCount={tarefasHoje.length}
      onContinuar={handleHourContinuar}
      onTrocarTarefa={handleHourVerTarefas}
      onPausar={handleHourPausar}
      onRetomar={handleHourRetomar}
    />
  ) : resumoSessao ? (
    <AssistantSessionSummary
      focoMinutos={Math.round(resumoSessao.focoSegundos / 60)}
      distracaoMinutos={Math.round(resumoSessao.distracaoSegundos / 60)}
      apps={resumoSessao.apps.map((a) => ({ nome: a.nome, minutos: Math.round(a.segundos / 60) }))}
      onFechar={() => setResumoSessao(null)}
    />
  ) : acessibilidadeFaltando ? (
    <AssistantAccessibilityPrompt onAbrirAjustes={() => void openAccessibilitySettings()} onDispensar={() => setAcessibilidadeFaltando(false)} />
  ) : priorityOneNudge.mostrar ? (
    <JarvisNotificationCard
      titulo="🔥 Sua prioridade #1 ainda não começou"
      acoes={[
        {
          label: "Começar",
          onClick: () => {
            if (dailyPlan.prioridadeUm) void handleComecarPrioridadeUm(dailyPlan.prioridadeUm.id);
          },
          variant: "default",
        },
        { label: "Adiar", onClick: priorityOneNudge.adiar, variant: "outline" },
        { label: "Existe um bloqueio", onClick: priorityOneNudge.marcarBloqueio, variant: "ghost" },
      ]}
    >
      "{priorityOneNudge.titulo}"
    </JarvisNotificationCard>
  ) : performanceReminder.lembrete ? (
    <JarvisNotificationCard
      titulo={`${performanceReminder.lembrete.nome} ainda está pendente hoje.`}
      acoes={[
        { label: "Fiz", onClick: () => void performanceReminder.marcarFeito(), variant: "default" },
        { label: "Lembrar depois", onClick: performanceReminder.lembrarDepois, variant: "outline" },
        { label: "Não vou fazer hoje", onClick: performanceReminder.naoVouFazer, variant: "ghost" },
      ]}
    />
  ) : celebracao || cobranca ? (
    <JarvisNotificationCard tone={celebracao ? "success" : "info"}>{celebracao ?? cobranca}</JarvisNotificationCard>
  ) : performanceReminder.destaqueMeta ? (
    <JarvisNotificationCard tone="info">{performanceReminder.destaqueMeta.texto}</JarvisNotificationCard>
  ) : startDayPrompt.mostrar ? (
    <JarvisNotificationCard
      titulo={`Bom dia${nomeUsuario ? `, ${nomeUsuario}` : ""} 👋`}
      acoes={[
        { label: "Planejar meu dia", onClick: handleAbrirComecarDiaDaSaudacao, variant: "default" },
        { label: "Agora não", onClick: startDayPrompt.dispensar, variant: "outline" },
      ]}
    >
      Vamos definir o que realmente importa hoje?
    </JarvisNotificationCard>
  ) : sleepMorningPrompt.mostrar ? (
    <JarvisNotificationCard
      titulo="Bom dia 👋"
      acoes={[
        { label: "Registrar sono", onClick: handleAbrirRegistrarSono, variant: "default" },
        { label: "Depois", onClick: sleepMorningPrompt.dispensar, variant: "outline" },
      ]}
    >
      Antes de começar, quer registrar como foi sua noite?
    </JarvisNotificationCard>
  ) : null;

  // Correção de bug reportado: na versão embutida (variant !== "window"), o
  // balão sempre nascia "acima e à direita" da orbe (bottom-full right-0),
  // sem checar se cabia ali — se a orbe estivesse arrastada perto do topo
  // ou da borda esquerda da tela, o balão renderizava fora da viewport,
  // cortado e sem dar pra clicar nos botões. Mede o balão já renderizado e
  // decide o lado (acima/abaixo) e alinhamento (direita/esquerda) que
  // realmente cabem, no mesmo espírito de clampPos/posicaoDentroDoMonitor
  // já usados pra orbe e pra janela nativa.
  const notifRef = useRef<HTMLDivElement>(null);
  const [notifLado, setNotifLado] = useState<{ vertical: "acima" | "abaixo"; horizontal: "direita" | "esquerda" }>({
    vertical: "acima",
    horizontal: "direita",
  });

  useLayoutEffect(() => {
    if (variant === "window" || !temBalaoVisivel) return;
    const el = notifRef.current;
    if (!el) return;
    const margem = 8;
    const rect = el.getBoundingClientRect();
    const cabeAcima = pos.y - rect.height - margem >= 0;
    const cabeNaDireita = pos.x + ORB_SIZE - rect.width >= 0;
    setNotifLado({ vertical: cabeAcima ? "acima" : "abaixo", horizontal: cabeNaDireita ? "direita" : "esquerda" });
    // `temBalaoVisivel` (booleano estável) no lugar de `notificacaoJsx` (um
    // elemento JSX novo a cada render) — o que importa aqui é só "apareceu/
    // sumiu um balão", não a identidade do elemento.
  }, [temBalaoVisivel, pos.x, pos.y, variant]);

  // Rodada 12, item "não quero que ele suma": no modo notificação, empilha
  // o card ACIMA da orbe (não centraliza mais igual ao modo orbe sozinha)
  // — as duas ficam visíveis ao mesmo tempo, no canto inferior direito da
  // janela, dando a impressão de "o Jarvis está falando" em vez do card
  // sozinho cobrindo a orbe.
  // Pedido do usuário: o mesmo empilhamento agora vale pro painel aberto —
  // antes ele preenchia a janela inteira e cobria a orbe por trás ("some de
  // onde está"); agora a orbe continua visível embaixo do painel, do mesmo
  // jeito que já acontecia com o balão de notificação (ver TAMANHO_CONTEUDO_
  // PAINEL/PANEL_TAMANHO em desktop/window.ts).
  // p-6 (24px) garante clareza pro anel de progresso, que vaza ~18px além
  // da caixa de 64px da orbe (ver AssistantOrbRing.tsx) — sem isso o anel
  // tocaria a borda física da janela quando a orbe está encostada no canto
  // (não mais centralizada, como no modo orbe sozinha).
  const alinhamentoWrapper = variant !== "window" ? "" : janelaModo === "orb" ? "items-center justify-center" : "items-end justify-end gap-2 p-6";

  return (
    <>
      <div
        className={variant === "window" ? `fixed inset-0 z-50 flex flex-col ${alinhamentoWrapper}` : "fixed z-50"}
        style={variant === "window" ? undefined : { left: pos.x, top: pos.y }}
      >
        {variant === "window" ? (
          <>
            {/* Card/painel ANTES da orbe no DOM: com justify-end (empacota
                do fim pra trás, no sentido do eixo principal — vertical
                aqui), o primeiro filho fica acima do segundo, ambos
                colados no canto inferior — a orbe é sempre o último,
                sempre visível, com o card OU o painel empilhado por cima
                dela (nunca os dois juntos: um só aparece com o painel
                fechado, o outro só com o painel aberto). */}
            {!open && notificacaoJsx}
            {open && (
              <div className="shrink-0 overflow-hidden" style={{ width: TAMANHO_CONTEUDO_PAINEL.width, height: TAMANHO_CONTEUDO_PAINEL.height }}>
                {painelJsx}
              </div>
            )}
            <AssistantOrb
              ref={orbRef}
              open={open}
              pulse={pulseGreen ? "green" : null}
              ring={ring}
              pausado={estado === "pausado"}
              diaEncerrado={diaEncerrado}
              onPointerDown={handleOrbPointerDown}
            />
          </>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
              <AssistantOrb
                ref={orbRef}
                open={open}
                pulse={pulseGreen ? "green" : null}
                ring={ring}
                pausado={estado === "pausado"}
                diaEncerrado={diaEncerrado}
                onPointerDown={handleOrbPointerDown}
              />
            </PopoverAnchor>
            <PopoverContent
              side="top"
              align="end"
              sideOffset={16}
              collisionPadding={16}
              // Item 3 (rodada 4): clicar na orbe pra FECHAR o painel
              // competia com a própria detecção de "clique fora" do Radix (a
              // orbe é âncora, não gatilho, então o Radix não a trata como
              // "dentro") — os dois chamavam onOpenChange no mesmo gesto e
              // um desfazia o outro. Cancelar aqui deixa o pointerup manual
              // (abaixo) ser a única fonte de verdade pro toggle da orbe;
              // clicar fora de verdade continua fechando normalmente.
              onPointerDownOutside={(e) => {
                if (orbRef.current?.contains(e.target as Node)) e.preventDefault();
              }}
              className="h-[620px] w-[460px] max-w-[calc(100vw-2rem)] border-none bg-transparent p-0 shadow-none"
            >
              {painelJsx}
            </PopoverContent>
          </Popover>
        )}

        {variant !== "window" && notificacaoJsx && (
          <div
            ref={notifRef}
            className={cn(
              "absolute max-w-[calc(100vw-2rem)]",
              notifLado.vertical === "acima" ? "bottom-full mb-2" : "top-full mt-2",
              notifLado.horizontal === "direita" ? "right-0" : "left-0"
            )}
          >
            {notificacaoJsx}
          </div>
        )}
      </div>

      {documentoAbertoId && (
        <div className="fixed inset-0 z-[60]">
          <DocumentEditor
            documentoId={documentoAbertoId}
            onClose={() => {
              setDocumentoAbertoId(null);
              refetchDocumentos();
            }}
          />
        </div>
      )}

      <Dialog open={editando} onOpenChange={setEditando}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar atividade</DialogTitle>
          </DialogHeader>
          {tarefaAtual && (
            <AssistantEditarAtividadeForm
              atividade={tarefaAtual}
              projetos={projetos}
              colunasDoProjeto={colunasDoProjeto}
              onSalvar={handleSalvarEdicao}
              onCancelar={() => setEditando(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={sonoDialogAberto} onOpenChange={setSonoDialogAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{sono.log ? "Editar sono" : "Registrar sono"}</DialogTitle>
          </DialogHeader>
          <SleepRegisterForm
            logExistente={sono.log}
            onSalvar={sono.registrar}
            onSalvo={() => setSonoDialogAberto(false)}
            onCancelar={() => setSonoDialogAberto(false)}
          />
        </DialogContent>
      </Dialog>

    </>
  );
}
