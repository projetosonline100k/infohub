import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  FolderOpen,
  Lightbulb,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn, formatarTempo as formatarMinutos } from "@/lib/utils";
import {
  categoriaTarefa,
  type AssistantCategoria,
  type AssistantTarefa,
  type ColunaAtividade,
  type NovaAtividadeInput,
} from "@/hooks/useAssistantAtividades";
import type { AssistantEstadoPainel } from "@/hooks/useAssistantCobranca";
import type { AssistantProjetoOpcao, AssistantFiltroData, AssistantFiltroDia } from "@/hooks/useAssistantProjeto";
import type { AtividadeDoPlano, PlanoDiario } from "@/lib/productivity/DailyPlanService";
import { capitalizar, formatarTempoFoco, rotuloPrazo } from "../format";
import { AssistantFocoDeHojeSection } from "./AssistantFocoDeHojeSection";
import type { FiltroResponsavel } from "@/lib/atividades/filtroResponsavel";

const OPCOES_DIA: { id: AssistantFiltroDia; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "amanha", label: "Amanhã" },
  { id: "semana", label: "Esta semana" },
  { id: "data", label: "Data específica" },
];

const TODOS_PROJETOS = "__todos__";
const SEM_PROJETO = "Sem projeto";

interface AssistantHojeTabProps {
  estado: AssistantEstadoPainel;
  // Item 4, rodada 4: saudação + filtro de projeto opcional da Home global.
  nomeUsuario: string;
  projetos: AssistantProjetoOpcao[];
  filtroDiaLabel: string;
  tarefas: AssistantTarefa[];
  tarefaAtual: AssistantTarefa | null;
  recomendacao: AssistantTarefa | null;
  elapsedSegundos: number;
  onSelecionarTarefa: (id: string) => void;
  onConcluirDireto: (id: string) => void;
  onVoltar: () => void;
  onIniciarFoco: (duracaoMin: number | null) => void;
  onPausar: () => void;
  onRetomar: () => void;
  onConcluir: () => void;
  onTrocarTarefa: () => void;
  onVerTodas: () => void;
  onQueFacoAgora: () => void;
  onComecarRecomendacao: () => void;
  // Item 4: controles da atividade selecionada/em foco/pausada.
  onZerarCronometro: () => void;
  onEditarAtividade: () => void;
  // Arrastar pra reordenar tarefas/grupos de projeto na Home — recebe a
  // sequência final de ids já calculada por quem chama.
  onReordenarPorIds: (ids: string[]) => void;
  // Criação rápida de atividade no topo da Home (mesma infra do Kanban —
  // ver AdicionarAtividadeHoje).
  colunasDoProjeto: (clienteId: string | null) => Promise<ColunaAtividade[]>;
  onCriarAtividade: (input: NovaAtividadeInput) => Promise<unknown>;
  // Projeto atual "de verdade" (o mesmo das abas Kanban/Docs/Notas) — a
  // criação rápida nasce nele, NÃO no filtro "Todos os projetos" da Home
  // (que é só de visualização e sempre começa vazio). Sem isto, uma tarefa
  // criada aqui com um projeto ativo em outra aba nascia "Sem projeto" e
  // não aparecia no Kanban daquele cliente.
  projetoIdAtual: string | null;
  // "Dia" morava numa aba "Projeto" isolada que deixou de existir (item 4
  // do pedido) — só tinha essa única outra opção de lugar pra ir, já que é
  // o filtro que decide quais tarefas aparecem bem aqui embaixo.
  filtroDia: AssistantFiltroData;
  onMudarFiltroDia: (filtro: AssistantFiltroData) => void;
  // "Foco de hoje" (Começar o dia) — null quando não existe plano pra hoje;
  // a seção inteira some nesse caso (o convite pra planejar já vem pelo
  // cartão "Bom dia", não duplica aqui).
  planoDoDia: PlanoDiario | null;
  atividadesDoPlano: AtividadeDoPlano[];
  prioridadeUmDoPlano: AtividadeDoPlano | null;
  onAbrirComecarDia: () => void;
  filtroResponsavel: FiltroResponsavel;
}

