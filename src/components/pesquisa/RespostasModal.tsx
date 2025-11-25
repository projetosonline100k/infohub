import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RespostasResumo } from "./RespostasResumo";
import { RespostasPergunta } from "./RespostasPergunta";
import { RespostasIndividual } from "./RespostasIndividual";

interface Resposta {
  id: string;
  pergunta_id: string;
  respondente_id: string;
  resposta_texto: string | null;
  respostas_selecionadas: string[];
  created_at: string;
}

interface Pergunta {
  id: string;
  titulo: string;
  tipo: "aberta" | "multipla" | "unica";
  opcoes: string[];
}

interface Pesquisa {
  titulo: string;
}

interface RespostasModalProps {
  pesquisaId: string;
  onClose: () => void;
}

export function RespostasModal({ pesquisaId, onClose }: RespostasModalProps) {
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    carregarDados();
  }, [pesquisaId]);

  const carregarDados = async () => {
    try {
      setLoading(true);

      // Load survey info
      const { data: pesquisaData, error: pesquisaError } = await supabase
        .from("pesquisas")
        .select("titulo")
        .eq("id", pesquisaId)
        .single();

      if (pesquisaError) throw pesquisaError;
      setPesquisa(pesquisaData);

      // Load questions
      const { data: perguntasData, error: perguntasError } = await supabase
        .from("perguntas_pesquisa")
        .select("*")
        .eq("pesquisa_id", pesquisaId)
        .order("ordem");

      if (perguntasError) throw perguntasError;
      setPerguntas(
        (perguntasData || []).map((p) => ({
          ...p,
          opcoes: Array.isArray(p.opcoes) ? (p.opcoes as string[]) : [],
        }))
      );

      // Load responses
      const { data: respostasData, error: respostasError } = await supabase
        .from("respostas_pesquisa")
        .select("*")
        .eq("pesquisa_id", pesquisaId)
        .order("created_at", { ascending: false });

      if (respostasError) throw respostasError;
      setRespostas(
        (respostasData || []).map((r) => ({
          ...r,
          respostas_selecionadas: Array.isArray(r.respostas_selecionadas)
            ? (r.respostas_selecionadas as string[])
            : [],
        }))
      );
    } catch (error: any) {
      toast({
        title: "Erro ao carregar respostas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const totalRespondentes = new Set(
    respostas.map((r) => r.respondente_id).filter(Boolean)
  ).size;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {pesquisa ? (
              <>
                Respostas: {pesquisa.titulo}
                <div className="text-sm font-normal text-muted-foreground mt-1">
                  {totalRespondentes} respondente
                  {totalRespondentes !== 1 ? "s" : ""}
                </div>
              </>
            ) : (
              "Carregando..."
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Carregando respostas...
          </div>
        ) : totalRespondentes === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            Nenhuma resposta ainda
          </div>
        ) : (
          <Tabs defaultValue="resumo" className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="pergunta">Pergunta</TabsTrigger>
              <TabsTrigger value="individual">Individual</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="flex-1">
              <RespostasResumo perguntas={perguntas} respostas={respostas} />
            </TabsContent>

            <TabsContent value="pergunta" className="flex-1">
              <RespostasPergunta perguntas={perguntas} respostas={respostas} />
            </TabsContent>

            <TabsContent value="individual" className="flex-1">
              <RespostasIndividual
                perguntas={perguntas}
                respostas={respostas}
                onRespostasChange={carregarDados}
              />
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
