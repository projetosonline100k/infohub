import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle } from "lucide-react";

interface Pesquisa {
  id: string;
  titulo_pergunta: string;
  tipo: "aberta" | "multipla" | "unica";
  opcoes: string[];
}

export default function FormularioPublico() {
  const { slug } = useParams<{ slug: string }>();
  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [respostaTexto, setRespostaTexto] = useState("");
  const [respostaSelecionada, setRespostaSelecionada] = useState("");
  const [respostasMultiplas, setRespostasMultiplas] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    carregarPesquisa();
  }, [slug]);

  const carregarPesquisa = async () => {
    if (!slug) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("pesquisas")
        .select("id, titulo_pergunta, tipo, opcoes")
        .eq("link_publico", slug)
        .single();

      if (error) throw error;
      setPesquisa({
        ...data,
        opcoes: Array.isArray(data.opcoes) ? data.opcoes as string[] : []
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Pesquisa não encontrada",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleOpcaoMultipla = (opcao: string) => {
    setRespostasMultiplas((prev) =>
      prev.includes(opcao)
        ? prev.filter((o) => o !== opcao)
        : [...prev, opcao]
    );
  };

  const enviarResposta = async () => {
    if (!pesquisa) return;

    // Validate
    if (pesquisa.tipo === "aberta" && !respostaTexto.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, escreva sua resposta",
        variant: "destructive",
      });
      return;
    }

    if (pesquisa.tipo === "unica" && !respostaSelecionada) {
      toast({
        title: "Erro",
        description: "Por favor, selecione uma opção",
        variant: "destructive",
      });
      return;
    }

    if (pesquisa.tipo === "multipla" && respostasMultiplas.length === 0) {
      toast({
        title: "Erro",
        description: "Por favor, selecione pelo menos uma opção",
        variant: "destructive",
      });
      return;
    }

    try {
      setEnviando(true);

      const payload: any = {
        pesquisa_id: pesquisa.id,
      };

      if (pesquisa.tipo === "aberta") {
        payload.resposta_texto = respostaTexto;
      } else if (pesquisa.tipo === "unica") {
        payload.respostas_selecionadas = [respostaSelecionada];
      } else {
        payload.respostas_selecionadas = respostasMultiplas;
      }

      const { error } = await supabase.from("respostas_pesquisa").insert(payload);

      if (error) throw error;

      setEnviado(true);
    } catch (error: any) {
      toast({
        title: "Erro ao enviar resposta",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando pesquisa...</p>
      </div>
    );
  }

  if (!pesquisa) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="p-8 max-w-md">
          <p className="text-center text-muted-foreground">Pesquisa não encontrada</p>
        </Card>
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="p-8 max-w-md text-center">
          <CheckCircle className="h-16 w-16 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Obrigado por responder!</h2>
          <p className="text-muted-foreground">Sua resposta foi registrada com sucesso.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="p-8 max-w-2xl w-full">
        <h1 className="text-2xl font-bold mb-6">{pesquisa.titulo_pergunta}</h1>

        {pesquisa.tipo === "aberta" && (
          <Textarea
            value={respostaTexto}
            onChange={(e) => setRespostaTexto(e.target.value)}
            placeholder="Digite sua resposta..."
            className="min-h-[150px] mb-4"
          />
        )}

        {pesquisa.tipo === "multipla" && (
          <div className="space-y-3 mb-4">
            {pesquisa.opcoes.map((opcao, index) => (
              <div key={index} className="flex items-center gap-2">
                <Checkbox
                  id={`opcao-${index}`}
                  checked={respostasMultiplas.includes(opcao)}
                  onCheckedChange={() => toggleOpcaoMultipla(opcao)}
                />
                <Label htmlFor={`opcao-${index}`} className="cursor-pointer">
                  {opcao}
                </Label>
              </div>
            ))}
          </div>
        )}

        {pesquisa.tipo === "unica" && (
          <RadioGroup value={respostaSelecionada} onValueChange={setRespostaSelecionada} className="mb-4">
            {pesquisa.opcoes.map((opcao, index) => (
              <div key={index} className="flex items-center gap-2">
                <RadioGroupItem value={opcao} id={`opcao-${index}`} />
                <Label htmlFor={`opcao-${index}`} className="cursor-pointer">
                  {opcao}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        <Button onClick={enviarResposta} disabled={enviando} className="w-full">
          {enviando ? "Enviando..." : "Enviar resposta"}
        </Button>
      </Card>
    </div>
  );
}
