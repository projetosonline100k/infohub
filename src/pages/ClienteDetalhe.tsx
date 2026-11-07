import { useAuth } from "@/auth/AuthProvider";
import { acessoProprietario, resolverAcesso, permissoesVazias, AreaEquipe } from "@/lib/equipe";
import { EquipeCard } from "@/components/equipe/EquipeCard";
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Edit, Trash } from "lucide-react";
import { CerebroView } from "@/components/cerebro/CerebroView";
import { toast } from "@/hooks/use-toast";
import { ProdutoForm } from "@/components/ProdutoForm";
import { PesquisaList } from "@/components/pesquisa/PesquisaList";
import { ConteudoSection } from "@/components/conteudo/ConteudoSection";
import { AtividadesView } from "@/components/atividades/AtividadesView";
import { DocumentQuickAccess } from "@/components/documentos/DocumentQuickAccess";
import { DocumentosView } from "@/components/documentos/DocumentosView";
import { ProdutoDetalheModal } from "@/components/produtos/ProdutoDetalheModal";
import { ReceitaGraficoCliente } from "@/components/produtos/ReceitaGraficoCliente";
import { PainelVendas } from "@/components/produtos/PainelVendas";
import { usePresencaProjeto } from "@/hooks/usePresencaProjeto";
import { useWorkspaceAcoes } from "@/components/workspace/WorkspaceTabs";
import { confirmar } from "@/components/DialogosGlobais";

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