const SEM_PROJETO_VALOR = "__sem_projeto__";

// Item 2 do pedido: criar uma atividade pra hoje sem sair da Home nem abrir
// o Kanban. Usa a MESMA função de criação que o Kanban e o formulário
// completo do Jarvis (useAssistantAtividades.criarAtividade ->
// src/lib/atividades/criarAtividade.ts) — não existe uma segunda fonte de
// dados, só uma UI de atalho em cima da que já existe.
function AdicionarAtividadeHoje({
  projetos,
  projetoIdPadrao,
  colunasDoProjeto,
  onCriarAtividade,
}: {
  projetos: AssistantProjetoOpcao[];
  projetoIdPadrao: string | null;
  colunasDoProjeto: (clienteId: string | null) => Promise<ColunaAtividade[]>;
  onCriarAtividade: (input: NovaAtividadeInput) => Promise<unknown>;
}) {
  const [titulo, setTitulo] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(projetoIdPadrao);
  const [minutos, setMinutos] = useState("25");
  const [criando, setCriando] = useState(false);

  // Segue o filtro de projeto da Home (item "se não houver projeto, criar
  // como pessoal") — só como valor inicial; a pessoa pode trocar antes de
  // criar sem afetar o filtro da lista.
  useEffect(() => {
    setClienteId(projetoIdPadrao);
  }, [projetoIdPadrao]);

  const criar = async () => {
    const valor = titulo.trim();
    if (!valor || criando) return;
    setCriando(true);
    try {
      // Status inicial = primeira coluna que não é de conclusão (backlog/"a
      // fazer" na prática) — nunca cai direto numa coluna de concluídas.
      const cols = await colunasDoProjeto(clienteId);
      const coluna = cols.find((c) => !c.eh_conclusao) ?? cols[0];
      await onCriarAtividade({
        titulo: valor,
        clienteId,
        dataAtividade: format(new Date(), "yyyy-MM-dd"),
        tempoEstimado: minutos.trim() ? Number(minutos) : null,
        prioridade: "media",
        statusKey: coluna?.status_key ?? "backlog",
      });
      toast.success("Atividade adicionada");
      setTitulo("");
    } catch {
      toast.error("Não foi possível adicionar a atividade agora. Tente de novo.");
    } finally {
      setCriando(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Adicionar nova atividade</p>
      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-2.5">
        <Input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void criar();
          }}
          placeholder="Ex: Gravar 3 criativos"
          className="h-9 bg-background text-sm"
          disabled={criando}
        />
        <div className="flex items-center gap-1.5">
          <Select value={clienteId ?? SEM_PROJETO_VALOR} onValueChange={(v) => setClienteId(v === SEM_PROJETO_VALOR ? null : v)}>
            <SelectTrigger className="h-9 flex-1 gap-1.5 bg-background text-xs" disabled={criando}>
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_PROJETO_VALOR}>Sem projeto</SelectItem>
              {projetos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative shrink-0">
            <Clock className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="number"
              min={1}
              value={minutos}
              onChange={(e) => setMinutos(e.target.value)}
              disabled={criando}
              className="h-9 w-24 bg-background pl-7 text-xs"
              aria-label="Estimativa em minutos"
              title={Number(minutos) > 0 ? `= ${formatarMinutos(Number(minutos))}` : undefined}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 gap-1 px-3 text-xs"
            disabled={!titulo.trim() || criando}
            onClick={criar}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}

const TITULO_SECAO: Record<AssistantCategoria, string> = {
  atrasada: "Atrasadas",
  hoje: "Hoje",
  proxima: "Próximas",
};

const ICONE_SECAO: Record<AssistantCategoria, typeof AlertTriangle> = {
  atrasada: AlertTriangle,
  hoje: Calendar,
  proxima: CalendarClock,
};

// Círculo de "concluir" colorido pela categoria (vermelho pra atrasada, azul
// pra hoje) — substitui o Checkbox padrão, que não dava pra tingir por
// categoria sem sobrescrever o componente inteiro.
function CirculoConcluir({ categoria, titulo, onConcluir }: { categoria: AssistantCategoria; titulo: string; onConcluir: () => void }) {
  const cor = categoria === "atrasada" ? "border-destructive" : categoria === "hoje" ? "border-primary" : "border-muted-foreground/40";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onConcluir();
      }}
      aria-label={`Concluir "${titulo}"`}
      className={cn("h-5 w-5 shrink-0 rounded-full border-2 bg-background transition-colors hover:bg-muted", cor)}
    />
  );
}

