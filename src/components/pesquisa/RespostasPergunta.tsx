import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

interface RespostasPerguntaProps {
  perguntas: Pergunta[];
  respostas: Resposta[];
}

export function RespostasPergunta({
  perguntas,
  respostas,
}: RespostasPerguntaProps) {
  const [perguntaIndex, setPerguntaIndex] = useState(0);

  if (perguntas.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Nenhuma pergunta encontrada
      </div>
    );
  }

  const perguntaAtual = perguntas[perguntaIndex];
  const respostasPergunta = respostas.filter(
    (r) => r.pergunta_id === perguntaAtual.id
  );

  const anterior = () => {
    if (perguntaIndex > 0) {
      setPerguntaIndex(perguntaIndex - 1);
    }
  };

  const proximo = () => {
    if (perguntaIndex < perguntas.length - 1) {
      setPerguntaIndex(perguntaIndex + 1);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Select
          value={perguntaIndex.toString()}
          onValueChange={(value) => setPerguntaIndex(parseInt(value))}
        >
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {perguntas.map((p, index) => (
              <SelectItem key={p.id} value={index.toString()}>
                {index + 1}. {p.titulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={anterior}
            disabled={perguntaIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {perguntaIndex + 1} de {perguntas.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={proximo}
            disabled={perguntaIndex === perguntas.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[450px]">
        <div className="space-y-4 p-4">
          <div>
            <h3 className="font-medium text-lg">{perguntaAtual.titulo}</h3>
            <p className="text-sm text-muted-foreground">
              {respostasPergunta.length} resposta
              {respostasPergunta.length !== 1 ? "s" : ""}
            </p>
          </div>

          {perguntaAtual.tipo === "aberta" ? (
            <div className="space-y-2">
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
              opcoes={perguntaAtual.opcoes}
              respostas={respostasPergunta.map((r) => r.respostas_selecionadas)}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
