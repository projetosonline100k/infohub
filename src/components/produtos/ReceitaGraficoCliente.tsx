import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, subMonths, startOfMonth, endOfMonth, startOfYear, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ReceitaGraficoClienteProps {
  clienteId: string;
}

interface Produto {
  id: string;
  nome_produto: string;
}

type FiltroTipo = "este_mes" | "ultimos_3_meses" | "este_ano" | "tudo";

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
  const [filtro, setFiltro] = useState<FiltroTipo>("ultimos_3_meses");
  const [produtosComTendencia, setProdutosComTendencia] = useState<{
    nome: string;
    cor: string;
    valores: number[];
    crescimento: number;
    crescendo: boolean;
  }[]>([]);

  useEffect(() => {
    carregarDados();
  }, [clienteId, filtro]);

  const getDataRange = () => {
    const hoje = new Date();
    switch (filtro) {
      case "este_mes":
        return { inicio: startOfMonth(hoje), fim: endOfMonth(hoje) };
      case "ultimos_3_meses":
        return { inicio: startOfMonth(subMonths(hoje, 2)), fim: endOfMonth(hoje) };
      case "este_ano":
        return { inicio: startOfYear(hoje), fim: endOfMonth(hoje) };
      case "tudo":
      default:
        return { inicio: null, fim: null };
    }
  };

  const carregarDados = async () => {
    try {
      setLoading(true);
      
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
      const { inicio, fim } = getDataRange();

      // Buscar dados diários (produto_financeiro_diario)
      let queryDiario = supabase
        .from("produto_financeiro_diario")
        .select("produto_id, data, receita")
        .in("produto_id", produtoIds)
        .order("data");

      if (inicio && fim) {
        queryDiario = queryDiario
          .gte("data", format(inicio, "yyyy-MM-dd"))
          .lte("data", format(fim, "yyyy-MM-dd"));
      }

      const { data: diarioData, error: diarioError } = await queryDiario;
      if (diarioError) throw diarioError;

      // Buscar dados mensais (produto_financeiro)
      let queryMensal = supabase
        .from("produto_financeiro")
        .select("produto_id, mes, receita_bruta")
        .in("produto_id", produtoIds)
        .order("mes");

      if (inicio && fim) {
        queryMensal = queryMensal
          .gte("mes", format(inicio, "yyyy-MM"))
          .lte("mes", format(fim, "yyyy-MM"));
      }

      const { data: mensalData, error: mensalError } = await queryMensal;
      if (mensalError) throw mensalError;

      // Agregar dados diários por mês
      const dadosDiariosAgregados: Record<string, Record<string, number>> = {};
      
      if (diarioData) {
        diarioData.forEach((d) => {
          const mes = d.data.substring(0, 7); // "yyyy-MM"
          if (!dadosDiariosAgregados[d.produto_id]) {
            dadosDiariosAgregados[d.produto_id] = {};
          }
          dadosDiariosAgregados[d.produto_id][mes] = 
            (dadosDiariosAgregados[d.produto_id][mes] || 0) + Number(d.receita || 0);
        });
      }

      // Combinar dados diários agregados com mensais
      const dadosCombinados: Record<string, Record<string, number>> = {};
      
      // Primeiro, adicionar dados mensais
      if (mensalData) {
        mensalData.forEach((d) => {
          if (!dadosCombinados[d.produto_id]) {
            dadosCombinados[d.produto_id] = {};
          }
          dadosCombinados[d.produto_id][d.mes] = Number(d.receita_bruta || 0);
        });
      }

      // Depois, sobrescrever/adicionar dados diários agregados (prioridade)
      Object.entries(dadosDiariosAgregados).forEach(([produtoId, meses]) => {
        if (!dadosCombinados[produtoId]) {
          dadosCombinados[produtoId] = {};
        }
        Object.entries(meses).forEach(([mes, receita]) => {
          dadosCombinados[produtoId][mes] = receita;
        });
      });

      // Processar dados por produto
      const resultado = produtosData.map((produto, index) => {
        const dadosProduto = dadosCombinados[produto.id] || {};
        const mesesOrdenados = Object.keys(dadosProduto).sort();
        const valores = mesesOrdenados.map(mes => dadosProduto[mes]);

        // Calcular crescimento
        let crescimento = 0;
        let crescendo = true;
        if (valores.length >= 2) {
          const ultimo = valores[valores.length - 1];
          const penultimo = valores[valores.length - 2];
          if (penultimo > 0) {
            crescimento = ((ultimo - penultimo) / penultimo) * 100;
          }
          crescendo = ultimo >= penultimo;
        }

        return {
          nome: produto.nome_produto,
          cor: CORES_PRODUTOS[index % CORES_PRODUTOS.length],
          valores,
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
    
    const diferencaY = ultimoValor - penultimoValor;
    let angulo = 0;
    if (diferencaY > 0) angulo = -30;
    else if (diferencaY < 0) angulo = 30;
    
    return { x, y, angulo };
  };

  const svgWidth = 280;
  const svgHeight = 120;
  const padding = 20;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={filtro === "este_mes" ? "default" : "outline"}
          size="sm"
          onClick={() => setFiltro("este_mes")}
        >
          Este mês
        </Button>
        <Button
          variant={filtro === "ultimos_3_meses" ? "default" : "outline"}
          size="sm"
          onClick={() => setFiltro("ultimos_3_meses")}
        >
          Últimos 3 meses
        </Button>
        <Button
          variant={filtro === "este_ano" ? "default" : "outline"}
          size="sm"
          onClick={() => setFiltro("este_ano")}
        >
          Este ano
        </Button>
        <Button
          variant={filtro === "tudo" ? "default" : "outline"}
          size="sm"
          onClick={() => setFiltro("tudo")}
        >
          Tudo
        </Button>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      ) : produtosComTendencia.length === 0 ? (
        <div className="h-32 flex items-center justify-center bg-muted/30 rounded-lg">
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Nenhum dado financeiro disponível para o período selecionado.
          </p>
        </div>
      ) : (
        produtosComTendencia.map((produto, index) => {
          const path = gerarCurva(produto.valores, svgWidth, svgHeight, padding);
          const posicaoFinal = getPosicaoFinal(produto.valores, svgWidth, svgHeight, padding);
          const valorTotal = produto.valores.reduce((acc, v) => acc + v, 0);
          const ultimoValor = produto.valores[produto.valores.length - 1] || 0;

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
                  <span className="text-sm font-bold text-foreground ml-2">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTotal)}
                  </span>
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
                  <path
                    d={path}
                    fill="none"
                    stroke={produto.cor}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  
                  <g transform={`translate(${posicaoFinal.x}, ${posicaoFinal.y}) rotate(${posicaoFinal.angulo})`}>
                    <polygon
                      points="0,-6 12,0 0,6"
                      fill={produto.cor}
                    />
                  </g>

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
        })
      )}
    </div>
  );
}
