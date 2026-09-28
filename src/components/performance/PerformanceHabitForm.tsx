import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CATALOGO_FONTES_AUTOMATICAS, type AutomaticKey } from "@/lib/performance/PerformanceAutomaticSources";
import type {
  CriarHabitoInput,
  FrequenciaHabito,
  Habito,
  Pilar,
  SourceHabito,
  TipoRotina,
} from "@/lib/performance/PerformanceHabitService";

const SEM_PILAR = "__sem_pilar__";
const NOVO_PILAR = "__novo_pilar__";

const OPCOES_TIPO: { valor: TipoRotina; label: string }[] = [
  { valor: "boolean", label: "Sim/Não" },
  { valor: "numero", label: "Número" },
  { valor: "minutos", label: "Minutos" },
  { valor: "horas", label: "Horas" },
  { valor: "paginas", label: "Páginas" },
];

const DIAS_SEMANA = [
  { valor: 1, label: "Seg" },
  { valor: 2, label: "Ter" },
  { valor: 3, label: "Qua" },
  { valor: 4, label: "Qui" },
  { valor: 5, label: "Sex" },
  { valor: 6, label: "Sáb" },
  { valor: 0, label: "Dom" },
];

interface PerformanceHabitFormProps {
  pilares: Pilar[];
  onCriarPilar: (nome: string) => Promise<Pilar>;
  habito?: Habito;
  valoresIniciais?: Partial<{ nome: string; tipo: TipoRotina; metaDiaria: number | null }>;
  onSalvar: (input: CriarHabitoInput) => Promise<Habito>;
  onSalvo: (habito: Habito) => void;
  onCancelar: () => void;
}

