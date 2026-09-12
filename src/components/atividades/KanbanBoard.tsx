import { useState } from "react";
import { KanbanColumn } from "./KanbanColumn";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { addDays, format } from "date-fns";
import { detectarDiaSemana } from "@/lib/diasSemana";

interface Atividade {
  id: string;
  titulo: string;
  descricao: string | null;
  concluida: boolean;
  prioridade: string;
  data_atividade: string;
  data_vencimento: string | null;
  data_inicio: string | null;
  tempo_estimado: number | null;
  timer_iniciado_em: string | null;
  timer_decorrido_segundos: number;
  responsavel_nome: string | null;
  status: string;
}

interface ChecklistResumo {
  total: number;
  concluidas: number;
}

interface Coluna {
  status_key: string;
  nome: string;
}

interface KanbanBoardProps {
  atividades: Atividade[];
  colunas: Coluna[];
  semanaInicio: Date;
  checklistPorAtividade?: Record<string, ChecklistResumo>;
  onCardClick: (id: string) => void;
  onAddCard: (status: string, titulo: string) => void;
  onRenameColuna: (status: string, novoNome: string) => void;
  onDeleteColuna: (status: string) => void;
  onCreateColuna: (nome: string) => void;
  onToggleConcluida: (id: string, concluida: boolean) => void;
  onIniciarTimer: (id: string) => void;
  onPausarTimer: (id: string) => void;
  onZerarTimer: (id: string) => void;
  onTimerFinalizado: (id: string) => void;
}

// Cores cíclicas para o cabeçalho das colunas, na ordem em que aparecem.
const CORES_COLUNA = ["bg-gray-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500", "bg-purple-500", "bg-pink-500", "bg-green-600"];

// Precisa ser renderizado dentro de um DragDropContext do componente pai,
// para que arrastar um card também possa soltar em cima de uma pasta.
export const KanbanBoard = ({
  atividades,
  colunas,
  semanaInicio,
  checklistPorAtividade,
  onCardClick,
  onAddCard,
  onRenameColuna,
  onDeleteColuna,
  onCreateColuna,
  onToggleConcluida,
  onIniciarTimer,
  onPausarTimer,
  onZerarTimer,
  onTimerFinalizado,
}: KanbanBoardProps) => {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");

  // Uma coluna chamada "Segunda-feira" etc. não filtra por status: mostra as
  // tarefas cuja data cai naquele dia da semana de referência.
  const getAtividadesPorColuna = (coluna: Coluna) => {
    const diaSemana = detectarDiaSemana(coluna.nome);
    if (diaSemana !== null) {
      const dataAlvo = format(addDays(semanaInicio, diaSemana), "yyyy-MM-dd");
      return atividades.filter((a) => a.data_atividade === dataAlvo);
    }
    return atividades.filter((a) => a.status === coluna.status_key);
  };

  const confirmarCriacao = () => {
    const valor = nome.trim();
    if (valor) onCreateColuna(valor);
    setNome("");
    setCriando(false);
  };

  return (
    <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 min-h-[400px]">
      {colunas.map((coluna, index) => (
        <KanbanColumn
          key={coluna.status_key}
          status={coluna.status_key}
          label={coluna.nome}
          color={CORES_COLUNA[index % CORES_COLUNA.length]}
          atividades={getAtividadesPorColuna(coluna)}
          checklistPorAtividade={checklistPorAtividade}
          onCardClick={onCardClick}
          onAddCard={onAddCard}
          onRenameColuna={onRenameColuna}
          onDeleteColuna={onDeleteColuna}
          onToggleConcluida={onToggleConcluida}
          onIniciarTimer={onIniciarTimer}
          onPausarTimer={onPausarTimer}
          onZerarTimer={onZerarTimer}
          onTimerFinalizado={onTimerFinalizado}
        />
      ))}

      <div className="min-w-[220px] w-56 flex-shrink-0">
        {criando ? (
          <Input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarCriacao();
              else if (e.key === "Escape") {
                setNome("");
                setCriando(false);
              }
            }}
            onBlur={confirmarCriacao}
            placeholder="Nome da coluna"
            className="h-9"
          />
        ) : (
          <button
            onClick={() => setCriando(true)}
            className="w-full flex items-center gap-2 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors border border-dashed border-border"
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm">Nova coluna</span>
          </button>
        )}
      </div>
    </div>
  );
};
