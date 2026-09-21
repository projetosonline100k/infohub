import { useAuth } from "@/auth/AuthProvider";
import { acessoProprietario, resolverAcesso, permissoesVazias, AreaEquipe } from "@/lib/equipe";
import { EquipeCard } from "@/components/equipe/EquipeCard";
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Plus, Edit, Trash, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { iniciais } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ProdutoForm } from "@/components/ProdutoForm";
import { PesquisaList } from "@/components/pesquisa/PesquisaList";
import { ConteudoSection } from "@/components/conteudo/ConteudoSection";
import { AtividadesView } from "@/components/atividades/AtividadesView";
import { DocumentQuickAccess } from "@/components/documentos/DocumentQuickAccess";
import { DocumentosView } from "@/components/documentos/DocumentosView";
import { ProdutoDetalheModal } from "@/components/produtos/ProdutoDetalheModal";
import { ReceitaGraficoCliente } from "@/components/produtos/ReceitaGraficoCliente";
import { PresencaOnlineDot } from "@/components/PresencaOnlineDot";
import { usePresencaProjeto } from "@/hooks/usePresencaProjeto";

interface Cliente {
  id: string;
  nome_especialista: string;
  idade: number;
  nicho: string;
  meta_atual?: string;
  link_painel_receita?: string;
}

interface Produto {
  id: string;
  nome_produto: string;
  preco?: string;
  status: string;
  descricao?: string;
  links_checkout?: any;
  acesso_url?: string;
  acesso_instrucoes?: string;
  ideias?: string;
}

