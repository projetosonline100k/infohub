import { useState } from "react";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Moon, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePerformanceHabits } from "@/hooks/usePerformanceHabits";
import { usePerformanceDashboard } from "@/hooks/usePerformanceDashboard";
import { useSleepToday } from "@/hooks/useSleepToday";
import { useSleepHistory } from "@/hooks/useSleepHistory";
import { formatarDuracao } from "@/lib/sleep/SleepService";
import { PerformanceOnboarding } from "./PerformanceOnboarding";
import { PerformanceHabitsManager } from "./PerformanceHabitsManager";
import { PerformanceGoals } from "./PerformanceGoals";
import { PerformanceMonthTracker } from "./PerformanceMonthTracker";
import { PerformanceHistory } from "./PerformanceHistory";
import { PerformanceStatCard } from "./PerformanceStatCard";
import { PerformanceToday } from "./PerformanceToday";
import { PerformanceMonthMiniCard } from "./PerformanceMonthMiniCard";
import { SleepOverview } from "@/components/sleep/SleepOverview";
import { SleepOverviewCard } from "@/components/sleep/SleepOverviewCard";
import { SleepRegisterForm } from "@/components/sleep/SleepRegisterForm";

type AbaPerformance = "geral" | "rotinas" | "metas" | "mes" | "historico" | "sono";

interface PerformanceOverviewProps {
  // Abre a aba "Relatórios" da página Produtividade (irmã de Performance,
  // fora deste Tabs) — undefined quando este componente é usado sem esse
  // contexto; o link correspondente simplesmente não aparece.
  onAbrirRelatorios?: () => void;
}

// Orquestrador — Tabs (Visão geral/Rotinas/Metas/Meu mês/Histórico). Zero
// hábitos → só o onboarding, sem as abas (item 25: dashboard adulto, não
// uma tela vazia de habit tracker infantil).
export function PerformanceOverview({ onAbrirRelatorios }: PerformanceOverviewProps) {
  const [aba, setAba] = useState<AbaPerformance>("geral");
  const { habitos, loading, refetch } = usePerformanceHabits();

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Carregando performance...</p>;
  }

  if (habitos.length === 0) {
    return <PerformanceOnboarding onCriada={refetch} />;
  }

  return (
    <Tabs value={aba} onValueChange={(v) => setAba(v as AbaPerformance)}>
      <TabsList>
        <TabsTrigger value="geral">Visão geral</TabsTrigger>
        <TabsTrigger value="rotinas">Rotinas</TabsTrigger>
        <TabsTrigger value="metas">Metas</TabsTrigger>
        <TabsTrigger value="mes">Meu mês</TabsTrigger>
        <TabsTrigger value="historico">Histórico</TabsTrigger>
        <TabsTrigger value="sono">Sono</TabsTrigger>
      </TabsList>

      <TabsContent value="geral" className="pt-4">
        <VisaoGeralConteudo onMudarAba={setAba} onAbrirRelatorios={onAbrirRelatorios} />
      </TabsContent>
      <TabsContent value="rotinas" className="pt-4">
        <PerformanceHabitsManager />
      </TabsContent>
      <TabsContent value="metas" className="pt-4">
        <PerformanceGoals />
      </TabsContent>
      <TabsContent value="mes" className="pt-4">
        <PerformanceMonthTracker />
      </TabsContent>
      <TabsContent value="historico" className="pt-4">
        <PerformanceHistory />
      </TabsContent>
      <TabsContent value="sono" className="pt-4">
        <SleepOverview />
      </TabsContent>
    </Tabs>
  );
}

