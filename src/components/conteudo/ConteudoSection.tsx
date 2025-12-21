import { BrainstormView } from "./BrainstormView";
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
      
      {subAba === "cronograma" && (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">
            Em breve: Cronograma de publicações
          </p>
        </div>
      )}
    </div>
  );
}
