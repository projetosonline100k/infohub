import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatTile } from "@/components/dashboard/StatTile";
import { DollarSign, TrendingUp, TrendingDown, Wallet, SlidersHorizontal, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format,
  startOfDay,
  subDays,
  eachDayOfInterval,
  differenceInCalendarDays,
  isWithinInterval,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Mesma paleta usada em ReceitaGraficoCliente.tsx, para consistência visual
// entre o dash geral e a tela de produtos de cada cliente.
const CORES_PRODUTOS = [
  "#22c55e", // verde
  "#3b82f6", // azul
  "#8b5cf6", // roxo
  "#f97316", // laranja
  "#ec4899", // rosa
  "#14b8a6", // teal
];

type FiltroPeriodo = "hoje" | "ontem" | "7dias" | "15dias" | "30dias" | "personalizado";

const OPCOES_FILTRO: { valor: FiltroPeriodo; label: string }[] = [
  { valor: "hoje", label: "Hoje" },
  { valor: "ontem", label: "Ontem" },
  { valor: "7dias", label: "Últimos 7 dias" },
  { valor: "15dias", label: "Últimos 15 dias" },
  { valor: "30dias", label: "Últimos 30 dias" },
  { valor: "personalizado", label: "Personalizado" },
];

interface ProdutoInfo {
  id: string;
  nome: string;
  clienteId: string;
  clienteNome: string;
  cor: string;
}

interface LancamentoDiario {
  produto_id: string;
  data: string;
  receita: number;
  custos: number;
  reembolsos: number;
}

interface PontoGrafico {
  data: string;
  dataLabel: string;
  [produtoId: string]: string | number;
}

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

export const FaturamentoGeral = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [produtos, setProdutos] = useState<ProdutoInfo[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoDiario[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<FiltroPeriodo>("30dias");
  const [personalizadoInicio, setPersonalizadoInicio] = useState<Date>();
  const [personalizadoFim, setPersonalizadoFim] = useState<Date>();

  useEffect(() => {
    carregar();
  }, []);

  const carregar = async () => {
    try {
      setLoading(true);
      const { data: produtosData, error: erroProdutos } = await supabase
        .from("produtos_cliente")
        .select("id, nome_produto, cliente_id");
      if (erroProdutos) throw erroProdutos;

      if (!produtosData || produtosData.length === 0) {
        setProdutos([]);
        setLoading(false);
        return;
      }

      const clienteIds = Array.from(new Set(produtosData.map((p) => p.cliente_id)));
      const { data: clientesData, error: erroClientes } = await supabase
        .from("clientes")
        .select("id, nome_especialista")
        .in("id", clienteIds);
      if (erroClientes) throw erroClientes;
      const nomesClientes = Object.fromEntries((clientesData || []).map((c) => [c.id, c.nome_especialista]));

      const produtoIds = produtosData.map((p) => p.id);
      const { data: diarioData, error: erroDiario } = await supabase
        .from("produto_financeiro_diario")
        .select("produto_id, data, receita, custos, reembolsos")
        .in("produto_id", produtoIds);
      if (erroDiario) throw erroDiario;

      const produtosInfo: ProdutoInfo[] = produtosData.map((p, index) => ({
        id: p.id,
        nome: p.nome_produto,
        clienteId: p.cliente_id,
        clienteNome: nomesClientes[p.cliente_id] || "",
        cor: CORES_PRODUTOS[index % CORES_PRODUTOS.length],
      }));

      const lancamentosNormalizados: LancamentoDiario[] = (diarioData || []).map((d) => ({
        produto_id: d.produto_id,
        data: d.data,
        receita: Number(d.receita || 0),
        custos: Number(d.custos || 0),
        reembolsos: Number(d.reembolsos || 0),
      }));

      // Por padrão só entram produtos que já tiveram algum lançamento — evita
      // encher o gráfico de linhas zeradas de produtos nunca faturados.
      const produtosComLancamento = new Set(lancamentosNormalizados.map((l) => l.produto_id));

      setProdutos(produtosInfo);
      setLancamentos(lancamentosNormalizados);
      setSelecionados(new Set(produtosInfo.filter((p) => produtosComLancamento.has(p.id)).map((p) => p.id)));
    } catch (error) {
      console.error("Erro ao carregar faturamento:", error);
    } finally {
      setLoading(false);
    }
  };

  const { inicio, fim } = useMemo(() => {
    const hoje = startOfDay(new Date());
    switch (filtro) {
      case "hoje":
        return { inicio: hoje, fim: hoje };
      case "ontem": {
        const ontem = subDays(hoje, 1);
        return { inicio: ontem, fim: ontem };
      }
      case "7dias":
        return { inicio: subDays(hoje, 6), fim: hoje };
      case "15dias":
        return { inicio: subDays(hoje, 14), fim: hoje };
      case "30dias":
        return { inicio: subDays(hoje, 29), fim: hoje };
      case "personalizado":
        return {
          inicio: startOfDay(personalizadoInicio || subDays(hoje, 6)),
          fim: startOfDay(personalizadoFim || hoje),
        };
    }
  }, [filtro, personalizadoInicio, personalizadoFim]);

  const toggleProduto = (id: string) => {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const produtosVisiveis = produtos.filter((p) => selecionados.has(p.id));

  const { dadosGrafico, totais, totaisAnteriores } = useMemo(() => {
    const duracaoDias = differenceInCalendarDays(fim, inicio) + 1;
    const fimAnterior = subDays(inicio, 1);
    const inicioAnterior = subDays(fimAnterior, duracaoDias - 1);

    const noPeriodo = (dataStr: string, ini: Date, f: Date) => {
      try {
        return isWithinInterval(parseISO(dataStr), { start: ini, end: f });
      } catch {
        return false;
      }
    };

    const dias = eachDayOfInterval({ start: inicio, end: fim });
    const grafico: PontoGrafico[] = dias.map((dia) => {
      const diaStr = format(dia, "yyyy-MM-dd");
      const ponto: PontoGrafico = { data: diaStr, dataLabel: format(dia, "dd/MM", { locale: ptBR }) };
      produtosVisiveis.forEach((p) => {
        ponto[p.id] = lancamentos
          .filter((l) => l.produto_id === p.id && l.data === diaStr)
          .reduce((acc, l) => acc + l.receita, 0);
      });
      return ponto;
    });

    const somar = (ini: Date, f: Date) =>
      lancamentos
        .filter((l) => produtosVisiveis.some((p) => p.id === l.produto_id) && noPeriodo(l.data, ini, f))
        .reduce(
          (acc, l) => ({
            receita: acc.receita + l.receita,
            custos: acc.custos + l.custos,
            reembolsos: acc.reembolsos + l.reembolsos,
          }),
          { receita: 0, custos: 0, reembolsos: 0 }
        );

    return {
      dadosGrafico: grafico,
      totais: somar(inicio, fim),
      totaisAnteriores: somar(inicioAnterior, fimAnterior),
    };
  }, [lancamentos, produtosVisiveis, inicio, fim]);

  const valorPorProduto = (produtoId: string) =>
    lancamentos
      .filter((l) => l.produto_id === produtoId && isWithinInterval(parseISO(l.data), { start: inicio, end: fim }))
      .reduce((acc, l) => acc + l.receita, 0);

  const lucroPeriodo = totais.receita - totais.custos - totais.reembolsos;
  const crescimento =
    totaisAnteriores.receita > 0 ? ((totais.receita - totaisAnteriores.receita) / totaisAnteriores.receita) * 100 : null;

  const irParaProduto = (produto: ProdutoInfo) => {
    navigate(`/clientes/${produto.clienteId}?produto=${produto.id}`);
  };

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-sm mb-2">{label}</p>
          {payload.map((entry, index) => {
            const produto = produtos.find((p) => p.id === entry.dataKey);
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

  if (loading) {
    return (
      <Card className="p-5 shadow-sm">
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando faturamento...</p>
      </Card>
    );
  }

  if (produtos.length === 0) {
    return (
      <Card className="p-5 shadow-sm">
        <p className="text-sm text-muted-foreground py-4">
          Nenhum produto cadastrado ainda. Cadastre produtos na aba de Informações de cada cliente para ver o
          faturamento aqui.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center bg-muted rounded-lg p-0.5 flex-wrap">
          {OPCOES_FILTRO.map((opcao) => (
            <button
              key={opcao.valor}
              onClick={() => setFiltro(opcao.valor)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                filtro === opcao.valor
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opcao.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {filtro === "personalizado" && (
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    {personalizadoInicio ? format(personalizadoInicio, "dd/MM/yy") : "Início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={personalizadoInicio} onSelect={setPersonalizadoInicio} locale={ptBR} />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground text-xs">até</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    {personalizadoFim ? format(personalizadoFim, "dd/MM/yy") : "Fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={personalizadoFim} onSelect={setPersonalizadoFim} locale={ptBR} />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                Produtos ({selecionados.size})
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="end">
              <p className="text-xs text-muted-foreground px-2 pb-2">Mostrar no gráfico</p>
              <div className="max-h-64 overflow-y-auto scrollbar-thin space-y-0.5">
                {produtos.map((produto) => (
                  <label
                    key={produto.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selecionados.has(produto.id)}
                      onCheckedChange={() => toggleProduto(produto.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{produto.nome}</p>
                      {produto.clienteNome && (
                        <p className="text-xs text-muted-foreground truncate">{produto.clienteNome}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {produtosVisiveis.length === 0 ? (
        <Card className="p-5 shadow-sm">
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum produto selecionado. Escolha ao menos um em "Produtos" acima.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatTile icon={DollarSign} label="Receita no período" value={formatarMoeda(totais.receita)} tone="good" />
            <StatTile
              icon={Wallet}
              label="Lucro líquido no período"
              value={formatarMoeda(lucroPeriodo)}
              tone={lucroPeriodo >= 0 ? "good" : "critical"}
            />
            <StatTile
              icon={crescimento !== null && crescimento < 0 ? TrendingDown : TrendingUp}
              label="Crescimento vs período anterior"
              value={crescimento === null ? "—" : `${crescimento >= 0 ? "+" : ""}${crescimento.toFixed(1)}%`}
              tone={crescimento === null ? "neutral" : crescimento >= 0 ? "good" : "warning"}
            />
          </div>

          <Card className="p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
              Faturamento por produto
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dadosGrafico} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dataLabel" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    className="text-muted-foreground"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {produtosVisiveis.map((produto) => (
                    <Line
                      key={produto.id}
                      type="monotone"
                      dataKey={produto.id}
                      stroke={produto.cor}
                      strokeWidth={2}
                      dot={{ fill: produto.cor, strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 2 }}
                      animationDuration={1000}
                      animationEasing="ease-in-out"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap gap-3 mt-4">
              {produtosVisiveis.map((produto) => (
                <button
                  key={produto.id}
                  onClick={() => irParaProduto(produto)}
                  className="group flex items-center gap-2 bg-muted/30 hover:bg-muted/60 rounded-lg px-3 py-2 transition-colors text-left"
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: produto.cor }} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{produto.nome}</p>
                    {produto.clienteNome && (
                      <p className="text-xs text-muted-foreground leading-tight truncate">{produto.clienteNome}</p>
                    )}
                  </div>
                  <span className="text-sm font-bold flex-shrink-0">{formatarMoeda(valorPorProduto(produto.id))}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
