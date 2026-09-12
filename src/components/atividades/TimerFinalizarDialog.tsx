import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Clock } from "lucide-react";

interface AtividadeTimer {
  id: string;
  titulo: string;
}

interface TimerFinalizarDialogProps {
  atividade: AtividadeTimer | null;
  onClose: () => void;
  onConcluir: (id: string) => void;
  onPrecisaMaisTempo: (id: string, minutosExtras: number) => void;
}

export const TimerFinalizarDialog = ({
  atividade,
  onClose,
  onConcluir,
  onPrecisaMaisTempo,
}: TimerFinalizarDialogProps) => {
  const [pedindoMaisTempo, setPedindoMaisTempo] = useState(false);
  const [minutosExtras, setMinutosExtras] = useState("15");

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setPedindoMaisTempo(false);
      setMinutosExtras("15");
      onClose();
    }
  };

  const confirmarMaisTempo = () => {
    if (!atividade) return;
    const minutos = parseInt(minutosExtras, 10);
    if (!minutos || minutos <= 0) return;
    onPrecisaMaisTempo(atividade.id, minutos);
    handleOpenChange(false);
  };

  return (
    <Dialog open={!!atividade} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Tempo esgotado
          </DialogTitle>
          <DialogDescription asChild>
            <p className="pt-1">
              O tempo estimado para <strong>{atividade?.titulo}</strong> acabou. Conseguiu finalizar?
            </p>
          </DialogDescription>
        </DialogHeader>

        {pedindoMaisTempo ? (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Quantos minutos a mais você precisa?</label>
            <Input
              autoFocus
              type="number"
              min={1}
              value={minutosExtras}
              onChange={(e) => setMinutosExtras(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmarMaisTempo()}
            />
          </div>
        ) : null}

        <DialogFooter>
          {pedindoMaisTempo ? (
            <>
              <Button variant="outline" onClick={() => setPedindoMaisTempo(false)}>
                Voltar
              </Button>
              <Button onClick={confirmarMaisTempo}>Adicionar tempo</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setPedindoMaisTempo(true)}>
                Não, preciso de mais tempo
              </Button>
              <Button onClick={() => atividade && onConcluir(atividade.id)}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Sim, finalizei
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
