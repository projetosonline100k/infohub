import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { addDays, endOfWeek, format, parseISO, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/auth/AuthProvider";
import { DocumentEditor } from "@/components/documentos/DocumentEditor";
import { AssistantOrb } from "./AssistantOrb";
import { AssistantPanel } from "./AssistantPanel";
import { JarvisNotificationCard } from "./JarvisNotificationCard";
import { AssistantHourAlert } from "./AssistantHourAlert";
import { AssistantFocusPrompt } from "./AssistantFocusPrompt";
import { AssistantOvertimeCard } from "./AssistantOvertimeCard";
import { AssistantAccessibilityPrompt } from "./AssistantAccessibilityPrompt";
import { AssistantSessionSummary } from "./AssistantSessionSummary";
import { AssistantEditarAtividadeForm, type PatchAtividade } from "./tabs/AssistantEditarAtividadeForm";
import type { AssistantAba } from "./AssistantTopNav";
import { useAssistantAtividades, categoriaTarefa, type AssistantTarefa } from "@/hooks/useAssistantAtividades";
import { useAssistantCobranca, type AssistantEstadoPainel } from "@/hooks/useAssistantCobranca";
import { useAssistantProjeto, type AssistantFiltroData } from "@/hooks/useAssistantProjeto";
import { useAssistantDocumentos } from "@/hooks/useAssistantDocumentos";
import { useJarvisMensagens } from "@/hooks/useJarvisMensagens";
import { useJarvisConfig } from "@/hooks/useJarvisConfig";
import { useFocusActivityMonitor, type ResumoSessao } from "@/hooks/useFocusActivityMonitor";
import { enviarSessaoParaExtensao, enviarTarefaAtualParaExtensao, enviarEstadoFocoParaExtensao, enviarSnapshotTarefasParaExtensao } from "@/lib/extensionBridge";
import { startWindowDrag, openMainWindow, setJarvisWindowMode, type JarvisWindowMode } from "@/lib/desktop/window";
import { checkAccessibilityTrusted, openAccessibilitySettings } from "@/lib/desktop/focusMonitor";
import { dispararConfete } from "@/lib/assistant/confetti";
import { playConclusaoSound } from "@/lib/assistant/sound";

const ORB_SIZE = 64;
const MARGEM_PADRAO = 24;
const CHAVE_POSICAO = "assistantPosition";
const CHAVE_TAREFA_ATUAL = "assistantCurrentTaskId";
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
  if (filtro.tipo === "hoje") return `Hoje, ${format(hoje, "d 'de' MMMM", { locale: ptBR })}`;
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
  const [aba, setAba] = useState<AssistantAba>("hoje");
  const [pos, setPos] = useState<Posicao>(lerPosicaoSalva);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moveu: boolean } | null>(null);
  const latestPosRef = useRef(pos);
  // Ref da orbe (item 3, rodada 4) — usada só pra dizer ao Radix "esse
  // clique é na orbe, não conta como clique-fora" (ver onPointerDownOutside
  // abaixo do Popover).
  const orbRef = useRef<HTMLButtonElement>(null);

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
  const { session, user } = useAuth();
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
    colunasVersion, moverParaStatus, criarAtividade, zerarTimer, atualizarAtividade,
  } = useAssistantAtividades();
  const { projetos, loadingProjetos, projetoId, projetoAtual, setProjetoId, filtroDia, setFiltroDia } = useAssistantProjeto();
  const { documentos, notas, loading: loadingDocumentos, refetch: refetchDocumentos, criarDocumento, criarNota, fixarNota, excluirNota } = useAssistantDocumentos(projetoId);
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
  const tarefasHoje = tarefas.filter((t) => tarefaBateFiltroDia(t, filtroDia));

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

  const handleQueFacoAgora = useCallback(() => {
    if (tarefasHoje.length === 0) return;
    setRecomendacaoId(tarefasHoje[0].id);
  }, [tarefasHoje]);

  const handleComecarRecomendacao = useCallback(async () => {
    if (!recomendacao) return;
    const id = recomendacao.id;
    setRecomendacaoId(null);
    setCurrentTaskId(id);
    setSelecionadaEm(null);
    setPausadoEm(null);
    await iniciarTimer(id);
  }, [recomendacao, setCurrentTaskId, iniciarTimer]);

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

  // Item 3, rodada 6: na janela nativa, redimensiona/reposiciona a janela
  // Tauri PRIMEIRO (aguardando terminar) e só ENTÃO troca `open` pra true.
  // Antes disso era o contrário — `open` virava true e o painel (h-full
  // w-full) já tentava renderizar dentro da janela ainda pequena/mal
  // posicionada de um frame anterior, cortando header/tabs até o resize
  // (assíncrono) terminar. Na versão embutida não existe essa janela
  // separada — só abre.
  const abrirPainel = useCallback(async () => {
    if (variant === "window") {
      await setJarvisWindowMode("panel");
    }
    setOpen(true);
  }, [variant]);

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
        if (drag && !drag.moveu) alternarPainel();
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
        setOpen((v) => !v);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, variant, alternarPainel]);

  // Modo real da janela nativa (rodada 8): "panel" quando o painel está
  // aberto (460x620, sempre — resize manual removido por enquanto, item 7
  // do pedido), "notification" quando fechado mas algum balão/aviso precisa
  // aparecer (380x230 — senão fica invisível, a orbe fechada é só 140x140),
  // "orb" (140x140) no resto do tempo. Cobre TODOS os balões existentes.
  // Se o painel JÁ está aberto, o modo continua "panel" mesmo com um balão
  // pendente — a notificação aparece flutuando sobre o painel (já cabe
  // dentro dos 460x620), nunca troca a janela pra modo notification com o
  // painel aberto (item 6 do pedido).
  const temBalaoVisivel = !!(dialogoExcedido || celebracao || cobranca || promptDesvio || horaAlerta || resumoSessao || acessibilidadeFaltando);
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
      todasTarefas={tarefas}
      colunasDoProjeto={colunasDoProjeto}
      colunasTodas={colunasTodas}
      colunasVersion={colunasVersion}
      onMoverStatus={handleMoverStatus}
      onCriarAtividade={criarAtividade}
      documentos={documentos}
      loadingDocumentos={loadingDocumentos}
      onCriarDocumento={handleCriarDocumento}
      onAbrirDocumento={handleAbrirDocumento}
      notas={notas}
      loadingNotas={loadingDocumentos}
      onCriarNota={criarNota}
      onFixarNota={fixarNota}
      onExcluirNota={excluirNota}
      onAbrirNotasCompleto={handleAbrirNotasCompleto}
      onZerarCronometro={handleZerarCronometro}
      onEditarAtividade={handleAbrirEditar}
      headerArrastavel={variant === "window"}
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
  ) : celebracao || cobranca ? (
    <JarvisNotificationCard tone={celebracao ? "success" : "info"}>{celebracao ?? cobranca}</JarvisNotificationCard>
  ) : null;

  // Rodada 12, item "não quero que ele suma": no modo notificação, empilha
  // o card ACIMA da orbe (não centraliza mais igual ao modo orbe sozinha)
  // — as duas ficam visíveis ao mesmo tempo, no canto inferior direito da
  // janela (380x360 — ver TAMANHOS em desktop/window.ts), dando a
  // impressão de "o Jarvis está falando" em vez do card sozinho cobrindo a
  // orbe.
  // p-6 (24px) garante clareza pro anel de progresso, que vaza ~18px além
  // da caixa de 64px da orbe (ver AssistantOrbRing.tsx) — sem isso o anel
  // tocaria a borda física da janela quando a orbe está encostada no canto
  // (não mais centralizada, como no modo orbe sozinha).
  const alinhamentoWrapper = variant !== "window" ? "" : janelaModo === "notification" ? "items-end justify-end gap-2 p-6" : "items-center justify-center";

  return (
    <>
      <div
        className={variant === "window" ? `fixed inset-0 z-50 flex flex-col ${alinhamentoWrapper}` : "fixed z-50"}
        style={variant === "window" ? undefined : { left: pos.x, top: pos.y }}
      >
        {variant === "window" ? (
          <>
            {/* Card ANTES da orbe no DOM: com justify-end (empacota do fim
                pra trás, no sentido do eixo principal — vertical aqui), o
                primeiro filho fica acima do segundo, ambos colados no
                canto inferior. Não aparece junto do painel aberto (a
                própria div do painel cobre tudo por cima, senão). */}
            {!open && notificacaoJsx}
            <AssistantOrb
              ref={orbRef}
              open={open}
              pulse={pulseGreen ? "green" : null}
              ring={ring}
              pausado={estado === "pausado"}
              onPointerDown={handleOrbPointerDown}
            />
            {/* Painel preenche a janela inteira (já 460x620 — ver
                setJarvisWindowMode("panel")) — fica por cima da orbe
                (mesma âncora, sempre montada) sem precisar escondê-la. */}
            {open && <div className="fixed inset-0 z-50">{painelJsx}</div>}
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

        {variant !== "window" && notificacaoJsx && <div className="absolute bottom-full right-0 mb-2">{notificacaoJsx}</div>}
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

    </>
  );
}
