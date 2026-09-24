import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, Lightbulb, Pause, Pencil, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { categoriaTarefa, type AssistantCategoria, type AssistantTarefa } from "@/hooks/useAssistantAtividades";
import type { AssistantEstadoPainel } from "@/hooks/useAssistantCobranca";
import type { AssistantProjetoOpcao } from "@/hooks/useAssistantProjeto";
import { capitalizar, formatarTempoFoco, rotuloPrazo } from "../format";

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
}

const TITULO_SECAO: Record<AssistantCategoria, string> = {
  atrasada: "⚠️ Atrasadas",
  hoje: "Hoje",
  proxima: "Próximas",
};

function ListaTarefa({ tarefa, onSelecionar, onConcluir }: { tarefa: AssistantTarefa; onSelecionar: () => void; onConcluir: () => void }) {
  return (
    <li className="flex items-center gap-2">
      <Checkbox checked={false} onCheckedChange={onConcluir} aria-label={`Concluir "${tarefa.titulo}"`} />
      <button
        type="button"
        onClick={onSelecionar}
        className="flex-1 truncate text-left text-sm text-foreground hover:text-primary"
        title={tarefa.titulo}
      >
        {tarefa.titulo}
      </button>
    </li>
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
}: AssistantHojeTabProps) {
  // Filtro de projeto da Home (item 4, rodada 4) — local, não persiste e é
  // independente do "projeto atual" usado pelas abas Projeto/Kanban/Docs/
  // Notas: a Home sempre nasce mostrando "Todos os projetos".
  const [filtroProjetoId, setFiltroProjetoId] = useState<string | null>(null);

  const nomeDoProjeto = (clienteId: string | null) => (clienteId ? projetos.find((p) => p.id === clienteId)?.nome ?? SEM_PROJETO : SEM_PROJETO);

  const secoes = useMemo(() => {
    const filtradas = filtroProjetoId ? tarefas.filter((t) => t.cliente_id === filtroProjetoId) : tarefas;
    const grupos: Record<AssistantCategoria, AssistantTarefa[]> = { atrasada: [], hoje: [], proxima: [] };
    filtradas.forEach((t) => grupos[categoriaTarefa(t)].push(t));
    return (["atrasada", "hoje", "proxima"] as AssistantCategoria[])
      .map((categoria) => {
        const itens = grupos[categoria];
        // "Todos os projetos": sub-agrupa cada seção por projeto (exemplo do
        // pedido — Core / Maria Souto / ...). Com um projeto específico
        // escolhido, a lista fica plana (repetir o nome seria redundante).
        if (filtroProjetoId || itens.length === 0) return { categoria, itens, subgrupos: null as { nome: string; itens: AssistantTarefa[] }[] | null };
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
        {filtroDiaLabel && <p className="text-xs text-muted-foreground">{filtroDiaLabel}</p>}
        {projetos.length > 0 && (
          <Select value={filtroProjetoId ?? TODOS_PROJETOS} onValueChange={(v) => setFiltroProjetoId(v === TODOS_PROJETOS ? null : v)}>
            <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent px-0 text-xs font-medium text-muted-foreground shadow-none hover:text-foreground focus:ring-0">
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
        <p className="text-sm text-muted-foreground">O que vamos fazer agora?</p>
      </div>

      {secoes.length > 0 ? (
        <div className="space-y-3">
          {secoes.map(({ categoria, itens, subgrupos }) => (
            <div key={categoria} className="space-y-1.5">
              <p className={cn("text-xs font-semibold uppercase tracking-wide", categoria === "atrasada" ? "text-destructive" : "text-muted-foreground")}>
                {TITULO_SECAO[categoria]}
              </p>
              {subgrupos ? (
                <div className="space-y-2">
                  {subgrupos.map((grupo) => (
                    <div key={grupo.nome} className="space-y-1">
                      <p className="text-[11px] font-medium text-foreground/70">{grupo.nome}</p>
                      <ul className="space-y-1.5">
                        {grupo.itens.map((tarefa) => (
                          <ListaTarefa
                            key={tarefa.id}
                            tarefa={tarefa}
                            onSelecionar={() => onSelecionarTarefa(tarefa.id)}
                            onConcluir={() => onConcluirDireto(tarefa.id)}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {itens.map((tarefa) => (
                    <ListaTarefa
                      key={tarefa.id}
                      tarefa={tarefa}
                      onSelecionar={() => onSelecionarTarefa(tarefa.id)}
                      onConcluir={() => onConcluirDireto(tarefa.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente por aqui. 🎉</p>
      )}

      <div className="space-y-2">
        <Button type="button" variant="secondary" className="w-full gap-2" onClick={onQueFacoAgora} disabled={tarefas.length === 0}>
          <Lightbulb className="h-4 w-4" />
          O que faço agora?
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={onVerTodas}>
          Ver todas
        </Button>
      </div>
    </div>
  );
}
