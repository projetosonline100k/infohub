import type { CSSProperties } from "react";
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
import { AssistantKanbanTab } from "./tabs/AssistantKanbanTab";
import { AssistantDocsTab } from "./tabs/AssistantDocsTab";
import { AssistantNotasTab } from "./tabs/AssistantNotasTab";
import { AssistantPerformanceTab } from "./tabs/AssistantPerformanceTab";
import { EndOfDayFlow } from "./enddoday/EndOfDayFlow";
import { StartDayFlow } from "./startday/StartDayFlow";
import type { AtividadeDoPlano, PlanoDiario } from "@/lib/productivity/DailyPlanService";
import type { FiltroResponsavel } from "@/lib/atividades/filtroResponsavel";

// Item 5 do pedido: o painel usava as cores do tema da página (verde no
// claro, ouro no botão padrão — ver --accent/--primary em index.css), que
// não é a identidade do Jarvis (o aro do ícone no cabeçalho já é ciano/azul
// fixo, ver AssistantEyes logo abaixo). Sobrescrever as variáveis de cor
// aqui, no contêiner raiz, faz TUDO que usa bg-primary/bg-accent/ring por
// baixo (botões, aba ativa, focos) virar esse mesmo azul, em qualquer tema
// claro/escuro da página — sem editar cada componente um por um.
//
// Fundo fixo (pedido novo): o painel usava --popover/--background/--card do
// TEMA DA PÁGINA — ficava claro se a página estivesse no tema claro. O
// pedido foi fixar o Jarvis nesse azul-marinho escuro específico sempre,
// então essas variáveis foram copiadas direto do bloco `.dark` de
// index.css (mesmos valores, não uma cor nova) — o Jarvis passa a nascer
// sempre "escuro" independente do tema ativo na página.
const CORES_JARVIS = {
  "--primary": "188 86% 42%",
  "--primary-foreground": "0 0% 100%",
  "--accent": "188 86% 42%",
  "--accent-foreground": "0 0% 100%",
  "--ring": "188 86% 42%",
  "--background": "201 50% 5%",
  "--foreground": "200 18% 97%",
  "--card": "202 38% 8%",
  "--card-foreground": "200 18% 97%",
  "--popover": "202 38% 8%",
  "--popover-foreground": "200 18% 97%",
  "--secondary": "201 35% 10%",
  "--secondary-foreground": "200 18% 97%",
  "--muted": "201 35% 10%",
  "--muted-foreground": "205 10% 59%",
  "--border": "202 19% 16%",
  "--input": "202 19% 16%",
} as CSSProperties;

interface AssistantPanelProps {
  onClose: () => void;
  // Item 3: "Expandir" mostra/foca a janela main completa do Infopro Hub
  // (não existe no modo web embutido — ali não há uma janela separada pra
  // focar, então o botão some quando esta prop não é passada).
  onExpandir?: () => void;
  aba: AssistantAba;
  onMudarAba: (aba: AssistantAba) => void;
  filtroResponsavel: FiltroResponsavel;
  onMudarFiltroResponsavel: (filtro: FiltroResponsavel) => void;

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
  onReordenarNaColuna: (statusKey: string, tarefaId: string, novoIndex: number) => void;
  onReordenarPorIds: (ids: string[]) => void;
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
  onNotaAtualizada: (id: string, patch: Partial<AssistantDocumento>) => void;
  onAbrirNotasCompleto: () => void;

  // Item 4: controles da atividade
  onZerarCronometro: () => void;
  onEditarAtividade: () => void;

  // Rodada 10, item 2: só true na janela nativa (variant="window") — lá o
  // cabeçalho também arrasta a janela do SO, igual já acontecia na orbe.
  // Na versão embutida não existe essa janela separada, então nem é
  // passado (arrastar o cabeçalho não faz nada).
  headerArrastavel?: boolean;

  // Encerrar o dia (itens 1, 2, 8) — botão manual no cabeçalho (funciona em
  // qualquer variant; web não tem o atalho global ⌘+Shift+E) + o fluxo em
  // si, que substitui a área de conteúdo (sem nav de abas) enquanto aberto.
  fluxoEncerrarDiaAberto: boolean;
  onAbrirEncerrarDia: () => void;
  onFecharEncerrarDia: () => void;
  onDiaEncerrado: () => void;
  onVerRelatorioCompleto: () => void;