// Criação/edição de hábito — pilar (com "+ novo pilar" inline), tipo, meta,
// frequência (todos os dias ou dias específicos) e fonte manual/automática
// (itens 3, 4, 7 do pedido).
export function PerformanceHabitForm({ pilares, onCriarPilar, habito, valoresIniciais, onSalvar, onSalvo, onCancelar }: PerformanceHabitFormProps) {
  const [nome, setNome] = useState(habito?.nome ?? valoresIniciais?.nome ?? "");
  const [descricao, setDescricao] = useState(habito?.descricao ?? "");
  const [pillarId, setPillarId] = useState<string | null>(habito?.pillar_id ?? pilares[0]?.id ?? null);
  const [novoPilarNome, setNovoPilarNome] = useState("");
  const [criandoPilar, setCriandoPilar] = useState(false);
  const [tipo, setTipo] = useState<TipoRotina>((habito?.tipo as TipoRotina) ?? valoresIniciais?.tipo ?? "boolean");
  const [metaDiaria, setMetaDiaria] = useState(String(habito?.meta_diaria ?? valoresIniciais?.metaDiaria ?? ""));
  const [unidade, setUnidade] = useState(habito?.unidade ?? "");
  const [frequencia, setFrequencia] = useState<FrequenciaHabito>((habito?.frequencia as FrequenciaHabito) ?? "todos_os_dias");
  const [diasSelecionados, setDiasSelecionados] = useState<number[]>(habito?.dias_da_semana ?? []);
  const [source, setSource] = useState<SourceHabito>((habito?.source as SourceHabito) ?? "manual");
  const [automaticKey, setAutomaticKey] = useState<AutomaticKey | null>((habito?.automatic_key as AutomaticKey) ?? null);
  const [salvando, setSalvando] = useState(false);

  const alternarDia = (dia: number) => {
    setDiasSelecionados((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]));
  };

  const confirmarNovoPilar = async () => {
    if (!novoPilarNome.trim()) return;
    const novo = await onCriarPilar(novoPilarNome.trim());
    setPillarId(novo.id);
    setNovoPilarNome("");
    setCriandoPilar(false);
  };

  const salvar = async () => {
    if (!nome.trim() || salvando) return;
    if (source === "automatic" && !automaticKey) return;
    setSalvando(true);
    try {
      const efetivoTipo = source === "automatic" ? CATALOGO_FONTES_AUTOMATICAS.find((f) => f.key === automaticKey)?.tipo ?? tipo : tipo;
      const novo = await onSalvar({
        pillarId,
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        tipo: efetivoTipo,
        metaDiaria: efetivoTipo === "boolean" ? null : metaDiaria ? Number(metaDiaria) : null,
        unidade: efetivoTipo === "numero" ? unidade.trim() || null : null,
        frequencia,
        diasDaSemana: frequencia === "dias_especificos" ? diasSelecionados : null,
        source,
        automaticKey: source === "automatic" ? automaticKey : null,
      });
      toast.success(habito ? "Rotina atualizada" : "Rotina criada");
      onSalvo(novo);
    } catch {
      toast.error("Não foi possível salvar a rotina");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Fonte</Label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={source === "manual" ? "default" : "outline"} className="flex-1" onClick={() => setSource("manual")}>
            Manual
          </Button>
          <Button type="button" size="sm" variant={source === "automatic" ? "default" : "outline"} className="flex-1" onClick={() => setSource("automatic")}>
            Automática
          </Button>
        </div>
      </div>

      {source === "automatic" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Fonte automática</Label>
          <Select
            value={automaticKey ?? undefined}
            onValueChange={(v) => {
              setAutomaticKey(v as AutomaticKey);
              const f = CATALOGO_FONTES_AUTOMATICAS.find((x) => x.key === v);
              if (f) {
                setTipo(f.tipo);
                if (!nome.trim()) setNome(f.label);
              }
            }}
          >
            <SelectTrigger><SelectValue placeholder="Escolha..." /></SelectTrigger>
            <SelectContent>
              {CATALOGO_FONTES_AUTOMATICAS.map((f) => (
                <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="perf-habito-nome" className="text-xs">Nome</Label>
        <Input id="perf-habito-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Academia" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="perf-habito-desc" className="text-xs">Descrição (opcional)</Label>
        <Input id="perf-habito-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Pilar</Label>
        {criandoPilar ? (
          <div className="flex items-center gap-1.5">
            <Input autoFocus value={novoPilarNome} onChange={(e) => setNovoPilarNome(e.target.value)} placeholder="Nome do pilar" className="h-9" />
            <Button type="button" size="sm" onClick={confirmarNovoPilar}>Criar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCriandoPilar(false)}>Cancelar</Button>
          </div>
        ) : (
          <Select value={pillarId ?? SEM_PILAR} onValueChange={(v) => (v === NOVO_PILAR ? setCriandoPilar(true) : setPillarId(v === SEM_PILAR ? null : v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_PILAR}>Sem pilar</SelectItem>
              {pilares.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              <SelectItem value={NOVO_PILAR}>+ Novo pilar</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {source === "manual" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoRotina)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OPCOES_TIPO.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {tipo !== "boolean" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="perf-habito-meta" className="text-xs">Meta diária</Label>
            <Input id="perf-habito-meta" type="number" min={0} value={metaDiaria} onChange={(e) => setMetaDiaria(e.target.value)} />
          </div>
          {tipo === "numero" && source === "manual" && (
            <div className="space-y-1.5">
              <Label htmlFor="perf-habito-unidade" className="text-xs">Unidade</Label>
              <Input id="perf-habito-unidade" value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="litros" />
            </div>
          )}
        </div>
      )}

      {source === "manual" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Frequência</Label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={frequencia === "todos_os_dias" ? "default" : "outline"} className="flex-1" onClick={() => setFrequencia("todos_os_dias")}>
              Todos os dias
            </Button>
            <Button type="button" size="sm" variant={frequencia === "dias_especificos" ? "default" : "outline"} className="flex-1" onClick={() => setFrequencia("dias_especificos")}>
              Dias específicos
            </Button>
          </div>
          {frequencia === "dias_especificos" && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {DIAS_SEMANA.map((d) => (
                <button
                  key={d.valor}
                  type="button"
                  onClick={() => alternarDia(d.valor)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                    diasSelecionados.includes(d.valor) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="button" className="flex-1" disabled={!nome.trim() || salvando || (source === "automatic" && !automaticKey)} onClick={salvar}>
          {salvando ? "Salvando..." : habito ? "Salvar" : "Criar rotina"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  );
}
