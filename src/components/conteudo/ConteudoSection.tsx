import { BrainstormView } from "./BrainstormView";
import { FonteConhecimento } from "./FonteConhecimento";
import { CronogramaView } from "./CronogramaView";
import { VerticalView } from "./VerticalView";
import { YoutubeView } from "./YoutubeView";
import { VisaoGeralEmpresa } from "@/components/empresa/VisaoGeralEmpresa";

interface ConteudoSectionProps {
  clienteId: string;
  subAba: string;
  onIrPara: (subAba: string) => void;
  onAbrirAtividades: () => void;
}

export function ConteudoSection({ clienteId, subAba, onIrPara, onAbrirAtividades }: ConteudoSectionProps) {
  return (
    <div className="h-full">
      {subAba === "visao-geral" && <VisaoGeralEmpresa clienteId={clienteId} onIrPara={onIrPara} onAbrirAtividades={onAbrirAtividades} />}

      {subAba === "brainstorm" && <BrainstormView clienteId={clienteId} />}
      
      {subAba === "vertical" && <VerticalView clienteId={clienteId} />}
      
      {subAba === "youtube" && <YoutubeView clienteId={clienteId} />}
      
      {subAba === "cronograma" && <CronogramaView clienteId={clienteId} />}
      {subAba === "conhecimento" && <FonteConhecimento clienteId={clienteId} />}
    </div>
  );
}
