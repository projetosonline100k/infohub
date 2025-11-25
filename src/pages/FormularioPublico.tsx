import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Pergunta {
  id: string;
  titulo: string;
  tipo: "aberta" | "multipla" | "unica";
  opcoes: string[];
  obrigatoria: boolean;
}

interface Pesquisa {
  id: string;
  titulo: string;
}

export default function FormularioPublico() {
  const { slug } = useParams();
  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [respostas, setRespostas] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    carregarPesquisa();
  }, [slug]);

  const carregarPesquisa = async () => {
    try {
      setLoading(true);

      const { data: pesquisaData, error: pesquisaError } = await supabase
        .from("pesquisas")
        .select("id, titulo")
        .eq("link_publico", `/formulario/${slug}`)
        .single();

      if (pesquisaError) throw pesquisaError;
      setPesquisa(pesquisaData);

      const { data: perguntasData, error: perguntasError } = await supabase
        .from("perguntas_pesquisa")
        .select("*")
        .eq("pesquisa_id", pesquisaData.id)
        .order("ordem");

      if (perguntasError) throw perguntasError;

      setPerguntas(
        (perguntasData || []).map((p) => ({
          ...p,
          opcoes: Array.isArray(p.opcoes) ? (p.opcoes as string[]) : [],
        }))
      );

      // Initialize responses object
      const initialRespostas: Record<string, any> = {};
      perguntasData?.forEach((p) => {
        if (p.tipo === "aberta") {
          initialRespostas[p.id] = "";
        } else if (p.tipo === "multipla") {
          initialRespostas[p.id] = [];
        } else {
          initialRespostas[p.id] = "";
        }
      });
      setRespostas(initialRespostas);
    } catch (error: any) {
      console.error("Erro ao carregar pesquisa:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar a pesquisa.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleOpcaoMultipla = (perguntaId: string, opcao: string) => {
    const respostasAtuais = respostas[perguntaId] || [];
    const novasRespostas = respostasAtuais.includes(opcao)
      ? respostasAtuais.filter((o: string) => o !== opcao)
      : [...respostasAtuais, opcao];

    setRespostas({ ...respostas, [perguntaId]: novasRespostas });
  };

  const enviarResposta = async () => {
    if (!pesquisa) return;

    // Validate required questions
    for (const pergunta of perguntas) {
      if (pergunta.obrigatoria) {
        const resposta = respostas[pergunta.id];
        if (
          !resposta ||
          (Array.isArray(resposta) && resposta.length === 0) ||
          (typeof resposta === "string" && !resposta.trim())
        ) {
          toast({
            title: "Campo obrigatório",
            description: `Por favor, responda: ${pergunta.titulo}`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    try {
      setEnviando(true);

      // Generate unique respondent ID
      const respondente_id = `resp_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Prepare responses for each question
      const respostasParaSalvar = perguntas.map((pergunta) => {
        const resposta = respostas[pergunta.id];

        return {
          pesquisa_id: pesquisa.id,
          pergunta_id: pergunta.id,
          respondente_id,
          resposta_texto:
            pergunta.tipo === "aberta" ? resposta || null : null,
          respostas_selecionadas:
            pergunta.tipo === "multipla"
              ? resposta
              : pergunta.tipo === "unica"
              ? [resposta]
              : [],
        };
      });

      const { error } = await supabase
        .from("respostas_pesquisa")
        .insert(respostasParaSalvar);

      if (error) throw error;

      setEnviado(true);
      toast({
        title: "Resposta enviada!",
        description: "Obrigado por participar da pesquisa.",
      });
    } catch (error: any) {
      console.error("Erro ao enviar resposta:", error);
      toast({
        title: "Erro ao enviar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pesquisa) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Pesquisa não encontrada</h1>
          <p className="text-muted-foreground">
            O link que você acessou não é válido ou a pesquisa foi removida.
          </p>
        </div>
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-6xl">✓</div>
          <h1 className="text-2xl font-bold">Resposta enviada!</h1>
          <p className="text-muted-foreground">
            Obrigado por participar da nossa pesquisa.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">{pesquisa.titulo}</h1>
        </div>

        <div className="bg-card border rounded-lg p-6 space-y-8">
          {perguntas.map((pergunta, index) => (
            <div key={pergunta.id} className="space-y-3">
              <Label className="text-base font-medium">
                {index + 1}. {pergunta.titulo}
                {pergunta.obrigatoria && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </Label>

              {pergunta.tipo === "aberta" && (
                <Textarea
                  value={respostas[pergunta.id] || ""}
                  onChange={(e) =>
                    setRespostas({
                      ...respostas,
                      [pergunta.id]: e.target.value,
                    })
                  }
                  placeholder="Digite sua resposta..."
                  className="min-h-[100px]"
                />
              )}

              {pergunta.tipo === "multipla" && (
                <div className="space-y-3">
                  {pergunta.opcoes.map((opcao, opcaoIndex) => (
                    <div
                      key={opcaoIndex}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`${pergunta.id}-${opcaoIndex}`}
                        checked={(respostas[pergunta.id] || []).includes(
                          opcao
                        )}
                        onCheckedChange={() =>
                          toggleOpcaoMultipla(pergunta.id, opcao)
                        }
                      />
                      <Label
                        htmlFor={`${pergunta.id}-${opcaoIndex}`}
                        className="font-normal cursor-pointer"
                      >
                        {opcao}
                      </Label>
                    </div>
                  ))}
                </div>
              )}

              {pergunta.tipo === "unica" && (
                <RadioGroup
                  value={respostas[pergunta.id] || ""}
                  onValueChange={(value) =>
                    setRespostas({ ...respostas, [pergunta.id]: value })
                  }
                >
                  {pergunta.opcoes.map((opcao, opcaoIndex) => (
                    <div
                      key={opcaoIndex}
                      className="flex items-center space-x-2"
                    >
                      <RadioGroupItem
                        value={opcao}
                        id={`${pergunta.id}-radio-${opcaoIndex}`}
                      />
                      <Label
                        htmlFor={`${pergunta.id}-radio-${opcaoIndex}`}
                        className="font-normal cursor-pointer"
                      >
                        {opcao}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            </div>
          ))}

          <Button
            onClick={enviarResposta}
            disabled={enviando}
            className="w-full"
            size="lg"
          >
            {enviando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar resposta"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
