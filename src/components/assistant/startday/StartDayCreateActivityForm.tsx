import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatarTempo } from "@/lib/utils";
import type { AssistantProjetoOpcao } from "@/hooks/useAssistantProjeto";
import type { AssistantTarefa, ColunaAtividade, NovaAtividadeInput } from "@/hooks/useAssistantAtividades";

const PESSOAL = "__pessoal__";
const SEM_PASTA = "__sem_pasta__";

interface Pasta {
  id: string;
  nome: string;
}

interface StartDayCreateActivityFormProps {
  projetos: AssistantProjetoOpcao[];
  projetoIdPadrao: string | null;
  tituloInicial?: string;
  colunasDoProjeto: (clienteId: string | null) => Promise<ColunaAtividade[]>;
  onCriar: (input: NovaAtividadeInput) => Promise<AssistantTarefa>;
  onCriada: (atividade: AssistantTarefa) => void;
  onCancelar: () => void;
}

// Criação inline dentro do ritual matinal (80/20 e "ontem → hoje") — mesmos
// campos de AssistantEditarAtividadeForm.tsx (título, projeto, pasta,
// coluna/status, data, estimativa, descanso, prioridade), mas criando em
// vez de editar. Chama EXATAMENTE a função central de criação (via a
// wrapper de useAssistantAtividades.ts, passada por quem chama) — a
// atividade nasce real, aparece no Kanban normalmente, e quem chamou decide
// como usá-la (auto-selecionar no 80/20, ver onCriada).
export function StartDayCreateActivityForm({
  projetos,
  projetoIdPadrao,
  tituloInicial,
  colunasDoProjeto,
  onCriar,
  onCriada,
  onCancelar,
}: StartDayCreateActivityFormProps) {
  const [titulo, setTitulo] = useState(tituloInicial ?? "");
  const [clienteId, setClienteId] = useState<string | null>(projetoIdPadrao);
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [estimativa, setEstimativa] = useState("");
  const [descanso, setDescanso] = useState("");
  const [prioridade, setPrioridade] = useState("media");
  const [colunas, setColunas] = useState<ColunaAtividade[]>([]);
  const [statusKey, setStatusKey] = useState("");
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [pastaId, setPastaId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    colunasDoProjeto(clienteId).then((cols) => {
      if (cancelado) return;
      setColunas(cols);
      const naoConclusao = cols.find((c) => !c.eh_conclusao) ?? cols[0];
      setStatusKey((atual) => (cols.some((c) => c.status_key === atual) ? atual : naoConclusao?.status_key || ""));
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  useEffect(() => {
    let cancelado = false;
    setPastaId(null);
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

  const criar = async () => {
    if (!titulo.trim() || salvando) return;
    setSalvando(true);
    try {
      const coluna = colunas.find((c) => c.status_key === statusKey);
      const nova = await onCriar({
        titulo: titulo.trim(),
        clienteId,
        pastaId,
        dataAtividade: data,
        tempoEstimado: estimativa ? Number(estimativa) : null,
        tempoDescanso: descanso ? Number(descanso) : null,
        prioridade,
        statusKey: statusKey || "backlog",
      });
      toast.success("Atividade criada");
      onCriada(nova);
    } catch {
      toast.error("Não foi possível criar a atividade agora. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="startday-criar-titulo" className="text-xs">Título</Label>
        <Input id="startday-criar-titulo" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} />
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
          <Label htmlFor="startday-criar-data" className="text-xs">Data</Label>
          <Input id="startday-criar-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
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
          <Label htmlFor="startday-criar-estimativa" className="text-xs">Foco (min)</Label>
          <Input id="startday-criar-estimativa" type="number" min={0} value={estimativa} onChange={(e) => setEstimativa(e.target.value)} placeholder="40" />
          {Number(estimativa) > 0 && <p className="text-xs text-muted-foreground">= {formatarTempo(Number(estimativa))}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="startday-criar-descanso" className="text-xs">Descanso (min)</Label>
          <Input id="startday-criar-descanso" type="number" min={0} value={descanso} onChange={(e) => setDescanso(e.target.value)} placeholder="10" />
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
        <Button type="button" className="flex-1" disabled={!titulo.trim() || salvando} onClick={criar}>
          {salvando ? "Criando..." : "Criar"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
