import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

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
  { stroke: "#22c55e", fill: "#22c55e" }, // verde
  { stroke: "#3b82f6", fill: "#3b82f6" }, // azul
  { stroke: "#8b5cf6", fill: "#8b5cf6" }, // roxo
  { stroke: "#f97316", fill: "#f97316" }, // laranja
  { stroke: "#ec4899", fill: "#ec4899" }, // rosa
  { stroke: "#14b8a6", fill: "#14b8a6" }, // teal
  { stroke: "#eab308", fill: "#eab308" }, // amarelo
  { stroke: "#ef4444", fill: "#ef4444" }, // vermelho
];

export function ReceitaGraficoCliente({ clienteId }: ReceitaGraficoClienteProps) {
  const [loading, setLoading] = useState(true);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [dadosGrafico, setDadosGrafico] = useState<any[]>([]);

  useEffect(() => {
    carregarDados();
  }, [clienteId]);

  const carregarDados = async () => {
    try {
      // Buscar produtos do cliente
      const { data: produtosData, error: produtosError } = await supabase
        .from("produtos_cliente")
        .select("id, nome_produto")
        .eq("cliente_id", clienteId);

      if (produtosError) throw produtosError;

      if (!produtosData || produtosData.length === 0) {
        setLoading(false);
        return;
      }

      setProdutos(produtosData);

      // Buscar dados financeiros de todos os produtos
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

      // Agrupar dados por mês
      const mesesUnicos = [...new Set(financeiroData.map((d) => d.mes))].sort();
      
      const dadosAgrupados = mesesUnicos.map((mes) => {
        const registro: any = { mes: formatarMes(mes) };
        
        produtosData.forEach((produto) => {
          const dado = financeiroData.find(
            (d) => d.mes === mes && d.produto_id === produto.id
          );
          registro[produto.nome_produto] = dado ? Number(dado.receita_bruta) : 0;
        });
        
        return registro;
      });

      setDadosGrafico(dadosAgrupados);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  function formatarMes(mes: string) {
    const [ano, mesNum] = mes.split("-");
    const meses = [
      "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
      "Jul", "Ago", "Set", "Out", "Nov", "Dez",
    ];
    return `${meses[parseInt(mesNum) - 1]}/${ano.slice(2)}`;
  }

  function formatarMoeda(valor: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor);
  }

  if (loading) {
    return (
      <div className="h-72 flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (dadosGrafico.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center bg-muted rounded-lg">
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Nenhum dado financeiro disponível. Adicione dados na aba Financeiro de cada produto.
        </p>
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dadosGrafico}>
          <defs>
            {produtos.map((produto, index) => {
              const cor = CORES_PRODUTOS[index % CORES_PRODUTOS.length];
              return (
                <linearGradient
                  key={produto.id}
                  id={`gradient-${produto.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={cor.fill} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={cor.fill} stopOpacity={0.05} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
          <XAxis 
            dataKey="mes" 
            axisLine={false}
            tickLine={false}
            className="text-xs"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis 
            tickFormatter={(value) => 
              new Intl.NumberFormat("pt-BR", {
                notation: "compact",
                compactDisplay: "short",
              }).format(value)
            }
            axisLine={false}
            tickLine={false}
            className="text-xs"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip
            formatter={(value: number) => formatarMoeda(value)}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            }}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
          />
          <Legend 
            wrapperStyle={{ paddingTop: "10px" }}
          />
          {produtos.map((produto, index) => {
            const cor = CORES_PRODUTOS[index % CORES_PRODUTOS.length];
            return (
              <Area
                key={produto.id}
                type="monotone"
                dataKey={produto.nome_produto}
                stroke={cor.stroke}
                strokeWidth={2.5}
                fill={`url(#gradient-${produto.id})`}
                dot={{ r: 4, fill: cor.stroke, strokeWidth: 2, stroke: "#fff" }}
                activeDot={{ r: 6, fill: cor.stroke, strokeWidth: 2, stroke: "#fff" }}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
