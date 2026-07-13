import { BrainstormView } from "./BrainstormView";
import { CronogramaView } from "./CronogramaView";
import { VerticalView } from "./VerticalView";
import { YoutubeView } from "./YoutubeView";

interface ConteudoSectionProps {
  clienteId: string;
  subAba: string;
}

export function ConteudoSection({ clienteId, subAba }: ConteudoSectionProps) {
  return (
    <div className="h-full">
      {subAba === "brainstorm" && <BrainstormView clienteId={clienteId} />}
      
      {subAba === "vertical" && <VerticalView clienteId={clienteId} />}
      
      {subAba === "youtube" && <YoutubeView clienteId={clienteId} />}
      
      {subAba === "cronograma" && <CronogramaView clienteId={clienteId} />}
    </div>
  );
}
