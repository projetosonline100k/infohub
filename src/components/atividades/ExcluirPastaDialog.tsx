import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Pasta {
  id: string;
  nome: string;
}

interface ExcluirPastaDialogProps {
  pasta: Pasta | null;
  tarefasCount: number;
  onClose: () => void;
  onConfirm: (pastaId: string) => void;
}

export const ExcluirPastaDialog = ({
  pasta,
  tarefasCount,
  onClose,
  onConfirm,
}: ExcluirPastaDialogProps) => {
  const [confirmacao, setConfirmacao] = useState("");

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setConfirmacao("");
      onClose();
    }
  };

  const confirmar = () => {
    if (!pasta || confirmacao !== pasta.nome) return;
    onConfirm(pasta.id);
    setConfirmacao("");
  };

  return (
    <Dialog open={!!pasta} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Excluir pasta
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 pt-2 text-sm text-foreground">
              <p>
                Isso vai apagar a pasta <strong>{pasta?.nome}</strong>
                {tarefasCount > 0
                  ? ` e ${tarefasCount} ${tarefasCount === 1 ? "tarefa" : "tarefas"} dentro dela`
                  : ""}
                .
              </p>
              <p className="text-muted-foreground">
                Vai para a lixeira e pode ser restaurada em até 15 dias. Depois disso, some em definitivo.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            Para confirmar, digite <strong>{pasta?.nome}</strong>
          </label>
          <Input
            autoFocus
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmar();
            }}
            placeholder={pasta?.nome}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!pasta || confirmacao !== pasta.nome}
            onClick={confirmar}
          >
            Excluir pasta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
