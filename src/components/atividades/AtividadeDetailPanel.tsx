import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "./StatusBadge";
import { PriorityFlag } from "./PriorityFlag";
import { SubtarefasList } from "./SubtarefasList";
import { DocumentosList } from "@/components/documentos/DocumentosList";
import { DocumentEditor } from "@/components/documentos/DocumentEditor";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarIcon,
  Clock,
  Star,
  X,
  Trash2,
  FileText,
  Plus,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseResponsaveis, formatResponsaveis } from "@/lib/responsaveis";

interface Atividade {
  id: string;
  cliente_id: string | null;
  titulo: string;
  descricao: string | null;
  concluida: boolean;
  tempo_estimado: number | null;
  data_atividade: string;
  ordem: number;
  destaque: boolean;
  status: string;
  prioridade: string;
  data_vencimento: string | null;
  data_inicio: string | null;
  responsavel_nome: string | null;
}

interface Coluna {
  status_key: string;
  nome: string;
  eh_conclusao: boolean;
}

interface AtividadeDetailPanelProps {
  open: boolean;
  onClose: () => void;
  atividade: Atividade | null;
  colunas: Coluna[];
  onUpdate: () => void;
  onDelete: (id: string) => void;
}

const formatTempo = (minutos: number): string => {
  if (minutos >= 60) {
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return mins > 0 ? `${horas}h ${mins}min` : `${horas}h`;
  }
  return `${minutos}min`;
};

