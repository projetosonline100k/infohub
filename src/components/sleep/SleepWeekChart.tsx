import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { capitalizar } from "@/components/assistant/format";
import { formatarDuracao, type SleepLog } from "@/lib/sleep/SleepService";

interface SleepWeekChartProps {
  logs: SleepLog[];
  metaMinutos: number;
  hojeStr: string;
}

// "Últimas 7 noites" (item 5) — verde quando bate a meta, roxo/azul
// discreto (mesmo tom já usado pra notas em toda a UI, --status-notes)
// quando não bate. Item 16: "sono pode usar um detalhe roxo/azul discreto".
export function SleepWeekChart({ logs, metaMinutos, hojeStr }: SleepWeekChartProps) {
  const dados = logs.map((l) => ({
    horas: Number((l.total_sleep_minutes / 60).toFixed(2)),
    minutos: l.total_sleep_minutes,
    label: l.sleep_date === hojeStr ? "Hoje" : capitalizar(format(parseISO(l.sleep_date), "EEE", { locale: ptBR })),
  }));

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">Últimas 7 noites</h3>
      {dados.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Sem registros ainda.</p>
      ) : (
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} className="text-muted-foreground" />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-border bg-background p-2 text-xs shadow-lg">
                      <p className="font-medium text-foreground">{label}</p>
                      <p className="text-muted-foreground">{formatarDuracao(Number(payload[0].payload.minutos))}</p>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="horas" radius={[4, 4, 0, 0]} barSize={28}>
                {dados.map((d) => (
                  <Cell key={d.label} fill={d.minutos >= metaMinutos ? "hsl(var(--status-success))" : "hsl(var(--status-notes))"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
