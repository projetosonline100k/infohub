import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Atividade {
  id: string;
  titulo: string;
  descricao: string | null;
  tempo_estimado: number | null;
  destaque: boolean;
  data_atividade: string;
}

interface AtividadeFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (atividade: Partial<Atividade>) => void;
  atividade?: Atividade | null;
}

export const AtividadeForm = ({
  open,
  onClose,
  onSave,
  atividade,
}: AtividadeFormProps) => {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tempoEstimado, setTempoEstimado] = useState("");
  const [destaque, setDestaque] = useState(false);

  useEffect(() => {
    if (atividade) {
      setTitulo(atividade.titulo);
      setDescricao(atividade.descricao || "");
      setTempoEstimado(atividade.tempo_estimado?.toString() || "");
      setDestaque(atividade.destaque);
    } else {
      setTitulo("");
      setDescricao("");
      setTempoEstimado("");
      setDestaque(false);
    }
  }, [atividade]);

  const handleSave = () => {
    onSave({
      id: atividade?.id,
      titulo,
      descricao: descricao || null,
      tempo_estimado: tempoEstimado ? parseInt(tempoEstimado) : null,
      destaque,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {atividade ? "Editar Atividade" : "Nova Atividade"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="titulo">Título</Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Nome da atividade"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Notas</Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes ou anotações..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tempo">Tempo estimado (minutos)</Label>
            <Input
              id="tempo"
              type="number"
              value={tempoEstimado}
              onChange={(e) => setTempoEstimado(e.target.value)}
              placeholder="Ex: 30"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="destaque">Destacar atividade</Label>
            <Switch
              id="destaque"
              checked={destaque}
              onCheckedChange={setDestaque}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!titulo.trim()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
