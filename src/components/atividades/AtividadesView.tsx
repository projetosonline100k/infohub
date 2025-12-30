import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Plus, Bike, MoreHorizontal, ArrowUpDown } from "lucide-react";
import { AtividadeItem } from "./AtividadeItem";
import { DiaSection } from "./DiaSection";
import { AtividadeForm } from "./AtividadeForm";
import { toast } from "sonner";
import { format, startOfWeek, addDays, parseISO, isEqual } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  created_at: string;
}

interface AtividadesViewProps {
  clienteId?: string;
}

const DIAS_SEMANA = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

// Parse tempo from text like "1h", "40min", "30m"
const parseTempoFromText = (text: string): { titulo: string; tempo: number | null } => {
  const tempoRegex = /(\d+)\s*(h|hora|hr|min|m|minutos?)\b/gi;
  let totalMinutos = 0;
  let titulo = text;
  let match;
  
  while ((match = tempoRegex.exec(text)) !== null) {
    const valor = parseInt(match[1]);
    const unidade = match[2].toLowerCase();
    
    if (unidade.startsWith("h")) {
      totalMinutos += valor * 60;
    } else {
      totalMinutos += valor;
    }
    
    titulo = titulo.replace(match[0], "").trim();
  }
  
  return {
    titulo: titulo || text,
    tempo: totalMinutos > 0 ? totalMinutos : null,
  };
};

export const AtividadesView = ({ clienteId }: AtividadesViewProps) => {
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [novaAtividade, setNovaAtividade] = useState("");
  const [diasAbertos, setDiasAbertos] = useState<Record<string, boolean>>({});
  const [editingAtividade, setEditingAtividade] = useState<Atividade | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Get current week's days
  const getWeekDays = () => {
    const hoje = new Date();
    const inicioSemana = startOfWeek(hoje, { weekStartsOn: 1 }); // Monday start
    return DIAS_SEMANA.map((dia, index) => ({
      nome: dia,
      data: format(addDays(inicioSemana, index), "yyyy-MM-dd"),
    }));
  };

  const weekDays = getWeekDays();

  const carregarAtividades = async () => {
    try {
      let query = supabase
        .from("atividades")
        .select("*")
        .order("ordem", { ascending: true });

      if (clienteId) {
        query = query.eq("cliente_id", clienteId);
      } else {
        query = query.is("cliente_id", null);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAtividades(data || []);

      // Open days that have tasks
      const diasComTarefas: Record<string, boolean> = {};
      (data || []).forEach((atividade) => {
        const diaIndex = weekDays.findIndex(d => d.data === atividade.data_atividade);
        if (diaIndex !== -1) {
          diasComTarefas[weekDays[diaIndex].nome] = true;
        }
      });
      setDiasAbertos(diasComTarefas);
    } catch (error) {
      console.error("Erro ao carregar atividades:", error);
      toast.error("Erro ao carregar atividades");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarAtividades();
  }, [clienteId]);

  const adicionarAtividade = async () => {
    if (!novaAtividade.trim()) return;

    const { titulo, tempo } = parseTempoFromText(novaAtividade);
    const hoje = format(new Date(), "yyyy-MM-dd");

    try {
      const { error } = await supabase.from("atividades").insert({
        titulo,
        tempo_estimado: tempo,
        data_atividade: hoje,
        cliente_id: clienteId || null,
        ordem: atividades.length + 1,
      });

      if (error) throw error;

      setNovaAtividade("");
      carregarAtividades();
      toast.success("Atividade adicionada");
    } catch (error) {
      console.error("Erro ao adicionar atividade:", error);
      toast.error("Erro ao adicionar atividade");
    }
  };

  const toggleAtividade = async (id: string, concluida: boolean) => {
    try {
      const { error } = await supabase
        .from("atividades")
        .update({ concluida })
        .eq("id", id);

      if (error) throw error;

      setAtividades((prev) =>
        prev.map((a) => (a.id === id ? { ...a, concluida } : a))
      );
    } catch (error) {
      console.error("Erro ao atualizar atividade:", error);
      toast.error("Erro ao atualizar atividade");
    }
  };

  const excluirAtividade = async (id: string) => {
    try {
      const { error } = await supabase.from("atividades").delete().eq("id", id);

      if (error) throw error;

      setAtividades((prev) => prev.filter((a) => a.id !== id));
      toast.success("Atividade excluída");
    } catch (error) {
      console.error("Erro ao excluir atividade:", error);
      toast.error("Erro ao excluir atividade");
    }
  };

  const salvarAtividade = async (dados: Partial<Atividade>) => {
    try {
      if (dados.id) {
        const { error } = await supabase
          .from("atividades")
          .update({
            titulo: dados.titulo,
            descricao: dados.descricao,
            tempo_estimado: dados.tempo_estimado,
            destaque: dados.destaque,
          })
          .eq("id", dados.id);

        if (error) throw error;
        toast.success("Atividade atualizada");
      }
      carregarAtividades();
    } catch (error) {
      console.error("Erro ao salvar atividade:", error);
      toast.error("Erro ao salvar atividade");
    }
  };

  const getAtividadesDoDia = (dataStr: string) => {
    return atividades.filter((a) => a.data_atividade === dataStr);
  };

  const toggleDia = (dia: string) => {
    setDiasAbertos((prev) => ({
      ...prev,
      [dia]: !prev[dia],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground">Carregando atividades...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bike className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide">
            Atividades
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Add task input */}
      <div className="relative">
        <Plus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={novaAtividade}
          onChange={(e) => setNovaAtividade(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              adicionarAtividade();
            }
          }}
          placeholder="Adicionar tarefa"
          className="pl-9 bg-muted/50 border-muted"
        />
      </div>

      {/* Days of the week */}
      <div className="space-y-1">
        {weekDays.map(({ nome, data }) => {
          const atividadesDoDia = getAtividadesDoDia(data);
          const contagem = atividadesDoDia.length;

          return (
            <DiaSection
              key={nome}
              dia={nome}
              contagem={contagem}
              isOpen={diasAbertos[nome] || false}
              onToggle={() => toggleDia(nome)}
            >
              {atividadesDoDia.map((atividade) => (
                <AtividadeItem
                  key={atividade.id}
                  id={atividade.id}
                  titulo={atividade.titulo}
                  concluida={atividade.concluida}
                  tempoEstimado={atividade.tempo_estimado || undefined}
                  temDescricao={!!atividade.descricao}
                  destaque={atividade.destaque}
                  onToggle={toggleAtividade}
                  onClick={(id) => {
                    const atv = atividades.find((a) => a.id === id);
                    if (atv) {
                      setEditingAtividade(atv);
                      setFormOpen(true);
                    }
                  }}
                  onDelete={excluirAtividade}
                />
              ))}
            </DiaSection>
          );
        })}
      </div>

      {/* Edit form modal */}
      <AtividadeForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingAtividade(null);
        }}
        onSave={salvarAtividade}
        atividade={editingAtividade}
      />
    </div>
  );
};
