import { useCallback, useEffect, useState } from "react";
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
  NodeChange,
  EdgeChange,
} from "reactflow";
import "reactflow/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
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

export function ProdutoFunil({ produtoId }: ProdutoFunilProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [funilNodes, setFunilNodes] = useState<FunilNode[]>([]);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novaCor, setNovaCor] = useState("blue");
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Carregar dados do funil
  const carregarFunil = useCallback(async () => {
    const { data, error } = await supabase
      .from("funil_vendas")
      .select("*")
      .eq("produto_id", produtoId)
      .order("ordem");

    if (error) {
      console.error("Erro ao carregar funil:", error);
      return;
    }

    if (data) {
      setFunilNodes(data);

      // Converter para formato ReactFlow
      const flowNodes: Node[] = data.map((node) => ({
        id: node.id,
        position: { x: node.posicao_x, y: node.posicao_y },
        data: {
          label: node.titulo,
          color: node.cor,
        },
        style: {
          background: nodeColors[node.cor] || nodeColors.blue,
          color: "white",
          border: "none",
          borderRadius: "8px",
          padding: "12px 20px",
          fontWeight: 500,
          minWidth: "120px",
          textAlign: "center" as const,
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
    }
  }, [produtoId, setNodes, setEdges]);

  useEffect(() => {
    carregarFunil();
  }, [carregarFunil]);

  // Adicionar novo nó
  const adicionarNo = async () => {
    if (!novoTitulo.trim()) {
      toast({ title: "Digite um título para o nó", variant: "destructive" });
      return;
    }

    const posX = nodes.length > 0 ? Math.max(...nodes.map(n => n.position.x)) + 200 : 100;
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
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao adicionar nó", variant: "destructive" });
      return;
    }

    setNovoTitulo("");
    carregarFunil();
  };

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

  // Atualizar posição ao arrastar
  const handleNodesChange = useCallback(
    async (changes: NodeChange[]) => {
      onNodesChange(changes);

      // Salvar posição quando parar de arrastar
      for (const change of changes) {
        if (change.type === "position" && change.dragging === false && change.position) {
          await supabase
            .from("funil_vendas")
            .update({
              posicao_x: change.position.x,
              posicao_y: change.position.y,
            })
            .eq("id", change.id);
        }
      }
    },
    [onNodesChange]
  );

  // Duplo clique para editar
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    setEditingNodeId(node.id);
    setEditingTitle(node.data.label);
  }, []);

  // Salvar edição do título
  const salvarTitulo = async () => {
    if (!editingNodeId || !editingTitle.trim()) return;

    const { error } = await supabase
      .from("funil_vendas")
      .update({ titulo: editingTitle })
      .eq("id", editingNodeId);

    if (error) {
      toast({ title: "Erro ao salvar título", variant: "destructive" });
      return;
    }

    setEditingNodeId(null);
    setEditingTitle("");
    carregarFunil();
  };

  // Deletar nó
  const deletarNo = async (nodeId: string) => {
    const { error } = await supabase
      .from("funil_vendas")
      .delete()
      .eq("id", nodeId);

    if (error) {
      toast({ title: "Erro ao deletar nó", variant: "destructive" });
      return;
    }

    carregarFunil();
  };

  return (
    <div className="h-full flex flex-col">
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
          Arraste para mover • Conecte arrastando de um nó para outro • Duplo clique para editar
        </div>
      </div>

      {/* Modal de edição */}
      {editingNodeId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg shadow-lg space-y-4">
            <h3 className="font-semibold">Editar etapa</h3>
            <Input
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && salvarTitulo()}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="destructive"
                onClick={() => {
                  deletarNo(editingNodeId);
                  setEditingNodeId(null);
                }}
              >
                Excluir
              </Button>
              <Button variant="outline" onClick={() => setEditingNodeId(null)}>
                Cancelar
              </Button>
              <Button onClick={salvarTitulo}>Salvar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1" style={{ minHeight: "500px" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          fitView
          attributionPosition="bottom-left"
        >
          <Controls />
          <Background gap={20} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
