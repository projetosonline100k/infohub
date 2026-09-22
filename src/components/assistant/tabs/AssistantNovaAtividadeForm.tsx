import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssistantProjetoOpcao } from "@/hooks/useAssistantProjeto";
import type { ColunaAtividade, NovaAtividadeInput } from "@/hooks/useAssistantAtividades";

const PESSOAL = "__pessoal__";

interface AssistantNovaAtividadeFormProps {
  projetos: AssistantProjetoOpcao[];
  projetoIdPadrao: string | null;
  colunasDoProjeto: (clienteId: string | null) => Promise<ColunaAtividade[]>;
  onCriar: (input: NovaAtividadeInput) => Promise<unknown>;
  onCancelar: () => void;
}

// Formulário rápido de criação — item 5. Insere direto na MESMA tabela
// (useAssistantAtividades.criarAtividade -> mesmos campos/defaults de
// adicionarAtividadeNoStatus em AtividadesView.tsx), então já aparece no
// Kanban principal.
export function AssistantNovaAtividadeForm({ projetos, projetoIdPadrao, colunasDoProjeto, onCriar, onCancelar }: AssistantNovaAtividadeFormProps) {
  const [titulo, setTitulo] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(projetoIdPadrao);
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [estimativa, setEstimativa] = useState("");
  const [prioridade, setPrioridade] = useState("media");
  const [colunas, setColunas] = useState<ColunaAtividade[]>([]);
  const [statusKey, setStatusKey] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    colunasDoProjeto(clienteId).then((cols) => {
      if (cancelado) return;
      setColunas(cols);
      setStatusKey((atual) => (cols.some((c) => c.status_key === atual) ? atual : cols[0]?.status_key || ""));
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const criar = async () => {
    if (!titulo.trim() || salvando) return;
    setSalvando(true);
    try {
      await onCriar({
        titulo: titulo.trim(),
        clienteId,
        dataAtividade: data,
        tempoEstimado: estimativa ? Number(estimativa) : null,
        prioridade,
        statusKey: statusKey || "backlog",
      });
      toast.success("Atividade criada");
      onCancelar();
    } catch {
      toast.error("Não foi possível criar a atividade");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="assistant-nova-titulo" className="text-xs">Título</Label>
        <Input id="assistant-nova-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="O que precisa ser feito?" autoFocus />
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

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="assistant-nova-data" className="text-xs">Data</Label>
          <Input id="assistant-nova-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assistant-nova-estimativa" className="text-xs">Estimativa (min)</Label>
          <Input id="assistant-nova-estimativa" type="number" min={0} value={estimativa} onChange={(e) => setEstimativa(e.target.value)} placeholder="40" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
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
