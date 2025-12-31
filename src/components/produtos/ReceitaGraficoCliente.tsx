import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart,
  Line,
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
  "#22c55e", // verde
  "#3b82f6", // azul
  "#8b5cf6", // roxo
  "#f97316", // laranja
  "#ec4899", // rosa
  "#14b8a6", // teal
  "#eab308", // amarelo
  "#ef4444", // vermelho
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
        <LineChart data={dadosGrafico}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="mes" className="text-xs" />
          <YAxis 
            tickFormatter={(value) => 
              new Intl.NumberFormat("pt-BR", {
                notation: "compact",
                compactDisplay: "short",
              }).format(value)
            }
            className="text-xs"
          />
          <Tooltip
            formatter={(value: number) => formatarMoeda(value)}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Legend />
          {produtos.map((produto, index) => (
            <Line
              key={produto.id}
              type="monotone"
              dataKey={produto.nome_produto}
              stroke={CORES_PRODUTOS[index % CORES_PRODUTOS.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
