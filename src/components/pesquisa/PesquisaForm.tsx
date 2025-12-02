import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const [mensagemInicial, setMensagemInicial] = useState("");
  const [mensagemFinal, setMensagemFinal] = useState("");
  const [linkFinal, setLinkFinal] = useState("");
  const [linkFinalTexto, setLinkFinalTexto] = useState("");
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
        .select("titulo, banner_url, mensagem_inicial, mensagem_final, link_final, link_final_texto")
        .eq("id", pesquisaId)
        .single();

      if (pesquisaError) throw pesquisaError;

      setBannerUrl(pesquisaData.banner_url || "");
      setMensagemInicial(pesquisaData.mensagem_inicial || "");
      setMensagemFinal(pesquisaData.mensagem_final || "");
      setLinkFinal(pesquisaData.link_final || "");
      setLinkFinalTexto(pesquisaData.link_final_texto || "");

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

  const moverPerguntaParaCima = (index: number) => {
    if (index === 0) return;
    const novasPerguntas = [...perguntas];
    [novasPerguntas[index - 1], novasPerguntas[index]] = 
      [novasPerguntas[index], novasPerguntas[index - 1]];
    setPerguntas(novasPerguntas);
  };

  const moverPerguntaParaBaixo = (index: number) => {
    if (index === perguntas.length - 1) return;
    const novasPerguntas = [...perguntas];
    [novasPerguntas[index], novasPerguntas[index + 1]] = 
      [novasPerguntas[index + 1], novasPerguntas[index]];
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
          .update({ 
            titulo, 
            banner_url: bannerUrl || null,
            mensagem_inicial: mensagemInicial || null,
            mensagem_final: mensagemFinal || null,
            link_final: linkFinal || null,
            link_final_texto: linkFinalTexto || null,
          })
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
            mensagem_inicial: mensagemInicial || null,
            mensagem_final: mensagemFinal || null,
            link_final: linkFinal || null,
            link_final_texto: linkFinalTexto || null,
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

        <form onSubmit={salvarPesquisa} className="flex gap-6 h-[70vh]">
          {/* Preview Column */}
          <div className="w-1/3 border rounded-lg flex flex-col">
            <PesquisaPreview 
              titulo={titulo} 
              perguntas={perguntas} 
              bannerUrl={bannerUrl}
              mensagemInicial={mensagemInicial}
              mensagemFinal={mensagemFinal}
              linkFinal={linkFinal}
              linkFinalTexto={linkFinalTexto}
            />
          </div>

          {/* Form Column */}
          <div className="flex-1 flex flex-col">
            <ScrollArea className="flex-1">
              <div className="space-y-6 pr-4 pb-4">
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

                <div>
                  <Label htmlFor="mensagem-inicial">Mensagem inicial (opcional)</Label>
                  <Textarea
                    id="mensagem-inicial"
                    value={mensagemInicial}
                    onChange={(e) => setMensagemInicial(e.target.value)}
                    placeholder="Ex: Parabéns pela sua inscrição! Para me ajudar a personalizar sua experiência, responda algumas perguntas..."
                    className="mt-1 min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Será exibida antes das perguntas
                  </p>
                </div>

                <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                  <Label className="text-base font-semibold">Configurações de Conclusão</Label>
                  
                  <div>
                    <Label htmlFor="mensagem-final">Mensagem final (opcional)</Label>
                    <Textarea
                      id="mensagem-final"
                      value={mensagemFinal}
                      onChange={(e) => setMensagemFinal(e.target.value)}
                      placeholder="Ex: Obrigado por participar! Agora você pode acessar seu presente..."
                      className="mt-1 min-h-[80px]"
                    />
                  </div>

                  <div>
                    <Label htmlFor="link-final">Link do botão (opcional)</Label>
                    <Input
                      id="link-final"
                      value={linkFinal}
                      onChange={(e) => setLinkFinal(e.target.value)}
                      placeholder="https://exemplo.com/presente"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="link-final-texto">Texto do botão (opcional)</Label>
                    <Input
                      id="link-final-texto"
                      value={linkFinalTexto}
                      onChange={(e) => setLinkFinalTexto(e.target.value)}
                      placeholder="Ex: Acesse seu presente"
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      O link só aparece se você preencher a URL acima
                    </p>
                  </div>
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

                <div className="space-y-6">
                  {perguntas.map((pergunta, index) => (
                    <PerguntaCard
                      key={index}
                      pergunta={pergunta}
                      index={index}
                      totalPerguntas={perguntas.length}
                      onUpdate={atualizarPergunta}
                      onRemove={removerPergunta}
                      onMoveUp={moverPerguntaParaCima}
                      onMoveDown={moverPerguntaParaBaixo}
                    />
                  ))}
                </div>
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
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
