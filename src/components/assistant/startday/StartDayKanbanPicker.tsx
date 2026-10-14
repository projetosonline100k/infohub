import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Clock, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AssistantTarefa, ColunaAtividade, NovaAtividadeInput } from "@/hooks/useAssistantAtividades";
import type { AssistantProjetoOpcao } from "@/hooks/useAssistantProjeto";

const SEM_PROJETO = "__pessoal__";

interface StartDayKanbanPickerProps {
  tarefas: AssistantTarefa[];
  projetos: AssistantProjetoOpcao[];
  projetoIdAtual: string | null;
  selecionadas: string[];
  limite: number;
  onAlternar: (id: string) => void;
  colunasDoProjeto: (clienteId: string | null) => Promise<ColunaAtividade[]>;
  onCriarAtividade: (input: NovaAtividadeInput) => Promise<AssistantTarefa>;
  onAtividadeCriada: (id: string) => void;
}

// Iniciar o dia → "Escolha até 3 atividades", no jeito Kanban (pedido do
// Davi: é pelo Kanban que ele se guia). Escolhe o projeto, vê as colunas
// dele lado a lado; tocar numa atividade seleciona pra hoje, e o "+" de cada
// coluna cria uma atividade ali mesmo (só o título; já entra selecionada).
export function StartDayKanbanPicker({
  tarefas,
  projetos,
  projetoIdAtual,
  selecionadas,
  limite,
  onAlternar,
  colunasDoProjeto,
  onCriarAtividade,
  onAtividadeCriada,
}: StartDayKanbanPickerProps) {
  const [projetoId, setProjetoId] = useState<string | null>(projetoIdAtual ?? projetos[0]?.id ?? null);
  const [colunas, setColunas] = useState<ColunaAtividade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criandoEm, setCriandoEm] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    void colunasDoProjeto(projetoId).then((cols) => {
      if (cancelado) return;
      setColunas([...cols].filter((c) => !c.eh_conclusao).sort((a, b) => a.ordem - b.ordem));
      setCarregando(false);
    });
    return () => { cancelado = true; };
  }, [projetoId, colunasDoProjeto]);

  useEffect(() => { if (criandoEm) inputRef.current?.focus(); }, [criandoEm]);

  const porColuna = useMemo(() => {
    const mapa: Record<string, AssistantTarefa[]> = {};
    colunas.forEach((c) => { mapa[c.status_key] = []; });
    tarefas
      .filter((t) => (t.cliente_id ?? null) === projetoId)
      .forEach((t) => { if (mapa[t.status]) mapa[t.status].push(t); });
    Object.values(mapa).forEach((l) => l.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)));
    return mapa;
  }, [tarefas, colunas, projetoId]);

  const criar = async (coluna: ColunaAtividade) => {
    const t = titulo.trim();
    if (!t || salvando) return;
    setSalvando(true);
    try {
      const nova = await onCriarAtividade({
        titulo: t,
        clienteId: projetoId,
        dataAtividade: format(new Date(), "yyyy-MM-dd"),
        tempoEstimado: null,
        prioridade: "media",
        statusKey: coluna.status_key,
      });
      if (selecionadas.length < limite) onAtividadeCriada(nova.id);
      toast.success(selecionadas.length < limite ? "Atividade criada e selecionada" : "Atividade criada");
      setTitulo("");
      setCriandoEm(null);
    } catch {
      toast.error("Não foi possível criar a atividade agora. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-2">
      <Select value={projetoId ?? SEM_PROJETO} onValueChange={(v) => { setProjetoId(v === SEM_PROJETO ? null : v); setCriandoEm(null); }}>
        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {projetos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          <SelectItem value={SEM_PROJETO}>Sem projeto (pessoal)</SelectItem>
        </SelectContent>
      </Select>

      {carregando ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="flex max-h-[340px] gap-2 overflow-x-auto pb-1">
          {colunas.map((coluna) => {
            const itens = porColuna[coluna.status_key] ?? [];
            return (
              <div key={coluna.status_key} className="flex w-52 shrink-0 flex-col rounded-lg border border-border bg-muted/30">
                <div className="flex items-center justify-between gap-1 border-b border-border px-2 py-1.5">
                  <p className="truncate text-xs font-semibold">{coluna.nome} <span className="font-normal text-muted-foreground">({itens.length})</span></p>
                  <button type="button" onClick={() => { setCriandoEm(coluna.status_key); setTitulo(""); }}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" title={`Nova atividade em "${coluna.nome}"`}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-h-[40px] flex-1 space-y-1 overflow-y-auto p-1.5">
                  {criandoEm === coluna.status_key && (
                    <div className="space-y-1">
                      <Input ref={inputRef} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título e Enter"
                        disabled={salvando} className="h-8 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); void criar(coluna); }
                          if (e.key === "Escape") { e.stopPropagation(); setCriandoEm(null); }
                        }} />
                      <p className="px-0.5 text-[10px] text-muted-foreground">Enter cria · Esc cancela</p>
                    </div>
                  )}
                  {itens.map((t) => {
                    const marcada = selecionadas.includes(t.id);
                    const desabilitada = !marcada && selecionadas.length >= limite;
                    return (
                      <button key={t.id} type="button" disabled={desabilitada} onClick={() => onAlternar(t.id)}
                        className={cn(
                          "flex w-full items-start gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                          marcada ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-primary/40 disabled:pointer-events-none disabled:opacity-40",
                        )}>
                        <span aria-hidden="true" className="mt-px">{marcada ? "✓" : "○"}</span>
                        <span className="min-w-0 flex-1 break-words">{t.titulo}</span>
                        {t.tempo_estimado ? <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground"><Clock className="h-2.5 w-2.5" />{t.tempo_estimado}</span> : null}
                      </button>
                    );
                  })}
                  {!itens.length && criandoEm !== coluna.status_key && <p className="px-1 py-2 text-[11px] text-muted-foreground">Vazia</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
