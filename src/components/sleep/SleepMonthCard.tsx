import { useEffect, useState } from "react";
import { endOfMonth, format, isSameMonth, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { capitalizar } from "@/components/assistant/format";
import { useAuth } from "@/auth/AuthProvider";
import { buscarLogsDoIntervalo, buscarMeta, formatarDuracao } from "@/lib/sleep/SleepService";
import { calcularMetricasDeSono } from "@/lib/sleep/SleepMetricsService";

interface SleepMonthCardProps {
  mesRef: Date;
}

// "SONO — [MÊS]" (item 9) — card próprio ao lado do tracker de hábitos,
// sem entrar no grid/circular (o pedido diz explicitamente que não precisa
// caber no mesmo componente se prejudicar a leitura).
export function SleepMonthCard({ mesRef }: SleepMonthCardProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totalNoites, setTotalNoites] = useState(0);
  const [diasNoIntervalo, setDiasNoIntervalo] = useState(0);
  const [mediaMinutos, setMediaMinutos] = useState(0);
  const [noitesDentroDaMeta, setNoitesDentroDaMeta] = useState(0);
  const [mediaQualidade, setMediaQualidade] = useState(0);
  const [metaMinutos, setMetaMinutos] = useState(450);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const inicio = startOfMonth(mesRef);
      const fimMes = endOfMonth(mesRef);
      const hoje = new Date();
      const fim = isSameMonth(mesRef, hoje) && fimMes > hoje ? hoje : fimMes;
      const inicioStr = format(inicio, "yyyy-MM-dd");
      const fimStr = format(fim, "yyyy-MM-dd");
      const [logs, meta] = await Promise.all([buscarLogsDoIntervalo(user.id, inicioStr, fimStr), buscarMeta(user.id)]);
      if (cancelado) return;
      const metrica = calcularMetricasDeSono(logs, meta?.target_sleep_minutes ?? 450);
      setTotalNoites(metrica.totalNoites);
      setMediaMinutos(metrica.mediaMinutos);
      setNoitesDentroDaMeta(metrica.noitesDentroDaMeta);
      setMediaQualidade(metrica.mediaQualidade);
      setMetaMinutos(meta?.target_sleep_minutes ?? 450);
      setDiasNoIntervalo(Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1);
      setLoading(false);
    }
    void carregar();
    return () => {
      cancelado = true;
    };
  }, [user, mesRef]);

  if (loading) return null;

  return (
    <Card className="space-y-2 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
        Sono — {capitalizar(format(mesRef, "MMMM", { locale: ptBR }))}
      </h3>
      {totalNoites === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma noite registrada neste mês.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Média</p>
            <p className="font-semibold text-foreground">{formatarDuracao(mediaMinutos)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Meta</p>
            <p className="font-semibold text-foreground">{formatarDuracao(metaMinutos)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Noites registradas</p>
            <p className="font-semibold text-foreground">
              {totalNoites} / {diasNoIntervalo}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Dentro da meta</p>
            <p className="font-semibold text-foreground">{noitesDentroDaMeta} noites</p>
          </div>
          <div className="col-span-2">
            <p className="text-muted-foreground">Qualidade média</p>
            <p className="font-semibold text-foreground">{mediaQualidade}/10</p>
          </div>
        </div>
      )}
    </Card>
  );
}
