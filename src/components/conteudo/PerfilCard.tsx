import { useState } from "react";
import { Plus, X, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Perfil {
  id: string;
  nome: string;
  descricao?: string;
  imagem_url?: string;
  ordem: number;
}

interface PerfilCardProps {
  perfil: Perfil | null;
  onAdd: () => void;
  onUpdate: (id: string, dados: Partial<Perfil>) => void;
  onDelete: (id: string) => void;
}

export function PerfilCard({ perfil, onAdd, onUpdate, onDelete }: PerfilCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [nome, setNome] = useState(perfil?.nome || "");
  const [descricao, setDescricao] = useState(perfil?.descricao || "");

  const handleSave = () => {
    if (perfil) {
      onUpdate(perfil.id, { nome, descricao });
    }
    setIsEditing(false);
  };

  if (!perfil) {
    return (
      <button
        onClick={onAdd}
        className="aspect-square border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <Plus className="h-8 w-8 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Adicionar perfil</span>
      </button>
    );
  }

  return (
    <>
      <div className="aspect-square border border-border rounded-lg p-3 bg-card relative group flex flex-col">
        {/* Ações */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => {
              setNome(perfil.nome);
              setDescricao(perfil.descricao || "");
              setIsEditing(true);
            }}
          >
            <Edit2 className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => onDelete(perfil.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 flex flex-col">
          <h4 className="font-medium text-sm mb-1 line-clamp-1">{perfil.nome}</h4>
          <p className="text-xs text-muted-foreground line-clamp-3 flex-1">
            {perfil.descricao || "Clique para editar"}
          </p>
        </div>
      </div>

      {/* Modal de edição */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome do perfil</label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: @fulano"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Por que esse perfil é uma referência?"
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
