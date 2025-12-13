import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Ideia {
  id: string;
  titulo: string;
  descricao?: string;
  status: string;
}

interface IdeiasTabProps {
  clienteId: string;
}

export function IdeiasTab({ clienteId }: IdeiasTabProps) {
  const [ideias, setIdeias] = useState<Ideia[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    carregarIdeias();
  }, [clienteId]);

  const carregarIdeias = async () => {
    try {
      const { data, error } = await supabase
        .from("ideias_conteudo")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setIdeias(data || []);
    } catch (error) {
      console.error("Erro ao carregar ideias:", error);
    } finally {
      setLoading(false);
    }
  };

  const adicionarIdeia = async () => {
    if (!titulo.trim()) return;

    try {
      const { data, error } = await supabase
        .from("ideias_conteudo")
        .insert({
          cliente_id: clienteId,
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      setIdeias([data, ...ideias]);
      setTitulo("");
      setDescricao("");
      setShowModal(false);
      toast({ title: "Ideia adicionada!" });
    } catch (error) {
      console.error("Erro ao adicionar ideia:", error);
      toast({ title: "Erro ao adicionar ideia", variant: "destructive" });
    }
  };

  const excluirIdeia = async (id: string) => {
    try {
      const { error } = await supabase
        .from("ideias_conteudo")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setIdeias(ideias.filter((i) => i.id !== id));
      toast({ title: "Ideia removida!" });
    } catch (error) {
      console.error("Erro ao excluir ideia:", error);
      toast({ title: "Erro ao excluir ideia", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Ideias de conteúdo</h3>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova ideia
        </Button>
      </div>

      {ideias.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Lightbulb className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">Nenhuma ideia cadastrada ainda</p>
          <p className="text-sm text-muted-foreground/70">
            Clique em "Nova ideia" para começar
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ideias.map((ideia) => (
            <Card key={ideia.id} className="group relative">
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => excluirIdeia(ideia.id)}
              >
                <X className="h-3 w-3" />
              </Button>
              <CardContent className="pt-4">
                <h4 className="font-medium mb-2">{ideia.titulo}</h4>
                {ideia.descricao && (
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {ideia.descricao}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de nova ideia */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova ideia de conteúdo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Título</label>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Vídeo sobre produtividade"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição (opcional)</label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descreva a ideia em mais detalhes..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button onClick={adicionarIdeia}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
