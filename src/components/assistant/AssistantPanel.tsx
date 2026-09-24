import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssistantTarefa, ColunaAtividade, NovaAtividadeInput } from "@/hooks/useAssistantAtividades";
import type { AssistantEstadoPainel } from "@/hooks/useAssistantCobranca";
import type { AssistantProjetoOpcao, AssistantFiltroData } from "@/hooks/useAssistantProjeto";
import type { AssistantDocumento } from "@/hooks/useAssistantDocumentos";
import { startWindowDrag } from "@/lib/desktop/window";
import { AssistantEyes } from "./AssistantEyes";
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
  // Item 3: "Expandir" mostra/foca a janela main completa do Infopro Hub
  // (não existe no modo web embutido — ali não há uma janela separada pra
  // focar, então o botão some quando esta prop não é passada).
  onExpandir?: () => void;
  aba: AssistantAba;
  onMudarAba: (aba: AssistantAba) => void;

  // Hoje / tarefa atual (preservado da versão anterior)
  estado: AssistantEstadoPainel;
  // Item 4, rodada 4: saudação da Home global.
  nomeUsuario: string;
  filtroDiaLabel: string;
  tarefasHoje: AssistantTarefa[];
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
  onCriarNota: (titulo: string, conteudo: string) => Promise<AssistantDocumento>;
  onFixarNota: (id: string, fixado: boolean) => void;
  onExcluirNota: (id: string) => void;
  onAbrirNotasCompleto: () => void;

  // Item 4: controles da atividade
  onZerarCronometro: () => void;
  onEditarAtividade: () => void;

  // Rodada 10, item 2: só true na janela nativa (variant="window") — lá o
  // cabeçalho também arrasta a janela do SO, igual já acontecia na orbe.
  // Na versão embutida não existe essa janela separada, então nem é
  // passado (arrastar o cabeçalho não faz nada).
  headerArrastavel?: boolean;
}

// Painel do assistente — mesmo cabeçalho/estilo de sempre (✦ Assistente /
// X), agora orquestrando as abas do mini workspace (item 1). Cada aba é um
// componente próprio em ./tabs; este arquivo só monta o esqueleto (header +
// banner de foco persistente + navegação) e repassa os dados.
export function AssistantPanel(props: AssistantPanelProps) {
  const { onClose, onExpandir, aba, onMudarAba, estado, tarefaAtual, elapsedSegundos, headerArrastavel } = props;

  const temSessaoAtiva = estado === "foco" || estado === "pausado" || estado === "selecionada";
  const mostrarBanner = aba !== "hoje" && temSessaoAtiva && tarefaAtual;

  return (
    // Tamanho controlado por quem chama (item 6/8): preenche exatamente o
    // container pai (janela nativa redimensionável ou o box com resize CSS
    // na web) — nunca mais um valor fixo aqui em paralelo, senão painel e
    // janela real podem ficar de tamanhos diferentes e recortar conteúdo
    // (foi exatamente essa a causa da regressão de abas sumindo depois de
    // redimensionar). Header/banner/nav ficam no topo (shrink-0); só a área
    // de conteúdo (flex-1 overflow-y-auto) muda — nunca redimensiona o
    // painel inteiro por navegação de aba.
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
      <div
        className={cn("flex shrink-0 items-center justify-between border-b border-border px-4 py-3", headerArrastavel && "cursor-grab active:cursor-grabbing")}
        // Rodada 10, item 2: cabeçalho também arrasta a janela nativa —
        // igual já acontecia na orbe. Ignora quando o alvo é um botão
        // (fechar/expandir), senão o arraste nativo competiria com o
        // clique neles.
        onPointerDown={
          headerArrastavel
            ? (e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                void startWindowDrag();
              }
            : undefined
        }
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          {/* Rodada 10, item 1: orbe em miniatura no lugar do ícone fixo —
              antes, ao abrir o painel (que agora preenche a janela
              inteira), a orbe "sumia" de vez (coberta por trás) sem
              nenhum resquício visual do Jarvis. Reaproveita AssistantEyes
              (mesmos frames/piscar), só menor e sem anel/glow. */}
          <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-background ring-1 ring-cyan-400/60">
            <AssistantEyes className="relative h-full w-full" pausado={estado === "pausado"} />
          </span>
          Assistente
        </div>
        <div className="flex items-center gap-1">
          {onExpandir && (
            <button
              type="button"
              onClick={onExpandir}
              aria-label="Expandir para o Infopro Hub completo"
              title="Abrir Infopro Hub completo"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar assistente"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {mostrarBanner && (
        <div className="shrink-0">
          <AssistantFocusBanner titulo={tarefaAtual.titulo} tempo={formatarCronometro(elapsedSegundos)} pausado={estado === "pausado"} />
        </div>
      )}

      <div className="shrink-0">
        <AssistantTopNav aba={aba} onMudarAba={onMudarAba} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {aba === "hoje" && (
          <AssistantHojeTab
            estado={estado}
            nomeUsuario={props.nomeUsuario}
            filtroDiaLabel={props.filtroDiaLabel}
            tarefas={props.tarefasHoje}
            projetos={props.projetos}
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
            onZerarCronometro={props.onZerarCronometro}
            onEditarAtividade={props.onEditarAtividade}
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
            onFixarNota={props.onFixarNota}
            onExcluirNota={props.onExcluirNota}
            onAbrirNotasCompleto={props.onAbrirNotasCompleto}
          />
        )}
      </div>
    </div>
  );
}
