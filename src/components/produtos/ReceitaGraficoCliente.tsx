import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown } from "lucide-react";

interface ReceitaGraficoClienteProps {
  clienteId: string;
}

interface Produto {
  id: string;
  nome_produto: string;
}

interface FinanceiroRow {
  produto_id: string;
  mes: string;
  receita_bruta: number;
}

const CORES_PRODUTOS = [
  "#22c55e", // verde
  "#3b82f6", // azul
  "#8b5cf6", // roxo
  "#f97316", // laranja
  "#ec4899", // rosa
  "#14b8a6", // teal
];

export function ReceitaGraficoCliente({ clienteId }: ReceitaGraficoClienteProps) {
  const [loading, setLoading] = useState(true);
  const [produtosComTendencia, setProdutosComTendencia] = useState<{
    nome: string;
    cor: string;
    valores: number[];
    crescimento: number;
    crescendo: boolean;
  }[]>([]);

  useEffect(() => {
    carregarDados();
  }, [clienteId]);

  const carregarDados = async () => {
    try {
      const { data: produtosData, error: produtosError } = await supabase
        .from("produtos_cliente")
        .select("id, nome_produto")
        .eq("cliente_id", clienteId);

      if (produtosError) throw produtosError;

      if (!produtosData || produtosData.length === 0) {
        setLoading(false);
        return;
      }

      const produtoIds = produtosData.map((p) => p.id);
      const { data: financeiroData, error: financeiroError } = await supabase
        .from("produto_financeiro")
        .select("produto_id, mes, receita_bruta")
        .in("produto_id", produtoIds)
        .order("mes");

      if (financeiroError) throw financeiroError;

      if (!financeiroData || financeiroData.length === 0) {
        setLoading(false);
        return;
      }

      // Processar dados por produto
      const resultado = produtosData.map((produto, index) => {
        const dadosProduto = financeiroData
          .filter((d) => d.produto_id === produto.id)
          .map((d) => Number(d.receita_bruta));

        // Calcular crescimento (comparar último com penúltimo)
        let crescimento = 0;
        let crescendo = true;
        if (dadosProduto.length >= 2) {
          const ultimo = dadosProduto[dadosProduto.length - 1];
          const penultimo = dadosProduto[dadosProduto.length - 2];
          if (penultimo > 0) {
            crescimento = ((ultimo - penultimo) / penultimo) * 100;
          }
          crescendo = ultimo >= penultimo;
        }

        return {
          nome: produto.nome_produto,
          cor: CORES_PRODUTOS[index % CORES_PRODUTOS.length],
          valores: dadosProduto,
          crescimento: Math.abs(crescimento),
          crescendo,
        };
      }).filter(p => p.valores.length > 0);

      setProdutosComTendencia(resultado);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  // Gerar path SVG para curva suave
  const gerarCurva = (valores: number[], width: number, height: number, padding: number) => {
    if (valores.length === 0) return "";
    if (valores.length === 1) {
      const x = padding;
      const y = height / 2;
      return `M ${x} ${y} L ${width - padding} ${y}`;
    }

    const maxValor = Math.max(...valores, 1);
    const minValor = Math.min(...valores, 0);
    const range = maxValor - minValor || 1;
    
    const pontos = valores.map((v, i) => ({
      x: padding + (i / (valores.length - 1)) * (width - padding * 2),
      y: padding + (1 - (v - minValor) / range) * (height - padding * 2),
    }));

    // Criar curva bezier suave
    let path = `M ${pontos[0].x} ${pontos[0].y}`;
    
    for (let i = 0; i < pontos.length - 1; i++) {
      const p0 = pontos[i];
      const p1 = pontos[i + 1];
      const midX = (p0.x + p1.x) / 2;
      
      path += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    return path;
  };

  // Calcular posição final da seta
  const getPosicaoFinal = (valores: number[], width: number, height: number, padding: number) => {
    if (valores.length === 0) return { x: width - padding, y: height / 2, angulo: 0 };
    
    const maxValor = Math.max(...valores, 1);
    const minValor = Math.min(...valores, 0);
    const range = maxValor - minValor || 1;
    
    const ultimoValor = valores[valores.length - 1];
    const penultimoValor = valores.length > 1 ? valores[valores.length - 2] : ultimoValor;
    
    const x = width - padding;
    const y = padding + (1 - (ultimoValor - minValor) / range) * (height - padding * 2);
    
    // Calcular ângulo baseado na tendência
    const diferencaY = ultimoValor - penultimoValor;
    let angulo = 0;
    if (diferencaY > 0) angulo = -30; // Subindo
    else if (diferencaY < 0) angulo = 30; // Descendo
    
    return { x, y, angulo };
  };

  if (loading) {
    return (
      <div className="h-48 flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (produtosComTendencia.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center bg-muted/30 rounded-lg">
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Nenhum dado financeiro disponível.
        </p>
      </div>
    );
  }

  const svgWidth = 280;
  const svgHeight = 120;
  const padding = 20;

  return (
    <div className="space-y-4">
      {produtosComTendencia.map((produto, index) => {
        const path = gerarCurva(produto.valores, svgWidth, svgHeight, padding);
        const posicaoFinal = getPosicaoFinal(produto.valores, svgWidth, svgHeight, padding);

        return (
          <div key={index} className="flex items-center gap-4">
            {/* Nome e indicador */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: produto.cor }}
                />
                <span className="text-sm font-medium truncate">{produto.nome}</span>
              </div>
              <div className="flex items-center gap-1 mt-1 pl-5">
                {produto.crescendo ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span
                  className={`text-xs font-medium ${
                    produto.crescendo ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {produto.crescimento.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Gráfico de linha com seta */}
            <div className="flex-shrink-0">
              <svg
                width={svgWidth}
                height={svgHeight}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="overflow-visible"
              >
                {/* Linha curva */}
                <path
                  d={path}
                  fill="none"
                  stroke={produto.cor}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                
                {/* Seta no final */}
                <g transform={`translate(${posicaoFinal.x}, ${posicaoFinal.y}) rotate(${posicaoFinal.angulo})`}>
                  <polygon
                    points="0,-6 12,0 0,6"
                    fill={produto.cor}
                  />
                </g>

                {/* Círculo no início */}
                {produto.valores.length > 0 && (
                  <circle
                    cx={padding}
                    cy={padding + (1 - (produto.valores[0] - Math.min(...produto.valores)) / (Math.max(...produto.valores, 1) - Math.min(...produto.valores, 0) || 1)) * (svgHeight - padding * 2)}
                    r={4}
                    fill={produto.cor}
                  />
                )}
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}
