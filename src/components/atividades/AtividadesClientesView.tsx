import { cn } from "@/lib/utils";
import { comConclusaoDaEquipe } from "@/lib/atividades/concluidaEquipe";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRecarregarAoVoltar } from "@/hooks/useRecarregarAoVoltar";
import { useAuth } from "@/auth/AuthProvider";
import { acessoProprietario, resolverAcesso } from "@/lib/equipe";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { List, Map as MapaIcone, Plus, Users } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { iniciais } from "@/lib/utils";
import { DiaSection } from "./DiaSection";
import { AtividadeItem } from "./AtividadeItem";
import { AtividadeDetailPanel } from "./AtividadeDetailPanel";
import { AtividadesView } from "./AtividadesView";
import { MapaAtividades } from "./MapaAtividades";
import { TimerFinalizarDialog } from "./TimerFinalizarDialog";
import { criarAtividade as criarAtividadeService, lerPastaAtivaSalva } from "@/lib/atividades/criarAtividade";
import { filtrarPorResponsavel, type FiltroResponsavel } from "@/lib/atividades/filtroResponsavel";
import { useIdentidadeResponsavel } from "@/hooks/useIdentidadeResponsavel";

// Guarda qual(is) cliente(s) estavam selecionados no filtro, pra voltar
// exatamente de onde parou ao reabrir a aba.
const CHAVE_FILTRO = "atividades-clientes:filtro";
const REGRA_REPETIR: Record<string, string> = { diario: "todo dia", dias_uteis: "dias úteis", semanal: "toda semana", dias: "dias escolhidos" };
// Último modo usado na visão de todos os clientes (lista ou mapa).
const CHAVE_MODO = "atividades-clientes:modo";

interface ClienteInfo {
  id: string;
  nome: string;
}

interface Atividade {
  id: string;
  alarme_em?: string | null;
  user_id: string | null;
  cliente_id: string;
  titulo: string;
  descricao: string | null;
  concluida: boolean;
  tempo_estimado: number | null;
  data_atividade: string;
  ordem: number;
  destaque: boolean;
  status: string;
  prioridade: string;
  data_vencimento: string | null;
  data_inicio: string | null;
  responsavel_nome: string | null;
  pasta_id?: string | null;
  timer_iniciado_em?: string | null;
  timer_decorrido_segundos?: number | null;
}

interface Coluna {
  id: string;
  nome: string;
  status_key: string;
  ordem: number;
  eh_conclusao: boolean;
  cliente_id: string;
}

interface ChecklistResumo {
  total: number;
  concluidas: number;
}