function TarefaResumoCard({
  tarefa,
  categoria,
  nomeProjeto,
  onSelecionar,
  onConcluir,
  dragRef,
  dragProps,
  dragHandleProps,
  arrastando,
  mostrarResponsavel,
}: {
  tarefa: AssistantTarefa;
  categoria: AssistantCategoria;
  nomeProjeto: string;
  onSelecionar: () => void;
  onConcluir: () => void;
  // Vem do Draggable de quem chama (arrastar pra reordenar) — opcionais
  // porque nem todo lugar que usa este card precisa disso.
  dragRef?: (el: HTMLElement | null) => void;
  dragProps?: Record<string, unknown>;
  dragHandleProps?: Record<string, unknown> | null;
  arrastando?: boolean;
  mostrarResponsavel?: boolean;
}) {
  const prazo = categoria === "atrasada" ? rotuloPrazo(tarefa.data_vencimento) : null;
  return (
    <div
      ref={dragRef}
      {...dragProps}
      {...dragHandleProps}
      role="button"
      tabIndex={0}
      onClick={onSelecionar}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelecionar();
      }}
      className={cn(
        "flex items-center gap-2.5 rounded-lg bg-background px-1.5 py-2 text-left transition-colors hover:bg-muted/60",
        arrastando && "shadow-lg ring-1 ring-primary/40"
      )}
    >
      <CirculoConcluir categoria={categoria} titulo={tarefa.titulo} onConcluir={onConcluir} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground" title={tarefa.titulo}>{tarefa.titulo}</p>
        <p className="truncate text-xs text-muted-foreground">
          {mostrarResponsavel ? `Responsável: ${tarefa.responsavel_nome || "Sem responsável"}` : nomeProjeto}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {prazo ? (
          <span className="text-xs font-medium text-destructive">{capitalizar(prazo.texto)}</span>
        ) : tarefa.tempo_estimado ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {tarefa.tempo_estimado} min
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelecionar();
        }}
        aria-label="Mais opções"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Item 4: "Zerar cronômetro" (com confirmação) + "Editar" — aparecem nos
// três estados com tarefa atual (selecionada/foco/pausado).
function AcoesAtividade({ onZerar, onEditar }: { onZerar: () => void; onEditar: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setConfirmando(true)}
        >
          <RotateCcw className="h-3 w-3" />
          Zerar cronômetro
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onEditar}
        >
          <Pencil className="h-3 w-3" />
          Editar
        </Button>
      </div>
      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zerar o cronômetro?</AlertDialogTitle>
            <AlertDialogDescription>
              O tempo decorrido volta a 0. A tarefa continua exatamente onde está — só o cronômetro é zerado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onZerar}>Zerar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BotaoVoltar({ onVoltar }: { onVoltar: () => void }) {
  return (
    <button
      type="button"
      onClick={onVoltar}
      className="-ml-1 -mt-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      Voltar
    </button>
  );
}

