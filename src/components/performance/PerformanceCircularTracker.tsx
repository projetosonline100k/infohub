import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatarValor } from "./format";
import type { Habito } from "@/lib/performance/PerformanceHabitService";
import type { LinhaHabito } from "@/lib/performance/PerformanceMetricsService";

interface PerformanceCircularTrackerProps {
  habitos: Habito[];
  dias: string[];
  linhasPorHabito: Map<string, LinhaHabito[]>;
}

const RAIO_INICIAL = 40;
const ESPESSURA = 14;
const ESPACO_ANEL = 4;
const GAP_GRAUS = 1.2;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

// Versão original pro design dark/cyan do Infopro Hub (item 12: "não copiar
// exatamente o template") — cada anel é um hábito, cada segmento do anel é
// um dia do mês. Clicar num segmento mostra o valor daquele dia, mesmo
// critério do grid.
export function PerformanceCircularTracker({ habitos, dias, linhasPorHabito }: PerformanceCircularTrackerProps) {
  const [selecionado, setSelecionado] = useState<{ habitoId: string; date: string } | null>(null);

  const raioMax = RAIO_INICIAL + Math.max(0, habitos.length - 1) * (ESPESSURA + ESPACO_ANEL);
  const tamanho = (raioMax + ESPESSURA) * 2 + 20;
  const centro = tamanho / 2;
  const segAngulo = 360 / dias.length;

  const linhaSelecionada = selecionado ? linhasPorHabito.get(selecionado.habitoId)?.find((l) => l.date === selecionado.date) : null;
  const habitoSelecionado = selecionado ? habitos.find((h) => h.id === selecionado.habitoId) : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`}>
        {habitos.map((h, indiceHabito) => {
          const raio = RAIO_INICIAL + indiceHabito * (ESPESSURA + ESPACO_ANEL);
          const linhas = linhasPorHabito.get(h.id) ?? [];
          return (
            <g key={h.id}>
              {linhas.map((l, i) => {
                const inicio = i * segAngulo + GAP_GRAUS / 2;
                const fim = (i + 1) * segAngulo - GAP_GRAUS / 2;
                const d = describeArc(centro, centro, raio, inicio, fim);
                const cor = !l.programado ? "text-muted-foreground/15" : l.completed ? "text-status-success" : "text-muted-foreground/40";
                return (
                  <path
                    key={l.date}
                    d={d}
                    stroke="currentColor"
                    strokeWidth={ESPESSURA}
                    fill="none"
                    className={cn(cor, "cursor-pointer transition-colors")}
                    onClick={() => setSelecionado({ habitoId: h.id, date: l.date })}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap justify-center gap-3">
        {habitos.map((h, i) => (
          <span key={h.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-status-success" style={{ opacity: 1 - i * 0.12 }} />
            {h.nome}
          </span>
        ))}
      </div>

      {habitoSelecionado && linhaSelecionada && (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
          <p className="text-sm font-medium text-foreground">{habitoSelecionado.nome}</p>
          <p className="text-xs text-muted-foreground">
            {format(parseISO(linhaSelecionada.date), "d 'de' MMMM", { locale: ptBR })} —{" "}
            {!linhaSelecionada.programado
              ? "não programado"
              : habitoSelecionado.tipo === "boolean"
              ? linhaSelecionada.completed ? "✓" : "○"
              : formatarValor(linhaSelecionada)}
          </p>
        </div>
      )}
    </div>
  );
}
