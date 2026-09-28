import { useState } from "react";
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATALOGO_FONTES_AUTOMATICAS, type AutomaticKey } from "@/lib/performance/PerformanceAutomaticSources";
import type { CriarMetaInput, Meta, PeriodoMeta, TipoMeta } from "@/lib/performance/PerformanceGoalService";
import type { Habito, Pilar } from "@/lib/performance/PerformanceHabitService";

const SEM_PILAR = "__sem_pilar__";

const OPCOES_TIPO: { valor: TipoMeta; label: string }[] = [
  { valor: "numero", label: "Número" },
  { valor: "minutos", label: "Minutos" },
  { valor: "horas", label: "Horas" },
  { valor: "paginas", label: "Páginas" },
  { valor: "percentual", label: "Percentual (%)" },
];

interface PerformanceGoalFormProps {
  pilares: Pilar[];
  habitos: Habito[];
  meta?: Meta;
  onSalvar: (input: CriarMetaInput) => Promise<Meta>;
  onSalvo: (meta: Meta) => void;
  onCancelar: () => void;
  onExcluir?: () => void;
}

// Criação/edição de meta — vincula a um hábito manual (soma/conta os logs)
// OU a uma fonte automática (ex: "60h de foco"), nunca as duas (item 8/9).
export function PerformanceGoalForm({ pilares, habitos, meta, onSalvar, onSalvo, onCancelar, onExcluir }: PerformanceGoalFormProps) {
  const [nome, setNome] = useState(meta?.nome ?? "");
  const [pillarId, setPillarId] = useState<string | null>(meta?.pillar_id ?? null);
  const [tipo, setTipo] = useState<TipoMeta>((meta?.tipo as TipoMeta) ?? "numero");
  const [targetValue, setTargetValue] = useState(String(meta?.target_value ?? ""));
  const [unit, setUnit] = useState(meta?.unit ?? "");
  const [period, setPeriod] = useState<PeriodoMeta>((meta?.period as PeriodoMeta) ?? "mensal");
  const [startDate, setStartDate] = useState(meta?.start_date ?? format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(meta?.end_date ?? format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [vinculo, setVinculo] = useState<string>(meta?.automatic_source ?? meta?.linked_habit_id ?? "");
  const [salvando, setSalvando] = useState(false);

  const mudarPeriodo = (p: PeriodoMeta) => {
    setPeriod(p);
    if (p === "mensal") {
      setStartDate(format(startOfMonth(new Date()), "yyyy-MM-dd"));
      setEndDate(format(endOfMonth(new Date()), "yyyy-MM-dd"));
    } else if (p === "semanal") {
      setStartDate(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
      setEndDate(format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
    }
  };

  const isAutomatic = CATALOGO_FONTES_AUTOMATICAS.some((f) => f.key === vinculo);

  const salvar = async () => {
    if (!nome.trim() || !targetValue || salvando) return;
    setSalvando(true);
    try {
      const nova = await onSalvar({
        nome: nome.trim(),
        pillarId,
        tipo,
        targetValue: Number(targetValue),
        unit: unit.trim() || null,
        period,
        startDate,
        endDate,
        linkedHabitId: !isAutomatic && vinculo ? vinculo : null,
        automaticSource: isAutomatic ? (vinculo as AutomaticKey) : null,
      });
      toast.success(meta ? "Meta atualizada" : "Meta criada");
      onSalvo(nova);
    } catch {
      toast.error("Não foi possível salvar a meta");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="perf-meta-nome" className="text-xs">Nome</Label>
        <Input id="perf-meta-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Ler 600 páginas" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Vincular a</Label>
        <Select value={vinculo || undefined} onValueChange={setVinculo}>
          <SelectTrigger><SelectValue placeholder="Escolha um hábito ou fonte..." /></SelectTrigger>
          <SelectContent>
            {habitos.filter((h) => h.source === "manual").map((h) => (
              <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>
            ))}
            {CATALOGO_FONTES_AUTOMATICAS.map((f) => (
              <SelectItem key={f.key} value={f.key}>⚡ {f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Pilar</Label>
        <Select value={pillarId ?? SEM_PILAR} onValueChange={(v) => setPillarId(v === SEM_PILAR ? null : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_PILAR}>Sem pilar</SelectItem>
            {pilares.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMeta)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OPCOES_TIPO.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="perf-meta-alvo" className="text-xs">Alvo</Label>
          <Input id="perf-meta-alvo" type="number" min={0} value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
        </div>
      </div>

      {tipo !== "percentual" && (
        <div className="space-y-1.5">
          <Label htmlFor="perf-meta-unidade" className="text-xs">Unidade (opcional)</Label>
          <Input id="perf-meta-unidade" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="treinos" />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Período</Label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={period === "semanal" ? "default" : "outline"} className="flex-1" onClick={() => mudarPeriodo("semanal")}>
            Semanal
          </Button>
          <Button type="button" size="sm" variant={period === "mensal" ? "default" : "outline"} className="flex-1" onClick={() => mudarPeriodo("mensal")}>
            Mensal
          </Button>
          <Button type="button" size="sm" variant={period === "personalizado" ? "default" : "outline"} className="flex-1" onClick={() => setPeriod("personalizado")}>
            Personalizado
          </Button>
        </div>
        {period === "personalizado" && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" className="flex-1" disabled={!nome.trim() || !targetValue || salvando} onClick={salvar}>
          {salvando ? "Salvando..." : meta ? "Salvar" : "Criar meta"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
        {onExcluir && (
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={onExcluir}>
            Excluir
          </Button>
        )}
      </div>
    </div>
  );
}
