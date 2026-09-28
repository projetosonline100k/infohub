import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatarTempo } from "@/lib/utils";
import type { AssistantProjetoOpcao } from "@/hooks/useAssistantProjeto";
import type { AssistantTarefa, ColunaAtividade } from "@/hooks/useAssistantAtividades";

const PESSOAL = "__pessoal__";
const SEM_PASTA = "__sem_pasta__";

interface Pasta {
  id: string;
  nome: string;
}

export type PatchAtividade = Partial<
  Pick<AssistantTarefa, "titulo" | "tempo_estimado" | "tempo_descanso" | "prioridade" | "data_atividade" | "cliente_id" | "pasta_id" | "status" | "concluida">
>;

interface AssistantEditarAtividadeFormProps {
  atividade: AssistantTarefa;
  projetos: AssistantProjetoOpcao[];
  colunasDoProjeto: (clienteId: string | null) => Promise<ColunaAtividade[]>;
  onSalvar: (id: string, patch: PatchAtividade) => Promise<unknown>;
  onCancelar: () => void;
}

// Item 4: edição completa da atividade a partir do Jarvis — mesmos campos
// pedidos (título, estimativa, descanso, prioridade, data, projeto/pasta/
// coluna), salvando via atualizarAtividade (useAssistantAtividades.ts).
export function AssistantEditarAtividadeForm({ atividade, projetos, colunasDoProjeto, onSalvar, onCancelar }: AssistantEditarAtividadeFormProps) {
  const [titulo, setTitulo] = useState(atividade.titulo);
  const [clienteId, setClienteId] = useState<string | null>(atividade.cliente_id);
  const [data, setData] = useState(atividade.data_atividade);
  const [estimativa, setEstimativa] = useState(atividade.tempo_estimado ? String(atividade.tempo_estimado) : "");
  const [descanso, setDescanso] = useState(atividade.tempo_descanso ? String(atividade.tempo_descanso) : "");
  const [prioridade, setPrioridade] = useState(atividade.prioridade);
  const [colunas, setColunas] = useState<ColunaAtividade[]>([]);
  const [statusKey, setStatusKey] = useState(atividade.status);
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [pastaId, setPastaId] = useState<string | null>(atividade.pasta_id);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    colunasDoProjeto(clienteId).then((cols) => {
      if (cancelado) return;
      setColunas(cols);
      setStatusKey((atual) => (cols.some((c) => c.status_key === atual) ? atual : cols[0]?.status_key || atual));
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  useEffect(() => {
    let cancelado = false;
    if (!clienteId) {
      setPastas([]);
      return;
    }
    supabase
      .from("pastas_atividade")
      .select("id, nome")
      .eq("cliente_id", clienteId)
      .is("deleted_at", null)
      .order("ordem", { ascending: true })
      .then(({ data: rows, error }) => {
        if (cancelado || error) return;
        setPastas(rows || []);
      });
    return () => {
      cancelado = true;
    };
  }, [clienteId]);

  const salvar = async () => {
    if (!titulo.trim() || salvando) return;
    setSalvando(true);
    try {
      const coluna = colunas.find((c) => c.status_key === statusKey);
      await onSalvar(atividade.id, {
        titulo: titulo.trim(),
        cliente_id: clienteId,
        pasta_id: pastaId,
        data_atividade: data,
        tempo_estimado: estimativa ? Number(estimativa) : null,
        tempo_descanso: descanso ? Number(descanso) : null,
        prioridade,
        status: statusKey,
        concluida: !!coluna?.eh_conclusao,
      });
      toast.success("Atividade atualizada");
      onCancelar();
    } catch {
      toast.error("Não foi possível salvar as alterações");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="assistant-editar-titulo" className="text-xs">Título</Label>
        <Input id="assistant-editar-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Projeto</Label>
        <Select value={clienteId ?? PESSOAL} onValueChange={(v) => setClienteId(v === PESSOAL ? null : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={PESSOAL}>Pessoal (sem projeto)</SelectItem>
            {projetos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {clienteId && (
        <div className="space-y-1.5">
          <Label className="text-xs">Pasta</Label>
          <Select value={pastaId ?? SEM_PASTA} onValueChange={(v) => setPastaId(v === SEM_PASTA ? null : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_PASTA}>Sem pasta</SelectItem>
              {pastas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="assistant-editar-data" className="text-xs">Data</Label>
          <Input id="assistant-editar-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={statusKey} onValueChange={setStatusKey}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {colunas.map((c) => <SelectItem key={c.status_key} value={c.status_key}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="assistant-editar-estimativa" className="text-xs">Foco (min)</Label>
          <Input id="assistant-editar-estimativa" type="number" min={0} value={estimativa} onChange={(e) => setEstimativa(e.target.value)} placeholder="40" />
          {Number(estimativa) > 0 && <p className="text-xs text-muted-foreground">= {formatarTempo(Number(estimativa))}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assistant-editar-descanso" className="text-xs">Descanso (min)</Label>
          <Input id="assistant-editar-descanso" type="number" min={0} value={descanso} onChange={(e) => setDescanso(e.target.value)} placeholder="10" />
          {Number(descanso) > 0 && <p className="text-xs text-muted-foreground">= {formatarTempo(Number(descanso))}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Prioridade</Label>
        <Select value={prioridade} onValueChange={setPrioridade}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="baixa">Baixa</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" className="flex-1" disabled={!titulo.trim() || salvando} onClick={salvar}>
          {salvando ? "Salvando..." : "Salvar"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