const lerAbaProjeto = (id?: string): { aba?: string; sub?: string } => {
  if (!id) return {};
  try { return JSON.parse(localStorage.getItem(`projeto-aba:${id}`) || "{}"); } catch { return {}; }
};

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
  // 24/10 (Davi: "clico no item da lateral e não vai"): começa pela seção do endereço (?secao=) e só sem ela
  // pela última aberta neste projeto. Antes começava pela última e, no primeiro instante, reescrevia o
  // endereço com ela — o item clicado ficava marcado na lateral, mas a tela voltava para a seção antiga.
  const secaoInicial = (() => {
    const [aba, sub] = (searchParams.get("secao") ?? "").split(":");
    return aba ? { aba, sub: sub || undefined } : lerAbaProjeto(id);
  })();
  const [abaAtiva, setAbaAtiva] = useState(() => secaoInicial.aba ?? "atividades");
  const [subAbaConteudo, setSubAbaConteudo] = useState(() => secaoInicial.sub ?? lerAbaProjeto(id).sub ?? "visao-geral");
  // Lembra a seção aberta de cada projeto pra reabrir igual (fechar e abrir o app).
  // (Ao trocar de projeto na mesma guia não grava: a seção ainda é a do anterior.)
  const idDaAba = useRef(id);
  useEffect(() => {
    if (!id) return;
    if (idDaAba.current !== id) { idDaAba.current = id; return; }
    try { localStorage.setItem(`projeto-aba:${id}`, JSON.stringify({ aba: abaAtiva, sub: subAbaConteudo })); } catch { /* sem storage */ }
  }, [id, abaAtiva, subAbaConteudo]);
  const [mostrarFormProduto, setMostrarFormProduto] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null);
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  // Continua avisando que o Davi está no projeto (a bolinha de presença saiu junto com o menu interno).
  usePresencaProjeto(id);
  const { openTab } = useWorkspaceAcoes();

  // ?secao=<aba>[:<guia>] (barra lateral em árvore, 23/10): abre a seção pedida e o endereço acompanha
  // quando a aba muda aqui dentro (assim a árvore marca o item certo).
  const secaoPedida = searchParams.get("secao");
  useEffect(() => {
    if (!secaoPedida) return;
    const [aba, sub] = secaoPedida.split(":");
    if (aba && aba !== abaAtiva) setAbaAtiva(aba);
    if (sub && sub !== subAbaConteudo) setSubAbaConteudo(sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secaoPedida]);
  useEffect(() => {
    const atual = abaAtiva === "conteudo" ? `conteudo:${subAbaConteudo}` : abaAtiva;
    if (searchParams.get("secao") === atual) return;
    setSearchParams((sp) => { const n = new URLSearchParams(sp); n.set("secao", atual); return n; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva, subAbaConteudo]);

  useEffect(() => {
    if (searchParams.get("documento")) setAbaAtiva("documentos");
    // ?atividade=<id> (busca ⌘K, links das Notas): a aba Atividades abre o painel da tarefa.
    if (searchParams.get("atividade")) setAbaAtiva("atividades");
    // ?conversa=<membro> (o Atlas avisou de uma resposta): Conteúdo → Visão geral, onde fica a gaveta da Equipe.
    if (searchParams.get("conversa")) { setAbaAtiva("conteudo"); setSubAbaConteudo("visao-geral"); }
  }, [searchParams]);

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
    // Guia aberta num documento (?documento=…, ex.: ⌘+clique) vai pra
    // Documentos: senão este reset passava por cima e a guia abria em Atividades.
    // Senão, volta pra seção em que o Davi estava neste projeto (se houver).
    const salva = lerAbaProjeto(id);
    const conversa = !!searchParams.get("conversa");
    // 16/10: abrir um projeto entra sempre no Escritório (salvo link para documento/atividade).
    void salva;
    const [abaPedida, subPedida] = (searchParams.get("secao") ?? "").split(":");
    setAbaAtiva(searchParams.get("documento") ? "documentos" : searchParams.get("atividade") ? "atividades" : abaPedida || "conteudo");
    if (conversa || (!searchParams.get("documento") && !searchParams.get("atividade"))) setSubAbaConteudo(abaPedida ? subPedida || subAbaConteudo : "visao-geral");

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
        // Sem acesso ao Escritório (Conteúdo): Atividades, ou Informações gerais.
        if (!acessoResolvido.permissoes.conteudo.acessar) setAbaAtiva(acessoResolvido.permissoes.atividades.acessar ? "atividades" : "informacoes");
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
    if (!(await confirmar("Deseja realmente excluir este produto?"))) return;

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

  // Guias no topo: Escritório | Informações gerais e Documentos | Pesquisa.
  // 24/10 (Davi): as abas do Escritório (Escritório, Informações gerais, Vertical…) saíram do topo — estão na
  // barra lateral, dentro da pasta Escritório. Fica só Documentos | Pesquisa (a Pesquisa não está na lateral).
  const guiasTopo: { id: string; label: string; ativa: boolean; ir: () => void }[] =
    (abaAtiva === "documentos" || abaAtiva === "pesquisa") && pode("documentos") && pode("pesquisa")
      ? [
        { id: "documentos", label: "Documentos", ativa: abaAtiva === "documentos", ir: () => setAbaAtiva("documentos") },
        { id: "pesquisa", label: "Pesquisa", ativa: abaAtiva === "pesquisa", ir: () => setAbaAtiva("pesquisa") },
      ]
      : [];
  return (
    <div className="flex h-screen">
      {/* 24/10 (Davi): sai o menu interno do projeto (Voltar, ícones das abas): repetia a barra lateral em árvore. */}
      {pode("documentos") && <div className="fixed bottom-4 left-4 z-20"><DocumentQuickAccess key={id} clienteId={id!} /></div>}

      {/* Área de conteúdo */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {/* Conteúdo das abas */}
        <div className="p-6">
          {avisoPermissoes && <div role="status" className="mb-6 rounded-lg border border-border bg-muted/50 p-4 text-sm"><p>{avisoPermissoes}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void carregarDados()}>Tentar novamente</Button></div>}
          {guiasTopo.length > 0 && (
            // Fixa no topo ao rolar (17/10: "quando eu rolar para baixo, não quero que ela suma").
            <div className="sticky top-0 z-30 -mx-6 mb-4 bg-background/95 px-6 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-0.5 text-sm font-medium">
              {guiasTopo.map((g) => (
                <button key={g.id} type="button" title="⌘+clique: abrir numa guia nova"
                  onClick={(e) => {
                    // ⌘+clique (24/10, Davi): esta aba do projeto numa guia nova.
                    if (e.metaKey || e.ctrlKey) {
                      const secao = g.id === "informacoes" || g.id === "documentos" || g.id === "pesquisa" ? g.id : `conteudo:${g.id}`;
                      openTab(`/clientes/${id}?secao=${secao}`, `${cliente?.nome_especialista ?? "Projeto"} · ${g.label}`, { nova: true });
                      return;
                    }
                    g.ir();
                  }}
                  className={`rounded-md px-3 py-1 transition-colors ${g.ativa ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {g.label}
                </button>
              ))}
            </div>
            </div>
          )}
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

              {/* Vendas das plataformas (Eduzz, Kiwify, Hotmart): funil e origem — 07/11 */}
              {pode("produtos") && <Card>
                <CardHeader>
                  <CardTitle>Vendas</CardTitle>
                </CardHeader>
                <CardContent>
                  <PainelVendas clienteId={id!} />
                </CardContent>
              </Card>}

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
            <ConteudoSection clienteId={id!} subAba={subAbaConteudo} onIrPara={setSubAbaConteudo}
              onAbrirAtividades={() => setAbaAtiva("atividades")} />
          )}

          {abaAtiva === "cerebro" && pode("documentos") && <CerebroView clienteId={id!} />}
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