// Visão que junta as atividades de todos os clientes que o usuário tem
// acesso, sem precisar entrar em cada um: tudo aqui é a mesma tarefa que
// aparece dentro do cliente (mesma tabela), só reorganizada por cliente.
export const AtividadesClientesView = ({ filtroResponsavel = "todas" }: { filtroResponsavel?: FiltroResponsavel }) => {
  const { user } = useAuth();
  const meusNomes = useIdentidadeResponsavel();
  const [clientes, setClientes] = useState<ClienteInfo[]>([]);
  const [carregandoClientes, setCarregandoClientes] = useState(true);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [colunasPorCliente, setColunasPorCliente] = useState<Record<string, Coluna[]>>({});
  const [checklistPorAtividade, setChecklistPorAtividade] = useState<Record<string, ChecklistResumo>>({});
  const [loading, setLoading] = useState(true);
  const [selectedClienteIds, setSelectedClienteIds] = useState<Set<string>>(new Set());
  // Concluídas ficam escondidas por padrão — só aparecem se a pessoa marcar
  // "Ver concluídas" explicitamente.
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);
  const [modo, setModo] = useState<"lista" | "mapa">(() => {
    try { return localStorage.getItem(CHAVE_MODO) === "mapa" ? "mapa" : "lista"; } catch { return "lista"; }
  });
  const escolherModo = (novo: "lista" | "mapa") => {
    setModo(novo);
    try { localStorage.setItem(CHAVE_MODO, novo); } catch { /* sem storage */ }
  };
  const [diasAbertos, setDiasAbertos] = useState<Record<string, boolean>>({});
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoClienteId, setNovoClienteId] = useState("");
  const [selectedAtividade, setSelectedAtividade] = useState<Atividade | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Só entram nesta lista os clientes onde o usuário (dono ou membro da
  // equipe) tem permissão de acessar Atividades — a mesma checagem que
  // libera a aba "Atividades" dentro do cliente.
  const carregarClientesPermitidos = async () => {
    setCarregandoClientes(true);
    try {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome_especialista, user_id")
        .eq("arquivado", false)
        .order("nome_especialista", { ascending: true });
      if (error) throw error;

      const resolvidos = await Promise.all(
        (data || []).map(async (c) => {
          const dono = acessoProprietario(c.user_id, user?.id);
          if (dono) return { id: c.id, nome: c.nome_especialista, podeAcessar: true };
          try {
            const { data: permData, error: permErro } = await supabase.rpc("team_access", { target: c.id });
            if (permErro) throw permErro;
            const acesso = resolverAcesso(c.user_id, user?.id, permData);
            return { id: c.id, nome: c.nome_especialista, podeAcessar: !!acesso?.permissoes.atividades.acessar };
          } catch {
            return { id: c.id, nome: c.nome_especialista, podeAcessar: false };
          }
        })
      );

      setClientes(resolvidos.filter((c) => c.podeAcessar).map(({ id, nome }) => ({ id, nome })));
    } catch (error) {
      console.error("Erro ao carregar clientes:", error);
      toast.error("Erro ao carregar clientes");
    } finally {
      setCarregandoClientes(false);
    }
  };

  useEffect(() => {
    carregarClientesPermitidos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Restaura o filtro salvo assim que a lista de clientes permitidos chega
  // (só mantém ids que ainda são válidos/acessíveis).
  useEffect(() => {
    if (carregandoClientes) return;
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_FILTRO) || "[]") as string[];
      const validos = salvo.filter((id) => clientes.some((c) => c.id === id));
      if (validos.length > 0) setSelectedClienteIds(new Set(validos));
    } catch {
      // localStorage indisponível ou corrompido: segue mostrando todos
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregandoClientes]);

  useEffect(() => {
    if (carregandoClientes) return;
    localStorage.setItem(CHAVE_FILTRO, JSON.stringify(Array.from(selectedClienteIds)));
  }, [selectedClienteIds, carregandoClientes]);

  const carregarChecklist = async (ids: string[]) => {
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

  // "Carregando…" só na primeira vez; depois recarrega por trás (20/10, Davi: "dou o check num card,
  // tudo some e depois volta" — o realtime do próprio check recarregava apagando a tela).
  const jaCarregou = useRef(false);
  const carregarDados = async () => {
    if (clientes.length === 0) {
      setAtividades([]);
      setColunasPorCliente({});
      setLoading(false);
      return;
    }
    if (!jaCarregou.current) setLoading(true);
    try {
      const ids = clientes.map((c) => c.id);
      const [ativRes, colRes] = await Promise.all([
        supabase
          .from("atividades")
          .select("*")
          .in("cliente_id", ids)
          .is("deleted_at", null)
          .order("data_atividade", { ascending: true })
          .order("ordem", { ascending: true }),
        supabase.from("colunas_atividade").select("*").in("cliente_id", ids).order("ordem", { ascending: true }),
      ]);
      if (ativRes.error) throw ativRes.error;
      if (colRes.error) throw colRes.error;

      setAtividades(comConclusaoDaEquipe(ativRes.data || []));

      const porCliente: Record<string, Coluna[]> = {};
      (colRes.data || []).forEach((c) => {
        (porCliente[c.cliente_id] ??= []).push(c);
      });
      setColunasPorCliente(porCliente);

      await carregarChecklist((ativRes.data || []).map((a) => a.id));
    } catch (error) {
      console.error("Erro ao carregar atividades dos clientes:", error);
      toast.error("Erro ao carregar atividades dos clientes");
    } finally {
      jaCarregou.current = true;
      setLoading(false);
    }
  };
  // Vários avisos em sequência (o check, a cópia da tarefa que repete, a coluna…) viram uma recarga só.
  // O realtime é registrado uma vez só (quando a tela abre): chamava a carregarDados DAQUELE momento,
  // com a lista de projetos ainda vazia — e zerava a tela a cada check até outra recarga trazer de volta
  // (20/10, Davi: "tudo some e depois volta"). Pela ref, sempre a versão atual.
  const carregarRef = useRef(carregarDados);
  carregarRef.current = carregarDados;
  const recargaAgendada = useRef<number | undefined>(undefined);
  const recarregarLogo = () => {
    window.clearTimeout(recargaAgendada.current);
    recargaAgendada.current = window.setTimeout(() => void carregarRef.current(), 400);
  };

  useEffect(() => {
    carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes]);

  // Volta pra esta tela (troca de aba / volta pro app) ou abre o Mapa: busca
  // de novo, pra aparecer o que foi criado dentro de um projeto, pelo Atlas
  // ou em outra aba — sem depender só do realtime.
  const raizRef = useRef<HTMLDivElement>(null);
  useRecarregarAoVoltar(raizRef, () => void carregarDados());
  useEffect(() => {
    if (modo === "mapa") void carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  // Mesmo motivo/padrão de AtividadesView.tsx: essa lista só carregava sob
  // demanda, então uma atividade criada pelo Assistant/Jarvis (widget ou
  // extensão) ou por outra aba nunca aparecia aqui sem recarregar a
  // página. Realtime (fonte oficial) + BroadcastChannel (atalho entre abas
  // do mesmo navegador), sempre refazendo a MESMA busca já existente.
  useEffect(() => {
    if (!user?.id) return;
    const canal = supabase
      .channel(`atividades-clientes-view-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "atividades", filter: `user_id=eq.${user.id}` },
        () => recarregarLogo(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "colunas_atividade", filter: `user_id=eq.${user.id}` },
        () => recarregarLogo(),
      )
      .subscribe();

    let broadcast: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      broadcast = new BroadcastChannel("assistant-sync");
      broadcast.onmessage = () => recarregarLogo();
    }

    return () => {
      supabase.removeChannel(canal);
      broadcast?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Se o filtro estiver travado num único cliente, a criação de tarefa já
  // parte pra ele — evita ter que escolher de novo toda hora.
  useEffect(() => {
    if (selectedClienteIds.size === 1) {
      setNovoClienteId(Array.from(selectedClienteIds)[0]);
    }
  }, [selectedClienteIds]);

  const atividadesFiltradas = useMemo(() => {
    let lista = atividades;
    if (selectedClienteIds.size > 0) {
      lista = lista.filter((a) => selectedClienteIds.has(a.cliente_id));
    }
    if (!mostrarConcluidas) {
      lista = lista.filter((a) => !a.concluida);
    }
    return filtrarPorResponsavel(lista, filtroResponsavel, meusNomes, user?.id);
  }, [atividades, selectedClienteIds, mostrarConcluidas, filtroResponsavel, meusNomes, user?.id]);

  // Mapa: filtro por pessoa e por pasta (19/10: "todas as funções do modo atividade normal").
  const [filtroPessoa, setFiltroPessoa] = useState("todas");
  // 20/10 (Davi: "mais um filtro, tirar os colaboradores, senão tem coisa demais"): só as minhas e as sem dono.
  const [semEquipe, setSemEquipeEstado] = useState(() => { try { return localStorage.getItem("atividades-clientes:sem-equipe") === "1"; } catch { return false; } });
  const setSemEquipe = (v: boolean) => { setSemEquipeEstado(v); try { localStorage.setItem("atividades-clientes:sem-equipe", v ? "1" : "0"); } catch { /* sem storage */ } };
  const [filtroPasta, setFiltroPasta] = useState("todas");
  const [pastas, setPastas] = useState<{ id: string; nome: string; cliente_id: string | null }[]>([]);
  useEffect(() => {
    if (modo !== "mapa" || clientes.length === 0) return;
    void supabase.from("pastas_atividade").select("id, nome, cliente_id").in("cliente_id", clientes.map((c) => c.id))
      .eq("origem", "atividades").is("deleted_at", null).order("ordem")
      .then(({ data }) => setPastas((data ?? []) as { id: string; nome: string; cliente_id: string | null }[]));
  }, [modo, clientes]);
  const pessoasNoMapa = useMemo(() => Array.from(new Set(atividadesFiltradas.flatMap((a) => (a.responsavel_nome || "")
    .split(",").map((n) => n.trim()).filter(Boolean)))).sort((x, y) => x.localeCompare(y)), [atividadesFiltradas]);
  const atividadesDoMapa = useMemo(() => atividadesFiltradas
    .filter((a) => filtroPessoa === "todas" || (filtroPessoa === "ninguem"
      ? !(a.responsavel_nome || "").trim()
      : (a.responsavel_nome || "").split(",").map((n) => n.trim()).includes(filtroPessoa)))
    .filter((a) => filtroPasta === "todas" || a.pasta_id === filtroPasta)
    .filter((a) => {
      if (!semEquipe) return true;
      const nomes = (a.responsavel_nome || "").split(",").map((n) => n.trim().toLowerCase()).filter(Boolean);
      return !nomes.length || nomes.some((n) => meusNomes.some((m) => m.toLowerCase() === n));
    }), [atividadesFiltradas, filtroPessoa, filtroPasta, semEquipe, meusNomes]);
  const nomeCliente = (id: string | null) => clientes.find((c) => c.id === id)?.nome ?? "";

  // Sem filtro: só mostra cliente que realmente tem tarefa (senão a lista
  // fica enorme com grupo vazio pra cada cliente cadastrado). Com filtro
  // aplicado, mostra o(s) cliente(s) escolhido(s) mesmo sem tarefas, pra
  // confirmar que o filtro funcionou.
  const clientesParaExibir = useMemo(() => {
    if (selectedClienteIds.size > 0) {
      return clientes.filter((c) => selectedClienteIds.has(c.id));
    }
    return clientes.filter((c) => atividadesFiltradas.some((a) => a.cliente_id === c.id));
  }, [clientes, selectedClienteIds, atividadesFiltradas]);

  const atividadesDoCliente = (clienteId: string) =>
    atividadesFiltradas.filter((a) => a.cliente_id === clienteId).sort((a, b) => a.ordem - b.ordem);

  // Com exatamente 1 cliente no filtro, mostramos a aba Atividades de
  // verdade daquele cliente (lista/quadro/calendário, com o mesmo quadro e
  // a mesma memória de último modo usado que existe ao entrar nele) em vez
  // da lista agregada — só faz sentido "quadro" com um cliente por vez,
  // porque cada um tem suas próprias colunas.
  const clienteFiltradoUnico = useMemo(() => {
    if (selectedClienteIds.size !== 1) return null;
    const id = Array.from(selectedClienteIds)[0];
    return clientes.find((c) => c.id === id) || null;
  }, [selectedClienteIds, clientes]);

  // Evita reabrir o painel de detalhe (da lista agregada) por cima da view
  // do cliente único ao trocar o filtro.
  useEffect(() => {
    setPanelOpen(false);
    setSelectedAtividade(null);
  }, [clienteFiltradoUnico?.id, modo]);

  const toggleAtividade = async (id: string, concluida: boolean) => {
    const atual = atividades.find((a) => a.id === id);
    if (!atual) return;
    if (concluida) {
      const resumo = checklistPorAtividade[id];
      if (resumo && resumo.total > 0 && resumo.concluidas < resumo.total) {
        toast.error("Finalize todos os itens do checklist antes de concluir a tarefa");
        return;
      }
    }
    const colunas = colunasPorCliente[atual.cliente_id] || [];
    const colunaConclusao = colunas.find((c) => c.eh_conclusao);
    const colunaReabertura = colunas.find((c) => !c.eh_conclusao) || colunas[0];
    const novoStatus = concluida
      ? colunaConclusao?.status_key || atual.status
      : colunaReabertura?.status_key || atual.status;

    try {
      const { error } = await supabase.from("atividades").update({ concluida, status: novoStatus }).eq("id", id);
      if (error) throw error;
      setAtividades((prev) => prev.map((a) => (a.id === id ? { ...a, concluida, status: novoStatus } : a)));
      // Tarefa que repete: o banco já cria a próxima (20/10, Davi: "dou check, some e volta a mesma").
      const regra = (atual as { repetir?: string | null }).repetir;
      if (concluida && regra) {
        toast.success(regra === "semanal" ? "Feita! Ela se repete: a da semana que vem já está na mesma coluna."
          : `Feita! Ela se repete (${REGRA_REPETIR[regra] ?? "regra própria"}): a próxima já foi criada.`);
      }
    } catch (error) {
      console.error("Erro ao atualizar atividade:", error);
      toast.error("Erro ao atualizar atividade");
    }
  };

  // Mapa: card solto em outra coluna do mesmo projeto muda o status (e
  // conclui/reabre se a coluna for/deixar de ser a de conclusão).
  // Mapa: muda de coluna e/ou de posição (19/10, Davi: "mover os cards, mudar a ordem").
  const moverNoMapa = async (atividade: Atividade, coluna: Coluna | { status_key: string; eh_conclusao: boolean }, indice: number) => {
    if (coluna.eh_conclusao && !atividade.concluida) {
      const resumo = checklistPorAtividade[atividade.id];
      if (resumo && resumo.total > 0 && resumo.concluidas < resumo.total) {
        toast.error("Finalize todos os itens do checklist antes de concluir a tarefa");
        return;
      }
    }
    // A coluna de destino em ordem, sem o card que está andando; ele entra na posição pedida.
    const destino = atividades
      .filter((a) => a.cliente_id === atividade.cliente_id && a.status === coluna.status_key && a.id !== atividade.id)
      .sort((x, y) => x.ordem - y.ordem);
    destino.splice(Math.max(0, Math.min(indice, destino.length)), 0, { ...atividade, status: coluna.status_key });
    const novasOrdens = new Map(destino.map((a, i) => [a.id, i + 1]));
    const mudouColuna = atividade.status !== coluna.status_key;
    const anterior = atividades;
    setAtividades((prev) => prev.map((a) => {
      if (a.id === atividade.id) return { ...a, status: coluna.status_key, concluida: mudouColuna ? coluna.eh_conclusao : a.concluida, ordem: novasOrdens.get(a.id)! };
      return novasOrdens.has(a.id) ? { ...a, ordem: novasOrdens.get(a.id)! } : a;
    }));
    const pedidos = destino
      .filter((a) => a.id === atividade.id || a.ordem !== novasOrdens.get(a.id))
      .map((a) => supabase.from("atividades").update(a.id === atividade.id
        ? { status: coluna.status_key, ordem: novasOrdens.get(a.id)!, ...(mudouColuna ? { concluida: coluna.eh_conclusao } : {}) }
        : { ordem: novasOrdens.get(a.id)! }).eq("id", a.id));
    const resultados = await Promise.all(pedidos);
    if (resultados.some((r) => r.error)) {
      setAtividades(anterior);
      toast.error("Não foi possível mover a atividade");
    }
  };

  // Cronômetro no mapa (o mesmo do quadro do projeto).
  const [timerFinalizadoId, setTimerFinalizadoId] = useState<string | null>(null);
  const atualizarAtividade = async (id: string, patch: Partial<Atividade>, erro: string) => {
    const anterior = atividades;
    setAtividades((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    const { error } = await supabase.from("atividades").update(patch).eq("id", id);
    if (error) { setAtividades(anterior); toast.error(erro); }
  };
  const acoesTimer = {
    iniciar: (id: string) => void atualizarAtividade(id, { timer_iniciado_em: new Date().toISOString() }, "Erro ao iniciar o timer"),
    pausar: (id: string) => {
      const a = atividades.find((x) => x.id === id);
      if (!a?.timer_iniciado_em) return;
      const decorrido = Math.round((a.timer_decorrido_segundos || 0) + (Date.now() - new Date(a.timer_iniciado_em).getTime()) / 1000);
      void atualizarAtividade(id, { timer_iniciado_em: null, timer_decorrido_segundos: decorrido }, "Erro ao pausar o timer");
    },
    zerar: (id: string) => void atualizarAtividade(id, { timer_iniciado_em: null, timer_decorrido_segundos: 0 }, "Erro ao zerar o timer"),
    finalizado: (id: string) => {
      const a = atividades.find((x) => x.id === id);
      void atualizarAtividade(id, { timer_iniciado_em: null, timer_decorrido_segundos: (a?.tempo_estimado || 0) * 60 }, "Erro ao parar o timer");
      setTimerFinalizadoId(id);
    },
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

  const adicionarAtividade = async () => {
    const titulo = novoTitulo.trim();
    if (!titulo) return;
    if (!novoClienteId) {
      toast.error("Selecione o cliente da tarefa");
      return;
    }

    const colunas = (colunasPorCliente[novoClienteId] || []).slice().sort((a, b) => a.ordem - b.ordem);
    const colunaPadrao = colunas.find((c) => !c.eh_conclusao);
    const statusPadrao = colunaPadrao?.status_key || "backlog";
    const ordemNaColuna = atividades.filter(
      (a) => a.cliente_id === novoClienteId && a.status === statusPadrao
    ).length;

    try {
      await criarAtividadeService({
        titulo,
        clienteId: novoClienteId,
        pastaId: lerPastaAtivaSalva(novoClienteId),
        dataAtividade: format(new Date(), "yyyy-MM-dd"),
        statusKey: statusPadrao,
        concluida: false,
        ordem: ordemNaColuna + 1,
      });
      setNovoTitulo("");
      carregarDados();
      toast.success("Atividade adicionada");
    } catch (error) {
      console.error("Erro ao adicionar atividade:", error);
      toast.error("Erro ao adicionar atividade");
    }
  };

  const openAtividadeDetail = (id: string) => {
    const atv = atividades.find((a) => a.id === id);
    if (atv) {
      setSelectedAtividade(atv);
      setPanelOpen(true);
    }
  };

  if (carregandoClientes) {
    return (
      <div className="flex items-center justify-center h-32">
        <span className="text-muted-foreground text-sm">Carregando clientes...</span>
      </div>
    );
  }

  return (
    <div ref={raizRef} className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Clientes
              {selectedClienteIds.size > 0 ? ` (${selectedClienteIds.size})` : " (Todos)"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="flex items-center justify-between px-2 pb-2">
              <p className="text-xs text-muted-foreground">Mostrar atividades de</p>
              {selectedClienteIds.size > 0 && (
                <button
                  onClick={() => setSelectedClienteIds(new Set())}
                  className="text-xs text-primary hover:underline"
                >
                  Ver todos
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto scrollbar-thin space-y-0.5">
              {clientes.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedClienteIds.has(c.id)}
                    onCheckedChange={() =>
                      setSelectedClienteIds((prev) => {
                        const novo = new Set(prev);
                        if (novo.has(c.id)) novo.delete(c.id);
                        else novo.add(c.id);
                        return novo;
                      })
                    }
                  />
                  <Avatar className="h-5 w-5 flex-shrink-0">
                    <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
                      {iniciais(c.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm truncate">{c.nome}</span>
                </label>
              ))}
              {clientes.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-3">
                  Nenhum cliente com acesso a Atividades.
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Sempre visível — inclusive com um cliente só no filtro. */}
        <div className="flex items-center rounded-lg bg-muted p-0.5">
          <button type="button" onClick={() => escolherModo("lista")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${modo === "lista" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <List className="h-3.5 w-3.5" />Lista
          </button>
          <button type="button" onClick={() => escolherModo("mapa")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${modo === "mapa" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <MapaIcone className="h-3.5 w-3.5" />Mapa
          </button>
        </div>

        {modo === "mapa" && selectedClienteIds.size > 0 && (
          <button type="button" onClick={() => setSelectedClienteIds(new Set())} className="text-sm text-primary hover:underline">
            Ver todos os projetos
          </button>
        )}

        {modo === "mapa" && (
          <>
            <select value={filtroPessoa} onChange={(e) => setFiltroPessoa(e.target.value)} title="Filtrar por pessoa"
              className="h-8 rounded-md border bg-background px-2 text-sm">
              <option value="todas">Todas as pessoas</option>
              <option value="ninguem">Sem responsável</option>
              {pessoasNoMapa.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button type="button" onClick={() => setSemEquipe(!semEquipe)}
              title={semEquipe ? "Mostrar também as atividades da equipe" : "Esconder as atividades que estão com a equipe (fica só o que é seu e o que está sem dono)"}
              className={cn("h-8 rounded-md border px-2.5 text-sm", semEquipe ? "border-primary bg-primary/10 font-medium text-foreground" : "bg-background text-muted-foreground hover:bg-muted")}>
              {semEquipe ? "✓ Só as minhas" : "Esconder a equipe"}
            </button>
            <select value={filtroPasta} onChange={(e) => setFiltroPasta(e.target.value)} title="Filtrar por pasta"
              className="h-8 max-w-[220px] rounded-md border bg-background px-2 text-sm">
              <option value="todas">Todas as pastas</option>
              {pastas.filter((p) => selectedClienteIds.size === 0 || (p.cliente_id && selectedClienteIds.has(p.cliente_id))).map((p) => (
                <option key={p.id} value={p.id}>{selectedClienteIds.size === 1 ? p.nome : `${p.nome} · ${nomeCliente(p.cliente_id)}`}</option>
              ))}
            </select>
          </>
        )}

        {(!clienteFiltradoUnico || modo === "mapa") && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer ml-auto">
            <Checkbox checked={mostrarConcluidas} onCheckedChange={(v) => setMostrarConcluidas(!!v)} />
            Ver concluídas
          </label>
        )}
      </div>

      {modo === "mapa" ? (
        // Visão geral: todos os projetos de uma vez, num canvas com zoom.
        <MapaAtividades
          projetos={clientesParaExibir}
          atividades={atividadesDoMapa}
          colunasPorCliente={colunasPorCliente}
          onMover={(atividade, coluna, indice) => void moverNoMapa(atividade as Atividade, coluna, indice)}
          timer={acoesTimer}
          checklistPorAtividade={checklistPorAtividade}
          onAbrir={(atividade) => { setSelectedAtividade(atividade as Atividade); setPanelOpen(true); }}
          onConcluir={(atividade, concluida) => void toggleAtividade(atividade.id, concluida)}
          onCriar={async (clienteId, statusKey, titulo) => {
            try {
              await criarAtividadeService({
                titulo, clienteId, pastaId: lerPastaAtivaSalva(clienteId), dataAtividade: format(new Date(), "yyyy-MM-dd"),
                statusKey, concluida: false,
                ordem: atividades.filter((a) => a.cliente_id === clienteId && a.status === statusKey).length + 1,
              });
              toast.success("Atividade criada");
              void carregarDados();
            } catch (error) {
              console.error("Erro ao criar atividade no mapa:", error);
              toast.error("Não consegui criar a atividade");
              throw error;
            }
          }}
        />
      ) : clienteFiltradoUnico ? (
        // Aba Atividades de verdade daquele cliente: lista, quadro, calendário
        // e pastas, tudo igual a entrar nele — só que sem sair desta tela.
        <AtividadesView key={clienteFiltradoUnico.id} clienteId={clienteFiltradoUnico.id} filtroResponsavel={filtroResponsavel} />
      ) : (
        <>
          {/* Criar tarefa direto daqui, sem entrar no cliente */}
          {clientes.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={novoClienteId} onValueChange={setNovoClienteId}>
                <SelectTrigger className="h-9 w-48 flex-shrink-0 bg-muted/50 border-muted">
                  <SelectValue placeholder="Cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Plus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={novoTitulo}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") adicionarAtividade();
                  }}
                  placeholder="Adicionar tarefa para o cliente selecionado"
                  className="pl-9 bg-muted/50 border-muted"
                />
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-muted-foreground text-sm">Carregando atividades...</span>
            </div>
          ) : clientes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              Você não tem acesso às atividades de nenhum cliente.
            </p>
          ) : clientesParaExibir.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              Nenhuma atividade encontrada para o filtro selecionado.
            </p>
          ) : (
            <div className="space-y-1">
              {clientesParaExibir.map((c) => {
                const lista = atividadesDoCliente(c.id);
                const tempoTotal = lista.reduce((acc, a) => acc + (a.tempo_estimado || 0), 0);
                return (
                  <DiaSection
                    key={c.id}
                    dia={c.nome}
                    contagem={lista.length}
                    tempoTotal={tempoTotal}
                    isOpen={diasAbertos[c.id] ?? true}
                    onToggle={() => setDiasAbertos((prev) => ({ ...prev, [c.id]: !(prev[c.id] ?? true) }))}
                  >
                    {lista.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-3 py-2">Nenhuma atividade.</p>
                    ) : (
                      lista.map((a) => (
                        <AtividadeItem
                          key={a.id}
                          id={a.id}
                          titulo={a.titulo}
                          concluida={a.concluida}
                          tempoEstimado={a.tempo_estimado || undefined}
                          temDescricao={!!a.descricao}
                          destaque={a.destaque}
                          status={a.status}
                          statusLabel={
                            colunasPorCliente[a.cliente_id]?.find((col) => col.status_key === a.status)?.nome
                          }
                          prioridade={a.prioridade}
                          dataVencimento={a.data_vencimento}
                          responsavelNome={a.responsavel_nome}
                          alarmeEm={a.alarme_em}
                          checklist={checklistPorAtividade[a.id]}
                          onToggle={toggleAtividade}
                          onClick={openAtividadeDetail}
                          onDelete={excluirAtividade}
                        />
                      ))
                    )}
                  </DiaSection>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Card completo (lista agregada e mapa). */}
      {(!clienteFiltradoUnico || modo === "mapa") && (
        <>
        <TimerFinalizarDialog
          atividade={atividades.find((a) => a.id === timerFinalizadoId) || null}
          onClose={() => setTimerFinalizadoId(null)}
          onConcluir={(id) => {
            setTimerFinalizadoId(null);
            void toggleAtividade(id, true).then(() => atualizarAtividade(id, { timer_iniciado_em: null, timer_decorrido_segundos: 0 }, "Erro ao zerar o timer"));
          }}
          onPrecisaMaisTempo={(id, minutos) => {
            setTimerFinalizadoId(null);
            const a = atividades.find((x) => x.id === id);
            void atualizarAtividade(id, { tempo_estimado: (a?.tempo_estimado || 0) + minutos }, "Erro ao adicionar tempo")
              .then(() => toast.success("Tempo atualizado. Clique no relógio para reiniciar o timer."));
          }}
        />
        <AtividadeDetailPanel
          open={panelOpen}
          onClose={() => {
            setPanelOpen(false);
            setSelectedAtividade(null);
          }}
          atividade={selectedAtividade}
          colunas={selectedAtividade ? colunasPorCliente[selectedAtividade.cliente_id] || [] : []}
          onUpdate={carregarDados}
          onDelete={excluirAtividade}
        />
        </>
      )}
    </div>
  );
};
