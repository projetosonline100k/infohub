import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Trash2, GripVertical, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";

interface PerguntaCardProps {
  pergunta: {
    titulo: string;
    tipo: "aberta" | "multipla" | "unica";
    opcoes: string[];
    secao: number;
  };
  index: number;
  onUpdate: (index: number, field: string, value: any) => void;
  onRemove: (index: number) => void;
}

export function PerguntaCard({ pergunta, index, onUpdate, onRemove }: PerguntaCardProps) {
  const adicionarOpcao = () => {
    onUpdate(index, "opcoes", [...pergunta.opcoes, ""]);
  };

  const removerOpcao = (opcaoIndex: number) => {
    onUpdate(
      index,
      "opcoes",
      pergunta.opcoes.filter((_, i) => i !== opcaoIndex)
    );
  };

  const atualizarOpcao = (opcaoIndex: number, valor: string) => {
    const novasOpcoes = [...pergunta.opcoes];
    novasOpcoes[opcaoIndex] = valor;
    onUpdate(index, "opcoes", novasOpcoes);
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start gap-2">
        <GripVertical className="h-5 w-5 text-muted-foreground mt-2 cursor-move" />
        <div className="flex-1 space-y-4">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <Label>Pergunta {index + 1}</Label>
              <Input
                value={pergunta.titulo}
                onChange={(e) => onUpdate(index, "titulo", e.target.value)}
                placeholder="Digite sua pergunta..."
                className="mt-1"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(index)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo de resposta</Label>
              <RadioGroup
                value={pergunta.tipo}
                onValueChange={(value) => onUpdate(index, "tipo", value)}
                className="flex flex-col gap-2 mt-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="aberta" id={`aberta-${index}`} />
                  <Label htmlFor={`aberta-${index}`} className="font-normal cursor-pointer">
                    Aberta
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="multipla" id={`multipla-${index}`} />
                  <Label htmlFor={`multipla-${index}`} className="font-normal cursor-pointer">
                    Múltipla escolha
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="unica" id={`unica-${index}`} />
                  <Label htmlFor={`unica-${index}`} className="font-normal cursor-pointer">
                    Única escolha
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label htmlFor={`secao-${index}`}>Seção</Label>
              <Input
                id={`secao-${index}`}
                type="number"
                min="1"
                value={pergunta.secao}
                onChange={(e) => onUpdate(index, "secao", parseInt(e.target.value) || 1)}
                className="mt-1"
              />
            </div>
          </div>

          {(pergunta.tipo === "multipla" || pergunta.tipo === "unica") && (
            <div className="space-y-2">
              <Label>Opções de resposta</Label>
              {pergunta.opcoes.map((opcao, opcaoIndex) => (
                <div key={opcaoIndex} className="flex gap-2">
                  <Input
                    value={opcao}
                    onChange={(e) => atualizarOpcao(opcaoIndex, e.target.value)}
                    placeholder={`Opção ${opcaoIndex + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removerOpcao(opcaoIndex)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={adicionarOpcao}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar opção
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
