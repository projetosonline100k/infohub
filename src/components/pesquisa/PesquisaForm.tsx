import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { X, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PesquisaFormProps {
  clienteId: string;
  onClose: () => void;
}

type TipoPesquisa = "aberta" | "multipla" | "unica";

export function PesquisaForm({ clienteId, onClose }: PesquisaFormProps) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoPesquisa>("aberta");
  const [opcoes, setOpcoes] = useState<string[]>(["", ""]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const adicionarOpcao = () => {
    setOpcoes([...opcoes, ""]);
  };

  const removerOpcao = (index: number) => {
    if (opcoes.length > 2) {
      setOpcoes(opcoes.filter((_, i) => i !== index));
    }
  };

  const atualizarOpcao = (index: number, valor: string) => {
    const novasOpcoes = [...opcoes];
    novasOpcoes[index] = valor;
    setOpcoes(novasOpcoes);
  };

  const gerarSlug = () => {
    return crypto.randomUUID().slice(0, 8);
  };

  const salvarPesquisa = async () => {
    if (!titulo.trim()) {
      toast({
        title: "Erro",
        description: "Digite o título da pergunta",
        variant: "destructive",
      });
      return;
    }

    if ((tipo === "multipla" || tipo === "unica") && opcoes.filter(o => o.trim()).length < 2) {
      toast({
        title: "Erro",
        description: "Adicione pelo menos 2 opções",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const opcoesLimpas = tipo === "aberta" ? [] : opcoes.filter(o => o.trim());
      
      const { error } = await supabase.from("pesquisas").insert({
        cliente_id: clienteId,
        titulo_pergunta: titulo,
        tipo,
        opcoes: opcoesLimpas,
        link_publico: gerarSlug(),
      });

      if (error) throw error;

      toast({
        title: "Pesquisa criada!",
        description: "A pesquisa foi criada com sucesso.",
      });
      
      onClose();
    } catch (error: any) {
      toast({
        title: "Erro ao criar pesquisa",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Pesquisa</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          {/* Preview */}
          <div>
            <h3 className="font-semibold mb-3">Prévia</h3>
            <Card className="p-6 space-y-4 min-h-[300px]">
              <div>
                <h2 className="text-xl font-semibold mb-4">
                  {titulo || "Avatar ou expert?"}
                </h2>

                {tipo === "aberta" && (
                  <Textarea
                    placeholder="Sua resposta..."
                    disabled
                    className="min-h-[120px]"
                  />
                )}

                {tipo === "multipla" && (
                  <div className="space-y-2">
                    {opcoes.filter(o => o.trim()).map((opcao, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input type="checkbox" disabled className="h-4 w-4" />
                        <span>{opcao || `Opção ${index + 1}`}</span>
                      </div>
                    ))}
                  </div>
                )}

                {tipo === "unica" && (
                  <div className="space-y-2">
                    {opcoes.filter(o => o.trim()).map((opcao, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input type="radio" disabled className="h-4 w-4" name="preview" />
                        <span>{opcao || `Opção ${index + 1}`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Configuration */}
          <div>
            <h3 className="font-semibold mb-3">3 Modos</h3>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={tipo === "aberta" ? "default" : "outline"}
                  onClick={() => setTipo("aberta")}
                  className="flex-1"
                >
                  Pergunta (aberta)
                </Button>
                <Button
                  type="button"
                  variant={tipo === "multipla" ? "default" : "outline"}
                  onClick={() => setTipo("multipla")}
                  className="flex-1"
                >
                  Caixinha de perguntas
                </Button>
                <Button
                  type="button"
                  variant={tipo === "unica" ? "default" : "outline"}
                  onClick={() => setTipo("unica")}
                  className="flex-1"
                >
                  Seleção única
                </Button>
              </div>

              <div>
                <Label htmlFor="titulo">Texto da pergunta</Label>
                <Input
                  id="titulo"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Digite sua pergunta..."
                />
              </div>

              {(tipo === "multipla" || tipo === "unica") && (
                <div>
                  <Label>Alternativas</Label>
                  <div className="space-y-2 mt-2">
                    {opcoes.map((opcao, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={opcao}
                          onChange={(e) => atualizarOpcao(index, e.target.value)}
                          placeholder={`Opção ${index + 1}`}
                        />
                        {opcoes.length > 2 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => removerOpcao(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={adicionarOpcao}
                      className="w-full"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar opção
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={salvarPesquisa} disabled={saving}>
            {saving ? "Salvando..." : "Gerar pesquisa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
