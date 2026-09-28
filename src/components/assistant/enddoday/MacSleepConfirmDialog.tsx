import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { dormirMac } from "@/lib/desktop/sleep";

interface MacSleepConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// "Repousar Mac" (item 7) — só chama o comando nativo depois de confirmado
// aqui. Depois do comando, não faz mais nada (nem fecha o Jarvis, nem
// navega) — o próprio Mac dormindo já é a ação; qualquer coisa a mais
// seria o app tentando "reagir" a algo que já não controla mais.
export function MacSleepConfirmDialog({ open, onOpenChange }: MacSleepConfirmDialogProps) {
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    setEnviando(true);
    const resultado = await dormirMac();
    setEnviando(false);
    onOpenChange(false);
    if (!resultado.ok) toast.error("Não foi possível colocar o Mac em repouso agora.");
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Quer colocar este Mac em repouso agora?</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmar} disabled={enviando}>
            Repousar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
