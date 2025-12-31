import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, subMonths, startOfMonth, endOfMonth, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ReceitaGraficoClienteProps {
  clienteId: string;
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

interface ProdutoTendencia {
  nome: string;
  id: string;
  cor: string;
  valorTotal: number;
  crescimento: number;
  crescendo: boolean;
}

interface DadoGrafico {
  mes: string;
  mesLabel: string;
  [key: string]: string | number;
}

export function ReceitaGraficoCliente({ clienteId }: ReceitaGraficoClienteProps) {
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroTipo>("ultimos_3_meses");
  const [produtos, setProdutos] = useState<ProdutoTendencia[]>([]);
  const [dadosGrafico, setDadosGrafico] = useState<DadoGrafico[]>([]);

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

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
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

      // Buscar dados diários
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

      // Buscar dados mensais
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
          const mes = d.data.substring(0, 7);
          if (!dadosDiariosAgregados[d.produto_id]) {
            dadosDiariosAgregados[d.produto_id] = {};
          }
          dadosDiariosAgregados[d.produto_id][mes] = 
            (dadosDiariosAgregados[d.produto_id][mes] || 0) + Number(d.receita || 0);
        });
      }

      // Combinar dados
      const dadosCombinados: Record<string, Record<string, number>> = {};
      
      if (mensalData) {
        mensalData.forEach((d) => {
          if (!dadosCombinados[d.produto_id]) {
            dadosCombinados[d.produto_id] = {};
          }
          dadosCombinados[d.produto_id][d.mes] = Number(d.receita_bruta || 0);
        });
      }

      Object.entries(dadosDiariosAgregados).forEach(([produtoId, meses]) => {
        if (!dadosCombinados[produtoId]) {
          dadosCombinados[produtoId] = {};
        }
        Object.entries(meses).forEach(([mes, receita]) => {
          dadosCombinados[produtoId][mes] = receita;
        });
      });

      // Coletar todos os meses únicos
      const todosMeses = new Set<string>();
      Object.values(dadosCombinados).forEach(meses => {
        Object.keys(meses).forEach(mes => todosMeses.add(mes));
      });
      const mesesOrdenados = Array.from(todosMeses).sort();

      // Processar produtos
      const produtosProcessados: ProdutoTendencia[] = produtosData.map((produto, index) => {
        const dadosProduto = dadosCombinados[produto.id] || {};
        const valores = mesesOrdenados.map(mes => dadosProduto[mes] || 0);
        const valorTotal = valores.reduce((acc, v) => acc + v, 0);

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
          id: produto.id,
          cor: CORES_PRODUTOS[index % CORES_PRODUTOS.length],
          valorTotal,
          crescimento: Math.abs(crescimento),
          crescendo,
        };
      }).filter(p => p.valorTotal > 0);

      // Criar dados para o gráfico
      const dadosChart: DadoGrafico[] = mesesOrdenados.map(mes => {
        const [ano, mesNum] = mes.split('-');
        const mesLabel = format(new Date(parseInt(ano), parseInt(mesNum) - 1, 1), 'MMM/yy', { locale: ptBR });
        
        const ponto: DadoGrafico = { mes, mesLabel };
        produtosData.forEach(produto => {
          ponto[produto.id] = dadosCombinados[produto.id]?.[mes] || 0;
        });
        return ponto;
      });

      setProdutos(produtosProcessados);
      setDadosGrafico(dadosChart);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-sm mb-2">{label}</p>
          {payload.map((entry: any, index: number) => {
            const produto = produtos.find(p => p.id === entry.dataKey);
            return (
              <div key={index} className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-muted-foreground">{produto?.nome}:</span>
                <span className="font-medium">{formatarMoeda(entry.value)}</span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

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
      ) : produtos.length === 0 ? (
        <div className="h-32 flex items-center justify-center bg-muted/30 rounded-lg">
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Nenhum dado financeiro disponível para o período selecionado.
          </p>
        </div>
      ) : (
        <>
          {/* Gráfico de linhas */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dadosGrafico} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="mesLabel" 
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  className="text-muted-foreground"
                />
                <Tooltip content={<CustomTooltip />} />
                {produtos.map((produto) => (
                  <Line
                    key={produto.id}
                    type="monotone"
                    dataKey={produto.id}
                    stroke={produto.cor}
                    strokeWidth={2}
                    dot={{ fill: produto.cor, strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, strokeWidth: 2 }}
                    animationDuration={1500}
                    animationEasing="ease-in-out"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legenda com valores */}
          <div className="flex flex-wrap gap-4">
            {produtos.map((produto) => (
              <div key={produto.id} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: produto.cor }}
                />
                <span className="text-sm font-medium">{produto.nome}</span>
                <span className="text-sm font-bold">{formatarMoeda(produto.valorTotal)}</span>
                <div className="flex items-center gap-1">
                  {produto.crescendo ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                  <span className={`text-xs font-medium ${produto.crescendo ? "text-green-500" : "text-red-500"}`}>
                    {produto.crescimento.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