  // Começar o dia — mesmo padrão do bloco acima, botão próprio ("☀️") no
  // cabeçalho, exclusão mútua explícita com o fluxo de encerrar (só um
  // ritual por vez).
  fluxoComecarDiaAberto: boolean;
  onAbrirComecarDia: () => void;
  onFecharComecarDia: () => void;
  onPlanoSalvo: () => void;
  onComecarPrioridadeUm: (activityId: string) => void;
  onCriarAtividadeParaPlano: (input: NovaAtividadeInput) => Promise<AssistantTarefa>;
  // Plano do dia + progresso ("Foco de hoje") — repassado pra
  // AssistantHojeTab.
  planoDoDia: PlanoDiario | null;
  atividadesDoPlano: AtividadeDoPlano[];
  prioridadeUmDoPlano: AtividadeDoPlano | null;
  onVerPerformance: () => void;
  onRegistrarSono: () => void;
}

// Painel do assistente — mesmo cabeçalho/estilo de sempre (✦ Assistente /
// X), agora orquestrando as abas do mini workspace (item 1). Cada aba é um
// componente próprio em ./tabs; este arquivo só monta o esqueleto (header +
// banner de foco persistente + navegação) e repassa os dados.
export function AssistantPanel(props: AssistantPanelProps) {
  const {
    onClose,
    onExpandir,
    aba,
    onMudarAba,
    estado,
    tarefaAtual,
    elapsedSegundos,
    headerArrastavel,
    fluxoEncerrarDiaAberto,
    onAbrirEncerrarDia,
    onFecharEncerrarDia,
    onDiaEncerrado,
    onVerRelatorioCompleto,
    fluxoComecarDiaAberto,
    onAbrirComecarDia,
    onFecharComecarDia,
    onPlanoSalvo,
    onComecarPrioridadeUm,
    onCriarAtividadeParaPlano,
    planoDoDia,
    atividadesDoPlano,
    prioridadeUmDoPlano,
  } = props;

  const fluxoRitualAberto = fluxoEncerrarDiaAberto || fluxoComecarDiaAberto;
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
    <div
      // "dark" (a classe, não só as variáveis acima) é necessário porque
      // `darkMode: ["class"]` no Tailwind faz qualquer utilitário `dark:*`
      // usado lá dentro (ex.: `dark:prose-invert` no editor de notas)
      // procurar essa classe num ancestral — só as variáveis CSS não
      // ativam esses utilitários, e sem isso o texto de uma nota ficaria
      // escuro (tema claro da página) sobre o fundo escuro fixo do Jarvis.
      className="dark flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
      style={CORES_JARVIS}
    >
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
        <div className="flex items-center gap-2">
          {/* Rodada 10, item 1: orbe em miniatura no lugar do ícone fixo —
              antes, ao abrir o painel (que agora preenche a janela
              inteira), a orbe "sumia" de vez (coberta por trás) sem
              nenhum resquício visual do Jarvis. Reaproveita AssistantEyes
              (mesmos frames/piscar), só menor e sem anel/glow. */}
          <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-background ring-1 ring-cyan-400/60">
            <AssistantEyes className="relative h-full w-full" pausado={estado === "pausado"} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Assistente</p>
            <p className="text-xs font-normal text-muted-foreground">Seu parceiro de produtividade</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onAbrirComecarDia}
            aria-label="Começar o dia"
            title="Começar o dia"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <span aria-hidden="true">☀️</span>
          </button>
          <button
            type="button"
            onClick={onAbrirEncerrarDia}
            aria-label="Encerrar o dia"
            title="Encerrar o dia"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <span aria-hidden="true">🌙</span>
          </button>
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

      {mostrarBanner && !fluxoRitualAberto && (
        <div className="shrink-0">
          <AssistantFocusBanner titulo={tarefaAtual.titulo} tempo={formatarCronometro(elapsedSegundos)} pausado={estado === "pausado"} />
        </div>
      )}

      {/* Sem navegação por aba durante um ritual (encerrar/começar o dia) —
          item 8 ("sensação de ritual"), evita trocar de aba no meio do
          questionário e perder a noção de onde estava. */}
      {!fluxoRitualAberto && (
        <div className="shrink-0">
          <AssistantTopNav
            aba={aba}
            onMudarAba={onMudarAba}
            filtroResponsavel={props.filtroResponsavel}
            onMudarFiltroResponsavel={props.onMudarFiltroResponsavel}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {fluxoEncerrarDiaAberto && (
          <EndOfDayFlow onClose={onFecharEncerrarDia} onDiaEncerrado={onDiaEncerrado} onVerRelatorioCompleto={onVerRelatorioCompleto} />
        )}

        {fluxoComecarDiaAberto && (
          <StartDayFlow
            onClose={onFecharComecarDia}
            onPlanoSalvo={onPlanoSalvo}
            onComecarPrioridadeUm={onComecarPrioridadeUm}
            tarefas={props.todasTarefas}
            projetos={props.projetos}
            colunasDoProjeto={props.colunasDoProjeto}
            onCriarAtividade={onCriarAtividadeParaPlano}
            projetoIdAtual={props.projetoId}
          />
        )}

        {!fluxoRitualAberto && aba === "hoje" && (
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
            colunasDoProjeto={props.colunasDoProjeto}
            onCriarAtividade={props.onCriarAtividade}
            onReordenarPorIds={props.onReordenarPorIds}
            projetoIdAtual={props.projetoId}
            filtroDia={props.filtroDia}
            onMudarFiltroDia={props.onMudarFiltroDia}
            planoDoDia={planoDoDia}
            atividadesDoPlano={atividadesDoPlano}
            prioridadeUmDoPlano={prioridadeUmDoPlano}
            onAbrirComecarDia={onAbrirComecarDia}
            filtroResponsavel={props.filtroResponsavel}
          />
        )}

        {!fluxoRitualAberto && aba === "performance" && (
          <AssistantPerformanceTab onVerPerformance={props.onVerPerformance} onRegistrarSono={props.onRegistrarSono} />
        )}

        {!fluxoRitualAberto && aba === "kanban" && (
          <AssistantKanbanTab
            projetoId={props.projetoId}
            projetos={props.projetos}
            onSelecionarProjeto={props.onSelecionarProjeto}
            tarefas={props.todasTarefas}
            colunasDoProjeto={props.colunasDoProjeto}
            colunasTodas={props.colunasTodas}
            colunasVersion={props.colunasVersion}
            onSelecionarTarefa={props.onSelecionarTarefa}
            onConcluirDireto={props.onConcluirDireto}
            onMoverStatus={props.onMoverStatus}
            onReordenarNaColuna={props.onReordenarNaColuna}
            onCriarAtividade={props.onCriarAtividade}
            filtroResponsavel={props.filtroResponsavel}
          />
        )}

        {!fluxoRitualAberto && aba === "docs" && (
          <AssistantDocsTab
            projetoId={props.projetoId}
            projetoAtual={props.projetos.find((p) => p.id === props.projetoId) ?? null}
            documentos={props.documentos}
            loading={props.loadingDocumentos}
            onCriarDocumento={props.onCriarDocumento}
            onAbrirDocumento={props.onAbrirDocumento}
            onIrParaProjeto={() => onMudarAba("kanban")}
          />
        )}

        {!fluxoRitualAberto && aba === "notas" && (
          <AssistantNotasTab
            projetoId={props.projetoId}
            projetos={props.projetos}
            onSelecionarProjeto={props.onSelecionarProjeto}
            notas={props.notas}
            loading={props.loadingNotas}
            onCriarNota={props.onCriarNota}
            onFixarNota={props.onFixarNota}
            onExcluirNota={props.onExcluirNota}
            onNotaAtualizada={props.onNotaAtualizada}
            onAbrirNotasCompleto={props.onAbrirNotasCompleto}
          />
        )}
      </div>
    </div>
  );
}
