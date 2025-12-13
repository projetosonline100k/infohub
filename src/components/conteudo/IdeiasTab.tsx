import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Lightbulb, Instagram, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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

interface NovaIdeia {
  headline: string;
  link: string;
  plataforma: "instagram" | "youtube" | "";
  descricao: string;
}

interface IdeiasTabProps {
  clienteId: string;
}

const createEmptyIdeias = (): NovaIdeia[] => [
  { headline: "", link: "", plataforma: "", descricao: "" },
  { headline: "", link: "", plataforma: "", descricao: "" },
  { headline: "", link: "", plataforma: "", descricao: "" },
];

export function IdeiasTab({ clienteId }: IdeiasTabProps) {
  const [ideias, setIdeias] = useState<Ideia[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [novasIdeias, setNovasIdeias] = useState<NovaIdeia[]>(createEmptyIdeias());

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

  const updateIdeia = (index: number, field: keyof NovaIdeia, value: string) => {
    setNovasIdeias((prev) =>
      prev.map((ideia, i) =>
        i === index ? { ...ideia, [field]: value } : ideia
      )
    );
  };

  const adicionarIdeias = async () => {
    const ideiasValidas = novasIdeias.filter((i) => i.headline.trim());
    if (ideiasValidas.length === 0) return;

    try {
      const novasIdeiasDb: Ideia[] = [];

      for (const ideia of ideiasValidas) {
        const plataformas = ideia.plataforma ? [ideia.plataforma] : [];

        const { data, error } = await supabase
          .from("ideias_conteudo")
          .insert({
            cliente_id: clienteId,
            titulo: ideia.headline.trim(),
            descricao: ideia.descricao.trim() || null,
            plataformas: plataformas,
            link_referencia: ideia.link.trim() || null,
          })
          .select()
          .single();

        if (error) throw error;

        if (ideia.plataforma === "instagram") {
          await supabase.from("videos_vertical").insert({
            cliente_id: clienteId,
            titulo: ideia.headline.trim(),
            descricao: ideia.descricao.trim() || null,
            status: "ideia",
            ordem: 1,
          });
        }

        if (ideia.plataforma === "youtube") {
          await supabase.from("videos_youtube").insert({
            cliente_id: clienteId,
            titulo: ideia.headline.trim(),
            descricao: ideia.descricao.trim() || null,
            status: "ideia",
            ordem: 1,
          });
        }

        novasIdeiasDb.push(data);
      }

      setIdeias([...novasIdeiasDb.reverse(), ...ideias]);
      setNovasIdeias(createEmptyIdeias());
      setShowModal(false);
      toast({ title: `${ideiasValidas.length} ideia(s) adicionada(s)!` });
    } catch (error) {
      console.error("Erro ao adicionar ideias:", error);
      toast({ title: "Erro ao adicionar ideias", variant: "destructive" });
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

      {/* Modal de novas ideias */}
      <Dialog open={showModal} onOpenChange={(open) => { setShowModal(open); if (!open) setNovasIdeias(createEmptyIdeias()); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Novas ideias de conteúdo</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {novasIdeias.map((ideia, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg bg-muted/30">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Headline</Label>
                  <Input
                    value={ideia.headline}
                    onChange={(e) => updateIdeia(index, "headline", e.target.value)}
                    placeholder="Ex: 3 livros para ler"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Link</Label>
                  <Input
                    value={ideia.link}
                    onChange={(e) => updateIdeia(index, "link", e.target.value)}
                    placeholder="https://..."
                    type="url"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Qual plataforma?</Label>
                  <RadioGroup
                    value={ideia.plataforma}
                    onValueChange={(value) => updateIdeia(index, "plataforma", value)}
                    className="flex gap-4 pt-1"
                  >
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="instagram" id={`instagram-${index}`} />
                      <Label htmlFor={`instagram-${index}`} className="flex items-center gap-1 cursor-pointer text-sm">
                        <div className="w-4 h-4 rounded bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                          <Instagram className="h-2.5 w-2.5 text-white" />
                        </div>
                        Instagram
                      </Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="youtube" id={`youtube-${index}`} />
                      <Label htmlFor={`youtube-${index}`} className="flex items-center gap-1 cursor-pointer text-sm">
                        <div className="w-4 h-4 rounded bg-red-600 flex items-center justify-center">
                          <Youtube className="h-2.5 w-2.5 text-white" />
                        </div>
                        Youtube
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Descrição (opcional)</Label>
                  <Textarea
                    value={ideia.descricao}
                    onChange={(e) => updateIdeia(index, "descricao", e.target.value)}
                    placeholder="Descreva a ideia..."
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>
            ))}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowModal(false); setNovasIdeias(createEmptyIdeias()); }}>
                Cancelar
              </Button>
              <Button onClick={adicionarIdeias}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
