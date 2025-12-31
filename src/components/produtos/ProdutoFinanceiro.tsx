import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash, TrendingUp, TrendingDown, Calendar } from "lucide-react";
import { toast } from "@/hooks/use-toast";
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
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, parseISO, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FinanceiroDiario {
  id: string;
  produto_id: string;
  data: string;
  receita: number;
  custos: number;
  reembolsos: number;
  vendas_quantidade: number;
  notas: string | null;
}

interface FinanceiroMensal {
  id: string;
  produto_id: string;
  mes: string;
  receita_bruta: number;
  custos: number;
  reembolsos: number;
  vendas_quantidade: number;
  notas: string | null;
}

interface ProdutoFinanceiroProps {
  produtoId: string;
}

type ViewType = "diario" | "mensal" | "anual";
type FilterType = "este_mes" | "ultimo_mes" | "ultimos_3_meses" | "este_ano" | "custom";

export function ProdutoFinanceiro({ produtoId }: ProdutoFinanceiroProps) {
  const [viewType, setViewType] = useState<ViewType>("diario");
  const [filterType, setFilterType] = useState<FilterType>("este_mes");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  
  const [dadosDiarios, setDadosDiarios] = useState<FinanceiroDiario[]>([]);
  const [dadosMensais, setDadosMensais] = useState<FinanceiroMensal[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [novaData, setNovaData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [novoMes, setNovoMes] = useState(format(new Date(), "yyyy-MM"));

  // Years for selector
  const anos = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => anoAtual - i);
  }, []);

  const meses = [
    { value: 1, label: "Janeiro" },
    { value: 2, label: "Fevereiro" },
    { value: 3, label: "Março" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Maio" },
    { value: 6, label: "Junho" },
    { value: 7, label: "Julho" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" },
    { value: 11, label: "Novembro" },
    { value: 12, label: "Dezembro" },
  ];

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      // Carregar dados diários
      const { data: diarios, error: erroDiarios } = await supabase
        .from("produto_financeiro_diario")
        .select("*")
        .eq("produto_id", produtoId)
        .order("data", { ascending: true });

      if (erroDiarios) throw erroDiarios;
      setDadosDiarios(diarios || []);

      // Carregar dados mensais (legado)
      const { data: mensais, error: erroMensais } = await supabase
        .from("produto_financeiro")
        .select("*")
        .eq("produto_id", produtoId)
        .order("mes");

      if (erroMensais) throw erroMensais;
      setDadosMensais(mensais || []);
    } catch (error) {
      console.error("Erro ao carregar financeiro:", error);
    } finally {
      setLoading(false);
    }
  }, [produtoId]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Filtrar dados baseado no período selecionado
  const dadosFiltrados = useMemo(() => {
    const hoje = new Date();
    let inicio: Date;
    let fim: Date;

    switch (filterType) {
      case "este_mes":
        inicio = startOfMonth(hoje);
        fim = endOfMonth(hoje);
        break;
      case "ultimo_mes":
        inicio = startOfMonth(subMonths(hoje, 1));
        fim = endOfMonth(subMonths(hoje, 1));
        break;
      case "ultimos_3_meses":
        inicio = startOfMonth(subMonths(hoje, 2));
        fim = endOfMonth(hoje);
        break;
      case "este_ano":
        inicio = startOfYear(hoje);
        fim = endOfYear(hoje);
        break;
      case "custom":
        inicio = new Date(selectedYear, selectedMonth - 1, 1);
        fim = endOfMonth(inicio);
        break;
      default:
        inicio = startOfMonth(hoje);
        fim = endOfMonth(hoje);
    }

    return dadosDiarios.filter((d) => {
      const data = parseISO(d.data);
      return isWithinInterval(data, { start: inicio, end: fim });
    });
  }, [dadosDiarios, filterType, selectedYear, selectedMonth]);

  // Calcular totais
  const totais = useMemo(() => {
    const dados = viewType === "diario" ? dadosFiltrados : dadosDiarios;
    return dados.reduce(
      (acc, d) => ({
        receita: acc.receita + Number(d.receita || 0),
        custos: acc.custos + Number(d.custos || 0),
        reembolsos: acc.reembolsos + Number(d.reembolsos || 0),
        vendas: acc.vendas + (d.vendas_quantidade || 0),
      }),
      { receita: 0, custos: 0, reembolsos: 0, vendas: 0 }
    );
  }, [dadosFiltrados, dadosDiarios, viewType]);

  const lucroTotal = totais.receita - totais.custos - totais.reembolsos;
  const ticketMedio = totais.vendas > 0 ? totais.receita / totais.vendas : 0;

  // Calcular período anterior para comparação
  const comparacao = useMemo(() => {
    const hoje = new Date();
    let inicioAnterior: Date;
    let fimAnterior: Date;

    switch (filterType) {
      case "este_mes":
        inicioAnterior = startOfMonth(subMonths(hoje, 1));
        fimAnterior = endOfMonth(subMonths(hoje, 1));
        break;
      case "ultimo_mes":
        inicioAnterior = startOfMonth(subMonths(hoje, 2));
        fimAnterior = endOfMonth(subMonths(hoje, 2));
        break;
      case "ultimos_3_meses":
        inicioAnterior = startOfMonth(subMonths(hoje, 5));
        fimAnterior = endOfMonth(subMonths(hoje, 3));
        break;
      default:
        return null;
    }

    const dadosAnteriores = dadosDiarios.filter((d) => {
      const data = parseISO(d.data);
      return isWithinInterval(data, { start: inicioAnterior, end: fimAnterior });
    });

    const receitaAnterior = dadosAnteriores.reduce((acc, d) => acc + Number(d.receita || 0), 0);
    
    if (receitaAnterior === 0) return null;
    
    const variacao = ((totais.receita - receitaAnterior) / receitaAnterior) * 100;
    return { variacao, crescendo: variacao >= 0 };
  }, [dadosDiarios, filterType, totais.receita]);

  // Dados para gráfico
  const dadosGrafico = useMemo(() => {
    if (viewType === "diario") {
      return dadosFiltrados.map((d) => ({
        label: format(parseISO(d.data), "dd/MM", { locale: ptBR }),
        Receita: Number(d.receita || 0),
        Lucro: Number(d.receita || 0) - Number(d.custos || 0) - Number(d.reembolsos || 0),
      }));
    } else if (viewType === "mensal") {
      // Agrupar dados diários por mês
      const agrupado: Record<string, { receita: number; custos: number; reembolsos: number }> = {};
      
      dadosDiarios.forEach((d) => {
        const mes = format(parseISO(d.data), "yyyy-MM");
        if (!agrupado[mes]) {
          agrupado[mes] = { receita: 0, custos: 0, reembolsos: 0 };
        }
        agrupado[mes].receita += Number(d.receita || 0);
        agrupado[mes].custos += Number(d.custos || 0);
        agrupado[mes].reembolsos += Number(d.reembolsos || 0);
      });

      // Adicionar dados mensais legados
      dadosMensais.forEach((d) => {
        if (!agrupado[d.mes]) {
          agrupado[d.mes] = { receita: 0, custos: 0, reembolsos: 0 };
        }
        agrupado[d.mes].receita += Number(d.receita_bruta || 0);
        agrupado[d.mes].custos += Number(d.custos || 0);
        agrupado[d.mes].reembolsos += Number(d.reembolsos || 0);
      });

      return Object.entries(agrupado)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, dados]) => ({
          label: formatarMes(mes),
          Receita: dados.receita,
          Lucro: dados.receita - dados.custos - dados.reembolsos,
        }));
    } else {
      // Agrupar por ano
      const agrupado: Record<string, { receita: number; custos: number; reembolsos: number }> = {};
      
      dadosDiarios.forEach((d) => {
        const ano = format(parseISO(d.data), "yyyy");
        if (!agrupado[ano]) {
          agrupado[ano] = { receita: 0, custos: 0, reembolsos: 0 };
        }
        agrupado[ano].receita += Number(d.receita || 0);
        agrupado[ano].custos += Number(d.custos || 0);
        agrupado[ano].reembolsos += Number(d.reembolsos || 0);
      });

      dadosMensais.forEach((d) => {
        const ano = d.mes.split("-")[0];
        if (!agrupado[ano]) {
          agrupado[ano] = { receita: 0, custos: 0, reembolsos: 0 };
        }
        agrupado[ano].receita += Number(d.receita_bruta || 0);
        agrupado[ano].custos += Number(d.custos || 0);
        agrupado[ano].reembolsos += Number(d.reembolsos || 0);
      });

      return Object.entries(agrupado)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ano, dados]) => ({
          label: ano,
          Receita: dados.receita,
          Lucro: dados.receita - dados.custos - dados.reembolsos,
        }));
    }
  }, [dadosFiltrados, dadosDiarios, dadosMensais, viewType]);

  // CRUD Functions
  const adicionarDia = async () => {
    if (!novaData) {
      toast({ title: "Selecione uma data", variant: "destructive" });
      return;
    }

    if (dadosDiarios.some((d) => d.data === novaData)) {
      toast({ title: "Esta data já existe", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("produto_financeiro_diario").insert({
      produto_id: produtoId,
      data: novaData,
      receita: 0,
      custos: 0,
      reembolsos: 0,
      vendas_quantidade: 0,
    });

    if (error) {
      toast({ title: "Erro ao adicionar dia", variant: "destructive" });
      return;
    }

    carregarDados();
    toast({ title: "Dia adicionado com sucesso" });
  };

  const adicionarMes = async () => {
    if (!novoMes) {
      toast({ title: "Selecione um mês", variant: "destructive" });
      return;
    }

    if (dadosMensais.some((d) => d.mes === novoMes)) {
      toast({ title: "Este mês já existe", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("produto_financeiro").insert({
      produto_id: produtoId,
      mes: novoMes,
      receita_bruta: 0,
      custos: 0,
      reembolsos: 0,
      vendas_quantidade: 0,
    });

    if (error) {
      toast({ title: "Erro ao adicionar mês", variant: "destructive" });
      return;
    }

    carregarDados();
    toast({ title: "Mês adicionado com sucesso" });
  };

  const atualizarCampoDiario = async (
    id: string,
    campo: keyof FinanceiroDiario,
    valor: number | string
  ) => {
    const { error } = await supabase
      .from("produto_financeiro_diario")
      .update({ [campo]: valor })
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
      return;
    }

    setDadosDiarios((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [campo]: valor } : d))
    );
  };

  const atualizarCampoMensal = async (
    id: string,
    campo: keyof FinanceiroMensal,
    valor: number | string
  ) => {
    const { error } = await supabase
      .from("produto_financeiro")
      .update({ [campo]: valor })
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
      return;
    }

    setDadosMensais((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [campo]: valor } : d))
    );
  };

  const excluirDia = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;

    const { error } = await supabase
      .from("produto_financeiro_diario")
      .delete()
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
      return;
    }

    carregarDados();
  };

  const excluirMes = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;

    const { error } = await supabase
      .from("produto_financeiro")
      .delete()
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
      return;
    }

    carregarDados();
  };

  function formatarMes(mes: string) {
    const [ano, mesNum] = mes.split("-");
    const nomesMeses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${nomesMeses[parseInt(mesNum) - 1]}/${ano.slice(2)}`;
  }

  function formatarMoeda(valor: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor);
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header com Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-xl font-semibold">Financeiro do Produto</h2>
        <Tabs value={viewType} onValueChange={(v) => setViewType(v as ViewType)}>
          <TabsList>
            <TabsTrigger value="diario">Diário</TabsTrigger>
            <TabsTrigger value="mensal">Mensal</TabsTrigger>
            <TabsTrigger value="anual">Anual</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Filtros */}
      {viewType === "diario" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={filterType === "este_mes" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("este_mes")}
          >
            Este mês
          </Button>
          <Button
            variant={filterType === "ultimo_mes" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("ultimo_mes")}
          >
            Último mês
          </Button>
          <Button
            variant={filterType === "ultimos_3_meses" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("ultimos_3_meses")}
          >
            Últimos 3 meses
          </Button>
          <Button
            variant={filterType === "este_ano" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("este_ano")}
          >
            Este ano
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <Select
              value={selectedMonth.toString()}
              onValueChange={(v) => {
                setSelectedMonth(parseInt(v));
                setFilterType("custom");
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meses.map((m) => (
                  <SelectItem key={m.value} value={m.value.toString()}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedYear.toString()}
              onValueChange={(v) => {
                setSelectedYear(parseInt(v));
                setFilterType("custom");
              }}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map((a) => (
                  <SelectItem key={a} value={a.toString()}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Receita Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {formatarMoeda(totais.receita)}
            </p>
            {comparacao && (
              <div className="flex items-center gap-1 mt-1">
                {comparacao.crescendo ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span
                  className={`text-xs font-medium ${
                    comparacao.crescendo ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {comparacao.variacao.toFixed(1)}% vs período anterior
                </span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lucro Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                lucroTotal >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatarMoeda(lucroTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totais.vendas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ticket Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatarMoeda(ticketMedio)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Input para adicionar */}
      <div className="flex items-center gap-2">
        {viewType === "diario" ? (
          <>
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={novaData}
              onChange={(e) => setNovaData(e.target.value)}
              className="w-40"
            />
            <Button onClick={adicionarDia}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Dia
            </Button>
          </>
        ) : viewType === "mensal" ? (
          <>
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="month"
              value={novoMes}
              onChange={(e) => setNovoMes(e.target.value)}
              className="w-40"
            />
            <Button onClick={adicionarMes}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Mês
            </Button>
          </>
        ) : null}
      </div>

      {/* Tabela */}
      {viewType === "diario" && (
        <Card>
          <CardContent className="p-0">
            {dadosFiltrados.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Receita</TableHead>
                    <TableHead>Custos</TableHead>
                    <TableHead>Reembolsos</TableHead>
                    <TableHead>Vendas</TableHead>
                    <TableHead>Lucro</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dadosFiltrados.map((row) => {
                    const lucro = Number(row.receita) - Number(row.custos) - Number(row.reembolsos);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {format(parseISO(row.data), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={row.receita}
                            onChange={(e) =>
                              atualizarCampoDiario(row.id, "receita", parseFloat(e.target.value) || 0)
                            }
                            className="w-28 h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={row.custos}
                            onChange={(e) =>
                              atualizarCampoDiario(row.id, "custos", parseFloat(e.target.value) || 0)
                            }
                            className="w-28 h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={row.reembolsos}
                            onChange={(e) =>
                              atualizarCampoDiario(row.id, "reembolsos", parseFloat(e.target.value) || 0)
                            }
                            className="w-28 h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={row.vendas_quantidade}
                            onChange={(e) =>
                              atualizarCampoDiario(row.id, "vendas_quantidade", parseInt(e.target.value) || 0)
                            }
                            className="w-20 h-8"
                          />
                        </TableCell>
                        <TableCell
                          className={`font-medium ${lucro >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {formatarMoeda(lucro)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => excluirDia(row.id)}>
                            <Trash className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">
                  Nenhum registro para o período selecionado.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {viewType === "mensal" && (
        <Card>
          <CardContent className="p-0">
            {dadosMensais.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead>Receita Bruta</TableHead>
                    <TableHead>Custos</TableHead>
                    <TableHead>Reembolsos</TableHead>
                    <TableHead>Vendas</TableHead>
                    <TableHead>Lucro</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dadosMensais.map((row) => {
                    const lucro = Number(row.receita_bruta) - Number(row.custos) - Number(row.reembolsos);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{formatarMes(row.mes)}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={row.receita_bruta}
                            onChange={(e) =>
                              atualizarCampoMensal(row.id, "receita_bruta", parseFloat(e.target.value) || 0)
                            }
                            className="w-28 h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={row.custos}
                            onChange={(e) =>
                              atualizarCampoMensal(row.id, "custos", parseFloat(e.target.value) || 0)
                            }
                            className="w-28 h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={row.reembolsos}
                            onChange={(e) =>
                              atualizarCampoMensal(row.id, "reembolsos", parseFloat(e.target.value) || 0)
                            }
                            className="w-28 h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={row.vendas_quantidade}
                            onChange={(e) =>
                              atualizarCampoMensal(row.id, "vendas_quantidade", parseInt(e.target.value) || 0)
                            }
                            className="w-20 h-8"
                          />
                        </TableCell>
                        <TableCell
                          className={`font-medium ${lucro >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {formatarMoeda(lucro)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => excluirMes(row.id)}>
                            <Trash className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">
                  Nenhum dado mensal cadastrado. Adicione um mês para começar.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Gráfico */}
      {dadosGrafico.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Evolução {viewType === "diario" ? "Diária" : viewType === "mensal" ? "Mensal" : "Anual"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dadosGrafico}>
                  <defs>
                    <linearGradient id="gradientReceita" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradientLucro" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="label" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
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
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number) => formatarMoeda(value)}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="Receita"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#gradientReceita)"
                  />
                  <Area
                    type="monotone"
                    dataKey="Lucro"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#gradientLucro)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
