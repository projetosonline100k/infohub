import { Sparkles, X } from "lucide-react";
import type { AssistantTarefa, ColunaAtividade, NovaAtividadeInput } from "@/hooks/useAssistantAtividades";
import type { AssistantEstadoPainel } from "@/hooks/useAssistantCobranca";
import type { AssistantProjetoOpcao, AssistantFiltroData } from "@/hooks/useAssistantProjeto";
import type { AssistantDocumento } from "@/hooks/useAssistantDocumentos";
import { AssistantTopNav, type AssistantAba } from "./AssistantTopNav";
import { AssistantFocusBanner } from "./AssistantFocusBanner";
import { formatarCronometro } from "./format";
import { AssistantHojeTab } from "./tabs/AssistantHojeTab";
import { AssistantProjetoTab } from "./tabs/AssistantProjetoTab";
import { AssistantKanbanTab } from "./tabs/AssistantKanbanTab";
import { AssistantDocsTab } from "./tabs/AssistantDocsTab";
import { AssistantNotasTab } from "./tabs/AssistantNotasTab";

interface AssistantPanelProps {
  onClose: () => void;
  aba: AssistantAba;
  onMudarAba: (aba: AssistantAba) => void;

  // Hoje / tarefa atual (preservado da versão anterior)
  estado: AssistantEstadoPainel;
  projetoNome: string | null;
  filtroDiaLabel: string;
  tarefasHoje: AssistantTarefa[];
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

  // Projeto/dia
  projetos: AssistantProjetoOpcao[];
  loadingProjetos: boolean;
  projetoId: string | null;
  onSelecionarProjeto: (id: string | null) => void;
  filtroDia: AssistantFiltroData;
  onMudarFiltroDia: (filtro: AssistantFiltroData) => void;

  // Kanban
  todasTarefas: AssistantTarefa[];
  colunasDoProjeto: (clienteId: string | null) => Promise<ColunaAtividade[]>;
  colunasTodas: () => Promise<ColunaAtividade[]>;
  colunasVersion: number;
  onMoverStatus: (id: string, statusKey: string, ehConclusao: boolean) => void;
  onCriarAtividade: (input: NovaAtividadeInput) => Promise<unknown>;

  // Docs
  documentos: AssistantDocumento[];
  loadingDocumentos: boolean;
  onCriarDocumento: () => void;
  onAbrirDocumento: (id: string) => void;

  // Notas
  notas: AssistantDocumento[];
  loadingNotas: boolean;
  onCriarNota: (titulo: string, conteudo: string) => Promise<unknown>;
}

// Painel do assistente — mesmo cabeçalho/estilo de sempre (✦ Assistente /
// X), agora orquestrando as abas do mini workspace (item 1). Cada aba é um
// componente próprio em ./tabs; este arquivo só monta o esqueleto (header +
// banner de foco persistente + navegação) e repassa os dados.
export function AssistantPanel(props: AssistantPanelProps) {
  const { onClose, aba, onMudarAba, estado, tarefaAtual, elapsedSegundos } = props;

  const temSessaoAtiva = estado === "foco" || estado === "pausado" || estado === "selecionada";
  const mostrarBanner = aba !== "hoje" && temSessaoAtiva && tarefaAtual;

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          Assistente
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar assistente"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {mostrarBanner && (
        <AssistantFocusBanner titulo={tarefaAtual.titulo} tempo={formatarCronometro(elapsedSegundos)} pausado={estado === "pausado"} />
      )}

      <AssistantTopNav aba={aba} onMudarAba={onMudarAba} />

      <div className="max-h-[28rem] overflow-y-auto px-4 py-4">
        {aba === "hoje" && (
          <AssistantHojeTab
            estado={estado}
            projetoNome={props.projetoNome}
            filtroDiaLabel={props.filtroDiaLabel}
            tarefas={props.tarefasHoje}
            tarefaAtual={props.tarefaAtual}
            recomendacao={props.recomendacao}
            elapsedSegundos={props.elapsedSegundos}
            onSelecionarTarefa={props.onSelecionarTarefa}
            onConcluirDireto={props.onConcluirDireto}
            onVoltar={props.onVoltar}
            onIniciarFoco={props.onIniciarFoco}
            onPausar={props.onPausar}
            onRetomar={props.onRetomar}
            onConcluir={props.onConcluir}
            onTrocarTarefa={props.onTrocarTarefa}
            onVerTodas={props.onVerTodas}
            onQueFacoAgora={props.onQueFacoAgora}
            onComecarRecomendacao={props.onComecarRecomendacao}
          />
        )}

        {aba === "projeto" && (
          <AssistantProjetoTab
            projetos={props.projetos}
            loadingProjetos={props.loadingProjetos}
            projetoId={props.projetoId}
            onSelecionar={props.onSelecionarProjeto}
            filtroDia={props.filtroDia}
            onMudarFiltroDia={props.onMudarFiltroDia}
          />
        )}

        {aba === "kanban" && (
          <AssistantKanbanTab
            projetoId={props.projetoId}
            projetos={props.projetos}
            tarefas={props.todasTarefas}
            colunasDoProjeto={props.colunasDoProjeto}
            colunasTodas={props.colunasTodas}
            colunasVersion={props.colunasVersion}
            onSelecionarTarefa={props.onSelecionarTarefa}
            onConcluirDireto={props.onConcluirDireto}
            onMoverStatus={props.onMoverStatus}
            onCriarAtividade={props.onCriarAtividade}
          />
        )}

        {aba === "docs" && (
          <AssistantDocsTab
            projetoId={props.projetoId}
            projetoAtual={props.projetos.find((p) => p.id === props.projetoId) ?? null}
            documentos={props.documentos}
            loading={props.loadingDocumentos}
            onCriarDocumento={props.onCriarDocumento}
            onAbrirDocumento={props.onAbrirDocumento}
            onIrParaProjeto={() => onMudarAba("projeto")}
          />
        )}

        {aba === "notas" && (
          <AssistantNotasTab
            projetoId={props.projetoId}
            notas={props.notas}
            loading={props.loadingNotas}
            onCriarNota={props.onCriarNota}
          />
        )}
      </div>
    </div>
  );
}