// Dashboard de performance pessoal — 4 KPIs compactos no topo, os 3 cards
// protagonistas lado a lado (Sono/Rotinas/Meu mês), e links secundários
// compactos pras abas com mais detalhe (Metas/Histórico/Relatórios).
function VisaoGeralConteudo({
  onMudarAba,
  onAbrirRelatorios,
}: {
  onMudarAba: (aba: AbaPerformance) => void;
  onAbrirRelatorios?: () => void;
}) {
  const [dataSelecionada, setDataSelecionada] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const dash = usePerformanceDashboard(dataSelecionada);
  // "Sono — noite passada" é sempre a última noite de verdade, independente
  // do dia que a pessoa está navegando no resto da Visão geral (mesmo
  // critério de um widget de "agora", não de histórico).
  const sono = useSleepToday();
  const sonoHistorico = useSleepHistory("7dias");
  const [dialogSonoAberto, setDialogSonoAberto] = useState(false);
  const hoje = format(new Date(), "yyyy-MM-dd");

  if (dash.loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDataSelecionada((d) => format(subDays(new Date(d), 1), "yyyy-MM-dd"))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          {dataSelecionada === hoje ? "Hoje, " : ""}
          {format(new Date(`${dataSelecionada}T00:00:00`), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={dataSelecionada >= hoje}
          onClick={() => setDataSelecionada((d) => format(addDays(new Date(d), 1), "yyyy-MM-dd"))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PerformanceStatCard
          icon={Moon}
          label="Sono"
          value={sono.log ? formatarDuracao(sono.log.total_sleep_minutes) : "—"}
          progresso={sono.log && sono.meta ? (sono.log.total_sleep_minutes / sono.meta.target_sleep_minutes) * 100 : undefined}
          tone={sono.log && sono.meta ? (sono.log.total_sleep_minutes >= sono.meta.target_sleep_minutes ? "good" : "neutral") : "neutral"}
        />
        <PerformanceStatCard
          icon={Target}
          label="Score do dia"
          value={`${dash.scoreHoje}/100`}
          variacaoPercentual={dash.scoreVariacao}
          progresso={dash.scoreHoje}
          tone={dash.scoreHoje >= 70 ? "good" : dash.scoreHoje >= 40 ? "warning" : "critical"}
        />
        <PerformanceStatCard
          icon={BarChart3}
          label="Consistência da semana"
          value={`${dash.consistenciaSemanaPercentual.toFixed(0)}%`}
          variacaoPercentual={dash.consistenciaSemanaVariacao}
          progresso={dash.consistenciaSemanaPercentual}
          tone="neutral"
        />
        <PerformanceStatCard
          icon={Zap}
          label="Foco profundo"
          value={dash.focoHojeHoras >= 1 ? `${dash.focoHojeHoras.toFixed(1)}h` : `${Math.round(dash.focoHojeHoras * 60)}min`}
          variacaoPercentual={dash.focoHojeVariacao}
          progresso={dash.focoMetaHoras > 0 ? (dash.focoHojeHoras / dash.focoMetaHoras) * 100 : 0}
          tone="neutral"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1.1fr_1.2fr]">
        <SleepOverviewCard
          log={sono.log}
          logsSemana={sonoHistorico.logs}
          mediaSemanaMinutos={sonoHistorico.metricas.totalNoites > 0 ? sonoHistorico.metricas.mediaMinutos : null}
          metaMinutos={sono.meta?.target_sleep_minutes ?? null}
          onRegistrar={() => setDialogSonoAberto(true)}
          onAbrirSono={() => onMudarAba("sono")}
        />
        <PerformanceToday />
        <PerformanceMonthMiniCard
          mesRef={dataSelecionada}
          semanaAtualGrid={dash.semanaAtualGrid}
          consistenciaMesPercentual={dash.consistenciaMesPercentual}
          onAbrirMes={() => onMudarAba("mes")}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <SecondaryLink label="Ver metas" onClick={() => onMudarAba("metas")} />
        <SecondaryLink label="Ver histórico" onClick={() => onMudarAba("historico")} />
        {onAbrirRelatorios && <SecondaryLink label="Ver relatórios" onClick={onAbrirRelatorios} />}
      </div>

      <Dialog open={dialogSonoAberto} onOpenChange={setDialogSonoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar sono</DialogTitle>
          </DialogHeader>
          <SleepRegisterForm logExistente={sono.log} onSalvar={sono.registrar} onSalvo={() => setDialogSonoAberto(false)} onCancelar={() => setDialogSonoAberto(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SecondaryLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      {label}
      <ChevronRight className="h-3.5 w-3.5" />
    </button>
  );
}