// Aba "Hoje" — lista de tarefas reais (item 1) + recomendação (item 6) +
// tarefa selecionada/foco/pausado (itens 2-4), exatamente o comportamento
// que o Assistant já tinha antes da navegação por abas existir.
export function AssistantHojeTab({
  estado,
  nomeUsuario,
  projetos,
  filtroDiaLabel,
  tarefas,
  tarefaAtual,
  recomendacao,
  elapsedSegundos,
  onSelecionarTarefa,
  onConcluirDireto,
  onVoltar,
  onIniciarFoco,
  onPausar,
  onRetomar,
  onConcluir,
  onTrocarTarefa,
  onVerTodas,
  onQueFacoAgora,
  onComecarRecomendacao,
  onZerarCronometro,
  onEditarAtividade,
  onReordenarPorIds,
  colunasDoProjeto,
  onCriarAtividade,
  projetoIdAtual,
  filtroDia,
  onMudarFiltroDia,
  planoDoDia,
  atividadesDoPlano,
  prioridadeUmDoPlano,
  onAbrirComecarDia,
  filtroResponsavel,
}: AssistantHojeTabProps) {
  const [mostrarFiltroDia, setMostrarFiltroDia] = useState(false);
  // Filtro de projeto da Home (item 4, rodada 4) — local, não persiste e é
  // independente do "projeto atual" usado pelas abas Projeto/Kanban/Docs/
  // Notas: a Home sempre nasce mostrando "Todos os projetos".
  const [filtroProjetoId, setFiltroProjetoId] = useState<string | null>(null);

  const nomeDoProjeto = (clienteId: string | null) => (clienteId ? projetos.find((p) => p.id === clienteId)?.nome ?? SEM_PROJETO : SEM_PROJETO);

  // "Todos os projetos": sub-agrupa cada categoria por projeto (senão fica
  // tudo junto visualmente, difícil de separar um cliente do outro). Com um
  // projeto específico escolhido, a lista fica plana (repetir o nome seria
  // redundante). A ordem dos grupos segue a ordem em que aparecem em `itens`
  // (que já vem ordenada por `ordem` — ver compararTarefas), então arrastar
  // uma tarefa pra cima de tudo já bulda o grupo dela pra frente também.
  const secoes = useMemo(() => {
    const filtradas = filtroProjetoId ? tarefas.filter((t) => t.cliente_id === filtroProjetoId) : tarefas;
    const grupos: Record<AssistantCategoria, AssistantTarefa[]> = { atrasada: [], hoje: [], proxima: [] };
    filtradas.forEach((t) => grupos[categoriaTarefa(t)].push(t));
    return (["atrasada", "hoje", "proxima"] as AssistantCategoria[])
      .map((categoria) => {
        const itens = grupos[categoria];
        if (filtroProjetoId || itens.length === 0) {
          return { categoria, itens, subgrupos: null as { nome: string; itens: AssistantTarefa[] }[] | null };
        }
        const porProjeto = new Map<string, AssistantTarefa[]>();
        itens.forEach((t) => {
          const nome = nomeDoProjeto(t.cliente_id);
          if (!porProjeto.has(nome)) porProjeto.set(nome, []);
          porProjeto.get(nome)?.push(t);
        });
        return { categoria, itens, subgrupos: Array.from(porProjeto.entries()).map(([nome, itens]) => ({ nome, itens })) };
      })
      .filter((s) => s.itens.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefas, filtroProjetoId, projetos]);

  // Move um grupo de projeto inteiro pra cima/baixo dentro da categoria —
  // "mudar a ordem dos projetos" sem precisar de um campo novo no banco:
  // achata todos os grupos da categoria de novo, na sequência com os dois
  // grupos trocados, e regrava a `ordem` de todo mundo (cada grupo mantém
  // sua ordem interna).
  const moverGrupo = (categoria: AssistantCategoria, subgrupos: { nome: string; itens: AssistantTarefa[] }[], indice: number, direcao: -1 | 1) => {
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= subgrupos.length) return;
    const reordenados = [...subgrupos];
    [reordenados[indice], reordenados[alvo]] = [reordenados[alvo], reordenados[indice]];
    onReordenarPorIds(reordenados.flatMap((g) => g.itens.map((t) => t.id)));
  };

  // Arrastar pra reordenar (item "consigo mudar a ordem") — só dentro do
  // MESMO grupo (categoria + projeto, se sub-agrupado); arrastar entre
  // categorias mudaria a data/prazo da tarefa, o que esta ação não faz.
  const handleDragEndTarefas = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || destination.droppableId !== source.droppableId || destination.index === source.index) return;
    const [categoria, grupoNome] = source.droppableId.split("::");
    const secao = secoes.find((s) => s.categoria === categoria);
    if (!secao) return;
    const lista = grupoNome ? secao.subgrupos?.find((g) => g.nome === grupoNome)?.itens : secao.itens;
    if (!lista) return;
    const reordenados = [...lista];
    const [removida] = reordenados.splice(source.index, 1);
    reordenados.splice(destination.index, 0, removida);
    onReordenarPorIds(reordenados.map((t) => t.id));
  };

  const prazoAtual = tarefaAtual ? rotuloPrazo(tarefaAtual.data_vencimento) : null;
  const prazoRecomendacao = recomendacao ? rotuloPrazo(recomendacao.data_vencimento) : null;

  // Duração escolhida antes de iniciar o foco — pré-preenchida com a
  // estimativa da tarefa (se já tiver), editável. Some quando "atual" muda
  // pra outra tarefa (não quero o valor digitado antes vazando pra tarefa
  // errada).
  const [duracaoMin, setDuracaoMin] = useState("");
  useEffect(() => {
    setDuracaoMin(tarefaAtual?.tempo_estimado ? String(tarefaAtual.tempo_estimado) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefaAtual?.id]);

  const cronoFoco = formatarTempoFoco(elapsedSegundos, tarefaAtual?.tempo_estimado);

  if (estado === "recomendacao" && recomendacao) {
    return (
      <div className="space-y-4">
        <BotaoVoltar onVoltar={onVoltar} />
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Eu começaria por:</p>
          <p className="text-base font-medium">{recomendacao.titulo}</p>
          {prazoRecomendacao && (
            <p className={cn("text-sm", prazoRecomendacao.atrasada ? "text-destructive" : "text-muted-foreground")}>
              {prazoRecomendacao.atrasada ? `⚠️ Está ${prazoRecomendacao.texto}.` : `${capitalizar(prazoRecomendacao.texto)}.`}
            </p>
          )}
        </div>
        <Button type="button" className="w-full" onClick={onComecarRecomendacao}>
          Começar agora
        </Button>
      </div>
    );
  }

  if (estado === "selecionada" && tarefaAtual) {
    return (
      <div className="space-y-4">
        <BotaoVoltar onVoltar={onVoltar} />
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tarefa atual</p>
          <p className="text-base font-medium">{tarefaAtual.titulo}</p>
          {prazoAtual && (
            <p className={cn("text-sm", prazoAtual.atrasada ? "text-destructive" : "text-muted-foreground")}>
              {prazoAtual.atrasada ? `⚠️ ${capitalizar(prazoAtual.texto)}` : capitalizar(prazoAtual.texto)}
            </p>
          )}
          <AcoesAtividade onZerar={onZerarCronometro} onEditar={onEditarAtividade} />
          <div className="space-y-1 pt-1">
            <Label htmlFor="assistant-duracao-foco" className="text-xs">Duração (min)</Label>
            <Input
              id="assistant-duracao-foco"
              type="number"
              min={1}
              value={duracaoMin}
              onChange={(e) => setDuracaoMin(e.target.value)}
              placeholder="Sem tempo definido"
              className="h-8 w-28"
            />
            {Number(duracaoMin) > 0 && <p className="text-xs text-muted-foreground">= {formatarMinutos(Number(duracaoMin))}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1 gap-1.5"
            onClick={() => onIniciarFoco(duracaoMin ? Number(duracaoMin) : null)}
          >
            <Play className="h-3.5 w-3.5" />
            Iniciar foco
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={onTrocarTarefa}>
            Trocar tarefa
          </Button>
        </div>
      </div>
    );
  }

  if (estado === "foco" && tarefaAtual) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-500">🔥 Foco</p>
          <p className="text-base font-medium">{tarefaAtual.titulo}</p>
          <p className={cn("pt-1 text-2xl font-bold tabular-nums", cronoFoco.estourado && "text-destructive")}>{cronoFoco.texto}</p>
          {cronoFoco.estourado && tarefaAtual.tempo_estimado && (
            <p className="text-xs text-destructive">
              Estimado: {tarefaAtual.tempo_estimado}min · Executado: {Math.round(elapsedSegundos / 60)}min · Excedido: +
              {Math.round(elapsedSegundos / 60) - tarefaAtual.tempo_estimado}min
            </p>
          )}
          <AcoesAtividade onZerar={onZerarCronometro} onEditar={onEditarAtividade} />
        </div>
        <div className="flex gap-2">
          <Button type="button" className="flex-1 gap-1.5" onClick={onConcluir}>
            <Check className="h-3.5 w-3.5" />
            Concluir
          </Button>
          <Button type="button" variant="outline" className="flex-1 gap-1.5" onClick={onPausar}>
            <Pause className="h-3.5 w-3.5" />
            Pausar
          </Button>
        </div>
      </div>
    );
  }

  if (estado === "pausado" && tarefaAtual) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Foco pausado</p>
          <p className="text-base font-medium">{tarefaAtual.titulo}</p>
          <p className={cn("pt-1 text-2xl font-bold tabular-nums", cronoFoco.estourado ? "text-destructive" : "text-muted-foreground")}>{cronoFoco.texto}</p>
          {cronoFoco.estourado && tarefaAtual.tempo_estimado && (
            <p className="text-xs text-destructive">
              Estimado: {tarefaAtual.tempo_estimado}min · Executado: {Math.round(elapsedSegundos / 60)}min · Excedido: +
              {Math.round(elapsedSegundos / 60) - tarefaAtual.tempo_estimado}min
            </p>
          )}
          <AcoesAtividade onZerar={onZerarCronometro} onEditar={onEditarAtividade} />
        </div>
        <div className="flex gap-2">
          <Button type="button" className="flex-1 gap-1.5" onClick={onRetomar}>
            <Play className="h-3.5 w-3.5" />
            Retomar
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={onTrocarTarefa}>
            Trocar tarefa
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-base font-medium">Olá{nomeUsuario ? `, ${nomeUsuario}` : ""} 👋</p>
        {filtroDiaLabel && (
          <button
            type="button"
            onClick={() => setMostrarFiltroDia((v) => !v)}
            className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {filtroDiaLabel}
          </button>
        )}
        {mostrarFiltroDia && (
          <div className="space-y-1.5 pb-0.5 pt-1">
            <div className="flex flex-wrap gap-1">
              {OPCOES_DIA.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => onMudarFiltroDia({ tipo: op.id, data: op.id === "data" ? filtroDia.data : null })}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                    filtroDia.tipo === op.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                  )}
                >
                  {op.label}
                </button>
              ))}
            </div>
            {filtroDia.tipo === "data" && (
              <Input
                type="date"
                value={filtroDia.data ?? ""}
                onChange={(e) => onMudarFiltroDia({ tipo: "data", data: e.target.value })}
                className="h-7 w-40 text-xs"
              />
            )}
          </div>
        )}
        {projetos.length > 0 && (
          <Select value={filtroProjetoId ?? TODOS_PROJETOS} onValueChange={(v) => setFiltroProjetoId(v === TODOS_PROJETOS ? null : v)}>
            <SelectTrigger className="h-9 w-full justify-between border border-border bg-background px-3 text-sm font-normal text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_PROJETOS}>Todos os projetos</SelectItem>
              {projetos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <AssistantFocoDeHojeSection
        plano={planoDoDia}
        atividades={atividadesDoPlano}
        prioridadeUm={prioridadeUmDoPlano}
        onAbrirComecarDia={onAbrirComecarDia}
        onSelecionarTarefa={onSelecionarTarefa}
        onConcluir={onConcluirDireto}
      />

      <AdicionarAtividadeHoje
        projetos={projetos}
        projetoIdPadrao={projetoIdAtual}
        colunasDoProjeto={colunasDoProjeto}
        onCriarAtividade={onCriarAtividade}
      />

      {secoes.length > 0 ? (
        <DragDropContext onDragEnd={handleDragEndTarefas}>
          <div className="space-y-4">
            {secoes.map(({ categoria, itens, subgrupos }) => {
              const Icone = ICONE_SECAO[categoria];
              const cor = categoria === "atrasada" ? "text-destructive" : categoria === "hoje" ? "text-primary" : "text-muted-foreground";
              return (
                <div key={categoria} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className={cn("flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", cor)}>
                      <Icone className="h-3.5 w-3.5" />
                      {TITULO_SECAO[categoria]}
                    </p>
                    <button
                      type="button"
                      onClick={onVerTodas}
                      className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Ver todas ({itens.length})
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>

                  {subgrupos ? (
                    <div className="space-y-2.5">
                      {subgrupos.map((grupo, indice) => (
                        <div key={grupo.nome} className="space-y-0.5">
                          <div className="flex items-center gap-1 px-1.5">
                            <p className="flex-1 truncate text-[11px] font-medium text-foreground/70">{grupo.nome}</p>
                            <button
                              type="button"
                              disabled={indice === 0}
                              onClick={() => moverGrupo(categoria, subgrupos, indice, -1)}
                              aria-label={`Mover "${grupo.nome}" pra cima`}
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={indice === subgrupos.length - 1}
                              onClick={() => moverGrupo(categoria, subgrupos, indice, 1)}
                              aria-label={`Mover "${grupo.nome}" pra baixo`}
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </div>
                          <Droppable droppableId={`${categoria}::${grupo.nome}`}>
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.droppableProps} className="divide-y divide-border/60">
                                {grupo.itens.map((tarefa, index) => (
                                  <Draggable key={tarefa.id} draggableId={tarefa.id} index={index}>
                                    {(providedDrag, snapshot) => (
                                      <TarefaResumoCard
                                        tarefa={tarefa}
                                        categoria={categoria}
                                        nomeProjeto={grupo.nome}
                                        onSelecionar={() => onSelecionarTarefa(tarefa.id)}
                                        onConcluir={() => onConcluirDireto(tarefa.id)}
                                        dragRef={providedDrag.innerRef}
                                        dragProps={providedDrag.draggableProps}
                                        dragHandleProps={providedDrag.dragHandleProps}
                                        arrastando={snapshot.isDragging}
                                        mostrarResponsavel={filtroResponsavel === "outras"}
                                      />
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Droppable droppableId={categoria}>
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="divide-y divide-border/60">
                          {itens.map((tarefa, index) => (
                            <Draggable key={tarefa.id} draggableId={tarefa.id} index={index}>
                              {(providedDrag, snapshot) => (
                                <TarefaResumoCard
                                  tarefa={tarefa}
                                  categoria={categoria}
                                  nomeProjeto={nomeDoProjeto(tarefa.cliente_id)}
                                  onSelecionar={() => onSelecionarTarefa(tarefa.id)}
                                  onConcluir={() => onConcluirDireto(tarefa.id)}
                                  mostrarResponsavel={filtroResponsavel === "outras"}
                                  dragRef={providedDrag.innerRef}
                                  dragProps={providedDrag.draggableProps}
                                  dragHandleProps={providedDrag.dragHandleProps}
                                  arrastando={snapshot.isDragging}
                                />
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  )}
                </div>
              );
            })}
          </div>
        </DragDropContext>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente por aqui. 🎉</p>
      )}

      <Button type="button" variant="secondary" className="w-full gap-2" onClick={onQueFacoAgora} disabled={tarefas.length === 0}>
        <Lightbulb className="h-4 w-4" />
        O que faço agora?
      </Button>
    </div>
  );
}
