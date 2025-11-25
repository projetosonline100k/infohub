import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Printer, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Pergunta {
  id: string;
  titulo: string;
  tipo: "aberta" | "multipla" | "unica";
  opcoes: string[];
}

interface Resposta {
  id: string;
  pergunta_id: string;
  respondente_id: string;
  resposta_texto: string | null;
  respostas_selecionadas: string[];
  created_at: string;
}

interface RespostasIndividualProps {
  perguntas: Pergunta[];
  respostas: Resposta[];
  onRespostasChange: () => void;
}

export function RespostasIndividual({
  perguntas,
  respostas,
  onRespostasChange,
}: RespostasIndividualProps) {
  const { toast } = useToast();
  const [respondedorIndex, setRespondedorIndex] = useState(0);

  // Group responses by respondente_id
  const respondedores = Array.from(
    new Set(respostas.map((r) => r.respondente_id))
  ).filter(Boolean);

  if (respondedores.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Nenhuma resposta ainda
      </div>
    );
  }

  const respondedorAtual = respondedores[respondedorIndex];
  const respostasRespondedor = respostas.filter(
    (r) => r.respondente_id === respondedorAtual
  );

  const dataResposta =
    respostasRespondedor.length > 0
      ? new Date(respostasRespondedor[0].created_at)
      : new Date();

  const anterior = () => {
    if (respondedorIndex > 0) {
      setRespondedorIndex(respondedorIndex - 1);
    }
  };

  const proximo = () => {
    if (respondedorIndex < respondedores.length - 1) {
      setRespondedorIndex(respondedorIndex + 1);
    }
  };

  const imprimir = () => {
    window.print();
  };

  const excluir = async () => {
    if (!confirm("Tem certeza que deseja excluir essas respostas?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("respostas_pesquisa")
        .delete()
        .eq("respondente_id", respondedorAtual);

      if (error) throw error;

      toast({
        title: "Respostas excluídas",
        description: "As respostas foram removidas com sucesso.",
      });

      onRespostasChange();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={anterior}
            disabled={respondedorIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {respondedorIndex + 1} de {respondedores.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={proximo}
            disabled={respondedorIndex === respondedores.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={imprimir}>
            <Printer className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={excluir}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Respondido em {format(dataResposta, "dd/MM/yyyy 'às' HH:mm")}
      </div>

      <ScrollArea className="h-[450px]">
        <div className="space-y-6 p-4">
          {perguntas.map((pergunta, index) => {
            const resposta = respostasRespondedor.find(
              (r) => r.pergunta_id === pergunta.id
            );

            return (
              <div key={pergunta.id} className="space-y-2">
                <h3 className="font-medium">
                  {index + 1}. {pergunta.titulo}
                </h3>

                {pergunta.tipo === "aberta" ? (
                  <div className="bg-muted p-3 rounded-md text-sm">
                    {resposta?.resposta_texto || "Sem resposta"}
                  </div>
                ) : (
                  <div className="space-y-1 pl-4">
                    {resposta?.respostas_selecionadas &&
                    resposta.respostas_selecionadas.length > 0 ? (
                      resposta.respostas_selecionadas.map((opcao, i) => (
                        <div key={i} className="text-sm">
                          • {opcao}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Sem resposta
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
