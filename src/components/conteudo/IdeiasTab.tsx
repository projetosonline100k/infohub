import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Lightbulb, Instagram, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  plataformas: string[];
  link_referencia?: string;
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
  const [plataformas, setPlataformas] = useState<string[]>([]);
  const [linkReferencia, setLinkReferencia] = useState("");

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

  const togglePlataforma = (plataforma: string) => {
    setPlataformas((prev) =>
      prev.includes(plataforma)
        ? prev.filter((p) => p !== plataforma)
        : [...prev, plataforma]
    );
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
          plataformas: plataformas,
          link_referencia: linkReferencia.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Integração automática: cria no Kanban da plataforma selecionada
      if (plataformas.includes("instagram")) {
        await supabase.from("videos_vertical").insert({
          cliente_id: clienteId,
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          status: "ideia",
          ordem: 1,
        });
      }

      if (plataformas.includes("youtube")) {
        await supabase.from("videos_youtube").insert({
          cliente_id: clienteId,
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          status: "ideia",
          ordem: 1,
        });
      }

      setIdeias([data, ...ideias]);
      resetForm();
      setShowModal(false);
      toast({ title: "Ideia adicionada!" });
    } catch (error) {
      console.error("Erro ao adicionar ideia:", error);
      toast({ title: "Erro ao adicionar ideia", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setTitulo("");
    setDescricao("");
    setPlataformas([]);
    setLinkReferencia("");
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
        <div className="space-y-3">
          {ideias.map((ideia) => (
            <div
              key={ideia.id}
              className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:bg-accent/5 transition-colors"
            >
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => excluirIdeia(ideia.id)}
              >
                <X className="h-4 w-4" />
              </Button>
              
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{ideia.titulo}</p>
                {ideia.descricao && (
                  <p className="text-sm text-muted-foreground truncate">
                    {ideia.descricao}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {ideia.plataformas?.includes("instagram") && (
                  <div className="w-7 h-7 rounded-md bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                    <Instagram className="h-4 w-4 text-white" />
                  </div>
                )}
                {ideia.plataformas?.includes("youtube") && (
                  <div className="w-7 h-7 rounded-md bg-red-600 flex items-center justify-center">
                    <Youtube className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de nova ideia */}
      <Dialog open={showModal} onOpenChange={(open) => { setShowModal(open); if (!open) resetForm(); }}>
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
                placeholder="Ex: 3 livros para ler em 2025"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição (opcional)</label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descreva a ideia em mais detalhes..."
                rows={3}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Qual plataforma?</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={plataformas.includes("instagram")}
                    onCheckedChange={() => togglePlataforma("instagram")}
                  />
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                      <Instagram className="h-3 w-3 text-white" />
                    </div>
                    <span className="text-sm">Instagram</span>
                  </div>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={plataformas.includes("youtube")}
                    onCheckedChange={() => togglePlataforma("youtube")}
                  />
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded bg-red-600 flex items-center justify-center">
                      <Youtube className="h-3 w-3 text-white" />
                    </div>
                    <span className="text-sm">Youtube</span>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Possui link de referência?</label>
              <Input
                value={linkReferencia}
                onChange={(e) => setLinkReferencia(e.target.value)}
                placeholder="https://..."
                type="url"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowModal(false); resetForm(); }}>
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
