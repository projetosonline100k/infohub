import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { PerguntaCard } from "./PerguntaCard";
import { PesquisaPreview } from "./PesquisaPreview";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PesquisaFormProps {
  clienteId: string;
  pesquisaId?: string;
  onClose: () => void;
}

type TipoPesquisa = "aberta" | "multipla" | "unica";

interface Pergunta {
  titulo: string;
  tipo: TipoPesquisa;
  opcoes: string[];
  secao: number;
}

export function PesquisaForm({ clienteId, pesquisaId, onClose }: PesquisaFormProps) {
  const [titulo, setTitulo] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([
    { titulo: "", tipo: "aberta", opcoes: [], secao: 1 },
  ]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (pesquisaId) {
      carregarPesquisa();
    }
  }, [pesquisaId]);

  const carregarPesquisa = async () => {
    if (!pesquisaId) return;

    try {
      setLoading(true);

      const { data: pesquisaData, error: pesquisaError } = await supabase
        .from("pesquisas")
        .select("titulo, banner_url")
        .eq("id", pesquisaId)
        .single();

      if (pesquisaError) throw pesquisaError;

      setBannerUrl(pesquisaData.banner_url || "");

      const { data: perguntasData, error: perguntasError } = await supabase
        .from("perguntas_pesquisa")
        .select("*")
        .eq("pesquisa_id", pesquisaId)
        .order("ordem");

      if (perguntasError) throw perguntasError;

      setTitulo(pesquisaData.titulo || "");
      setPerguntas(
        perguntasData.map((p) => ({
          titulo: p.titulo,
          tipo: p.tipo as TipoPesquisa,
          opcoes: Array.isArray(p.opcoes) ? (p.opcoes as string[]) : [],
          secao: p.secao || 1,
        }))
      );
    } catch (error: any) {
      toast({
        title: "Erro ao carregar pesquisa",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const adicionarPergunta = () => {
    // Add to the highest section number
    const maxSecao = Math.max(...perguntas.map(p => p.secao), 0);
    setPerguntas([...perguntas, { titulo: "", tipo: "aberta", opcoes: [], secao: maxSecao || 1 }]);
  };

  const removerPergunta = (index: number) => {
    setPerguntas(perguntas.filter((_, i) => i !== index));
  };

  const atualizarPergunta = (index: number, field: string, value: any) => {
    const novasPerguntas = [...perguntas];
    novasPerguntas[index] = {
      ...novasPerguntas[index],
      [field]: value,
    };

    if (field === "tipo" && value === "aberta") {
      novasPerguntas[index].opcoes = [];
    } else if (
      field === "tipo" &&
      (value === "multipla" || value === "unica") &&
      novasPerguntas[index].opcoes.length === 0
    ) {
      novasPerguntas[index].opcoes = [""];
    }

    setPerguntas(novasPerguntas);
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Erro",
        description: "Por favor, selecione uma imagem válida",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Erro",
        description: "A imagem deve ter no máximo 5MB",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploadingBanner(true);

      const fileExt = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${clienteId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("survey-banners")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("survey-banners")
        .getPublicUrl(filePath);

      setBannerUrl(publicUrl);

      toast({
        title: "Banner enviado!",
        description: "A imagem foi carregada com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao enviar banner",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingBanner(false);
    }
  };

  const removeBanner = () => {
    setBannerUrl("");
  };

  const gerarSlug = (text: string) => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const salvarPesquisa = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!titulo.trim()) {
      toast({
        title: "Erro",
        description: "Digite um título para a pesquisa",
        variant: "destructive",
      });
      return;
    }

    if (perguntas.length === 0) {
      toast({
        title: "Erro",
        description: "Adicione pelo menos uma pergunta",
        variant: "destructive",
      });
      return;
    }

    const perguntasInvalidas = perguntas.some((p) => {
      if (!p.titulo.trim()) return true;
      if ((p.tipo === "multipla" || p.tipo === "unica") && p.opcoes.length === 0) {
        return true;
      }
      if (
        (p.tipo === "multipla" || p.tipo === "unica") &&
        p.opcoes.some((op) => !op.trim())
      ) {
        return true;
      }
      return false;
    });

    if (perguntasInvalidas) {
      toast({
        title: "Erro",
        description:
          "Todas as perguntas devem ter título e opções (se aplicável)",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      if (pesquisaId) {
        // Update existing survey
        const { error: updateError } = await supabase
          .from("pesquisas")
          .update({ titulo, banner_url: bannerUrl || null })
          .eq("id", pesquisaId);

        if (updateError) throw updateError;

        // Delete old questions
        const { error: deleteError } = await supabase
          .from("perguntas_pesquisa")
          .delete()
          .eq("pesquisa_id", pesquisaId);

        if (deleteError) throw deleteError;

        // Insert new questions
        const perguntasData = perguntas.map((p, index) => ({
          pesquisa_id: pesquisaId,
          titulo: p.titulo,
          tipo: p.tipo,
          opcoes: p.opcoes,
          ordem: index + 1,
          obrigatoria: true,
          secao: p.secao,
        }));

        const { error: insertError } = await supabase
          .from("perguntas_pesquisa")
          .insert(perguntasData);

        if (insertError) throw insertError;

        toast({
          title: "Pesquisa atualizada!",
          description: "As alterações foram salvas com sucesso.",
        });
      } else {
        // Create new survey
        const slug = `${gerarSlug(titulo)}-${Date.now()}`;
        const linkPublico = `/formulario/${slug}`;

        const { data: pesquisaData, error: pesquisaError } = await supabase
          .from("pesquisas")
          .insert({
            cliente_id: clienteId,
            titulo_pergunta: titulo,
            titulo,
            link_publico: linkPublico,
            tipo: "aberta",
            opcoes: [],
            banner_url: bannerUrl || null,
          })
          .select()
          .single();

        if (pesquisaError) throw pesquisaError;

        const perguntasData = perguntas.map((p, index) => ({
          pesquisa_id: pesquisaData.id,
          titulo: p.titulo,
          tipo: p.tipo,
          opcoes: p.opcoes,
          ordem: index + 1,
          obrigatoria: true,
          secao: p.secao,
        }));

        const { error: perguntasError } = await supabase
          .from("perguntas_pesquisa")
          .insert(perguntasData);

        if (perguntasError) throw perguntasError;

        toast({
          title: "Pesquisa criada!",
          description: "A pesquisa foi gerada com sucesso.",
        });
      }

      onClose();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar pesquisa",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {pesquisaId ? "Editar pesquisa" : "Criar nova pesquisa"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={salvarPesquisa} className="flex gap-4 h-[70vh]">
          {/* Preview Column */}
          <div className="w-1/3 border rounded-lg flex flex-col">
            <PesquisaPreview titulo={titulo} perguntas={perguntas} bannerUrl={bannerUrl} />
          </div>

          {/* Form Column */}
          <div className="flex-1 flex flex-col gap-4">
            <div>
              <Label htmlFor="titulo">Nome da pesquisa</Label>
              <Input
                id="titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Pesquisa de satisfação 2024"
              />
            </div>

            <div>
              <Label htmlFor="banner">Banner (opcional)</Label>
              {bannerUrl ? (
                <div className="mt-2 relative">
                  <img
                    src={bannerUrl}
                    alt="Banner"
                    className="w-full h-32 object-cover rounded-md"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={removeBanner}
                    className="absolute top-2 right-2"
                  >
                    Remover
                  </Button>
                </div>
              ) : (
                <div className="mt-2">
                  <input
                    type="file"
                    id="banner"
                    accept="image/*"
                    onChange={handleBannerUpload}
                    disabled={uploadingBanner}
                    className="hidden"
                  />
                  <Label
                    htmlFor="banner"
                    className="flex items-center justify-center w-full h-32 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    {uploadingBanner ? (
                      <span className="text-muted-foreground">Enviando...</span>
                    ) : (
                      <span className="text-muted-foreground">
                        Clique para selecionar uma imagem
                      </span>
                    )}
                  </Label>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Recomendado: 1200x400px, máximo 5MB
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label>Perguntas</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={adicionarPergunta}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar pergunta
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-4 pr-4">
                {perguntas.map((pergunta, index) => (
                  <PerguntaCard
                    key={index}
                    pergunta={pergunta}
                    index={index}
                    onUpdate={atualizarPergunta}
                    onRemove={removerPergunta}
                  />
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading
                  ? "Salvando..."
                  : pesquisaId
                  ? "Salvar alterações"
                  : "Criar pesquisa"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
