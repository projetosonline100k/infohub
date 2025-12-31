import { useCallback, useEffect, useState, useRef } from "react";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType,
  Handle,
  Position,
  ConnectionLineType,
  NodeProps,
  Viewport,
} from "reactflow";
import "reactflow/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Grid3X3, Trash2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FunilNode {
  id: string;
  produto_id: string;
  parent_id: string | null;
  titulo: string;
  cor: string;
  posicao_x: number;
  posicao_y: number;
  ordem: number;
  imagem_url?: string | null;
  categoria_id?: string | null;
}

interface FunilCategoria {
  id: string;
  produto_id: string;
  nome: string;
  ordem: number;
}

interface ProdutoFunilProps {
  produtoId: string;
}

const nodeColors: Record<string, string> = {
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  purple: "#a855f7",
  orange: "#f97316",
  pink: "#ec4899",
  cyan: "#06b6d4",
};

// Custom Node com handles em todos os lados e suporte a imagem
function FunilCustomNode({ data }: NodeProps) {
  return (
    <div
      className="rounded-lg overflow-hidden shadow-lg min-w-[120px]"
      style={{ background: data.background }}
    >
      {/* Handles para conexão em todos os lados */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-gray-500 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-gray-500 !border-2 !border-white"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        className="!w-3 !h-3 !bg-gray-500 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-source"
        className="!w-3 !h-3 !bg-gray-500 !border-2 !border-white"
      />

      {/* Imagem opcional */}
      {data.imagem && (
        <img
          src={data.imagem}
          alt=""
          className="w-full h-16 object-cover"
        />
      )}

      {/* Label */}
      <div className="px-4 py-3 text-white font-medium text-center">
        {data.label}
      </div>
    </div>
  );
}

const nodeTypes = {
  funilNode: FunilCustomNode,
};

// Helper para chave do localStorage da viewport
const getViewportKey = (produtoId: string, categoriaId: string) =>
  `funil_viewport:${produtoId}:${categoriaId}`;

export function ProdutoFunil({ produtoId }: ProdutoFunilProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [funilNodes, setFunilNodes] = useState<FunilNode[]>([]);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novaCor, setNovaCor] = useState("blue");
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingCor, setEditingCor] = useState("blue");
  const [editingImagem, setEditingImagem] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Categorias
  const [categorias, setCategorias] = useState<FunilCategoria[]>([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(null);
  const [editandoCategoria, setEditandoCategoria] = useState<string | null>(null);
  const [nomeCategoria, setNomeCategoria] = useState("");
  
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const hasLoadedCategory = useRef<string | null>(null);

  // Carregar categorias
  const carregarCategorias = useCallback(async () => {
    const { data, error } = await supabase
      .from("funil_categorias")
      .select("*")
      .eq("produto_id", produtoId)
      .order("ordem");

    if (error) {
      console.error("Erro ao carregar categorias:", error);
      return;
    }

    if (data && data.length > 0) {
      setCategorias(data);

      const defaultCatId = data[0].id;
      if (!categoriaAtiva) {
        setCategoriaAtiva(defaultCatId);
      }

      // Migrar nós antigos (sem categoria) para a categoria padrão
      await supabase
        .from("funil_vendas")
        .update({ categoria_id: defaultCatId })
        .eq("produto_id", produtoId)
        .is("categoria_id", null);
    } else {
      // Criar categoria padrão
      const { data: novaCategoria, error: catError } = await supabase
        .from("funil_categorias")
        .insert({
          produto_id: produtoId,
          nome: "Funil Principal",
          ordem: 1,
        })
        .select()
        .single();

      if (catError) {
        console.error("Erro ao criar categoria padrão:", catError);
        return;
      }

      if (novaCategoria) {
        setCategorias([novaCategoria]);
        setCategoriaAtiva(novaCategoria.id);

        // Migrar nós antigos (sem categoria) para a categoria padrão
        await supabase
          .from("funil_vendas")
          .update({ categoria_id: novaCategoria.id })
          .eq("produto_id", produtoId)
          .is("categoria_id", null);
      }
    }
  }, [produtoId, categoriaAtiva]);

  // Carregar dados do funil (apenas no load inicial ou troca de categoria)
  const carregarFunil = useCallback(async () => {
    if (!categoriaAtiva) return;
    
    // Evitar recarregar a mesma categoria
    if (hasLoadedCategory.current === categoriaAtiva) return;
    hasLoadedCategory.current = categoriaAtiva;

    const { data, error } = await supabase
      .from("funil_vendas")
      .select("*")
      .eq("produto_id", produtoId)
      .eq("categoria_id", categoriaAtiva)
      .order("ordem");

    if (error) {
      console.error("Erro ao carregar funil:", error);
      return;
    }

    if (data) {
      setFunilNodes(data);

      // Converter para formato ReactFlow com custom node
      const flowNodes: Node[] = data.map((node) => ({
        id: node.id,
        type: "funilNode",
        position: { x: node.posicao_x ?? 100, y: node.posicao_y ?? 100 },
        data: {
          label: node.titulo,
          color: node.cor,
          background: nodeColors[node.cor] || nodeColors.blue,
          imagem: node.imagem_url,
        },
      }));

      const flowEdges: Edge[] = data
        .filter((node) => node.parent_id)
        .map((node) => ({
          id: `e-${node.parent_id}-${node.id}`,
          source: node.parent_id!,
          target: node.id,
          type: "smoothstep",
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          style: { stroke: "#888" },
        }));

      setNodes(flowNodes);
      setEdges(flowEdges);

      // Restaurar viewport do localStorage
      if (reactFlowInstance) {
        const savedViewport = localStorage.getItem(getViewportKey(produtoId, categoriaAtiva));
        if (savedViewport) {
          try {
            const viewport: Viewport = JSON.parse(savedViewport);
            reactFlowInstance.setViewport(viewport);
          } catch (e) {
            console.error("Erro ao restaurar viewport:", e);
          }
        }
      }
    }
  }, [produtoId, categoriaAtiva, setNodes, setEdges, reactFlowInstance]);

  useEffect(() => {
    carregarCategorias();
  }, [carregarCategorias]);

  useEffect(() => {
    if (categoriaAtiva) {
      // Resetar flag para permitir carregar nova categoria
      if (hasLoadedCategory.current !== categoriaAtiva) {
        hasLoadedCategory.current = null;
      }
      carregarFunil();
    }
  }, [categoriaAtiva, carregarFunil]);

  // Salvar viewport no localStorage ao mover/zoom
  const handleMoveEnd = useCallback(
    (_: any, viewport: Viewport) => {
      if (categoriaAtiva) {
        localStorage.setItem(
          getViewportKey(produtoId, categoriaAtiva),
          JSON.stringify(viewport)
        );
      }
    },
    [produtoId, categoriaAtiva]
  );

  // Persistir posição apenas quando parar de arrastar
  const handleNodeDragStop = useCallback(
    async (_: React.MouseEvent, node: Node) => {
      await supabase
        .from("funil_vendas")
        .update({
          posicao_x: node.position.x,
          posicao_y: node.position.y,
        })
        .eq("id", node.id);

      // Atualizar estado local
      setFunilNodes((prev) =>
        prev.map((n) =>
          n.id === node.id
            ? { ...n, posicao_x: node.position.x, posicao_y: node.position.y }
            : n
        )
      );
    },
    []
  );

  // Criar nova categoria
  const criarCategoria = async () => {
    const { data, error } = await supabase
      .from("funil_categorias")
      .insert({
        produto_id: produtoId,
        nome: "Nova Categoria",
        ordem: categorias.length + 1,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao criar categoria", variant: "destructive" });
      return;
    }

    if (data) {
      setCategorias([...categorias, data]);
      setCategoriaAtiva(data.id);
      setEditandoCategoria(data.id);
      setNomeCategoria("Nova Categoria");
    }
  };

  // Salvar nome da categoria
  const salvarNomeCategoria = async () => {
    if (!editandoCategoria || !nomeCategoria.trim()) return;

    await supabase
      .from("funil_categorias")
      .update({ nome: nomeCategoria })
      .eq("id", editandoCategoria);

    setCategorias(
      categorias.map((c) =>
        c.id === editandoCategoria ? { ...c, nome: nomeCategoria } : c
      )
    );
    setEditandoCategoria(null);
  };

  // Deletar categoria
  const deletarCategoria = async (catId: string) => {
    if (categorias.length <= 1) {
      toast({ title: "Não é possível deletar a última categoria", variant: "destructive" });
      return;
    }

    await supabase.from("funil_categorias").delete().eq("id", catId);
    
    const novasCategorias = categorias.filter((c) => c.id !== catId);
    setCategorias(novasCategorias);
    
    if (categoriaAtiva === catId) {
      hasLoadedCategory.current = null;
      setCategoriaAtiva(novasCategorias[0]?.id || null);
    }
  };

  // Adicionar novo nó via botão (update otimista)
  const adicionarNo = async () => {
    if (!novoTitulo.trim()) {
      toast({ title: "Digite um título para o nó", variant: "destructive" });
      return;
    }

    const posX = nodes.length > 0 ? Math.max(...nodes.map((n) => n.position.x)) + 200 : 100;
    const posY = 100;

    const { data, error } = await supabase
      .from("funil_vendas")
      .insert({
        produto_id: produtoId,
        titulo: novoTitulo,
        cor: novaCor,
        posicao_x: posX,
        posicao_y: posY,
        ordem: funilNodes.length + 1,
        categoria_id: categoriaAtiva,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao adicionar nó", variant: "destructive" });
      return;
    }

    if (data) {
      // Update otimista - adicionar ao estado local sem refetch
      setFunilNodes((prev) => [...prev, data]);
      setNodes((prev) => [
        ...prev,
        {
          id: data.id,
          type: "funilNode",
          position: { x: posX, y: posY },
          data: {
            label: data.titulo,
            color: data.cor,
            background: nodeColors[data.cor] || nodeColors.blue,
            imagem: data.imagem_url,
          },
        },
      ]);
      setNovoTitulo("");
    }
  };

  // Duplo clique no canvas para criar nó (update otimista)
  const handlePaneDoubleClick = useCallback(
    async (event: React.MouseEvent) => {
      if (!reactFlowInstance) return;

      // Usar screenToFlowPosition diretamente
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const { data, error } = await supabase
        .from("funil_vendas")
        .insert({
          produto_id: produtoId,
          titulo: "Novo nó",
          cor: novaCor,
          posicao_x: position.x,
          posicao_y: position.y,
          ordem: funilNodes.length + 1,
          categoria_id: categoriaAtiva,
        })
        .select()
        .single();

      if (error) {
        toast({ title: "Erro ao criar nó", variant: "destructive" });
        return;
      }

      if (data) {
        // Update otimista - adicionar ao estado local
        setFunilNodes((prev) => [...prev, data]);
        setNodes((prev) => [
          ...prev,
          {
            id: data.id,
            type: "funilNode",
            position: { x: position.x, y: position.y },
            data: {
              label: "Novo nó",
              color: novaCor,
              background: nodeColors[novaCor] || nodeColors.blue,
              imagem: null,
            },
          },
        ]);

        // Abrir modal de edição imediatamente
        setEditingNodeId(data.id);
        setEditingTitle("Novo nó");
        setEditingCor(novaCor);
        setEditingImagem(null);
      }
    },
    [produtoId, novaCor, funilNodes.length, categoriaAtiva, reactFlowInstance, setNodes]
  );

  // Conectar nós
  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // Atualizar parent_id no banco
      const { error } = await supabase
        .from("funil_vendas")
        .update({ parent_id: connection.source })
        .eq("id", connection.target);

      if (error) {
        toast({ title: "Erro ao conectar nós", variant: "destructive" });
        return;
      }

      // Update otimista
      setFunilNodes((prev) =>
        prev.map((n) =>
          n.id === connection.target ? { ...n, parent_id: connection.source } : n
        )
      );

      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: "#888" },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  // Duplo clique para editar nó existente
  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.stopPropagation(); // Evitar que crie um novo nó
      const funilNode = funilNodes.find((n) => n.id === node.id);
      setEditingNodeId(node.id);
      setEditingTitle(node.data.label);
      setEditingCor(funilNode?.cor || "blue");
      setEditingImagem(funilNode?.imagem_url || null);
    },
    [funilNodes]
  );

  // Upload de imagem
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingNodeId) return;

    setUploadingImage(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${editingNodeId}-${Date.now()}.${fileExt}`;
      const filePath = `funil/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("conhecimentos")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("conhecimentos")
        .getPublicUrl(filePath);

      setEditingImagem(urlData.publicUrl);
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      toast({ title: "Erro ao fazer upload da imagem", variant: "destructive" });
    } finally {
      setUploadingImage(false);
    }
  };

  // Salvar edição completa do nó (update otimista)
  const salvarEdicao = async () => {
    if (!editingNodeId || !editingTitle.trim()) return;

    const { error } = await supabase
      .from("funil_vendas")
      .update({
        titulo: editingTitle,
        cor: editingCor,
        imagem_url: editingImagem,
      })
      .eq("id", editingNodeId);

    if (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
      return;
    }

    // Update otimista - atualizar estado local
    setFunilNodes((prev) =>
      prev.map((n) =>
        n.id === editingNodeId
          ? { ...n, titulo: editingTitle, cor: editingCor, imagem_url: editingImagem }
          : n
      )
    );

    setNodes((prev) =>
      prev.map((n) =>
        n.id === editingNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                label: editingTitle,
                color: editingCor,
                background: nodeColors[editingCor] || nodeColors.blue,
                imagem: editingImagem,
              },
            }
          : n
      )
    );

    setEditingNodeId(null);
    setEditingTitle("");
    setEditingImagem(null);
  };

  // Deletar nó (update otimista)
  const deletarNo = async (nodeId: string) => {
    // 1) Desvincular filhos para evitar erro de FK (parent_id)
    const { error: detachError } = await supabase
      .from("funil_vendas")
      .update({ parent_id: null })
      .eq("parent_id", nodeId);

    if (detachError) {
      toast({ title: "Erro ao desvincular etapas filhas", variant: "destructive" });
      return;
    }

    // 2) Deletar o nó
    const { error } = await supabase
      .from("funil_vendas")
      .delete()
      .eq("id", nodeId);

    if (error) {
      toast({ title: "Erro ao deletar nó", variant: "destructive" });
      return;
    }

    // Update otimista - remover do estado local
    setFunilNodes((prev) =>
      prev
        .map((n) => (n.parent_id === nodeId ? { ...n, parent_id: null } : n))
        .filter((n) => n.id !== nodeId)
    );
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));

    setEditingNodeId(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Abas de Categorias */}
      <div className="flex items-center border-b overflow-x-auto bg-muted/30">
        {categorias.map((cat) => (
          <div
            key={cat.id}
            className={`group flex items-center gap-2 px-4 py-2 border-b-2 cursor-pointer whitespace-nowrap transition-colors ${
              categoriaAtiva === cat.id
                ? "border-primary text-primary bg-background"
                : "border-transparent hover:bg-muted"
            }`}
          >
            {editandoCategoria === cat.id ? (
              <Input
                value={nomeCategoria}
                onChange={(e) => setNomeCategoria(e.target.value)}
                onBlur={salvarNomeCategoria}
                onKeyDown={(e) => e.key === "Enter" && salvarNomeCategoria()}
                className="h-6 w-32 text-sm"
                autoFocus
              />
            ) : (
              <span
                onClick={() => {
                  if (categoriaAtiva !== cat.id) {
                    hasLoadedCategory.current = null;
                    setCategoriaAtiva(cat.id);
                  }
                }}
                onDoubleClick={() => {
                  setEditandoCategoria(cat.id);
                  setNomeCategoria(cat.nome);
                }}
                className="flex items-center gap-2"
              >
                <Grid3X3 className="h-4 w-4" />
                {cat.nome}
              </span>
            )}
            {categorias.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deletarCategoria(cat.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={criarCategoria}
          className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 border-b flex items-center gap-4 flex-wrap">
        <Input
          placeholder="Título do novo nó"
          value={novoTitulo}
          onChange={(e) => setNovoTitulo(e.target.value)}
          className="w-48"
          onKeyDown={(e) => e.key === "Enter" && adicionarNo()}
        />
        <div className="flex gap-1">
          {Object.entries(nodeColors).map(([color, hex]) => (
            <button
              key={color}
              onClick={() => setNovaCor(color)}
              className={`w-6 h-6 rounded-full transition-transform ${
                novaCor === color ? "ring-2 ring-offset-2 ring-foreground scale-110" : ""
              }`}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
        <Button onClick={adicionarNo}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Etapa
        </Button>

        <div className="ml-auto text-xs text-muted-foreground">
          Duplo clique no canvas para criar • Arraste para mover • Duplo clique no nó para editar
        </div>
      </div>

      {/* Modal de edição */}
      {editingNodeId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg space-y-4 min-w-[320px]">
            <h3 className="font-semibold">Editar etapa</h3>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Título</label>
              <Input
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && salvarEdicao()}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Cor</label>
              <div className="flex gap-2">
                {Object.entries(nodeColors).map(([color, hex]) => (
                  <button
                    key={color}
                    onClick={() => setEditingCor(color)}
                    className={`w-7 h-7 rounded-full transition-transform ${
                      editingCor === color ? "ring-2 ring-offset-2 ring-foreground scale-110" : ""
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Imagem (opcional)</label>
              {editingImagem && (
                <div className="relative">
                  <img
                    src={editingImagem}
                    alt=""
                    className="w-full h-24 object-cover rounded"
                  />
                  <button
                    onClick={() => setEditingImagem(null)}
                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="relative">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                  className="cursor-pointer"
                />
                {uploadingImage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                    <span className="text-sm">Enviando...</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deletarNo(editingNodeId)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Excluir
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditingNodeId(null)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={salvarEdicao}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1" ref={reactFlowWrapper} style={{ minHeight: "500px" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeDragStop={handleNodeDragStop}
          onDoubleClick={handlePaneDoubleClick}
          onMoveEnd={handleMoveEnd}
          onInit={setReactFlowInstance}
          nodeTypes={nodeTypes}
          attributionPosition="bottom-left"
          connectionLineType={ConnectionLineType.SmoothStep}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
          }}
        >
          <Controls />
          <Background gap={20} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