export const AtividadeDetailPanel = ({
  open,
  onClose,
  atividade,
  colunas,
  onUpdate,
  onDelete,
}: AtividadeDetailPanelProps) => {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [status, setStatus] = useState("pendente");
  const [prioridade, setPrioridade] = useState("media");
  const [tempoEstimado, setTempoEstimado] = useState<number | null>(null);
  const [destaque, setDestaque] = useState(false);
  const [dataVencimento, setDataVencimento] = useState<Date | undefined>();
  const [dataInicio, setDataInicio] = useState<Date | undefined>();
  const [responsaveis, setResponsaveis] = useState<string[]>([]);
  const [novoResponsavel, setNovoResponsavel] = useState("");
  const [responsavelPopoverAberto, setResponsavelPopoverAberto] = useState(false);
  const [sugestoesEquipe, setSugestoesEquipe] = useState<string[]>([]);
  const [checklistResumo, setChecklistResumo] = useState({ total: 0, concluidas: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (atividade) {
      setTitulo(atividade.titulo);
      setDescricao(atividade.descricao || "");
      setStatus(atividade.status);
      setPrioridade(atividade.prioridade);
      setTempoEstimado(atividade.tempo_estimado);
      setDestaque(atividade.destaque);
      setDataVencimento(
        atividade.data_vencimento ? parseISO(atividade.data_vencimento) : undefined
      );
      setDataInicio(
        atividade.data_inicio ? parseISO(atividade.data_inicio) : undefined
      );
      setResponsaveis(parseResponsaveis(atividade.responsavel_nome));
      setNovoResponsavel("");
      setChecklistResumo({ total: 0, concluidas: 0 });
    }
  }, [atividade]);

  // Sugere nomes da equipe do cliente para preencher o responsável.
  useEffect(() => {
    if (!atividade?.cliente_id) {
      setSugestoesEquipe([]);
      return;
    }
    supabase
      .from("equipe_cliente")
      .select("nome_pessoa")
      .eq("cliente_id", atividade.cliente_id)
      .then(({ data }) => setSugestoesEquipe((data || []).map((m) => m.nome_pessoa)));
  }, [atividade?.cliente_id]);

  // Aceita overrides porque handlers de clique/seleção chamam salvar()
  // no mesmo instante em que mudam o estado — como a atualização de estado
  // do React é assíncrona, ler das variáveis de estado aqui pegaria o
  // valor antigo. O valor novo precisa ser passado explicitamente.
  const salvar = async (overrides?: {
    status?: string;
    prioridade?: string;
    destaque?: boolean;
    dataVencimento?: Date | undefined;
    dataInicio?: Date | undefined;
    responsaveis?: string[];
  }) => {
    if (!atividade) return;

    const valores = {
      status,
      prioridade,
      destaque,
      dataVencimento,
      dataInicio,
      responsaveis,
      ...overrides,
    };

    setSaving(true);
    try {
      const colunaAtual = colunas.find((c) => c.status_key === valores.status);
      const payload: Record<string, unknown> = {
        titulo,
        descricao: descricao || null,
        status: valores.status,
        concluida: !!colunaAtual?.eh_conclusao,
        prioridade: valores.prioridade,
        tempo_estimado: tempoEstimado,
        destaque: valores.destaque,
        data_vencimento: valores.dataVencimento
          ? format(valores.dataVencimento, "yyyy-MM-dd")
          : null,
        data_inicio: valores.dataInicio ? format(valores.dataInicio, "yyyy-MM-dd") : null,
        responsavel_nome: formatResponsaveis(valores.responsaveis),
      };
      // Quando uma Data Início é escolhida agora, ela passa a decidir em
      // qual dia a tarefa aparece no modo lista — sem isso a tarefa ficava
      // presa no dia em que foi criada (normalmente hoje, se veio do quadro),
      // mesmo depois de agendada para outro dia.
      if (overrides?.dataInicio) {
        payload.data_atividade = format(overrides.dataInicio, "yyyy-MM-dd");
      }
      const { error } = await supabase
        .from("atividades")
        .update(payload)
        .eq("id", atividade.id);

      if (error) throw error;

      toast.success("Atividade atualizada");
      onUpdate();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar atividade");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = (novoStatus: string) => {
    const colunaAlvo = colunas.find((c) => c.status_key === novoStatus);
    if (
      colunaAlvo?.eh_conclusao &&
      checklistResumo.total > 0 &&
      checklistResumo.concluidas < checklistResumo.total
    ) {
      toast.error("Finalize todos os itens do checklist antes de concluir a tarefa");
      return;
    }
    setStatus(novoStatus);
    salvar({ status: novoStatus });
  };

  const alternarResponsavel = (nome: string, marcado: boolean) => {
    const novaLista = marcado ? Array.from(new Set([...responsaveis, nome])) : responsaveis.filter((n) => n !== nome);
    setResponsaveis(novaLista);
    salvar({ responsaveis: novaLista });
  };

  const adicionarResponsavelLivre = () => {
    const nome = novoResponsavel.trim();
    if (!nome) return;
    setNovoResponsavel("");
    if (responsaveis.includes(nome)) return;
    const novaLista = [...responsaveis, nome];
    setResponsaveis(novaLista);
    salvar({ responsaveis: novaLista });
  };

  const handleDelete = () => {
    if (atividade) {
      onDelete(atividade.id);
      onClose();
    }
  };

  if (!atividade) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="space-y-4 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Tarefa
              </span>
              <span className="text-xs text-muted-foreground">
                #{atividade.id.slice(0, 8)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDelete}
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <SheetTitle className="text-left">
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onBlur={() => salvar()}
              className="text-xl font-semibold bg-transparent border-none shadow-none focus-visible:ring-0 px-0 h-auto"
            />
          </SheetTitle>
        </SheetHeader>

        <div className="py-6 space-y-6">
          {/* Properties Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={status} onValueChange={handleStatusChange}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colunas.map((coluna) => (
                    <SelectItem key={coluna.status_key} value={coluna.status_key}>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full",
                            coluna.eh_conclusao ? "bg-green-400" : "bg-muted-foreground"
                          )}
                        />
                        {coluna.nome}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Prioridade</label>
              <Select value={prioridade} onValueChange={(v) => { setPrioridade(v); salvar({ prioridade: v }); }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">
                    <div className="flex items-center gap-2">
                      <PriorityFlag priority="baixa" />
                      Baixa
                    </div>
                  </SelectItem>
                  <SelectItem value="media">
                    <div className="flex items-center gap-2">
                      <PriorityFlag priority="media" />
                      Média
                    </div>
                  </SelectItem>
                  <SelectItem value="alta">
                    <div className="flex items-center gap-2">
                      <PriorityFlag priority="alta" />
                      Alta
                    </div>
                  </SelectItem>
                  <SelectItem value="urgente">
                    <div className="flex items-center gap-2">
                      <PriorityFlag priority="urgente" />
                      Urgente
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Responsible — mais de uma pessoa pode ser responsável pela mesma tarefa */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Responsável</label>
              <Popover open={responsavelPopoverAberto} onOpenChange={setResponsavelPopoverAberto}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-9 w-full justify-start gap-1.5 px-3 py-1.5 font-normal"
                  >
                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {responsaveis.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {responsaveis.map((nome) => (
                          <Badge key={nome} variant="secondary" className="text-xs">{nome}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Quem é responsável?</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="start">
                  <div className="space-y-3">
                    {Array.from(new Set([...sugestoesEquipe, ...responsaveis])).length > 0 && (
                      <div className="max-h-48 space-y-2 overflow-y-auto">
                        {Array.from(new Set([...sugestoesEquipe, ...responsaveis])).map((nome) => (
                          <div key={nome} className="flex items-center gap-2">
                            <Checkbox
                              id={`resp-${nome}`}
                              checked={responsaveis.includes(nome)}
                              onCheckedChange={(checked) => alternarResponsavel(nome, checked === true)}
                            />
                            <label htmlFor={`resp-${nome}`} className="flex-1 cursor-pointer truncate text-sm">{nome}</label>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1.5 border-t pt-2">
                      <Input
                        value={novoResponsavel}
                        onChange={(e) => setNovoResponsavel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); adicionarResponsavelLivre(); }
                        }}
                        placeholder="Adicionar outro nome..."
                        className="h-8 text-sm"
                      />
                      <Button type="button" size="sm" variant="secondary" onClick={adicionarResponsavelLivre}>
                        Adicionar
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Data Início</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-9",
                      !dataInicio && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataInicio
                      ? format(dataInicio, "dd/MM/yyyy", { locale: ptBR })
                      : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dataInicio}
                    onSelect={(d) => { setDataInicio(d); salvar({ dataInicio: d }); }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Data Vencimento</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-9",
                      !dataVencimento && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataVencimento
                      ? format(dataVencimento, "dd/MM/yyyy", { locale: ptBR })
                      : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dataVencimento}
                    onSelect={(d) => { setDataVencimento(d); salvar({ dataVencimento: d }); }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Estimated Time */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Tempo Estimado</label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={tempoEstimado || ""}
                  onChange={(e) => setTempoEstimado(e.target.value ? parseInt(e.target.value) : null)}
                  onBlur={() => salvar()}
                  placeholder="Minutos"
                  className="h-9"
                />
              </div>
            </div>

            {/* Highlight */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Destaque</label>
              <Button
                variant={destaque ? "default" : "outline"}
                size="sm"
                onClick={() => { const novoDestaque = !destaque; setDestaque(novoDestaque); salvar({ destaque: novoDestaque }); }}
                className="w-full h-9"
              >
                <Star className={cn("h-4 w-4 mr-2", destaque && "fill-current")} />
                {destaque ? "Destacada" : "Destacar"}
              </Button>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Descrição</label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              onBlur={() => salvar()}
              placeholder="Adicionar descrição..."
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Subtasks */}
          <div className="border-t border-border pt-4">
            <SubtarefasList
              atividadeId={atividade.id}
              onResumoChange={(resumo) => {
                setChecklistResumo(resumo);
                // O quadro (kanban) decide se pode finalizar com base no
                // checklist que ele já tem carregado; sem isso, marcar o
                // último item aqui não refletia lá até algo mais recarregar.
                onUpdate();
              }}
            />
          </div>

          {/* Documents */}
          <DocumentosSection atividadeId={atividade.id} clienteId={atividade.cliente_id} atividadeTitulo={atividade.titulo} />
        </div>
      </SheetContent>
    </Sheet>
  );
};

// Separate component for documents section
function DocumentosSection({
  atividadeId,
  clienteId,
  atividadeTitulo,
}: {
  atividadeId: string;
  clienteId: string | null;
  atividadeTitulo: string;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const criarNovoDocumento = async () => {
    const { data, error } = await supabase
      .from("documentos")
      .insert({
        atividade_id: atividadeId,
        cliente_id: clienteId,
        titulo: atividadeTitulo || "Documento sem título",
      })
      .select()
      .single();

    if (data && !error) {
      setSelectedDocId(data.id);
      setEditorOpen(true);
    } else {
      toast.error("Erro ao criar documento");
    }
  };

  const handleOpenDoc = (docId: string) => {
    setSelectedDocId(docId);
    setEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setEditorOpen(false);
    setSelectedDocId(null);
    setRefreshKey((k) => k + 1);
  };

  return (
    <>
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Documentos</span>
          </div>
          <Button size="sm" variant="ghost" onClick={criarNovoDocumento} className="h-7 px-2">
            <Plus className="h-4 w-4 mr-1" />
            Novo Doc
          </Button>
        </div>
        <DocumentosList 
          key={refreshKey}
          atividadeId={atividadeId} 
          onOpenDoc={handleOpenDoc} 
        />
      </div>

      {editorOpen && selectedDocId && (
        <DocumentEditor documentoId={selectedDocId} onClose={handleCloseEditor} />
      )}
    </>
  );
}
