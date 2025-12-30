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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
}

interface AtividadeDetailPanelProps {
  open: boolean;
  onClose: () => void;
  atividade: Atividade | null;
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
    }
  }, [atividade]);

  const salvar = async () => {
    if (!atividade) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("atividades")
        .update({
          titulo,
          descricao: descricao || null,
          status,
          prioridade,
          tempo_estimado: tempoEstimado,
          destaque,
          data_vencimento: dataVencimento
            ? format(dataVencimento, "yyyy-MM-dd")
            : null,
          data_inicio: dataInicio ? format(dataInicio, "yyyy-MM-dd") : null,
        })
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
              onBlur={salvar}
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
              <Select value={status} onValueChange={(v) => { setStatus(v); setTimeout(salvar, 100); }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                      Pendente
                    </div>
                  </SelectItem>
                  <SelectItem value="em_progresso">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      Em Progresso
                    </div>
                  </SelectItem>
                  <SelectItem value="finalizado">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-400" />
                      Finalizado
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Prioridade</label>
              <Select value={prioridade} onValueChange={(v) => { setPrioridade(v); setTimeout(salvar, 100); }}>
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
                    onSelect={(d) => { setDataInicio(d); setTimeout(salvar, 100); }}
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
                    onSelect={(d) => { setDataVencimento(d); setTimeout(salvar, 100); }}
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
                  onBlur={salvar}
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
                onClick={() => { setDestaque(!destaque); setTimeout(salvar, 100); }}
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
              onBlur={salvar}
              placeholder="Adicionar descrição..."
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Subtasks */}
          <div className="border-t border-border pt-4">
            <SubtarefasList atividadeId={atividade.id} />
          </div>

          {/* Documents */}
          <DocumentosSection atividadeId={atividade.id} clienteId={atividade.cliente_id} />
        </div>
      </SheetContent>
    </Sheet>
  );
};

// Separate component for documents section
function DocumentosSection({ atividadeId, clienteId }: { atividadeId: string; clienteId: string | null }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const criarNovoDocumento = async () => {
    const { data, error } = await supabase
      .from("documentos")
      .insert({
        atividade_id: atividadeId,
        cliente_id: clienteId,
        titulo: "Documento sem título",
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
