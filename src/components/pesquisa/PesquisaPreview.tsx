import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Pergunta {
  titulo: string;
  tipo: "aberta" | "multipla" | "unica";
  opcoes: string[];
}

interface PesquisaPreviewProps {
  titulo: string;
  perguntas: Pergunta[];
  bannerUrl?: string;
  mensagemInicial?: string;
  mensagemFinal?: string;
  linkFinal?: string;
  linkFinalTexto?: string;
}

export function PesquisaPreview({ titulo, perguntas, bannerUrl, mensagemInicial, mensagemFinal, linkFinal, linkFinalTexto }: PesquisaPreviewProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Prévia</h3>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {bannerUrl && (
            <div className="w-full">
              <img
                src={bannerUrl}
                alt="Banner"
                className="w-full h-32 object-cover rounded-md"
              />
            </div>
          )}

          {titulo && (
            <div>
              <h2 className="text-2xl font-bold">{titulo}</h2>
            </div>
          )}

          {mensagemInicial && (
            <div className="bg-muted/50 rounded-lg p-4 border">
              <p className="text-sm whitespace-pre-wrap">{mensagemInicial}</p>
            </div>
          )}

          {perguntas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Adicione perguntas para ver a prévia
            </p>
          ) : (
            perguntas.map((pergunta, index) => (
              <div key={index} className="space-y-3">
                <Label className="text-base">
                  {index + 1}. {pergunta.titulo || "Pergunta sem título"}
                </Label>

                {pergunta.tipo === "aberta" && (
                  <Textarea
                    placeholder="Resposta em texto..."
                    disabled
                    className="resize-none"
                  />
                )}

                {pergunta.tipo === "multipla" && (
                  <div className="space-y-2">
                    {pergunta.opcoes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Adicione opções
                      </p>
                    ) : (
                      pergunta.opcoes.map((opcao, opcaoIndex) => (
                        <div
                          key={opcaoIndex}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox disabled id={`prev-mult-${index}-${opcaoIndex}`} />
                          <Label
                            htmlFor={`prev-mult-${index}-${opcaoIndex}`}
                            className="font-normal cursor-pointer"
                          >
                            {opcao || `Opção ${opcaoIndex + 1}`}
                          </Label>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {pergunta.tipo === "unica" && (
                  <RadioGroup disabled>
                    {pergunta.opcoes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Adicione opções
                      </p>
                    ) : (
                      pergunta.opcoes.map((opcao, opcaoIndex) => (
                        <div
                          key={opcaoIndex}
                          className="flex items-center space-x-2"
                        >
                          <RadioGroupItem
                            value={opcaoIndex.toString()}
                            id={`prev-radio-${index}-${opcaoIndex}`}
                          />
                          <Label
                            htmlFor={`prev-radio-${index}-${opcaoIndex}`}
                            className="font-normal cursor-pointer"
                          >
                            {opcao || `Opção ${opcaoIndex + 1}`}
                          </Label>
                        </div>
                      ))
                    )}
                  </RadioGroup>
                )}
              </div>
            ))
          )}

          {(mensagemFinal || linkFinal) && (
            <div className="border-t pt-6 space-y-4">
              <div className="text-center space-y-4">
                <div className="text-4xl text-primary">✓</div>
                <p className="font-semibold">Tela de conclusão:</p>
                
                {mensagemFinal && (
                  <div className="bg-muted/50 rounded-lg p-4 border">
                    <p className="text-sm whitespace-pre-wrap">{mensagemFinal}</p>
                  </div>
                )}

                {linkFinal && (
                  <Button disabled className="w-full">
                    {linkFinalTexto || "Acesse aqui"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
