import { useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { aprovarCarrosseis } from "@/lib/empresa/aprovarCarrossel";
import type { CarrosselResumo } from "@/lib/empresa/carrossel";

// "Aprovar todos": o lote inteiro de uma vez; cada carrossel vira uma tarefa
// "Programar carrossel" na fila da Dalila.
export function AprovarTodosCarrosseis({ clienteId, prontos, onAprovou }: {
  clienteId: string;
  prontos: CarrosselResumo[];
  onAprovou: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  if (prontos.length < 2) return null;

  const aprovar = async () => {
    setAprovando(true);
    try {
      const { aprovados, programador } = await aprovarCarrosseis(clienteId, prontos);
      toast.success(`${aprovados} carrosséis aprovados.${programador ? ` Foram para a fila da ${programador} programar.` : " (Não achei a Dalila no projeto.)"}`);
      setAberto(false);
      onAprovou();
    } catch {
      toast.error("Não consegui aprovar todos. Os que deram certo já saíram da lista.");
      onAprovou();
    } finally {
      setAprovando(false);
    }
  };

  return (
    <>
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-2">
        <span className="min-w-0 flex-1 text-sm">{prontos.length} carrosséis do Roy prontos</span>
        <Button size="sm" className="h-8 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setAberto(true)}>
          <CheckCheck className="h-4 w-4" /> Aprovar todos
        </Button>
      </div>
      <AlertDialog open={aberto} onOpenChange={(v) => { if (!aprovando) setAberto(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar os {prontos.length} carrosséis?</AlertDialogTitle>
            <AlertDialogDescription>Cada um vai inteiro (todas as páginas e a legenda) para a fila da Dalila programar.</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
            {prontos.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className="text-muted-foreground">{c.numero ? String(c.numero).padStart(3, "0") : "·"}</span>
                <span className="min-w-0 flex-1 truncate">{c.tema}</span>
                <span className="text-muted-foreground">{c.paginas.length} pág.</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aprovando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={aprovando} onClick={(e) => { e.preventDefault(); void aprovar(); }}
              className="bg-emerald-600 text-white hover:bg-emerald-700">
              {aprovando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Aprovar todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
