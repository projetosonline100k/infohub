import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatTile } from "@/components/dashboard/StatTile";
import { FaturamentoGeral } from "@/components/dashboard/FaturamentoGeral";
import { supabase } from "@/integrations/supabase/client";
import { cn, iniciais } from "@/lib/utils";
import { AlertCircle, CalendarClock, TrendingUp, ArrowRight } from "lucide-react";
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  addWeeks,
  isWithinInterval,
  differenceInCalendarDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";

interface AtividadeResumo {
  id: string;
  titulo: string;
  cliente_id: string | null;
  concluida: boolean;
  data_atividade: string;
  data_vencimento: string | null;
  responsavel_nome: string | null;
}

interface ResponsavelResumo {
  nome: string;
  pendentes: number;
  atrasadas: number;
  hoje: number;
}

type FiltroEntrega = "atrasadas" | "esta_semana" | "proxima_semana";

const DashGeral = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [atividades, setAtividades] = useState<AtividadeResumo[]>([]);
  const [nomesClientes, setNomesClientes] = useState<Record<string, string>>({});
  const [equipe, setEquipe] = useState<string[]>([]);
  const [filtroEntrega, setFiltroEntrega] = useState<FiltroEntrega>("esta_semana");

  useEffect(() => {
    carregarResumo();
  }, []);

  const carregarResumo = async () => {
    try {
      const [
        { data: atividadesData, error: erroAtividades },
        { data: clientesData, error: erroClientes },
        { data: equipeData, error: erroEquipe },
      ] = await Promise.all([
        supabase
          .from("atividades")
          .select("id, titulo, cliente_id, concluida, data_atividade, data_vencimento, responsavel_nome")
          .is("deleted_at", null),
        supabase.from("clientes").select("id, nome_especialista"),
        supabase.from("equipe_cliente").select("nome_pessoa"),
      ]);

      if (erroAtividades) throw erroAtividades;
      if (erroClientes) throw erroClientes;
      if (erroEquipe) throw erroEquipe;

      setAtividades(atividadesData || []);
      setNomesClientes(
        Object.fromEntries((clientesData || []).map((c) => [c.id, c.nome_especialista]))
      );
      setEquipe(Array.from(new Set((equipeData || []).map((m) => m.nome_pessoa))));
    } catch (error) {
      console.error("Erro ao carregar resumo do dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Dash geral</h1>
          <p className="text-muted-foreground">Visão geral dos resultados do seu negócio</p>
        </div>
        <Card className="p-8 shadow-md">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        </Card>
      </div>
    );
  }

  const hoje = new Date();
  const hojeStr = format(hoje, "yyyy-MM-dd");
  const inicioSemana = startOfWeek(hoje, { weekStartsOn: 1 });
  const fimSemana = endOfWeek(hoje, { weekStartsOn: 1 });
  const inicioProximaSemana = addWeeks(inicioSemana, 1);
  const fimProximaSemana = addWeeks(fimSemana, 1);

  const pendentes = atividades.filter((a) => !a.concluida);

  const atrasadas = pendentes
    .filter((a) => a.data_vencimento && a.data_vencimento < hojeStr)
    .sort((a, b) => (a.data_vencimento || "").localeCompare(b.data_vencimento || ""));

  const paraHoje = pendentes.filter((a) => a.data_vencimento === hojeStr);

  const dentroDoIntervalo = (a: AtividadeResumo, inicio: Date, fim: Date) => {
    if (!a.data_vencimento) return false;
    try {
      return isWithinInterval(parseISO(a.data_vencimento), { start: inicio, end: fim });
    } catch {
      return false;
    }
  };

  const paraEntregar = {
    atrasadas,
    esta_semana: pendentes
      .filter((a) => dentroDoIntervalo(a, inicioSemana, fimSemana))
      .sort((a, b) => (a.data_vencimento || "").localeCompare(b.data_vencimento || "")),
    proxima_semana: pendentes
      .filter((a) => dentroDoIntervalo(a, inicioProximaSemana, fimProximaSemana))
      .sort((a, b) => (a.data_vencimento || "").localeCompare(b.data_vencimento || "")),
  }[filtroEntrega];

  const daSemana = atividades.filter((a) => {
    try {
      return isWithinInterval(parseISO(a.data_atividade), { start: inicioSemana, end: fimSemana });
    } catch {
      return false;
    }
  });
  const concluidasSemana = daSemana.filter((a) => a.concluida);
  const produtividade = daSemana.length > 0 ? Math.round((concluidasSemana.length / daSemana.length) * 100) : null;

  // Todo mundo que já foi registrado como responsável em alguma tarefa ou
  // cadastrado na equipe de algum cliente, mesmo sem nada pendente agora.
  const roster = new Set<string>(equipe);
  pendentes.forEach((a) => a.responsavel_nome && roster.add(a.responsavel_nome));

  const porResponsavel: ResponsavelResumo[] = Array.from(roster)
    .map((nome) => ({
      nome,
      pendentes: pendentes.filter((a) => a.responsavel_nome === nome).length,
      atrasadas: atrasadas.filter((a) => a.responsavel_nome === nome).length,
      hoje: paraHoje.filter((a) => a.responsavel_nome === nome).length,
    }))
    .sort((a, b) => b.pendentes - a.pendentes || b.atrasadas - a.atrasadas);

  const semResponsavel = pendentes.filter((a) => !a.responsavel_nome).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Dash geral</h1>
        <p className="text-muted-foreground">Como estão suas tarefas agora</p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          icon={AlertCircle}
          label="Tarefas atrasadas"
          value={String(atrasadas.length)}
          tone={atrasadas.length > 0 ? "critical" : "good"}
        />
        <StatTile
          icon={CalendarClock}
          label="Para hoje"
          value={String(paraHoje.length)}
          tone={paraHoje.length > 0 ? "warning" : "good"}
        />
        <StatTile
          icon={TrendingUp}
          label="Produtividade da semana"
          value={produtividade === null ? "—" : `${produtividade}%`}
          tone={produtividade === null ? "neutral" : produtividade >= 70 ? "good" : "warning"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Por responsável */}
        <Card className="p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
            Por responsável
          </h2>
          {porResponsavel.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum responsável registrado ainda.</p>
          ) : (
            <div className="space-y-3">
              {porResponsavel.map((r) => (
                <div key={r.nome} className="flex items-center gap-3">
                  <Avatar className="h-7 w-7 flex-shrink-0">
                    <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                      {iniciais(r.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-sm text-foreground truncate">{r.nome}</span>
                  <span className="text-xs font-medium text-foreground flex-shrink-0">
                    {r.pendentes} para fazer
                  </span>
                  {r.atrasadas > 0 && (
                    <span className="text-xs font-medium text-red-500 flex-shrink-0">{r.atrasadas} atrasada{r.atrasadas > 1 ? "s" : ""}</span>
                  )}
                  {r.hoje > 0 && (
                    <span className="text-xs font-medium text-orange-400 flex-shrink-0">{r.hoje} hoje</span>
                  )}
                </div>
              ))}
              {semResponsavel > 0 && (
                <p className="text-xs text-muted-foreground pt-1">
                  +{semResponsavel} tarefa{semResponsavel > 1 ? "s" : ""} sem responsável definido
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Lista de atrasadas */}
        <Card className="p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
            Tarefas atrasadas
          </h2>
          {atrasadas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma tarefa atrasada. 🎉</p>
          ) : (
            <div className="space-y-1">
              {atrasadas.slice(0, 8).map((a) => {
                const dias = a.data_vencimento
                  ? differenceInCalendarDays(hoje, parseISO(a.data_vencimento))
                  : 0;
                return (
                  <button
                    key={a.id}
                    onClick={() => a.cliente_id && navigate(`/clientes/${a.cliente_id}`)}
                    disabled={!a.cliente_id}
                    className="w-full flex items-center gap-2 py-2 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors text-left disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span className="flex-1 min-w-0 text-sm text-foreground truncate">{a.titulo}</span>
                    {a.cliente_id && nomesClientes[a.cliente_id] && (
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {nomesClientes[a.cliente_id]}
                      </span>
                    )}
                    <span className="text-xs font-medium text-red-500 flex-shrink-0">
                      {dias === 0 ? "vence hoje" : `${dias}d atrasada`}
                    </span>
                    {a.cliente_id && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                  </button>
                );
              })}
              {atrasadas.length > 8 && (
                <p className="text-xs text-muted-foreground pt-2">
                  +{atrasadas.length - 8} outras tarefas atrasadas
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Tarefas para entregar */}
      <Card className="p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Tarefas para entregar
          </h2>
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {([
              ["atrasadas", "Atrasadas"],
              ["esta_semana", "Esta semana"],
              ["proxima_semana", "Semana que vem"],
            ] as const).map(([valor, label]) => (
              <button
                key={valor}
                onClick={() => setFiltroEntrega(valor)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  filtroEntrega === valor
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {paraEntregar.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Nada por aqui neste período.</p>
        ) : (
          <div className="space-y-1">
            {paraEntregar.slice(0, 10).map((a) => (
              <button
                key={a.id}
                onClick={() => a.cliente_id && navigate(`/clientes/${a.cliente_id}`)}
                disabled={!a.cliente_id}
                className="w-full flex items-center gap-2 py-2 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors text-left disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className="flex-1 min-w-0 text-sm text-foreground truncate">{a.titulo}</span>
                {a.responsavel_nome && (
                  <span className="text-xs text-muted-foreground truncate max-w-[100px]">{a.responsavel_nome}</span>
                )}
                {a.cliente_id && nomesClientes[a.cliente_id] && (
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                    {nomesClientes[a.cliente_id]}
                  </span>
                )}
                {a.data_vencimento && (
                  <span className="text-xs font-medium text-muted-foreground flex-shrink-0">
                    {format(parseISO(a.data_vencimento), "dd/MM", { locale: ptBR })}
                  </span>
                )}
                {a.cliente_id && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
              </button>
            ))}
            {paraEntregar.length > 10 && (
              <p className="text-xs text-muted-foreground pt-2">
                +{paraEntregar.length - 10} outras tarefas neste período
              </p>
            )}
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Semana de {format(inicioSemana, "d MMM", { locale: ptBR })} a {format(fimSemana, "d MMM", { locale: ptBR })} ·{" "}
        {concluidasSemana.length}/{daSemana.length} tarefas concluídas
      </p>

      <div className="pt-2">
        <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide mb-4">
          Faturamento
        </h2>
        <FaturamentoGeral />
      </div>
    </div>
  );
};

export default DashGeral;
