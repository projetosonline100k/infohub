import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, Eye, Plus, Pencil } from "lucide-react";
import { PesquisaForm } from "./PesquisaForm";
import { RespostasModal } from "./RespostasModal";

interface Pesquisa {
  id: string;
  titulo_pergunta: string;
  tipo: "aberta" | "multipla" | "unica";
  link_publico: string;
  created_at: string;
  respostas_count?: number;
}

interface PesquisaListProps {
  clienteId: string;
}

export function PesquisaList({ clienteId }: PesquisaListProps) {
  const [pesquisas, setPesquisas] = useState<Pesquisa[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editPesquisaId, setEditPesquisaId] = useState<string | undefined>(undefined);
  const [selectedPesquisa, setSelectedPesquisa] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    carregarPesquisas();
  }, [clienteId]);

  const carregarPesquisas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("pesquisas")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Count unique respondents for each survey
      const pesquisasComRespostas = await Promise.all(
        (data || []).map(async (pesquisa) => {
          const { data: respondentes } = await supabase
            .from("respostas_pesquisa")
            .select("respondente_id")
            .eq("pesquisa_id", pesquisa.id);

          // Count unique respondent IDs
          const uniqueRespondentes = new Set(
            respondentes?.map((r) => r.respondente_id) || []
          );

          return { ...pesquisa, respostas_count: uniqueRespondentes.size };
        })
      );

      setPesquisas(pesquisasComRespostas);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar pesquisas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copiarLink = (linkPublico: string) => {
    // Usar URL publicada se disponível, ou origin atual
    const baseUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
    const fullUrl = `${baseUrl}${linkPublico}`;
    navigator.clipboard.writeText(fullUrl);
    toast({
      title: "Link copiado!",
      description: "O link da pesquisa foi copiado para a área de transferência.",
    });
  };

  const editarPesquisa = (pesquisaId: string) => {
    setEditPesquisaId(pesquisaId);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditPesquisaId(undefined);
    carregarPesquisas();
  };

  if (loading) {
    return <div className="text-muted-foreground">Carregando pesquisas...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Pesquisa</h2>
        <Button onClick={() => { setEditPesquisaId(undefined); setShowForm(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Gerar pesquisa
        </Button>
      </div>

      {pesquisas.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">Nenhuma pesquisa criada ainda</p>
          <Button onClick={() => { setEditPesquisaId(undefined); setShowForm(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Criar primeira pesquisa
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {pesquisas.map((pesquisa) => (
            <Card key={pesquisa.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold">{pesquisa.titulo_pergunta}</h3>
                  <div className="text-sm text-muted-foreground">
                    {pesquisa.respostas_count || 0} pessoa{pesquisa.respostas_count !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => editarPesquisa(pesquisa.id)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copiarLink(pesquisa.link_publico)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPesquisa(pesquisa.id)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <PesquisaForm
          clienteId={clienteId}
          pesquisaId={editPesquisaId}
          onClose={handleCloseForm}
        />
      )}

      {selectedPesquisa && (
        <RespostasModal
          pesquisaId={selectedPesquisa}
          onClose={() => setSelectedPesquisa(null)}
        />
      )}
    </div>
  );
}
