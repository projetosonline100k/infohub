import { useState } from "react";
import { Target } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isDesktop } from "@/lib/platform";
import { CICLOS, useFocoTimer, type Ciclo } from "@/hooks/useFocoTimer";
import { useAssistantAtividades } from "@/hooks/useAssistantAtividades";
import { ligarFocoTotal } from "@/lib/foco/focoTotal";
import { useWorkspaceTabsOpcional } from "@/components/workspace/WorkspaceTabs";

// "Focar" de uma tarefa (28/10, Davi: "o modo foco só ativa quando eu clicar no Focar da tarefa; daí faz as
// perguntas — quanto tempo, ativar o modo foco — e faz o que ele foi feito para fazer"). Escolhe o bloco e se
// liga o foco total (Não Perturbe, só os sites de trabalho, a coluna do relógio); "Começar" põe a tarefa em
// foco e começa — o mesmo cronômetro da página do Modo Foco.
export function FocarTarefa({ tarefa, onFechar }: { tarefa: { id: string; titulo: string } | null; onFechar: () => void }) {
  const { iniciarTimer, pausarTimer } = useAssistantAtividades();
  const { estado, escolherCiclo, escolherTarefa, comecar, marcarTotal } =
    useFocoTimer({ iniciarTimer: (id) => iniciarTimer(id), pausarTimer: (id) => pausarTimer(id) });
  const guias = useWorkspaceTabsOpcional();
  const [ciclo, setCiclo] = useState<Ciclo>(estado.ciclo);
  const [minutos, setMinutos] = useState("");
  const [total, setTotal] = useState(true);

  const comecarFoco = async () => {
    if (!tarefa) return;
    const m = Math.round(Number(minutos));
    const escolhido = m > 0 ? { id: `p${m}/${Math.max(5, Math.round(m / 5))}`, rotulo: `${m} min`, foco: Math.min(240, m), pausa: Math.max(5, Math.round(m / 5)) } : ciclo;
    escolherCiclo(escolhido);          // zera o bloco no tempo escolhido
    escolherTarefa(tarefa.id);
    comecar();
    onFechar();
    if (total && isDesktop() && !estado.total) {
      let telaCheia = false;
      try { telaCheia = localStorage.getItem("modo-foco:tela-cheia") === "1"; } catch { /* */ }
      const r = await ligarFocoTotal({ telaCheia });
      marcarTotal(true);
      if (!r.naoPerturbe) toast.info("Foco total ligado. Para silenciar as notificações, crie os atalhos (veja no Modo Foco).");
    } else {
      toast.success(`Foco: ${escolhido.foco} min em "${tarefa.titulo}"`);
      if (!isDesktop()) guias?.openTab("/foco");
    }
  };

  return (
    <Dialog open={!!tarefa} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" />Focar nesta tarefa</DialogTitle>
        </DialogHeader>
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm font-medium">{tarefa?.titulo}</p>
        <div>
          <p className="mb-2 text-sm font-medium">Quanto tempo?</p>
          <div className="grid grid-cols-3 gap-2">
            {CICLOS.map((c) => (
              <button key={c.id} type="button" onClick={() => { setCiclo(c); setMinutos(""); }}
                className={cn("rounded-xl border py-2 text-sm", !minutos && ciclo.id === c.id ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted")}>
                {c.foco} min<span className="block text-[11px] text-muted-foreground">pausa de {c.pausa}</span>
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            Outro:
            <input value={minutos} onChange={(e) => setMinutos(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="min"
              className="w-20 rounded-lg border bg-background px-2 py-1 text-foreground outline-none focus:border-primary/50" />
            minutos
          </label>
        </div>
        {isDesktop() && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
            <input type="checkbox" checked={total || estado.total} disabled={estado.total} onChange={(e) => setTotal(e.target.checked)} className="mt-0.5" />
            <span>
              <b>Ativar o foco total</b>
              <span className="block text-xs text-muted-foreground">
                {estado.total ? "Já está ligado." : "Silencia as notificações, deixa só os sites de trabalho e abre o relógio na lateral."}
              </span>
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => void comecarFoco()}><Target className="mr-1.5 h-4 w-4" />Começar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
