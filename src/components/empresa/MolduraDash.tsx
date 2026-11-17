import type { ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** Moldura dos dashes dos funcionários (Danilo, Lauro, Kdu): janela própria, ou, com `embutido`, só o corpo (usado nas guias do painel do setor). */
export function MolduraDash({ embutido, aberto, onFechar, className, children, depois }: {
  embutido?: boolean; aberto: boolean; onFechar: () => void; className: string; children: ReactNode;
  /** Outras janelas que o dash abre (ficam fora do conteúdo). */
  depois?: ReactNode;
}) {
  if (embutido) {
    return (
      <>
        <div className="dark space-y-4 rounded-2xl border border-white/10 bg-[#070b14] p-4 text-white sm:p-5">{children}</div>
        {depois}
      </>
    );
  }
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className={className}>{children}</DialogContent>
      {depois}
    </Dialog>
  );
}
