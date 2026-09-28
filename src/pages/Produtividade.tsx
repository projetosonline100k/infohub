import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/auth/AuthProvider";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatarTempo } from "@/lib/utils";
import { buscarHistorico, OPCOES_BLOQUEIO, type FiltroHistorico, type RelatorioDiario } from "@/lib/productivity/DailyReportService";
import { PerformanceOverview } from "@/components/performance/PerformanceOverview";

const OPCOES_FILTRO: { valor: FiltroHistorico; label: string }[] = [
  { valor: "hoje", label: "Hoje" },
  { valor: "ontem", label: "Ontem" },
  { valor: "7dias", label: "7 dias" },
  { valor: "30dias", label: "30 dias" },
];

function rotuloBloqueio(relatorio: RelatorioDiario): string | null {
  if (!relatorio.main_blocker) return null;
  if (relatorio.main_blocker === "outro") return relatorio.main_blocker_other || "Outro";
  return OPCOES_BLOQUEIO.find((o) => o.valor === relatorio.main_blocker)?.label ?? relatorio.main_blocker;
}

// Histórico de "Encerrar o dia" (item 11) — mesma convenção de layout
// lista/detalhe já usada em /notas, mesmo padrão de dados (useState +
// useEffect, sem React Query) já usado em DashGeral.tsx/Admin.tsx.
export default function Produtividade() {
  const { user } = useAuth();
  const [abaPrincipal, setAbaPrincipal] = useState("relatorios");
  const [filtro, setFiltro] = useState<FiltroHistorico>("7dias");
  const [relatorios, setRelatorios] = useState<RelatorioDiario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    buscarHistorico(user.id, filtro)
      .then((data) => {
        setRelatorios(data);
        setSelecionadoId(data[0]?.id ?? null);
      })
      .finally(() => setLoading(false));
  }, [user, filtro]);

  const selecionado = relatorios.find((r) => r.id === selecionadoId) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-4xl font-bold text-foreground">Produtividade</h1>
        <p className="text-muted-foreground">Relatórios de "Encerrar o dia" e sua rotina de alta performance.</p>
      </div>

      {/* "Relatórios" selecionado por padrão — zero mudança de comportamento
          pra quem já usava esta página (item "preservar tudo que já
          funciona"). "Performance" é a aba nova. */}
      <Tabs value={abaPrincipal} onValueChange={setAbaPrincipal}>
        <TabsList>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="relatorios" className="space-y-4 pt-4">
          <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5 w-fit">
            {OPCOES_FILTRO.map((op) => (
              <button
                key={op.valor}
                type="button"
                onClick={() => setFiltro(op.valor)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filtro === op.valor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {op.label}
              </button>
            ))}
          </div>

          {loading ? (
            <Card className="p-5 shadow-sm">
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
            </Card>
          ) : relatorios.length === 0 ? (
            <Card className="p-5 shadow-sm">
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum relatório nesse período.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
              <Card className="max-h-[70vh] overflow-y-auto p-2 shadow-sm">
                {relatorios.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelecionadoId(r.id)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left transition-colors",
                      r.id === selecionadoId ? "bg-accent/10" : "hover:bg-muted/60"
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">{format(parseISO(r.date), "EEEE, d 'de' MMM", { locale: ptBR })}</p>
                    <p className="text-xs text-muted-foreground">
                      Produtividade {r.productivity_score}/10 · {r.completed_tasks} tarefas concluídas
                    </p>
                  </button>
                ))}
              </Card>

              {selecionado && (
                <Card className="space-y-4 p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-foreground">
                    {format(parseISO(selecionado.date), "EEEE, d 'de' MMMM", { locale: ptBR })}
                  </h2>

                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Metrica label="Produtividade" value={`${selecionado.productivity_score}/10`} />
                    <Metrica label="Energia" value={`${selecionado.energy_score}/5`} />
                    <Metrica label="Foco" value={`${selecionado.focus_score}/5`} />
                    <Metrica label="Prioridade" value={selecionado.completed_main_priority ? "Concluída" : "Não concluída"} />
                    <Metrica label="Tempo focado" value={formatarTempo(Math.round(selecionado.focused_seconds / 60))} />
                    <Metrica label="Maior sessão" value={formatarTempo(Math.round(selecionado.longest_focus_seconds / 60))} />
                    <Metrica label="Sessões de foco" value={String(selecionado.focus_sessions_count)} />
                    <Metrica label="Tarefas concluídas" value={String(selecionado.completed_tasks)} />
                    <Metrica label="Pausas" value={String(selecionado.pause_count)} />
                    <Metrica label="Atrasadas" value={String(selecionado.overdue_tasks)} />
                    {selecionado.distraction_seconds + selecionado.possible_distraction_seconds > 0 && (
                      <Metrica label="Distração" value={formatarTempo(Math.round((selecionado.distraction_seconds + selecionado.possible_distraction_seconds) / 60))} />
                    )}
                    {selecionado.overtime_seconds > 0 && (
                      <Metrica label="Acima da estimativa" value={formatarTempo(Math.round(selecionado.overtime_seconds / 60))} />
                    )}
                  </div>

                  <div className="space-y-3 border-t border-border pt-4">
                    {selecionado.main_win && <Resposta pergunta="Principal vitória" resposta={selecionado.main_win} />}
                    {rotuloBloqueio(selecionado) && <Resposta pergunta="O que mais atrapalhou" resposta={rotuloBloqueio(selecionado) as string} />}
                    {selecionado.pending_for_tomorrow && <Resposta pergunta="Ficou pendente" resposta={selecionado.pending_for_tomorrow} />}
                    {selecionado.tomorrow_main_priority && <Resposta pergunta="Prioridade do dia seguinte" resposta={selecionado.tomorrow_main_priority} />}
                  </div>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="performance" className="pt-4">
          <PerformanceOverview onAbrirRelatorios={() => setAbaPrincipal("relatorios")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metrica({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function Resposta({ pergunta, resposta }: { pergunta: string; resposta: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{pergunta}</p>
      <p className="text-sm text-foreground">"{resposta}"</p>
    </div>
  );
}
