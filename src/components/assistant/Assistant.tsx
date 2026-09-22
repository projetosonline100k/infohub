import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { addDays, endOfWeek, format, parseISO, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useAuth } from "@/auth/AuthProvider";
import { DocumentEditor } from "@/components/documentos/DocumentEditor";
import { AssistantOrb } from "./AssistantOrb";
import { AssistantPanel } from "./AssistantPanel";
import { AssistantBubble } from "./AssistantBubble";
import type { AssistantAba } from "./AssistantTopNav";
import { useAssistantAtividades, categoriaTarefa, type AssistantTarefa } from "@/hooks/useAssistantAtividades";
import { useAssistantCobranca, type AssistantEstadoPainel } from "@/hooks/useAssistantCobranca";
import { useAssistantProjeto, type AssistantFiltroData } from "@/hooks/useAssistantProjeto";
import { useAssistantDocumentos } from "@/hooks/useAssistantDocumentos";
import { enviarSessaoParaExtensao, enviarTarefaAtualParaExtensao } from "@/lib/extensionBridge";

const ORB_SIZE = 60;
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

// Assistente virtual flutuante — instância única, montada no layout
// autenticado (DashboardLayout). Mini workspace: navegação por abas
// (Hoje/Projeto/Kanban/Docs/Notas), tudo sobre as mesmas fontes de dados já
// existentes (atividades, colunas_atividade, documentos, clientes). Também
// espelha sessão/tarefa atual pra extensão Chrome (ver src/lib/extensionBridge.ts).
export function Assistant() {
  const [open, setOpen] = useState(false);
  const [aba, setAba] = useState<AssistantAba>("hoje");
  const [pos, setPos] = useState<Posicao>(lerPosicaoSalva);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moveu: boolean } | null>(null);
  const latestPosRef = useRef(pos);

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
  const [, forceTick] = useState(0);

  const navigate = useNavigate();
  const { session } = useAuth();
  const { tarefas, atrasadas, loading, iniciarTimer, pausarTimer, concluir, colunasDoProjeto, moverParaStatus, criarAtividade } = useAssistantAtividades();
  const { projetos, loadingProjetos, projetoId, projetoAtual, setProjetoId, filtroDia, setFiltroDia } = useAssistantProjeto();
  const { documentos, notas, loading: loadingDocumentos, refetch: refetchDocumentos, criarDocumento, criarNota } = useAssistantDocumentos(projetoId);

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

  // Aba "Hoje": projeto selecionado (ou todos) + recorte de dia (atrasadas
  // sempre aparecem).
  const tarefasHoje = tarefas.filter(
    (t) => (projetoId === null || t.cliente_id === projetoId) && tarefaBateFiltroDia(t, filtroDia),
  );

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

  // Anel de progresso (item 9): estimativa da tarefa como 100%, ou 25min de
  // referência quando não há estimativa. Fica verde por alguns segundos ao
  // concluir (reaproveita o mesmo `pulseGreen` do brilho da orbe).
  const ring = pulseGreen
    ? { progress: 1, estado: "concluido" as const }
    : (estado === "foco" || estado === "pausado") && tarefaAtual
    ? {
        progress: Math.min(1, elapsedSegundos / ((tarefaAtual.tempo_estimado || 0) * 60 || REFERENCIA_SEM_ESTIMATIVA_SEGUNDOS)),
        estado: estado as "foco" | "pausado",
      }
    : null;

  const cobranca = useAssistantCobranca({
    panelAberto: open,
    estado,
    selecionadaEm,
    pausadoEm,
    focoIniciadoEm: tarefaAtual?.timer_iniciado_em ? new Date(tarefaAtual.timer_iniciado_em).getTime() : null,
    focoAcumuladoAntesDoRunSegundos: tarefaAtual?.timer_decorrido_segundos || 0,
    atrasadasCount: atrasadas.length,
  });

  // Ponte com a extensão Chrome (itens 10-12) — manda sessão + tarefa atual
  // sempre que mudam; a extensão (se instalada) escuta via postMessage na
  // mesma origem (ver src/lib/extensionBridge.ts e chrome-extension/bridge.js).
  useEffect(() => {
    enviarSessaoParaExtensao(session);
  }, [session]);
  useEffect(() => {
    enviarTarefaAtualParaExtensao(currentTaskId);
  }, [currentTaskId]);

  const dispararCelebracao = useCallback(() => {
    setCelebracao("Boa. Uma a menos. ✨");
    setPulseGreen(true);
    setTimeout(() => setPulseGreen(false), 1500);
    setTimeout(() => setCelebracao(null), 3000);
  }, []);

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

  const handleIniciarFoco = useCallback(async () => {
    if (!tarefaAtual) return;
    setSelecionadaEm(null);
    setPausadoEm(null);
    await iniciarTimer(tarefaAtual.id);
  }, [tarefaAtual, iniciarTimer]);

  const handlePausar = useCallback(async () => {
    if (!tarefaAtual) return;
    await pausarTimer(tarefaAtual.id);
    setPausadoEm(Date.now());
  }, [tarefaAtual, pausarTimer]);

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
      await concluir(tarefaAtual.id);
      setCurrentTaskId(null);
      setSelecionadaEm(null);
      setPausadoEm(null);
      dispararCelebracao();
    } catch {
      toast.error("Não foi possível concluir a tarefa");
    }
  }, [tarefaAtual, concluir, setCurrentTaskId, dispararCelebracao]);

  const handleConcluirDireto = useCallback(async (id: string) => {
    try {
      await concluir(id);
      if (id === currentTaskId) setCurrentTaskId(null);
      dispararCelebracao();
    } catch {
      toast.error("Não foi possível concluir a tarefa");
    }
  }, [concluir, currentTaskId, setCurrentTaskId, dispararCelebracao]);

  const handleVerTodas = useCallback(() => {
    setOpen(false);
    navigate("/atividades");
  }, [navigate]);

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
      setDocumentoAbertoId(doc.id);
    } catch {
      toast.error("Não foi possível criar o documento");
    }
  }, [criarDocumento]);

  // Arraste da orbe — listeners imperativos em `window` enquanto dura (mesmo
  // padrão do connectionDrag em MindMapEditor.tsx), distinguindo clique de
  // arraste pela distância percorrida.
  const handleOrbPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moveu: false };
    setDragging(true);
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;

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
  }, [dragging]);

  // Mantém a orbe dentro da viewport se a janela for redimensionada depois
  // de uma posição já salva.
  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p.x, p.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <>
      <div className="fixed z-50" style={{ left: pos.x, top: pos.y }}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <AssistantOrb open={open} pulse={pulseGreen ? "green" : null} ring={ring} onPointerDown={handleOrbPointerDown} />
          </PopoverAnchor>
          <PopoverContent
            side="top"
            align="end"
            sideOffset={16}
            collisionPadding={16}
            className="w-[360px] max-w-[calc(100vw-2rem)] border-none bg-transparent p-0 shadow-none"
          >
            <AssistantPanel
              onClose={() => setOpen(false)}
              aba={aba}
              onMudarAba={setAba}
              estado={estado}
              projetoNome={projetoAtual?.nome ?? null}
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
              onMoverStatus={handleMoverStatus}
              onCriarAtividade={criarAtividade}
              documentos={documentos}
              loadingDocumentos={loadingDocumentos}
              onCriarDocumento={handleCriarDocumento}
              onAbrirDocumento={setDocumentoAbertoId}
              notas={notas}
              loadingNotas={loadingDocumentos}
              onCriarNota={criarNota}
            />
          </PopoverContent>
        </Popover>

        {(celebracao || cobranca) && <AssistantBubble message={celebracao ?? cobranca ?? ""} tone={celebracao ? "success" : "info"} />}
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
    </>
  );
}
