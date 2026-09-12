import { useState } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Plus, X, Trash2, Pencil, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Sentinela: não é o id de nenhuma pasta real, representa a visão geral dos grupos.
export const VISAO_GERAL = "__visao_geral__";

interface Pasta {
  id: string;
  nome: string;
}

interface PastasBarProps {
  pastas: Pasta[];
  pastaAtivaId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (nome: string) => void;
  onRename: (id: string, novoNome: string) => void;
  onRequestDelete: (pasta: Pasta) => void;
  lixeiraCount: number;
  onOpenLixeira: () => void;
}

export const PastasBar = ({
  pastas,
  pastaAtivaId,
  onSelect,
  onCreate,
  onRename,
  onRequestDelete,
  lixeiraCount,
  onOpenLixeira,
}: PastasBarProps) => {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");

  const confirmarCriacao = () => {
    const valor = nome.trim();
    if (valor) onCreate(valor);
    setNome("");
    setCriando(false);
  };

  const iniciarEdicao = (pasta: Pasta) => {
    setEditandoId(pasta.id);
    setNomeEditado(pasta.nome);
  };

  const confirmarEdicao = () => {
    const valor = nomeEditado.trim();
    if (editandoId && valor) onRename(editandoId, valor);
    setEditandoId(null);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => onSelect(VISAO_GERAL)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
          pastaAtivaId === VISAO_GERAL
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:text-foreground"
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Visão geral
      </button>

      {pastas.map((pasta) =>
        editandoId === pasta.id ? (
          <Input
            key={pasta.id}
            autoFocus
            value={nomeEditado}
            onChange={(e) => setNomeEditado(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarEdicao();
              else if (e.key === "Escape") setEditandoId(null);
            }}
            onBlur={confirmarEdicao}
            className="h-8 w-40"
          />
        ) : (
          <Droppable key={pasta.id} droppableId={`folder-${pasta.id}`}>
            {(provided, snapshot) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="group relative">
                <button
                  onClick={() => onSelect(pasta.id)}
                  onDoubleClick={() => iniciarEdicao(pasta)}
                  className={cn(
                    "pl-3 pr-12 py-1.5 rounded-md text-sm font-medium transition-colors max-w-[180px] truncate",
                    pastaAtivaId === pasta.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                    snapshot.isDraggingOver && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                  )}
                >
                  {pasta.nome}
                </button>
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      iniciarEdicao(pasta);
                    }}
                    className="p-0.5 rounded hover:bg-black/10"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDelete(pasta);
                    }}
                    className="p-0.5 rounded hover:bg-black/10"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        )
      )}

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
          placeholder="Nome da pasta"
          className="h-8 w-40"
        />
      ) : (
        <Button variant="ghost" size="sm" className="h-8" onClick={() => setCriando(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nova pasta
        </Button>
      )}

      {lixeiraCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-muted-foreground ml-auto"
          onClick={onOpenLixeira}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Lixeira ({lixeiraCount})
        </Button>
      )}
    </div>
  );
};
