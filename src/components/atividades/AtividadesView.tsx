import { LousaAtividades } from "./LousaAtividades";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Bike, MoreHorizontal, ArrowUpDown, List, LayoutGrid, Calendar as CalendarIcon, ChevronLeft, ChevronRight, NotebookText, Users } from "lucide-react";
import { AtividadeItem } from "./AtividadeItem";
import { DiaSection } from "./DiaSection";
import { AtividadeDetailPanel } from "./AtividadeDetailPanel";
import { KanbanBoard } from "./KanbanBoard";
import { CalendarView } from "./CalendarView";
import { PastasBar, VISAO_GERAL } from "./PastasBar";
import { VisaoGeralGrupos } from "./VisaoGeralGrupos";
import { ExcluirPastaDialog } from "./ExcluirPastaDialog";
import { LixeiraPastasDialog } from "./LixeiraPastasDialog";
import { NotasPessoais } from "./notas/NotasPessoais";
import { toast } from "sonner";
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  startOfYear, 
  endOfYear, 
  addDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addYears,
  subYears,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  isSameDay,
  isWithinInterval,
  parseISO
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { cn, iniciais } from "@/lib/utils";
import { detectarDiaSemana } from "@/lib/diasSemana";
import { TimerFinalizarDialog } from "./TimerFinalizarDialog";

interface Atividade {
  id: string;
  cliente_id: string | null;
  titulo: string;
  descricao: string | null;
  concluida: boolean;
  tempo_estimado: number | null;
  data_atividade: string;
  ordem: number;
  destaque: boolean;
  created_at: string;
  status: string;
  prioridade: string;
  data_vencimento: string | null;
  data_inicio: string | null;
  pasta_id: string | null;
  responsavel_nome: string | null;
  timer_iniciado_em: string | null;
  timer_decorrido_segundos: number;
}

interface Pasta {
  id: string;
  nome: string;
  ordem: number;
}

interface ChecklistResumo {
  total: number;
  concluidas: number;
}

interface GrupoResumo {
  id: string | null;
  nome: string;
  total: number;
  concluidas: number;
  atrasadas: number;
  estaSemana: number;
  integrantes: string[];
}

interface Coluna {
  id: string;
  nome: string;
  status_key: string;
  ordem: number;
  eh_conclusao: boolean;
}

// As quatro colunas que o quadro sempre teve; mantidas com as mesmas
// status_key para não exigir migrar as tarefas já existentes.
const COLUNAS_PADRAO = [
  { nome: "Backlog", status_key: "backlog", eh_conclusao: false },
  { nome: "Em Execução", status_key: "em_progresso", eh_conclusao: false },
  { nome: "Revisão", status_key: "revisao", eh_conclusao: false },
  { nome: "Finalizado", status_key: "finalizado", eh_conclusao: true },
];

interface AtividadesViewProps {
  clienteId?: string;
}

type ViewMode = "lista" | "quadro" | "calendario" | "notas";
type PeriodoFiltro = "semana" | "mes" | "ano";

interface GrupoAtividades {
  id: string;
  label: string;
  inicio: Date;
  fim: Date;
}

const getIntervaloData = (data: Date, periodo: PeriodoFiltro) => {
  if (periodo === "semana") {
    return {
      inicio: startOfWeek(data, { weekStartsOn: 1 }),
      fim: endOfWeek(data, { weekStartsOn: 1 }),
    };
  } else if (periodo === "mes") {
    return {
      inicio: startOfMonth(data),
      fim: endOfMonth(data),
    };
  } else {
    return {
      inicio: startOfYear(data),
      fim: endOfYear(data),
    };
  }
};

const getLabelPeriodo = (data: Date, periodo: PeriodoFiltro) => {
  if (periodo === "semana") {
    const inicio = startOfWeek(data, { weekStartsOn: 1 });
    const fim = endOfWeek(data, { weekStartsOn: 1 });
    return `${format(inicio, "d MMM", { locale: ptBR })} - ${format(fim, "d MMM", { locale: ptBR })}`;
  } else if (periodo === "mes") {
    return format(data, "MMMM yyyy", { locale: ptBR });
  } else {
    return format(data, "yyyy");
  }
};

// Parse tempo from text like "1h", "40min", "30m"
const parseTempoFromText = (text: string): { titulo: string; tempo: number | null } => {
  const tempoRegex = /(\d+)\s*(h|hora|hr|min|m|minutos?)\b/gi;
  let totalMinutos = 0;
  let titulo = text;
  let match;

  while ((match = tempoRegex.exec(text)) !== null) {
    const valor = parseInt(match[1]);
    const unidade = match[2].toLowerCase();

    if (unidade.startsWith("h")) {
      totalMinutos += valor * 60;
    } else {
      totalMinutos += valor;
    }

    titulo = titulo.replace(match[0], "").trim();
  }

  return {
    titulo: titulo || text,
    tempo: totalMinutos > 0 ? totalMinutos : null,
  };
};

