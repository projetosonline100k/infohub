import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ListTodo, CalendarClock } from "lucide-react";
import { iniciais } from "@/lib/utils";

interface GrupoResumo {
  id: string | null;
  nome: string;
  total: number;
  concluidas: number;
  atrasadas: number;
  estaSemana: number;
  integrantes: string[];
}

interface VisaoGeralGruposProps {
  grupos: GrupoResumo[];
  onSelect: (id: string | null) => void;
}

const MAX_AVATARES = 4;

export const VisaoGeralGrupos = ({ grupos, onSelect }: VisaoGeralGruposProps) => {
  if (grupos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        Nenhuma pasta ainda. Crie uma pasta acima para organizar suas tarefas em grupos.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {grupos.map((grupo) => {
        const progresso = grupo.total > 0 ? Math.round((grupo.concluidas / grupo.total) * 100) : 0;
        const paraFazer = grupo.total - grupo.concluidas;
        const integrantesVisiveis = grupo.integrantes.slice(0, MAX_AVATARES);
        const integrantesRestantes = grupo.integrantes.length - integrantesVisiveis.length;

        return (
          <button
            key={grupo.id ?? "sem-pasta"}
            onClick={() => onSelect(grupo.id)}
            className="text-left p-4 rounded-lg border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-2 gap-2">
              <h3 className="font-medium text-foreground truncate">{grupo.nome}</h3>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {grupo.concluidas}/{grupo.total}
              </span>
            </div>

            <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progresso}%` }}
              />
            </div>

            {/* Integrantes */}
            <div className="flex items-center justify-between mb-3">
              {grupo.integrantes.length > 0 ? (
                <div className="flex items-center -space-x-1.5">
                  {integrantesVisiveis.map((nome) => (
                    <Avatar key={nome} className="h-6 w-6 border-2 border-card" title={nome}>
                      <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
                        {iniciais(nome)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {integrantesRestantes > 0 && (
                    <div className="h-6 w-6 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[9px] text-muted-foreground font-medium">
                      +{integrantesRestantes}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Sem integrantes</span>
              )}
            </div>

            {/* Métricas */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ListTodo className="h-3 w-3" />
                {paraFazer} para fazer
              </span>
              {grupo.estaSemana > 0 && (
                <span className="flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" />
                  {grupo.estaSemana} essa semana
                </span>
              )}
              {grupo.atrasadas > 0 && (
                <span className="font-medium text-red-500">
                  {grupo.atrasadas} atrasada{grupo.atrasadas > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
