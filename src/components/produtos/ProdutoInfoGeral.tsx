import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface LinkCheckout {
  nome: string;
  url: string;
  preco: string;
}

interface Produto {
  id: string;
  nome_produto: string;
  preco?: string;
  status: string;
  descricao?: string;
  links_checkout?: LinkCheckout[];
  acesso_url?: string;
  acesso_instrucoes?: string;
  ideias?: string;
}

interface ProdutoInfoGeralProps {
  produto: Produto;
  onUpdate: () => void;
}

export function ProdutoInfoGeral({ produto, onUpdate }: ProdutoInfoGeralProps) {
  const [nome, setNome] = useState(produto.nome_produto);
  const [descricao, setDescricao] = useState(produto.descricao || "");
  const [linksCheckout, setLinksCheckout] = useState<LinkCheckout[]>(
    Array.isArray(produto.links_checkout) ? produto.links_checkout : []
  );
  const [acessoUrl, setAcessoUrl] = useState(produto.acesso_url || "");
  const [acessoInstrucoes, setAcessoInstrucoes] = useState(produto.acesso_instrucoes || "");
  const [ideias, setIdeias] = useState(produto.ideias || "");
  const [saving, setSaving] = useState(false);
  const [novoLink, setNovoLink] = useState({ nome: "", url: "", preco: "" });

  const salvarCampo = useCallback(async (campo: string, valor: any) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("produtos_cliente")
        .update({ [campo]: valor })
        .eq("id", produto.id);

      if (error) throw error;
      onUpdate();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [produto.id, onUpdate]);

  const adicionarLink = async () => {
    if (!novoLink.nome || !novoLink.url) {
      toast({ title: "Preencha nome e URL do link", variant: "destructive" });
      return;
    }

    const novosLinks = [...linksCheckout, novoLink];
    setLinksCheckout(novosLinks);
    setNovoLink({ nome: "", url: "", preco: "" });
    await salvarCampo("links_checkout", novosLinks);
  };

  const removerLink = async (index: number) => {
    const novosLinks = linksCheckout.filter((_, i) => i !== index);
    setLinksCheckout(novosLinks);
    await salvarCampo("links_checkout", novosLinks);
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Indicador de salvando */}
      {saving && (
        <div className="fixed top-4 right-4 flex items-center gap-2 text-sm text-muted-foreground bg-background border rounded-md px-3 py-2 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Salvando...
        </div>
      )}

      {/* Nome do Produto */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nome do Produto</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => salvarCampo("nome_produto", nome)}
            className="text-lg font-medium"
            placeholder="Nome do produto"
          />
        </CardContent>
      </Card>

      {/* O que é */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que é</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            onBlur={() => salvarCampo("descricao", descricao)}
            placeholder="Descreva o produto, sua proposta de valor, público-alvo..."
            className="min-h-[120px]"
          />
        </CardContent>
      </Card>

      {/* Preços e Links */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Preços e Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Lista de links existentes */}
          {linksCheckout.length > 0 && (
            <div className="space-y-2">
              {linksCheckout.map((link, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{link.nome}</p>
                    {link.preco && (
                      <p className="text-sm text-muted-foreground">{link.preco}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.open(link.url, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removerLink(index)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Form para adicionar novo link */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 p-3 border border-dashed rounded-lg">
            <Input
              placeholder="Plataforma (ex: Hotmart)"
              value={novoLink.nome}
              onChange={(e) => setNovoLink({ ...novoLink, nome: e.target.value })}
            />
            <Input
              placeholder="URL do checkout"
              value={novoLink.url}
              onChange={(e) => setNovoLink({ ...novoLink, url: e.target.value })}
            />
            <Input
              placeholder="Preço (ex: R$ 97)"
              value={novoLink.preco}
              onChange={(e) => setNovoLink({ ...novoLink, preco: e.target.value })}
            />
            <Button onClick={adicionarLink} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Acesso do Produto */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acesso do Produto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">URL de Acesso</label>
            <Input
              value={acessoUrl}
              onChange={(e) => setAcessoUrl(e.target.value)}
              onBlur={() => salvarCampo("acesso_url", acessoUrl)}
              placeholder="https://area-de-membros.com/..."
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Instruções de Acesso</label>
            <Textarea
              value={acessoInstrucoes}
              onChange={(e) => setAcessoInstrucoes(e.target.value)}
              onBlur={() => salvarCampo("acesso_instrucoes", acessoInstrucoes)}
              placeholder="Login, senha padrão, como acessar..."
              className="min-h-[80px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Ideias */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ideias</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={ideias}
            onChange={(e) => setIdeias(e.target.value)}
            onBlur={() => salvarCampo("ideias", ideias)}
            placeholder="Anotações, ideias de melhorias, próximos passos..."
            className="min-h-[120px]"
          />
        </CardContent>
      </Card>
    </div>
  );
}
