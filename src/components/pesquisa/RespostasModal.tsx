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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

interface Resposta {
  id: string;
  resposta_texto: string | null;
  respostas_selecionadas: string[];
  created_at: string;
}

interface Pesquisa {
  titulo_pergunta: string;
  tipo: string;
}

interface RespostasModalProps {
  pesquisaId: string;
  onClose: () => void;
}

export function RespostasModal({ pesquisaId, onClose }: RespostasModalProps) {
  const [respostas, setRespostas] = useState<Resposta[]>([]);
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
        .select("titulo_pergunta, tipo")
        .eq("id", pesquisaId)
        .single();

      if (pesquisaError) throw pesquisaError;
      setPesquisa(pesquisaData);

      // Load responses
      const { data: respostasData, error: respostasError } = await supabase
        .from("respostas_pesquisa")
        .select("*")
        .eq("pesquisa_id", pesquisaId)
        .order("created_at", { ascending: false });

      if (respostasError) throw respostasError;
      setRespostas((respostasData || []).map(r => ({
        ...r,
        respostas_selecionadas: Array.isArray(r.respostas_selecionadas) ? r.respostas_selecionadas as string[] : []
      })));
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

  const getTipoLabel = (tipo: string) => {
    const labels = {
      aberta: "Pergunta aberta",
      multipla: "Múltipla escolha",
      unica: "Seleção única",
    };
    return labels[tipo as keyof typeof labels] || tipo;
  };

  const formatarResposta = (resposta: Resposta) => {
    if (resposta.resposta_texto) {
      return resposta.resposta_texto;
    }
    if (resposta.respostas_selecionadas && Array.isArray(resposta.respostas_selecionadas)) {
      return resposta.respostas_selecionadas.join(", ");
    }
    return "Sem resposta";
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {pesquisa ? (
              <>
                Respostas: "{pesquisa.titulo_pergunta}"
                <div className="text-sm font-normal text-muted-foreground mt-1">
                  Tipo: {getTipoLabel(pesquisa.tipo)} • Total de respostas: {respostas.length}
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
        ) : respostas.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            Nenhuma resposta ainda
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Resposta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {respostas.map((resposta) => (
                <TableRow key={resposta.id}>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(resposta.created_at), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                  <TableCell>{formatarResposta(resposta)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
