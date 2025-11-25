import { RespostaChart } from "./RespostaChart";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Pergunta {
  id: string;
  titulo: string;
  tipo: "aberta" | "multipla" | "unica";
  opcoes: string[];
}

interface Resposta {
  id: string;
  pergunta_id: string;
  resposta_texto: string | null;
  respostas_selecionadas: string[];
}

interface RespostasResumoProps {
  perguntas: Pergunta[];
  respostas: Resposta[];
}

export function RespostasResumo({ perguntas, respostas }: RespostasResumoProps) {
  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-8 p-4">
        {perguntas.map((pergunta, index) => {
          const respostasPergunta = respostas.filter(
            (r) => r.pergunta_id === pergunta.id
          );

          return (
            <div key={pergunta.id} className="space-y-3">
              <div>
                <h3 className="font-medium text-lg">
                  {index + 1}. {pergunta.titulo}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {respostasPergunta.length} resposta
                  {respostasPergunta.length !== 1 ? "s" : ""}
                </p>
              </div>

              {pergunta.tipo === "aberta" ? (
                <div className="space-y-2 pl-4 border-l-2 border-border">
                  {respostasPergunta.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma resposta ainda
                    </p>
                  ) : (
                    respostasPergunta.map((resposta) => (
                      <div
                        key={resposta.id}
                        className="text-sm bg-muted p-3 rounded-md"
                      >
                        {resposta.resposta_texto || "Sem resposta"}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <RespostaChart
                  opcoes={pergunta.opcoes}
                  respostas={respostasPergunta.map(
                    (r) => r.respostas_selecionadas
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
