import { WhatsappDoProjeto } from "./WhatsappDoProjeto";
import { BrainstormView } from "./BrainstormView";
import { FonteConhecimento } from "./FonteConhecimento";
import { PaginasView } from "./PaginasView";
import { CronogramaView } from "./CronogramaView";
import { CrmView } from "@/components/crm/CrmView";
import { TrafegoProjeto } from "@/components/trafego/TrafegoProjeto";
import { EmbaixadoresProjeto } from "@/components/embaixador/EmbaixadoresProjeto";
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
      {/* "quiz" e "chatbot" são os nomes antigos das abas: links e guias salvos caem na lista certa dentro de Páginas */}
      {(subAba === "paginas" || subAba === "quiz") && <PaginasView clienteId={clienteId} inicial="quiz" />}
      {subAba === "chatbot" && <PaginasView clienteId={clienteId} inicial="chatbot" />}
      {subAba === "whatsapp" && <WhatsappDoProjeto clienteId={clienteId} />}
      {subAba === "crm" && <CrmView clienteId={clienteId} />}
      {subAba === "embaixadores" && <EmbaixadoresProjeto clienteId={clienteId} />}
      {subAba === "trafego" && <TrafegoProjeto clienteId={clienteId} />}
    </div>
  );
}
