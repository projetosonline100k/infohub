import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash } from "lucide-react";
import { toast } from "@/hooks/use-toast";
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

interface FinanceiroRow {
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

export function ProdutoFinanceiro({ produtoId }: ProdutoFinanceiroProps) {
  const [dados, setDados] = useState<FinanceiroRow[]>([]);
  const [novoMes, setNovoMes] = useState("");
  const [loading, setLoading] = useState(true);

  const carregarDados = useCallback(async () => {
    const { data, error } = await supabase
      .from("produto_financeiro")
      .select("*")
      .eq("produto_id", produtoId)
      .order("mes");

    if (error) {
      console.error("Erro ao carregar financeiro:", error);
      return;
    }

    setDados(data || []);
    setLoading(false);
  }, [produtoId]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const adicionarMes = async () => {
    if (!novoMes) {
      toast({ title: "Selecione um mês", variant: "destructive" });
      return;
    }

    const mesFormatado = novoMes; // formato: "2024-01"

    // Verificar se já existe
    if (dados.some((d) => d.mes === mesFormatado)) {
      toast({ title: "Este mês já existe", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("produto_financeiro").insert({
      produto_id: produtoId,
      mes: mesFormatado,
      receita_bruta: 0,
      custos: 0,
      reembolsos: 0,
      vendas_quantidade: 0,
    });

    if (error) {
      toast({ title: "Erro ao adicionar mês", variant: "destructive" });
      return;
    }

    setNovoMes("");
    carregarDados();
  };

  const atualizarCampo = async (
    id: string,
    campo: keyof FinanceiroRow,
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

    setDados((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [campo]: valor } : d))
    );
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

  // Calcular totais
  const totais = dados.reduce(
    (acc, d) => ({
      receita: acc.receita + Number(d.receita_bruta),
      custos: acc.custos + Number(d.custos),
      reembolsos: acc.reembolsos + Number(d.reembolsos),
      vendas: acc.vendas + d.vendas_quantidade,
    }),
    { receita: 0, custos: 0, reembolsos: 0, vendas: 0 }
  );

  const lucroTotal = totais.receita - totais.custos - totais.reembolsos;
  const ticketMedio = totais.vendas > 0 ? totais.receita / totais.vendas : 0;

  // Dados para o gráfico
  const dadosGrafico = dados.map((d) => ({
    mes: formatarMes(d.mes),
    Receita: Number(d.receita_bruta),
    Lucro: Number(d.receita_bruta) - Number(d.custos) - Number(d.reembolsos),
    Vendas: d.vendas_quantidade,
  }));

  function formatarMes(mes: string) {
    const [ano, mesNum] = mes.split("-");
    const meses = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
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
      <div className="p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Financeiro do Produto</h2>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Resumo */}
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

      {/* Tabela */}
      {dados.length > 0 ? (
        <Card>
          <CardContent className="p-0">
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
                {dados.map((row) => {
                  const lucro =
                    Number(row.receita_bruta) -
                    Number(row.custos) -
                    Number(row.reembolsos);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {formatarMes(row.mes)}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.receita_bruta}
                          onChange={(e) =>
                            atualizarCampo(
                              row.id,
                              "receita_bruta",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-28 h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.custos}
                          onChange={(e) =>
                            atualizarCampo(
                              row.id,
                              "custos",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-28 h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.reembolsos}
                          onChange={(e) =>
                            atualizarCampo(
                              row.id,
                              "reembolsos",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-28 h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.vendas_quantidade}
                          onChange={(e) =>
                            atualizarCampo(
                              row.id,
                              "vendas_quantidade",
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-20 h-8"
                        />
                      </TableCell>
                      <TableCell
                        className={`font-medium ${
                          lucro >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatarMoeda(lucro)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => excluirMes(row.id)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Nenhum dado financeiro cadastrado. Adicione um mês para começar.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Gráfico */}
      {dados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolução</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dadosGrafico}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) => formatarMoeda(value)}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Receita"
                    stroke="#22c55e"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="Lucro"
                    stroke="#3b82f6"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