export default function ClienteDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [permissoesDisponiveis, setPermissoesDisponiveis] = useState(false);
  const [acesso, setAcesso] = useState({ proprietario: false, permissoes: permissoesVazias() });
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroCliente, setErroCliente] = useState("");
  const [avisoPermissoes, setAvisoPermissoes] = useState("");
  const requisicaoAtual = useRef(0);
  const [abaAtiva, setAbaAtiva] = useState("atividades");
  const [conteudoExpandido, setConteudoExpandido] = useState(false);
  const [sidebarRecolhida, setSidebarRecolhida] = useState(false);
  const [subAbaConteudo, setSubAbaConteudo] = useState("brainstorm");
  const [mostrarFormProduto, setMostrarFormProduto] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null);
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const { pessoasOnline } = usePresencaProjeto(id);

  useEffect(() => {
    void carregarDados();
    return () => { requisicaoAtual.current += 1; };
  }, [id, user?.id]);

  const carregarDados = async () => {
    if (!id) return;
    const requisicao = ++requisicaoAtual.current;
    const vigente = () => requisicao === requisicaoAtual.current;
    setLoading(true);
    setCliente(null);
    setProdutos([]);
    setErroCliente("");
    setAvisoPermissoes("");
    setPermissoesDisponiveis(false);
    setAcesso({ proprietario: false, permissoes: permissoesVazias() });
    // Ao abrir um projeto, vai direto para Atividades — mas alguém sem
    // permissão nessa área ainda cai em Informações gerais (ver abaixo).
    setAbaAtiva("atividades");

    try {
      const clienteRes = await supabase.from("clientes").select("*").eq("id", id).maybeSingle();
      if (!vigente()) return;
      if (clienteRes.error) throw clienteRes.error;
      if (!clienteRes.data) return;
      // O resultado autorizado pelo banco não depende da consulta auxiliar de permissões.
      setCliente(clienteRes.data);
      const dono = acessoProprietario(clienteRes.data.user_id, user?.id);
      if (dono) setAcesso(dono);

      try {
        const { data, error } = await supabase.rpc('team_access', { target: id });
        if (!vigente()) return;
        if (error) throw error;
        const acessoResolvido = resolverAcesso(clienteRes.data.user_id, user?.id, data);
        if (!acessoResolvido) throw new Error('Resposta de permissões inválida');
        setAcesso(acessoResolvido);
        setPermissoesDisponiveis(true);
        if (!acessoResolvido.permissoes.atividades.acessar) setAbaAtiva("informacoes");
      } catch (error) {
        if (!vigente()) return;
        console.error("Erro ao consultar permissões do cliente:", error);
        if (!dono) {
          setAvisoPermissoes(!clienteRes.data.user_id
            ? "Este cliente está sem proprietário identificado no banco. É necessário vincular o registro à conta que o criou para liberar a administração."
            : "Não foi possível consultar suas permissões de membro. Tente novamente.");
          setAbaAtiva("informacoes");
        }
      }

      const produtosRes = await supabase.from("produtos_cliente").select("*").eq("cliente_id", id);
      if (!vigente()) return;
      if (produtosRes.error) {
        console.error("Erro ao carregar produtos:", produtosRes.error);
        toast({ title: "Não foi possível carregar os produtos", variant: "destructive" });
      } else {
        setProdutos(produtosRes.data || []);
        // Permite chegar direto num produto específico via /clientes/:id?produto=<id>.
        const produtoAlvo = searchParams.get("produto");
        if (produtoAlvo) {
          const encontrado = (produtosRes.data || []).find((p) => p.id === produtoAlvo);
          if (encontrado) {
            setProdutoSelecionado(encontrado);
            setSearchParams({}, { replace: true });
          }
        }
      }
    } catch (error) {
      if (!vigente()) return;
      console.error("Erro ao carregar dados do cliente:", error);
      const detalhe = error as { code?: string; message?: string };
      setErroCliente(`Não foi possível carregar os dados do cliente. ${detalhe.message || "Verifique a conexão e tente novamente."}${detalhe.code ? ` (Código: ${detalhe.code})` : ""}`);
    } finally {
      if (vigente()) setLoading(false);
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
        <p role={erroCliente ? "alert" : undefined} className="max-w-xl px-4 text-center text-muted-foreground">{erroCliente || "Cliente não encontrado ou sem acesso nesta conta."}</p>
        {erroCliente && <Button onClick={() => void carregarDados()}>Tentar novamente</Button>}
        <Button onClick={() => navigate("/clientes")}>Voltar para lista</Button>
      </div>
    );
  }

  const pode = (area: AreaEquipe) => acesso.permissoes[area].acessar;

  const abasPrincipais = [
    { id: "informacoes", label: "Informações gerais" },
    { id: "pesquisa", label: "Pesquisa" },
    { id: "atividades", label: "Atividades" },
    { id: "documentos", label: "Documentos" },
  ].filter(item => item.id === "informacoes" || pode(item.id as AreaEquipe));
  const abasConteudo = [
    { id: "brainstorm", label: "Brainstorm" },
    { id: "vertical", label: "Vertical" },
    { id: "youtube", label: "Youtube" },
    { id: "cronograma", label: "Cronograma" },
  ];

  return (
    <div className="flex h-screen">
      {/* Sidebar interno */}
      <div className={`${sidebarRecolhida ? "w-14" : "w-52"} shrink-0 border-r border-border bg-background p-4 transition-all`}>
        {sidebarRecolhida ? (
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/clientes")}
              title="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarRecolhida(false)}
              title="Expandir menu"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Avatar className="h-8 w-8" title={cliente.nome_especialista}>
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                {iniciais(cliente.nome_especialista)}
              </AvatarFallback>
            </Avatar>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/clientes")}
                className="flex-1 justify-start gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarRecolhida(true)}
                title="Recolher menu"
                className="h-9 w-9"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>

            {/* Nome do cliente, sempre visível em cima do menu pra identificar
                de cara em qual cliente você está. */}
            <div className="mb-4 flex items-center gap-2 px-1">
              <Avatar className="h-9 w-9 flex-shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                  {iniciais(cliente.nome_especialista)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground text-sm truncate">
                  {cliente.nome_especialista}
                </p>
                {cliente.nicho && (
                  <p className="text-xs text-muted-foreground truncate">{cliente.nicho}</p>
                )}
              </div>
              <PresencaOnlineDot pessoas={pessoasOnline} />
            </div>

            <div className="space-y-1">
              {abasPrincipais.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAbaAtiva(item.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    abaAtiva === item.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {item.label}
                </button>
              ))}

              {pode("conteudo") && <div>
                <button
                  type="button"
                  onClick={() => {
                    setConteudoExpandido(!conteudoExpandido);
                    if (!conteudoExpandido) {
                      setAbaAtiva("conteudo");
                    }
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between ${
                    abaAtiva === "conteudo"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <span>Conteúdo</span>
                  {conteudoExpandido ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                {conteudoExpandido && (
                  <div className="ml-3 mt-1 space-y-1 border-l border-border pl-2">
                    {abasConteudo.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setAbaAtiva("conteudo");
                          setSubAbaConteudo(item.id);
                        }}
                        className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                          abaAtiva === "conteudo" && subAbaConteudo === item.id
                            ? "bg-primary/20 text-primary font-medium"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>}
            </div>
          </>
        )}
      </div>

      {pode("documentos") && <div className="fixed bottom-4 left-4 z-20"><DocumentQuickAccess key={id} clienteId={id!} /></div>}

      {/* Área de conteúdo */}
      <div className="flex-1 overflow-y-auto">
        {/* Conteúdo das abas */}
        <div className="p-6">
          {avisoPermissoes && <div role="status" className="mb-6 rounded-lg border border-border bg-muted/50 p-4 text-sm"><p>{avisoPermissoes}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void carregarDados()}>Tentar novamente</Button></div>}
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

                {acesso.proprietario && <EquipeCard key={id} clienteId={id!} permissoesDisponiveis={permissoesDisponiveis} />}
              </div>

              {/* Receita */}
              {pode("produtos") && <><Card>
                <CardHeader>
                  <CardTitle>Receita</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReceitaGraficoCliente clienteId={id!} />
                </CardContent>
              </Card>

              {/* Esteira de produtos */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Esteira de produtos</CardTitle>
                  {acesso.permissoes.produtos.criar && <Button
                    size="sm"
                    onClick={() => {
                      setProdutoEditando(null);
                      setMostrarFormProduto(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar
                  </Button>}
                </CardHeader>
                <CardContent>
                  {produtos.length > 0 ? (
                    <div className="flex gap-4 overflow-x-auto pb-4">
                      {produtos.map((produto) => (
                        <div
                          key={produto.id}
                          onClick={() => setProdutoSelecionado(produto)}
                          className="min-w-[200px] border border-border rounded-lg p-4 bg-card relative group cursor-pointer hover:border-primary/50 transition-colors"
                        >
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            {acesso.permissoes.produtos.editar && <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProdutoEditando(produto);
                                setMostrarFormProduto(true);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>}
                            {acesso.proprietario && <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                excluirProduto(produto.id);
                              }}
                            >
                              <Trash className="h-3 w-3" />
                            </Button>}
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
              </Card></>}
            </div>
          )}

          {abaAtiva === "pesquisa" && pode("pesquisa") && (
            <PesquisaList clienteId={id!} />
          )}

          {abaAtiva === "atividades" && pode("atividades") && (
            <div className="w-full">
              <AtividadesView clienteId={id} />
            </div>
          )}

          {abaAtiva === "conteudo" && pode("conteudo") && (
            <ConteudoSection clienteId={id!} subAba={subAbaConteudo} />
          )}

          {abaAtiva === "documentos" && pode("documentos") && (
            <DocumentosView clienteId={id!} />
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

      {/* Modal de detalhe do produto */}
      {produtoSelecionado && (
        <ProdutoDetalheModal
          produto={produtoSelecionado}
          onClose={() => setProdutoSelecionado(null)}
          onUpdate={carregarDados}
        />
      )}
    </div>
  );
}
