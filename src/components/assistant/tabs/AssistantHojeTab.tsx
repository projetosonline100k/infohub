import { useMemo } from "react";
import { Check, ChevronLeft, Lightbulb, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatarTempo as formatarMinutos } from "@/lib/utils";
import { categoriaTarefa, type AssistantCategoria, type AssistantTarefa } from "@/hooks/useAssistantAtividades";
import type { AssistantEstadoPainel } from "@/hooks/useAssistantCobranca";
import { capitalizar, formatarCronometro, rotuloPrazo } from "../format";

interface AssistantHojeTabProps {
  estado: AssistantEstadoPainel;
  projetoNome: string | null;
  filtroDiaLabel: string;
  tarefas: AssistantTarefa[];
  tarefaAtual: AssistantTarefa | null;
  recomendacao: AssistantTarefa | null;
  elapsedSegundos: number;
  onSelecionarTarefa: (id: string) => void;
  onConcluirDireto: (id: string) => void;
  onVoltar: () => void;
  onIniciarFoco: () => void;
  onPausar: () => void;
  onRetomar: () => void;
  onConcluir: () => void;
  onTrocarTarefa: () => void;
  onVerTodas: () => void;
  onQueFacoAgora: () => void;
  onComecarRecomendacao: () => void;
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
  projetoNome,
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
}: AssistantHojeTabProps) {
  const secoes = useMemo(() => {
    const grupos: Record<AssistantCategoria, AssistantTarefa[]> = { atrasada: [], hoje: [], proxima: [] };
    tarefas.forEach((t) => grupos[categoriaTarefa(t)].push(t));
    return (["atrasada", "hoje", "proxima"] as AssistantCategoria[])
      .map((categoria) => ({ categoria, itens: grupos[categoria] }))
      .filter((s) => s.itens.length > 0);
  }, [tarefas]);

  const prazoAtual = tarefaAtual ? rotuloPrazo(tarefaAtual.data_vencimento) : null;
  const prazoRecomendacao = recomendacao ? rotuloPrazo(recomendacao.data_vencimento) : null;

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
          {!!tarefaAtual.tempo_estimado && (
            <p className="text-sm text-muted-foreground">Estimativa: {formatarMinutos(tarefaAtual.tempo_estimado)}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" className="flex-1 gap-1.5" onClick={onIniciarFoco}>
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
          <p className="pt-1 text-2xl font-bold tabular-nums">{formatarCronometro(elapsedSegundos)}</p>
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
          <p className="pt-1 text-2xl font-bold tabular-nums text-muted-foreground">{formatarCronometro(elapsedSegundos)}</p>
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
      <div className="space-y-1">
        {(projetoNome || filtroDiaLabel) && (
          <p className="text-xs text-muted-foreground">
            {projetoNome && <span className="font-medium text-foreground">{projetoNome}</span>}
            {projetoNome && filtroDiaLabel && " · "}
            {filtroDiaLabel}
          </p>
        )}
        <p className="text-base font-medium">Olá 👋</p>
        <p className="text-sm text-muted-foreground">O que vamos fazer agora?</p>
      </div>

      {secoes.length > 0 ? (
        <div className="space-y-3">
          {secoes.map(({ categoria, itens }) => (
            <div key={categoria} className="space-y-1.5">
              <p className={cn("text-xs font-semibold uppercase tracking-wide", categoria === "atrasada" ? "text-destructive" : "text-muted-foreground")}>
                {TITULO_SECAO[categoria]}
              </p>
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
