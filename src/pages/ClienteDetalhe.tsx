import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Edit, Trash } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ProdutoForm } from "@/components/ProdutoForm";

interface Cliente {
  id: string;
  nome_especialista: string;
  idade: number;
  nicho: string;
  meta_atual?: string;
  link_painel_receita?: string;
}

interface EquipeMembro {
  id: string;
  nome_pessoa: string;
  papel: string;
}

interface Produto {
  id: string;
  nome_produto: string;
  preco?: string;
  status: string;
}

export default function ClienteDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [equipe, setEquipe] = useState<EquipeMembro[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState("informacoes");
  const [mostrarFormProduto, setMostrarFormProduto] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null);

  useEffect(() => {
    carregarDados();
  }, [id]);

  const carregarDados = async () => {
    if (!id) return;

    try {
      setLoading(true);

      const [clienteRes, equipeRes, produtosRes] = await Promise.all([
        supabase.from("clientes").select("*").eq("id", id).single(),
        supabase.from("equipe_cliente").select("*").eq("cliente_id", id),
        supabase.from("produtos_cliente").select("*").eq("cliente_id", id),
      ]);

      if (clienteRes.error) throw clienteRes.error;
      setCliente(clienteRes.data);

      if (equipeRes.data) setEquipe(equipeRes.data);
      if (produtosRes.data) setProdutos(produtosRes.data);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro ao carregar dados do cliente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const excluirProduto = async (produtoId: string) => {
    if (!confirm("Deseja realmente excluir este produto?")) return;

    try {
      const { error } = await supabase
        .from("produtos_cliente")
        .delete()
        .eq("id", produtoId);

      if (error) throw error;

      toast({ title: "Produto excluído com sucesso!" });
      carregarDados();
    } catch (error) {
      console.error("Erro ao excluir produto:", error);
      toast({
        title: "Erro ao excluir produto",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-muted-foreground">Cliente não encontrado</p>
        <Button onClick={() => navigate("/clientes")}>Voltar para lista</Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar interno */}
      <div className="w-48 border-r border-border bg-background p-4">
        <div className="space-y-2">
          <button
            onClick={() => setAbaAtiva("informacoes")}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              abaAtiva === "informacoes"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            Informações gerais
          </button>
          <button
            onClick={() => setAbaAtiva("pesquisa")}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              abaAtiva === "pesquisa"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            Pesquisa
          </button>
          <button
            onClick={() => setAbaAtiva("atividades")}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              abaAtiva === "atividades"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            Atividades
          </button>
        </div>
      </div>

      {/* Área de conteúdo */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="border-b border-border bg-background p-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/clientes")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">{cliente.nome_especialista}</h1>
        </div>

        {/* Conteúdo das abas */}
        <div className="p-6">
          {abaAtiva === "informacoes" && (
            <div className="space-y-6">
              {/* Bloco superior: Meta e Equipe */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Meta atual */}
                <Card>
                  <CardHeader>
                    <CardTitle>Meta atual</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      {cliente.meta_atual || "Nenhuma meta definida"}
                    </p>
                  </CardContent>
                </Card>

                {/* Equipe */}
                <Card>
                  <CardHeader>
                    <CardTitle>Equipe</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {equipe.length > 0 ? (
                      <div className="space-y-2">
                        {equipe.map((membro) => (
                          <div key={membro.id} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full border-2 border-foreground" />
                            <span className="text-sm">
                              {membro.nome_pessoa}{" "}
                              <span className="text-muted-foreground">
                                [{membro.papel}]
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nenhum membro na equipe
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Receita */}
              <Card>
                <CardHeader>
                  <CardTitle>Receita</CardTitle>
                </CardHeader>
                <CardContent>
                  {cliente.link_painel_receita ? (
                    <div className="w-full h-96 rounded-lg overflow-hidden border border-border">
                      <iframe
                        src={cliente.link_painel_receita}
                        className="w-full h-full"
                        title="Painel de Receitas"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-48 flex items-center justify-center bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground text-center max-w-md">
                        Aqui será exibido o gráfico de receitas e dados financeiros
                        (integração com Hotmart/Monetizze/etc)
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Esteira de produtos */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Esteira de produtos</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => {
                      setProdutoEditando(null);
                      setMostrarFormProduto(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar
                  </Button>
                </CardHeader>
                <CardContent>
                  {produtos.length > 0 ? (
                    <div className="flex gap-4 overflow-x-auto pb-4">
                      {produtos.map((produto) => (
                        <div
                          key={produto.id}
                          className="min-w-[200px] border border-border rounded-lg p-4 bg-card relative group"
                        >
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => {
                                setProdutoEditando(produto);
                                setMostrarFormProduto(true);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => excluirProduto(produto.id)}
                            >
                              <Trash className="h-3 w-3" />
                            </Button>
                          </div>
                          <h4 className="font-semibold text-sm mb-2">
                            {produto.nome_produto}
                          </h4>
                          {produto.preco && (
                            <p className="text-sm text-muted-foreground mb-1">
                              {produto.preco}
                            </p>
                          )}
                          <span
                            className={`inline-block text-xs px-2 py-1 rounded ${
                              produto.status === "Ativo"
                                ? "bg-green-500/20 text-green-700 dark:text-green-400"
                                : produto.status === "Pausado"
                                ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400"
                                : "bg-blue-500/20 text-blue-700 dark:text-blue-400"
                            }`}
                          >
                            {produto.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhum produto cadastrado
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {abaAtiva === "pesquisa" && (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">
                Em breve: área de pesquisa do cliente
              </p>
            </div>
          )}

          {abaAtiva === "atividades" && (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">
                Em breve: atividades e tarefas deste cliente
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de produto */}
      {mostrarFormProduto && (
        <ProdutoForm
          clienteId={id!}
          produto={produtoEditando}
          onClose={() => {
            setMostrarFormProduto(false);
            setProdutoEditando(null);
          }}
          onSave={carregarDados}
        />
      )}
    </div>
  );
}
