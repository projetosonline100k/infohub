import { BrainstormView } from "./BrainstormView";
import { FonteConhecimento } from "./FonteConhecimento";
import { QuizzesView } from "./QuizzesView";
import { CronogramaView } from "./CronogramaView";
import { VerticalView } from "./VerticalView";
import { YoutubeView } from "./YoutubeView";
import { VisaoGeralEmpresa } from "@/components/empresa/VisaoGeralEmpresa";
import { cn } from "@/lib/utils";

interface ConteudoSectionProps {
  clienteId: string;
  subAba: string;
  onIrPara: (subAba: string) => void;
  onAbrirAtividades: () => void;
}

// Creator (16/10): Vertical, Youtube e Brainstorm juntos, cada um numa guia.
const GUIAS_CREATOR = [
  { id: "vertical", rotulo: "Vertical" },
  { id: "youtube", rotulo: "Youtube" },
  { id: "brainstorm", rotulo: "Brainstorm" },
];

export function ConteudoSection({ clienteId, subAba, onIrPara, onAbrirAtividades }: ConteudoSectionProps) {
  const noCreator = GUIAS_CREATOR.some((g) => g.id === subAba);
  return (
    <div className="h-full">
      {noCreator && (
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Creator</h1>
          <div className="flex rounded-lg bg-muted p-0.5 text-sm font-medium">
            {GUIAS_CREATOR.map((g) => (
              <button key={g.id} type="button"
                onClick={() => { try { localStorage.setItem("creator-guia", g.id); } catch { /* sem storage */ } onIrPara(g.id); }}
                className={cn("rounded-md px-3 py-1 transition-colors", subAba === g.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {g.rotulo}
              </button>
            ))}
          </div>
        </div>
      )}
      {subAba === "visao-geral" && <VisaoGeralEmpresa clienteId={clienteId} onIrPara={onIrPara} onAbrirAtividades={onAbrirAtividades} />}

      {subAba === "brainstorm" && <BrainstormView clienteId={clienteId} />}
      
      {subAba === "vertical" && <VerticalView clienteId={clienteId} />}
      
      {subAba === "youtube" && <YoutubeView clienteId={clienteId} />}
      
      {subAba === "cronograma" && <CronogramaView clienteId={clienteId} />}
      {subAba === "conhecimento" && <FonteConhecimento clienteId={clienteId} />}
      {subAba === "quiz" && <QuizzesView clienteId={clienteId} />}
    </div>
  );
}
