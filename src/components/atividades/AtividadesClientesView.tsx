import { useEffect, useMemo, useState } from "react";
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
import { Plus, Users } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { iniciais } from "@/lib/utils";
import { DiaSection } from "./DiaSection";
import { AtividadeItem } from "./AtividadeItem";
import { AtividadeDetailPanel } from "./AtividadeDetailPanel";
import { AtividadesView } from "./AtividadesView";

// Guarda qual(is) cliente(s) estavam selecionados no filtro, pra voltar
// exatamente de onde parou ao reabrir a aba.
const CHAVE_FILTRO = "atividades-clientes:filtro";

interface ClienteInfo {
  id: string;
  nome: string;
}

interface Atividade {
  id: string;
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
export const AtividadesClientesView = () => {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<ClienteInfo[]>([]);
  const [carregandoClientes, setCarregandoClientes] = useState(true);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [colunasPorCliente, setColunasPorCliente] = useState<Record<string, Coluna[]>>({});
  const [checklistPorAtividade, setChecklistPorAtividade] = useState<Record<string, ChecklistResumo>>({});
  const [loading, setLoading] = useState(true);
  const [selectedClienteIds, setSelectedClienteIds] = useState<Set<string>>(new Set());
  const [mostrarConcluidas, setMostrarConcluidas] = useState(true);
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

  const carregarDados = async () => {
    if (clientes.length === 0) {
      setAtividades([]);
      setColunasPorCliente({});
      setLoading(false);
      return;
    }
    setLoading(true);
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

      setAtividades(ativRes.data || []);

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
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes]);

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
    return lista;
  }, [atividades, selectedClienteIds, mostrarConcluidas]);

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
  }, [clienteFiltradoUnico?.id]);

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
    } catch (error) {
      console.error("Erro ao atualizar atividade:", error);
      toast.error("Erro ao atualizar atividade");
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
      const { error } = await supabase.from("atividades").insert({
        titulo,
        cliente_id: novoClienteId,
        data_atividade: format(new Date(), "yyyy-MM-dd"),
        status: statusPadrao,
        ordem: ordemNaColuna + 1,
      });
      if (error) throw error;
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
    <div className="space-y-4">
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

        {!clienteFiltradoUnico && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer ml-auto">
            <Checkbox checked={mostrarConcluidas} onCheckedChange={(v) => setMostrarConcluidas(!!v)} />
            Ver concluídas
          </label>
        )}
      </div>

      {clienteFiltradoUnico ? (
        // Aba Atividades de verdade daquele cliente: lista, quadro, calendário
        // e pastas, tudo igual a entrar nele — só que sem sair desta tela.
        <AtividadesView key={clienteFiltradoUnico.id} clienteId={clienteFiltradoUnico.id} />
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