export const AtividadesView = ({ clienteId }: AtividadesViewProps) => {
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [novaAtividade, setNovaAtividade] = useState("");
  const [diasAbertos, setDiasAbertos] = useState<Record<string, boolean>>({});
  const [selectedAtividade, setSelectedAtividade] = useState<Atividade | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // Dentro de um cliente começa no quadro; na tela pessoal (sem cliente) começa na lista.
  const [viewMode, setViewMode] = useState<ViewMode>(clienteId ? "quadro" : "lista");
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>("semana");
  // Ignora o filtro de período na lista; quadro e calendário já ignoram sempre
  // (não faz sentido uma tarefa sumir do quadro só porque mudou de semana).
  const [mostrarTodas, setMostrarTodas] = useState(false);
  // Filtros específicos do quadro: por padrão mostra tudo, sem período.
  const [mostrarConcluidas, setMostrarConcluidas] = useState(true);
  const [kanbanPeriodo, setKanbanPeriodo] = useState<"todas" | "semana" | "proxima_semana">("todas");
  const [timerFinalizadoId, setTimerFinalizadoId] = useState<string | null>(null);
  // Filtro de responsáveis: conjunto vazio = mostra de todo mundo.
  const [pessoasDisponiveis, setPessoasDisponiveis] = useState<string[]>([]);
  const [pessoasSelecionadas, setPessoasSelecionadas] = useState<Set<string>>(new Set());
  const [dataReferencia, setDataReferencia] = useState(new Date());
  const [pastas, setPastas] = useState<Pasta[]>([]);
  // null = "Sem pasta"; VISAO_GERAL = grade de resumo dos grupos; senão, o id da pasta.
  const [pastaAtivaId, setPastaAtivaId] = useState<string | null>(VISAO_GERAL);
  const [pastaParaExcluir, setPastaParaExcluir] = useState<(Pasta & { tarefas: number }) | null>(null);
  const [lixeiraAberta, setLixeiraAberta] = useState(false);
  const [lixeiraCount, setLixeiraCount] = useState(0);
  const [checklistPorAtividade, setChecklistPorAtividade] = useState<Record<string, ChecklistResumo>>({});
  const [visaoGeral, setVisaoGeral] = useState<GrupoResumo[]>([]);
  const [colunas, setColunas] = useState<Coluna[]>([]);

  // Sem isso, a pasta/visão escolhida se perdia toda vez que a aba de
  // Atividades era fechada e reaberta (o componente remonta do zero).
  useEffect(() => {
    const chave = `atividades-view:${clienteId || "pessoal"}`;
    let viewModeSalvo: ViewMode | null = null;
    let pastaSalva: string | null | undefined;
    try {
      const salvo = JSON.parse(localStorage.getItem(chave) || "{}");
      if (["lista", "quadro", "calendario", "notas"].includes(salvo.viewMode)) viewModeSalvo = salvo.viewMode;
      if (typeof salvo.pastaAtivaId === "string" || salvo.pastaAtivaId === null) pastaSalva = salvo.pastaAtivaId;
    } catch {
      // localStorage indisponível ou corrompido: segue com o padrão
    }
    setViewMode(viewModeSalvo ?? (clienteId ? "quadro" : "lista"));
    setPastaAtivaId(pastaSalva !== undefined ? pastaSalva : VISAO_GERAL);
  }, [clienteId]);

  useEffect(() => {
    const chave = `atividades-view:${clienteId || "pessoal"}`;
    localStorage.setItem(chave, JSON.stringify({ viewMode, pastaAtivaId }));
  }, [viewMode, pastaAtivaId, clienteId]);

  // Quando uma pasta está selecionada (inclusive "Sem pasta" = null), só suas
  // tarefas aparecem; na visão geral essa lista não é usada para renderizar.
  // Junta a equipe cadastrada com quem já foi digitado como responsável em
  // alguma tarefa, pra ninguém ficar de fora do filtro por não estar num
  // cadastro formal.
  const rosterPessoas = useMemo(() => {
    const nomes = new Set(pessoasDisponiveis);
    atividades.forEach((a) => {
      if (a.responsavel_nome) nomes.add(a.responsavel_nome);
    });
    return Array.from(nomes).sort();
  }, [pessoasDisponiveis, atividades]);

  const atividadesVisiveis = useMemo(() => {
    let lista = pastaAtivaId === VISAO_GERAL ? atividades : atividades.filter((a) => a.pasta_id === pastaAtivaId);
    if (pessoasSelecionadas.size > 0) {
      lista = lista.filter((a) => pessoasSelecionadas.has(a.responsavel_nome || "Sem responsável"));
    }
    return lista;
  }, [atividades, pastaAtivaId, pessoasSelecionadas]);

  // Semana usada tanto pelo filtro "esta semana/semana que vem" do quadro
  // quanto pelas colunas nomeadas como dia da semana (sempre precisam de
  // uma semana de referência, mesmo com o filtro em "todas").
  const semanaReferenciaKanban = useMemo(() => {
    const base = kanbanPeriodo === "proxima_semana" ? addWeeks(new Date(), 1) : new Date();
    return {
      inicio: startOfWeek(base, { weekStartsOn: 1 }),
      fim: endOfWeek(base, { weekStartsOn: 1 }),
    };
  }, [kanbanPeriodo]);

  const atividadesKanban = useMemo(() => {
    let lista = atividadesVisiveis;
    if (kanbanPeriodo !== "todas") {
      lista = lista.filter((a) => {
        try {
          return isWithinInterval(parseISO(a.data_atividade), { start: semanaReferenciaKanban.inicio, end: semanaReferenciaKanban.fim });
        } catch {
          return false;
        }
      });
    }
    if (!mostrarConcluidas) {
      lista = lista.filter((a) => !a.concluida);
    }
    return lista;
  }, [atividadesVisiveis, kanbanPeriodo, semanaReferenciaKanban, mostrarConcluidas]);

  // Get interval days based on period filter
  const intervaloDatas = useMemo(() => {
    return getIntervaloData(dataReferencia, periodoFiltro);
  }, [dataReferencia, periodoFiltro]);

  // Get groups for the current period based on filter type
  const gruposDoPeriodo = useMemo((): GrupoAtividades[] => {
    if (periodoFiltro === "semana") {
      // For week: show individual days
      const days = eachDayOfInterval({
        start: intervaloDatas.inicio,
        end: intervaloDatas.fim,
      });
      return days.map((day) => ({
        id: format(day, "yyyy-MM-dd"),
        label: `${format(day, "EEEE", { locale: ptBR }).charAt(0).toUpperCase() + format(day, "EEEE", { locale: ptBR }).slice(1)}, ${format(day, "d MMM", { locale: ptBR })}`,
        inicio: day,
        fim: day,
      }));
    } else if (periodoFiltro === "mes") {
      // For month: show weeks
      const weeks = eachWeekOfInterval(
        { start: intervaloDatas.inicio, end: intervaloDatas.fim },
        { weekStartsOn: 1 }
      );
      return weeks.map((weekStart, index) => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        return {
          id: `semana-${index + 1}`,
          label: `Semana ${index + 1} (${format(weekStart, "d MMM", { locale: ptBR })} - ${format(weekEnd, "d MMM", { locale: ptBR })})`,
          inicio: weekStart,
          fim: weekEnd,
        };
      });
    } else {
      // For year: show months
      const months = eachMonthOfInterval({
        start: intervaloDatas.inicio,
        end: intervaloDatas.fim,
      });
      return months.map((monthStart) => {
        const monthEnd = endOfMonth(monthStart);
        return {
          id: format(monthStart, "yyyy-MM"),
          label: format(monthStart, "MMMM", { locale: ptBR }).charAt(0).toUpperCase() + format(monthStart, "MMMM", { locale: ptBR }).slice(1),
          inicio: monthStart,
          fim: monthEnd,
        };
      });
    }
  }, [intervaloDatas, periodoFiltro]);

  const labelPeriodo = useMemo(() => {
    return getLabelPeriodo(dataReferencia, periodoFiltro);
  }, [dataReferencia, periodoFiltro]);

  // Com "ver todas" ligado, a lista não fica presa à grade fixa da semana/mês/ano:
  // um dia por data que realmente tem tarefa, em ordem cronológica.
  const gruposParaExibir = useMemo((): GrupoAtividades[] => {
    if (!mostrarTodas) return gruposDoPeriodo;
    const datasUnicas = Array.from(new Set(atividadesVisiveis.map((a) => a.data_atividade))).sort();
    return datasUnicas.map((dataStr) => {
      const data = parseISO(dataStr);
      const label = format(data, "EEEE, d 'de' MMMM", { locale: ptBR });
      return {
        id: dataStr,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        inicio: data,
        fim: data,
      };
    });
  }, [mostrarTodas, gruposDoPeriodo, atividadesVisiveis]);

  useEffect(() => {
    if (!mostrarTodas) return;
    setDiasAbertos((prev) => {
      const abertos = { ...prev };
      gruposParaExibir.forEach((g) => {
        if (!(g.id in abertos)) abertos[g.id] = true;
      });
      return abertos;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarTodas, gruposParaExibir]);

  const periodoAnterior = () => {
    if (periodoFiltro === "semana") {
      setDataReferencia((prev) => subWeeks(prev, 1));
    } else if (periodoFiltro === "mes") {
      setDataReferencia((prev) => subMonths(prev, 1));
    } else {
      setDataReferencia((prev) => subYears(prev, 1));
    }
  };

  const proximoPeriodo = () => {
    if (periodoFiltro === "semana") {
      setDataReferencia((prev) => addWeeks(prev, 1));
    } else if (periodoFiltro === "mes") {
      setDataReferencia((prev) => addMonths(prev, 1));
    } else {
      setDataReferencia((prev) => addYears(prev, 1));
    }
  };

  const irParaHoje = () => {
    setDataReferencia(new Date());
  };

  const carregarChecklistResumo = async (ids: string[]) => {
    if (ids.length === 0) {
      setChecklistPorAtividade({});
      return;
    }
    const { data, error } = await supabase
      .from("subtarefas_atividade")
      .select("atividade_id, concluida")
      .in("atividade_id", ids);

    if (error) {
      console.error("Erro ao carregar resumo de checklist:", error);
      return;
    }

    const resumo: Record<string, ChecklistResumo> = {};
    (data || []).forEach((s) => {
      if (!resumo[s.atividade_id]) resumo[s.atividade_id] = { total: 0, concluidas: 0 };
      resumo[s.atividade_id].total++;
      if (s.concluida) resumo[s.atividade_id].concluidas++;
    });
    setChecklistPorAtividade(resumo);
  };

  const carregarPastas = async () => {
    let query = supabase
      .from("pastas_atividade")
      .select("id, nome, ordem")
      .eq("origem", "atividades")
      .is("deleted_at", null)
      .order("ordem", { ascending: true });
    query = clienteId ? query.eq("cliente_id", clienteId) : query.is("cliente_id", null);

    const { data, error } = await query;
    if (error) {
      console.error("Erro ao carregar pastas:", error);
      return;
    }
    setPastas(data || []);
  };

  const carregarLixeiraCount = async () => {
    let query = supabase
      .from("pastas_atividade")
      .select("id", { count: "exact", head: true })
      .not("deleted_at", "is", null);
    query = clienteId ? query.eq("cliente_id", clienteId) : query.is("cliente_id", null);

    const { count, error } = await query;
    if (error) {
      console.error("Erro ao contar lixeira:", error);
      return;
    }
    setLixeiraCount(count || 0);
  };

  const carregarColunas = async () => {
    let query = supabase.from("colunas_atividade").select("*").order("ordem", { ascending: true });
    query = clienteId ? query.eq("cliente_id", clienteId) : query.is("cliente_id", null);

    const { data, error } = await query;
    if (error) {
      console.error("Erro ao carregar colunas:", error);
      return;
    }

    if (data && data.length > 0) {
      setColunas(data);
      return;
    }

    // Primeira vez que esse cliente (ou a área pessoal) abre o quadro:
    // cria as quatro colunas padrão para não começar vazio.
    const { data: inseridas, error: erroInsert } = await supabase
      .from("colunas_atividade")
      .insert(COLUNAS_PADRAO.map((c, i) => ({ ...c, cliente_id: clienteId || null, ordem: i })))
      .select();
    if (erroInsert) {
      console.error("Erro ao criar colunas padrão:", erroInsert);
      return;
    }
    setColunas((inseridas || []).sort((a, b) => a.ordem - b.ordem));
  };

  const carregarPessoas = async () => {
    let query = supabase.from("equipe_cliente").select("nome_pessoa");
    if (clienteId) query = query.eq("cliente_id", clienteId);
    const { data, error } = await query;
    if (error) {
      console.error("Erro ao carregar equipe:", error);
      return;
    }
    setPessoasDisponiveis(Array.from(new Set((data || []).map((m) => m.nome_pessoa))).sort());
  };

  useEffect(() => {
    carregarPastas();
    carregarLixeiraCount();
    carregarColunas();
    carregarPessoas();
  }, [clienteId]);

  const gerarStatusKey = (nome: string) => {
    const base = nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "coluna";
    let key = base;
    let contador = 1;
    while (colunas.some((c) => c.status_key === key)) {
      key = `${base}_${++contador}`;
    }
    return key;
  };

  const criarColuna = async (nome: string) => {
    try {
      const { data, error } = await supabase
        .from("colunas_atividade")
        .insert({
          nome,
          status_key: gerarStatusKey(nome),
          cliente_id: clienteId || null,
          ordem: colunas.length,
        })
        .select()
        .single();

      if (error) throw error;
      if (data) setColunas((prev) => [...prev, data]);
    } catch (error) {
      console.error("Erro ao criar coluna:", error);
      toast.error("Erro ao criar coluna");
    }
  };

  const renomearColuna = async (statusKey: string, novoNome: string) => {
    try {
      const coluna = colunas.find((c) => c.status_key === statusKey);
      if (!coluna) return;
      const { error } = await supabase.from("colunas_atividade").update({ nome: novoNome }).eq("id", coluna.id);
      if (error) throw error;
      setColunas((prev) => prev.map((c) => (c.id === coluna.id ? { ...c, nome: novoNome } : c)));
    } catch (error) {
      console.error("Erro ao renomear coluna:", error);
      toast.error("Erro ao renomear coluna");
    }
  };

  const excluirColuna = async (statusKey: string) => {
    const coluna = colunas.find((c) => c.status_key === statusKey);
    if (!coluna) return;
    if (colunas.length === 1) {
      toast.error("Não é possível excluir a última coluna do quadro");
      return;
    }
    const destino = colunas.find((c) => c.status_key !== statusKey);
    const tarefasNaColuna = atividades.filter((a) => a.status === statusKey).length;
    const mensagem =
      tarefasNaColuna > 0
        ? `Excluir "${coluna.nome}" vai mover ${tarefasNaColuna} tarefa${tarefasNaColuna > 1 ? "s" : ""} para "${destino?.nome}". Continuar?`
        : `Excluir a coluna "${coluna.nome}"?`;
    if (!window.confirm(mensagem)) return;

    try {
      if (tarefasNaColuna > 0 && destino) {
        const { error: erroMover } = await supabase
          .from("atividades")
          .update({ status: destino.status_key, concluida: destino.eh_conclusao })
          .eq("status", statusKey)
          .is("deleted_at", null);
        if (erroMover) throw erroMover;
      }
      const { error } = await supabase.from("colunas_atividade").delete().eq("id", coluna.id);
      if (error) throw error;
      setColunas((prev) => prev.filter((c) => c.id !== coluna.id));
      carregarAtividades();
      toast.success("Coluna excluída");
    } catch (error) {
      console.error("Erro ao excluir coluna:", error);
      toast.error("Erro ao excluir coluna");
    }
  };

  // Contagens por pasta para a grade da Visão Geral, sem limitar pelo
  // período selecionado na lista (a visão geral é sempre do total).
  const carregarVisaoGeral = async () => {
    // A visão geral só mostra pastas de verdade; tarefas sem pasta continuam
    // acessíveis pelo chip "Sem pasta" na barra, só não entram nesta grade.
    let query = supabase
      .from("atividades")
      .select("pasta_id, concluida, data_vencimento, responsavel_nome")
      .is("deleted_at", null)
      .not("pasta_id", "is", null);
    query = clienteId ? query.eq("cliente_id", clienteId) : query.is("cliente_id", null);

    const { data, error } = await query;
    if (error) {
      console.error("Erro ao carregar visão geral:", error);
      return;
    }

    const hojeStr = format(new Date(), "yyyy-MM-dd");
    const hoje = new Date();
    const inicioSemana = startOfWeek(hoje, { weekStartsOn: 1 });
    const fimSemana = endOfWeek(hoje, { weekStartsOn: 1 });

    type Acumulado = { total: number; concluidas: number; atrasadas: number; estaSemana: number; integrantes: Set<string> };
    const porPasta: Record<string, Acumulado> = {};
    (data || []).forEach((a) => {
      const chave = a.pasta_id as string;
      porPasta[chave] ??= { total: 0, concluidas: 0, atrasadas: 0, estaSemana: 0, integrantes: new Set() };
      const grupo = porPasta[chave];
      grupo.total++;
      if (a.concluida) grupo.concluidas++;
      else if (a.data_vencimento && a.data_vencimento < hojeStr) grupo.atrasadas++;
      if (a.data_vencimento) {
        try {
          if (isWithinInterval(parseISO(a.data_vencimento), { start: inicioSemana, end: fimSemana })) {
            grupo.estaSemana++;
          }
        } catch {
          // data inválida, ignora
        }
      }
      if (a.responsavel_nome) grupo.integrantes.add(a.responsavel_nome);
    });

    const vazio: Acumulado = { total: 0, concluidas: 0, atrasadas: 0, estaSemana: 0, integrantes: new Set() };
    const resultado: GrupoResumo[] = pastas.map((p) => {
      const acumulado = porPasta[p.id] || vazio;
      return {
        id: p.id,
        nome: p.nome,
        total: acumulado.total,
        concluidas: acumulado.concluidas,
        atrasadas: acumulado.atrasadas,
        estaSemana: acumulado.estaSemana,
        integrantes: Array.from(acumulado.integrantes),
      };
    });
    setVisaoGeral(resultado);
  };

  useEffect(() => {
    carregarVisaoGeral();
  }, [pastas, clienteId]);

  const criarPasta = async (nome: string) => {
    try {
      const { data, error } = await supabase
        .from("pastas_atividade")
        .insert({ nome, cliente_id: clienteId || null, ordem: pastas.length, origem: "atividades" })
        .select()
        .single();

      if (error) throw error;

      await carregarPastas();
      if (data) setPastaAtivaId(data.id);
    } catch (error) {
      console.error("Erro ao criar pasta:", error);
      toast.error("Erro ao criar pasta");
    }
  };

  const renomearPasta = async (id: string, novoNome: string) => {
    try {
      const { error } = await supabase
        .from("pastas_atividade")
        .update({ nome: novoNome })
        .eq("id", id);

      if (error) throw error;

      setPastas((prev) => prev.map((p) => (p.id === id ? { ...p, nome: novoNome } : p)));
    } catch (error) {
      console.error("Erro ao renomear pasta:", error);
      toast.error("Erro ao renomear pasta");
    }
  };

  const solicitarExclusaoPasta = async (pasta: Pasta) => {
    const { count } = await supabase
      .from("atividades")
      .select("id", { count: "exact", head: true })
      .eq("pasta_id", pasta.id)
      .is("deleted_at", null);
    setPastaParaExcluir({ ...pasta, tarefas: count || 0 });
  };

  const confirmarExclusaoPasta = async (pastaId: string) => {
    try {
      const agora = new Date().toISOString();
      const { error: erroPasta } = await supabase
        .from("pastas_atividade")
        .update({ deleted_at: agora })
        .eq("id", pastaId);
      if (erroPasta) throw erroPasta;

      const { error: erroAtividades } = await supabase
        .from("atividades")
        .update({ deleted_at: agora })
        .eq("pasta_id", pastaId);
      if (erroAtividades) throw erroAtividades;

      toast.success("Pasta movida para a lixeira");
      setPastaParaExcluir(null);
      if (pastaAtivaId === pastaId) setPastaAtivaId(VISAO_GERAL);
      carregarPastas();
      carregarLixeiraCount();
      carregarAtividades();
    } catch (error) {
      console.error("Erro ao excluir pasta:", error);
      toast.error("Erro ao excluir pasta");
    }
  };

  const carregarAtividades = async () => {
    try {
      // O período só limita a lista, e só quando "ver todas" está desligado.
      // Quadro e calendário sempre mostram tudo: não são organizados por
      // semana, então uma tarefa não pode sumir só por mudar de data.
      const aplicarPeriodo = viewMode === "lista" && !mostrarTodas;

      let query = supabase
        .from("atividades")
        .select("*")
        .is("deleted_at", null)
        .order("data_atividade", { ascending: true })
        .order("ordem", { ascending: true });

      if (aplicarPeriodo) {
        query = query
          .gte("data_atividade", format(intervaloDatas.inicio, "yyyy-MM-dd"))
          .lte("data_atividade", format(intervaloDatas.fim, "yyyy-MM-dd"));
      }

      if (clienteId) {
        query = query.eq("cliente_id", clienteId);
      } else {
        query = query.is("cliente_id", null);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAtividades(data || []);
      carregarChecklistResumo((data || []).map((a) => a.id));
      carregarVisaoGeral();

      // Open groups that have tasks. Com "ver todas" ligado, os grupos são por
      // data real (ver gruposParaExibir) e não pela grade fixa da semana/mês/ano,
      // senão atividades antigas nunca casam com nenhum grupo e ficam escondidas
      // num accordion fechado. Também fazemos merge (não substituição) pra não
      // fechar seções que o usuário já tinha aberto.
      const gruposComTarefas: Record<string, boolean> = {};
      if (mostrarTodas) {
        (data || []).forEach((atividade) => {
          gruposComTarefas[atividade.data_atividade] = true;
        });
      } else {
        (data || []).forEach((atividade) => {
          const dataAtv = parseISO(atividade.data_atividade);
          const grupoEncontrado = gruposDoPeriodo.find((g) =>
            isWithinInterval(dataAtv, { start: g.inicio, end: g.fim })
          );
          if (grupoEncontrado) {
            gruposComTarefas[grupoEncontrado.id] = true;
          }
        });
      }
      setDiasAbertos((prev) => ({ ...prev, ...gruposComTarefas }));
    } catch (error) {
      console.error("Erro ao carregar atividades:", error);
      toast.error("Erro ao carregar atividades");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarAtividades();
  }, [clienteId, intervaloDatas, viewMode, mostrarTodas]);

  const adicionarAtividade = async (dataOverride?: Date) => {
    if (!novaAtividade.trim()) return;

    const { titulo, tempo } = parseTempoFromText(novaAtividade);
    const dataAtividade = dataOverride 
      ? format(dataOverride, "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd");

    try {
      const { error } = await supabase.from("atividades").insert({
        titulo,
        tempo_estimado: tempo,
        data_atividade: dataAtividade,
        cliente_id: clienteId || null,
        pasta_id: pastaAtivaId,
        status: "backlog",
        ordem: atividades.length + 1,
      });

      if (error) throw error;

      setNovaAtividade("");
      carregarAtividades();
      toast.success("Atividade adicionada");
    } catch (error) {
      console.error("Erro ao adicionar atividade:", error);
      toast.error("Erro ao adicionar atividade");
    }
  };

  const adicionarAtividadeNoStatus = async (status: string, tituloBruto: string) => {
    if (!tituloBruto.trim()) return;

    const { titulo, tempo } = parseTempoFromText(tituloBruto);
    const coluna = colunas.find((c) => c.status_key === status);
    const diaSemana = coluna ? detectarDiaSemana(coluna.nome) : null;

    // Preserve a coluna escolhida e agende a tarefa no dia correspondente.
    const dataAtividade =
      diaSemana !== null
        ? format(addDays(semanaReferenciaKanban.inicio, diaSemana), "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd");
    const colunaStatus = coluna;
    const statusReal = status;

    try {
      const { error } = await supabase.from("atividades").insert({
        titulo,
        tempo_estimado: tempo,
        data_atividade: dataAtividade,
        cliente_id: clienteId || null,
        pasta_id: pastaAtivaId,
        ordem: atividades.length + 1,
        status: statusReal,
        concluida: !!colunaStatus?.eh_conclusao,
      });

      if (error) throw error;

      carregarAtividades();
      toast.success("Atividade adicionada");
    } catch (error) {
      console.error("Erro ao adicionar atividade:", error);
      toast.error("Erro ao adicionar atividade");
    }
  };

  const adicionarAtividadeRapida = async (date: Date) => {
    const titulo = prompt("Nome da tarefa:");
    if (!titulo?.trim()) return;

    try {
      const { error } = await supabase.from("atividades").insert({
        titulo,
        data_atividade: format(date, "yyyy-MM-dd"),
        cliente_id: clienteId || null,
        pasta_id: pastaAtivaId,
        status: "backlog",
        ordem: atividades.length + 1,
      });

      if (error) throw error;
      carregarAtividades();
      toast.success("Atividade adicionada");
    } catch (error) {
      console.error("Erro ao adicionar atividade:", error);
      toast.error("Erro ao adicionar atividade");
    }
  };

  const toggleAtividade = async (id: string, concluida: boolean) => {
    if (concluida) {
      const resumo = checklistPorAtividade[id];
      if (resumo && resumo.total > 0 && resumo.concluidas < resumo.total) {
        toast.error("Finalize todos os itens do checklist antes de concluir a tarefa");
        return;
      }
    }

    try {
      const colunaConclusao = colunas.find((c) => c.eh_conclusao);
      const colunaReabertura = colunas.find((c) => !c.eh_conclusao) || colunas[0];
      const novoStatus = concluida
        ? colunaConclusao?.status_key || "finalizado"
        : colunaReabertura?.status_key || "backlog";
      const { error } = await supabase
        .from("atividades")
        .update({ concluida, status: novoStatus })
        .eq("id", id);

      if (error) throw error;

      setAtividades((prev) =>
        prev.map((a) => (a.id === id ? { ...a, concluida, status: novoStatus } : a))
      );
    } catch (error) {
      console.error("Erro ao atualizar atividade:", error);
      toast.error("Erro ao atualizar atividade");
    }
  };

  // Serve tanto pra iniciar do zero (timer_decorrido_segundos já em 0) quanto
  // pra retomar depois de pausar (mantém a base já acumulada).
  const iniciarTimer = async (id: string) => {
    const agora = new Date().toISOString();
    try {
      const { error } = await supabase
        .from("atividades")
        .update({ timer_iniciado_em: agora })
        .eq("id", id);
      if (error) throw error;
      setAtividades((prev) => prev.map((a) => (a.id === id ? { ...a, timer_iniciado_em: agora } : a)));
    } catch (error) {
      console.error("Erro ao iniciar timer:", error);
      toast.error("Erro ao iniciar o timer");
    }
  };

  const pausarTimer = async (id: string) => {
    const atual = atividades.find((a) => a.id === id);
    if (!atual?.timer_iniciado_em) return;
    const decorridoAgora = (Date.now() - new Date(atual.timer_iniciado_em).getTime()) / 1000;
    const novoDecorrido = Math.round((atual.timer_decorrido_segundos || 0) + decorridoAgora);
    try {
      const { error } = await supabase
        .from("atividades")
        .update({ timer_iniciado_em: null, timer_decorrido_segundos: novoDecorrido })
        .eq("id", id);
      if (error) throw error;
      setAtividades((prev) =>
        prev.map((a) => (a.id === id ? { ...a, timer_iniciado_em: null, timer_decorrido_segundos: novoDecorrido } : a))
      );
    } catch (error) {
      console.error("Erro ao pausar timer:", error);
      toast.error("Erro ao pausar o timer");
    }
  };

  const zerarTimer = async (id: string) => {
    try {
      const { error } = await supabase
        .from("atividades")
        .update({ timer_iniciado_em: null, timer_decorrido_segundos: 0 })
        .eq("id", id);
      if (error) throw error;
      setAtividades((prev) =>
        prev.map((a) => (a.id === id ? { ...a, timer_iniciado_em: null, timer_decorrido_segundos: 0 } : a))
      );
    } catch (error) {
      console.error("Erro ao zerar timer:", error);
      toast.error("Erro ao zerar o timer");
    }
  };

  // O tempo esgotou: para o timer (marcando os segundos como totalmente
  // decorridos) e abre a pergunta de finalização.
  const handleTimerFinalizado = async (id: string) => {
    const atual = atividades.find((a) => a.id === id);
    const totalDecorrido = (atual?.tempo_estimado || 0) * 60;
    try {
      const { error } = await supabase
        .from("atividades")
        .update({ timer_iniciado_em: null, timer_decorrido_segundos: totalDecorrido })
        .eq("id", id);
      if (error) throw error;
      setAtividades((prev) =>
        prev.map((a) => (a.id === id ? { ...a, timer_iniciado_em: null, timer_decorrido_segundos: totalDecorrido } : a))
      );
    } catch (error) {
      console.error("Erro ao parar timer:", error);
    }
    setTimerFinalizadoId(id);
  };

  const concluirViaTimer = async (id: string) => {
    await toggleAtividade(id, true);
    setTimerFinalizadoId(null);
    try {
      const { error } = await supabase
        .from("atividades")
        .update({ timer_iniciado_em: null, timer_decorrido_segundos: 0 })
        .eq("id", id);
      if (error) throw error;
      setAtividades((prev) =>
        prev.map((a) => (a.id === id ? { ...a, timer_iniciado_em: null, timer_decorrido_segundos: 0 } : a))
      );
    } catch (error) {
      console.error("Erro ao zerar timer após concluir:", error);
    }
  };

  // Não mexe em timer_decorrido_segundos: ao retomar, o tempo já passado
  // continua contando, só que agora contra um total maior.
  const precisaMaisTempo = async (id: string, minutosExtras: number) => {
    const atual = atividades.find((a) => a.id === id);
    if (!atual) return;
    const novoTempo = (atual.tempo_estimado || 0) + minutosExtras;
    try {
      const { error } = await supabase
        .from("atividades")
        .update({ tempo_estimado: novoTempo })
        .eq("id", id);
      if (error) throw error;
      setAtividades((prev) => prev.map((a) => (a.id === id ? { ...a, tempo_estimado: novoTempo } : a)));
      toast.success("Tempo atualizado. Clique no relógio para reiniciar o timer.");
    } catch (error) {
      console.error("Erro ao adicionar tempo:", error);
      toast.error("Erro ao adicionar tempo");
    } finally {
      setTimerFinalizadoId(null);
    }
  };

  const excluirAtividade = async (id: string) => {
    try {
      const { error } = await supabase.from("atividades").delete().eq("id", id);

      if (error) throw error;

      setAtividades((prev) => prev.filter((a) => a.id !== id));
      toast.success("Atividade excluída");
    } catch (error) {
      console.error("Erro ao excluir atividade:", error);
      toast.error("Erro ao excluir atividade");
    }
  };

  const getAtividadesDoDia = (dataStr: string) => {
    return atividadesVisiveis
      .filter((a) => a.data_atividade === dataStr)
      .sort((a, b) => a.ordem - b.ordem);
  };

  const getAtividadesDoGrupo = (grupo: GrupoAtividades) => {
    return atividadesVisiveis
      .filter((a) => {
        const dataAtv = parseISO(a.data_atividade);
        return isWithinInterval(dataAtv, { start: grupo.inicio, end: grupo.fim });
      })
      .sort((a, b) => {
        // Sort by date first, then by order
        if (a.data_atividade !== b.data_atividade) {
          return a.data_atividade.localeCompare(b.data_atividade);
        }
        return a.ordem - b.ordem;
      });
  };

  const toggleDia = (dataKey: string) => {
    setDiasAbertos((prev) => ({
      ...prev,
      [dataKey]: !prev[dataKey],
    }));
  };

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;

    // Same position
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const sourceData = source.droppableId;
    const destData = destination.droppableId;

    // Find the activity
    const atividade = atividades.find((a) => a.id === draggableId);
    if (!atividade) return;

    // Soltar em cima de uma pasta na barra: só muda a pasta, mantém
    // status/data/ordem exatamente como estavam.
    if (destData.startsWith("folder-")) {
      const novaPastaId = destData === "folder-null" ? null : destData.slice("folder-".length);
      if (novaPastaId === atividade.pasta_id) return;

      setAtividades((prev) =>
        prev.map((a) => (a.id === draggableId ? { ...a, pasta_id: novaPastaId } : a))
      );

      try {
        const { error } = await supabase
          .from("atividades")
          .update({ pasta_id: novaPastaId })
          .eq("id", draggableId);
        if (error) throw error;

        const nomePasta = novaPastaId ? pastas.find((p) => p.id === novaPastaId)?.nome : null;
        toast.success(nomePasta ? `Movido para "${nomePasta}"` : "Removido da pasta");
      } catch (error) {
        console.error("Erro ao mover para a pasta:", error);
        toast.error("Erro ao mover para a pasta");
        carregarAtividades();
      }
      return;
    }

    // Check if dragging between status columns (Kanban mode)
    const statusOptions = colunas.map((c) => c.status_key);
    const isKanbanDrag = statusOptions.includes(sourceData) || statusOptions.includes(destData);

    if (isKanbanDrag) {
      const colunaDestino = colunas.find((c) => c.status_key === destData);
      const diaSemanaDestino = colunaDestino ? detectarDiaSemana(colunaDestino.nome) : null;

      // Coluna nomeada como dia da semana: mantém data e coluna sincronizadas.
      if (diaSemanaDestino !== null) {
        const novaData = format(addDays(semanaReferenciaKanban.inicio, diaSemanaDestino), "yyyy-MM-dd");
        setAtividades((prev) =>
          prev.map((a) => (a.id === draggableId ? { ...a, data_atividade: novaData, status: destData } : a))
        );
        try {
          const { error } = await supabase
            .from("atividades")
            .update({ data_atividade: novaData, status: destData })
            .eq("id", draggableId);
          if (error) throw error;
        } catch (error) {
          console.error("Erro ao mover atividade:", error);
          toast.error("Erro ao mover atividade");
          carregarAtividades();
        }
        return;
      }

      // Não deixa finalizar com checklist pendente. Não atualiza nada:
      // o card volta sozinho para a coluna de origem no próximo render.
      if (colunaDestino?.eh_conclusao) {
        const resumo = checklistPorAtividade[draggableId];
        if (resumo && resumo.total > 0 && resumo.concluidas < resumo.total) {
          toast.error("Finalize todos os itens do checklist antes de concluir a tarefa");
          return;
        }
      }

      // Reordena as colunas afetadas (origem e destino, ou só uma quando o
      // arrasto é dentro da mesma coluna) e recalcula a "ordem" de cada
      // card. Sem isso, mover um card pra outra posição na mesma coluna não
      // persistia nada, porque o status de origem e destino é igual.
      // Usa a mesma lista que está renderizada nas colunas (atividadesKanban,
      // já filtrada por período/concluídas) — senão os índices do drag não
      // batem com a posição real dos cards na tela.
      const colunaOrigemAntes = atividadesKanban
        .filter((a) => a.status === sourceData)
        .sort((a, b) => a.ordem - b.ordem);
      const colunaDestinoAntes =
        sourceData === destData
          ? colunaOrigemAntes
          : atividadesKanban.filter((a) => a.status === destData).sort((a, b) => a.ordem - b.ordem);

      const [removida] = colunaOrigemAntes.splice(source.index, 1);
      const atividadeMovida = {
        ...removida,
        status: destData,
        concluida: !!colunaDestino?.eh_conclusao,
      };

      if (sourceData === destData) {
        colunaOrigemAntes.splice(destination.index, 0, atividadeMovida);
      } else {
        colunaDestinoAntes.splice(destination.index, 0, atividadeMovida);
      }

      const listasAfetadas =
        sourceData === destData ? [colunaOrigemAntes] : [colunaOrigemAntes, colunaDestinoAntes];
      const novaOrdem = new Map<string, number>();
      listasAfetadas.forEach((lista) => lista.forEach((a, i) => novaOrdem.set(a.id, i + 1)));

      setAtividades((prev) =>
        prev.map((a) => {
          if (a.id === draggableId) {
            return {
              ...a,
              status: destData,
              concluida: !!colunaDestino?.eh_conclusao,
              ordem: novaOrdem.get(a.id) ?? a.ordem,
            };
          }
          const ordem = novaOrdem.get(a.id);
          return ordem !== undefined ? { ...a, ordem } : a;
        })
      );

      try {
        const { error } = await supabase
          .from("atividades")
          .update({
            status: destData,
            concluida: !!colunaDestino?.eh_conclusao,
            ordem: novaOrdem.get(draggableId),
          })
          .eq("id", draggableId);

        if (error) throw error;

        for (const [id, ordem] of novaOrdem) {
          if (id === draggableId) continue;
          await supabase.from("atividades").update({ ordem }).eq("id", id);
        }
      } catch (error) {
        console.error("Erro ao mover atividade:", error);
        toast.error("Erro ao mover atividade");
        carregarAtividades();
      }
      return;
    }

    // List mode drag - between days. Recalcula a "ordem" de todo mundo
    // afetado (origem e destino) e já reflete isso no estado local — antes
    // só a tarefa arrastada tinha a ordem atualizada na tela, então dava
    // empate de ordem com quem ficou no lugar e o card parecia voltar pra
    // onde estava até a próxima recarga da página.
    const listaOrigemAntes = getAtividadesDoDia(sourceData);
    const listaDestinoAntes = sourceData === destData ? listaOrigemAntes : getAtividadesDoDia(destData);

    const [removida] = listaOrigemAntes.splice(source.index, 1);
    const atividadeMovida = { ...removida, data_atividade: destData };

    if (sourceData === destData) {
      listaOrigemAntes.splice(destination.index, 0, atividadeMovida);
    } else {
      listaDestinoAntes.splice(destination.index, 0, atividadeMovida);
    }

    const listasAfetadas = sourceData === destData ? [listaOrigemAntes] : [listaOrigemAntes, listaDestinoAntes];
    const novaOrdem = new Map<string, number>();
    listasAfetadas.forEach((lista) => lista.forEach((a, i) => novaOrdem.set(a.id, i + 1)));

    setAtividades((prev) =>
      prev.map((a) => {
        if (a.id === draggableId) {
          return { ...a, data_atividade: destData, ordem: novaOrdem.get(a.id) ?? a.ordem };
        }
        const ordem = novaOrdem.get(a.id);
        return ordem !== undefined ? { ...a, ordem } : a;
      })
    );

    // Update in database
    try {
      const { error } = await supabase
        .from("atividades")
        .update({
          data_atividade: destData,
          ordem: novaOrdem.get(draggableId),
        })
        .eq("id", draggableId);

      if (error) throw error;

      for (const [id, ordem] of novaOrdem) {
        if (id === draggableId) continue;
        await supabase.from("atividades").update({ ordem }).eq("id", id);
      }
    } catch (error) {
      console.error("Erro ao mover atividade:", error);
      toast.error("Erro ao mover atividade");
      carregarAtividades(); // Revert on error
    }
  };

  const openAtividadeDetail = (id: string) => {
    const atv = atividades.find((a) => a.id === id);
    if (atv) {
      setSelectedAtividade(atv);
      setPanelOpen(true);
    }
  };

  // Permite chegar direto numa tarefa específica via ?atividade=<id> (usado
  // pelos links inseridos nas Notas). Busca direto no banco porque a tarefa
  // pode estar fora da pasta/período visíveis agora.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const alvo = searchParams.get("atividade");
    if (!alvo) return;
    supabase
      .from("atividades")
      .select("*")
      .eq("id", alvo)
      .is("deleted_at", null)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Erro ao abrir tarefa:", error);
          return;
        }
        if (data) {
          setSelectedAtividade(data);
          setPanelOpen(true);
        } else {
          toast.error("Tarefa não encontrada ou sem acesso");
        }
        setSearchParams({}, { replace: true });
      });
  }, [searchParams]);


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground">Carregando atividades...</span>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bike className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide">
            Atividades
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle - só faz sentido dentro de uma pasta, não na visão geral */}
          {pastaAtivaId !== VISAO_GERAL && (
            <div className="flex items-center bg-muted rounded-lg p-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("lista")}
                className={cn(
                  "h-7 px-2.5 rounded-md",
                  viewMode === "lista" && "bg-background shadow-sm"
                )}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("quadro")}
                className={cn(
                  "h-7 px-2.5 rounded-md",
                  viewMode === "quadro" && "bg-background shadow-sm"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("calendario")}
                className={cn(
                  "h-7 px-2.5 rounded-md",
                  viewMode === "calendario" && "bg-background shadow-sm"
                )}
              >
                <CalendarIcon className="h-4 w-4" />
              </Button>
              {/* Notas: só faz sentido na área pessoal, não dentro de um cliente */}
              {!clienteId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("notas")}
                  className={cn(
                    "h-7 px-2.5 rounded-md",
                    viewMode === "notas" && "bg-background shadow-sm"
                  )}
                  title="Notas"
                >
                  <NotebookText className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          {/* Filtro de responsáveis */}
          {pastaAtivaId !== VISAO_GERAL && viewMode !== "notas" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  Pessoas
                  {pessoasSelecionadas.size > 0 && ` (${pessoasSelecionadas.size})`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="end">
                <div className="flex items-center justify-between px-2 pb-2">
                  <p className="text-xs text-muted-foreground">Mostrar tarefas de</p>
                  {pessoasSelecionadas.size > 0 && (
                    <button
                      onClick={() => setPessoasSelecionadas(new Set())}
                      className="text-xs text-primary hover:underline"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto scrollbar-thin space-y-0.5">
                  {[...rosterPessoas, "Sem responsável"].map((nome) => (
                    <label
                      key={nome}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={pessoasSelecionadas.has(nome)}
                        onCheckedChange={() =>
                          setPessoasSelecionadas((prev) => {
                            const novo = new Set(prev);
                            if (novo.has(nome)) novo.delete(nome);
                            else novo.add(nome);
                            return novo;
                          })
                        }
                      />
                      <Avatar className="h-5 w-5 flex-shrink-0">
                        <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
                          {nome === "Sem responsável" ? "?" : iniciais(nome)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">{nome}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
          <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Pastas */}
      <PastasBar
        pastas={pastas}
        pastaAtivaId={pastaAtivaId}
        onSelect={setPastaAtivaId}
        onCreate={criarPasta}
        onRename={renomearPasta}
        onRequestDelete={solicitarExclusaoPasta}
        lixeiraCount={lixeiraCount}
        onOpenLixeira={() => setLixeiraAberta(true)}
      />

      {/* Add task input - só na lista; quadro e calendário já têm o próprio jeito de adicionar */}
      {pastaAtivaId !== VISAO_GERAL && viewMode === "lista" && (
        <div className="relative">
          <Plus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={novaAtividade}
            onChange={(e) => setNovaAtividade(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                adicionarAtividade();
              }
            }}
            placeholder={
              pastaAtivaId
                ? `Adicionar tarefa em "${pastas.find((p) => p.id === pastaAtivaId)?.nome}"`
                : "Adicionar tarefa (ex: Criar conteúdo 2h)"
            }
            className="pl-9 bg-muted/50 border-muted"
          />
        </div>
      )}

      {/* Period Filter - Only in list mode */}
      {pastaAtivaId !== VISAO_GERAL && viewMode === "lista" && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className={cn("flex items-center gap-1", mostrarTodas && "opacity-50 pointer-events-none")}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={periodoAnterior}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select
              value={periodoFiltro}
              onValueChange={(value: PeriodoFiltro) => setPeriodoFiltro(value)}
            >
              <SelectTrigger className="w-[130px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semana">Esta Semana</SelectItem>
                <SelectItem value="mes">Este Mês</SelectItem>
                <SelectItem value="ano">Este Ano</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={proximoPeriodo}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={irParaHoje}
            disabled={mostrarTodas}
          >
            Hoje
          </Button>
          <span className={cn("text-sm text-muted-foreground capitalize", mostrarTodas && "opacity-50")}>
            {labelPeriodo}
          </span>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer ml-auto">
            <Checkbox checked={mostrarTodas} onCheckedChange={(v) => setMostrarTodas(!!v)} />
            Ver todas as atividades
          </label>
        </div>
      )}

      {/* View Content */}
      {pastaAtivaId === VISAO_GERAL ? (
        <VisaoGeralGrupos grupos={visaoGeral} onSelect={setPastaAtivaId} />
      ) : (
        <>
          {viewMode === "lista" && (
            <div className="space-y-1">
              {gruposParaExibir.map((grupo) => {
                const atividadesDoGrupo = getAtividadesDoGrupo(grupo);
                const contagem = atividadesDoGrupo.length;
                const tempoTotal = atividadesDoGrupo.reduce((acc, a) => acc + (a.tempo_estimado || 0), 0);
                const isToday = mostrarTodas
                  ? isSameDay(grupo.inicio, new Date())
                  : periodoFiltro === "semana" && isSameDay(grupo.inicio, new Date());

                return (
                  <DiaSection
                    key={grupo.id}
                    dia={grupo.label}
                    contagem={contagem}
                    tempoTotal={tempoTotal}
                    isOpen={diasAbertos[grupo.id] || false}
                    onToggle={() => toggleDia(grupo.id)}
                    isToday={isToday}
                  >
                    <Droppable droppableId={grupo.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`min-h-[2px] rounded transition-colors ${
                            snapshot.isDraggingOver ? "bg-primary/10" : ""
                          }`}
                        >
                          {atividadesDoGrupo.map((atividade, index) => (
                            <Draggable
                              key={atividade.id}
                              draggableId={atividade.id}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`${
                                    snapshot.isDragging ? "opacity-90 shadow-lg" : ""
                                  }`}
                                >
                                  <AtividadeItem
                                    id={atividade.id}
                                    titulo={atividade.titulo}
                                    concluida={atividade.concluida}
                                    tempoEstimado={atividade.tempo_estimado || undefined}
                                    temDescricao={!!atividade.descricao}
                                    destaque={atividade.destaque}
                                    status={atividade.status}
                                    statusLabel={colunas.find((c) => c.status_key === atividade.status)?.nome}
                                    prioridade={atividade.prioridade}
                                    dataVencimento={atividade.data_vencimento}
                                    responsavelNome={atividade.responsavel_nome}
                                    checklist={checklistPorAtividade[atividade.id]}
                                    onToggle={toggleAtividade}
                                    onClick={openAtividadeDetail}
                                    onDelete={excluirAtividade}
                                    dragHandleProps={provided.dragHandleProps}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DiaSection>
                );
              })}
            </div>
          )}

          {viewMode === "quadro" && (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center bg-muted rounded-lg p-0.5">
                  {([
                    ["todas", "Todas"],
                    ["semana", "Esta semana"],
                    ["proxima_semana", "Semana que vem"],
                  ] as const).map(([valor, label]) => (
                    <button
                      key={valor}
                      onClick={() => setKanbanPeriodo(valor)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        kanbanPeriodo === valor
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer ml-auto">
                  <Checkbox checked={mostrarConcluidas} onCheckedChange={(v) => setMostrarConcluidas(!!v)} />
                  Ver concluídas
                </label>
              </div>

              <KanbanBoard
                atividades={atividadesKanban}
                colunas={colunas}
                semanaInicio={semanaReferenciaKanban.inicio}
                kanbanPeriodo={kanbanPeriodo}
                checklistPorAtividade={checklistPorAtividade}
                onCardClick={openAtividadeDetail}
                onAddCard={adicionarAtividadeNoStatus}
                onRenameColuna={renomearColuna}
                onDeleteColuna={excluirColuna}
                onCreateColuna={criarColuna}
                onToggleConcluida={toggleAtividade}
                onIniciarTimer={iniciarTimer}
                onPausarTimer={pausarTimer}
                onZerarTimer={zerarTimer}
                onTimerFinalizado={handleTimerFinalizado}
              />
            </>
          )}

          {viewMode === "calendario" && (
            <CalendarView
              atividades={atividadesVisiveis}
              onTaskClick={openAtividadeDetail}
              onAddTask={adicionarAtividadeRapida}
            />
          )}

          {viewMode === "notas" && <NotasPessoais />}
        </>
      )}

      {pastaAtivaId !== VISAO_GERAL && viewMode !== "notas" && (
        <LousaAtividades key={`${clienteId || "pessoal"}:${pastaAtivaId || "sem-pasta"}`} clienteId={clienteId} pastaId={pastaAtivaId} pastaNome={pastas.find(pasta => pasta.id === pastaAtivaId)?.nome} />
      )}

      {/* Detail Panel */}
      <AtividadeDetailPanel
        open={panelOpen}
        onClose={() => {
          setPanelOpen(false);
          setSelectedAtividade(null);
        }}
        atividade={selectedAtividade}
        colunas={colunas}
        onUpdate={carregarAtividades}
        onDelete={excluirAtividade}
      />

      <ExcluirPastaDialog
        pasta={pastaParaExcluir}
        tarefasCount={pastaParaExcluir?.tarefas || 0}
        onClose={() => setPastaParaExcluir(null)}
        onConfirm={confirmarExclusaoPasta}
      />

      <LixeiraPastasDialog
        open={lixeiraAberta}
        onClose={() => setLixeiraAberta(false)}
        clienteId={clienteId}
        onRestaurar={() => {
          carregarPastas();
          carregarLixeiraCount();
          carregarAtividades();
        }}
      />

      <TimerFinalizarDialog
        atividade={atividades.find((a) => a.id === timerFinalizadoId) || null}
        onClose={() => setTimerFinalizadoId(null)}
        onConcluir={concluirViaTimer}
        onPrecisaMaisTempo={precisaMaisTempo}
      />
    </div>
    </DragDropContext>
  );
};
