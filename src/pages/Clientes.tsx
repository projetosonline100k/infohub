import { useAuth } from "@/auth/AuthProvider";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, LayoutGrid, List, Users, Activity, Archive, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ClienteForm from "@/components/ClienteForm";
import { StatTile } from "@/components/dashboard/StatTile";
import { ProjetoRow } from "@/components/clientes/ProjetoRow";
import { NOTA_PREFIX } from "@/hooks/useAssistantDocumentos";
import { useWorkspaceTabs } from "@/components/workspace/WorkspaceTabs";

interface Cliente {
  user_id: string | null;
  id: string;
  nome_especialista: string;
  idade: number;
  nicho: string;
  arquivado: boolean;
}

interface EquipeMembro {
  id: string;
  cliente_id: string;
  nome_pessoa: string;
  papel: string;
}

interface ProjetoStats {
  notas: number;
  atividades: number;
  ultimaAtividade: string | null;
}

const STATS_VAZIAS: ProjetoStats = { notas: 0, atividades: 0, ultimaAtividade: null };

type Ordenacao = "nome" | "recente" | "notas";

const Clientes = () => {
  const navigate = useNavigate();
  const { openTab } = useWorkspaceTabs();
  const { user } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<Cliente | undefined>();
  const [equipeEditando, setEquipeEditando] = useState<EquipeMembro[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarArquivados, setMostrarArquivados] = useState(false);

  // Item 6 do redesign: busca/categoria/ordenação/lista-grid — tudo
  // client-side sobre a mesma lista que já era carregada, nenhuma
  // funcionalidade nova de backend.
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("nome");
  const [visualizacao, setVisualizacao] = useState<"lista" | "grid">("lista");

  // Contagens/última atividade por projeto + métricas globais do topo —
  // calculadas client-side sobre `atividades`/`documentos` já existentes
  // (mesmo padrão de agregação que DashGeral.tsx já faz), sem tabela nova.
  const [statsPorCliente, setStatsPorCliente] = useState<Record<string, ProjetoStats>>({});
  const [metricas, setMetricas] = useState({ ativos: 0, emAndamento: 0, concluidos: 0, notas: 0 });

  useEffect(() => {
    carregarClientes();
  }, [mostrarArquivados]);

  useEffect(() => {
    carregarMetricasGlobais();
  }, []);

  const carregarClientes = async () => {
    try {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .eq("arquivado", mostrarArquivados)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao carregar clientes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const carregarMetricasGlobais = async () => {
    try {
      const [ativosRes, concluidosRes, atividadesRes, documentosRes] = await Promise.all([
        supabase.from("clientes").select("id", { count: "exact", head: true }).eq("arquivado", false),
        supabase.from("clientes").select("id", { count: "exact", head: true }).eq("arquivado", true),
        supabase.from("atividades").select("cliente_id, concluida, created_at").is("deleted_at", null),
        supabase.from("documentos").select("cliente_id, conteudo, deleted_at"),
      ]);

      const atividades = atividadesRes.data || [];
      const notas = (documentosRes.data || []).filter((d) => !d.deleted_at && d.conteudo?.startsWith(NOTA_PREFIX));

      const emAndamentoSet = new Set(atividades.filter((a) => !a.concluida && a.cliente_id).map((a) => a.cliente_id as string));

      const porCliente: Record<string, ProjetoStats> = {};
      atividades.forEach((a) => {
        if (!a.cliente_id) return;
        const atual = porCliente[a.cliente_id] ?? { ...STATS_VAZIAS };
        atual.atividades += 1;
        if (!atual.ultimaAtividade || a.created_at > atual.ultimaAtividade) atual.ultimaAtividade = a.created_at;
        porCliente[a.cliente_id] = atual;
      });
      notas.forEach((d) => {
        if (!d.cliente_id) return;
        const atual = porCliente[d.cliente_id] ?? { ...STATS_VAZIAS };
        atual.notas += 1;
        porCliente[d.cliente_id] = atual;
      });

      setStatsPorCliente(porCliente);
      setMetricas({
        ativos: ativosRes.count || 0,
        emAndamento: emAndamentoSet.size,
        concluidos: concluidosRes.count || 0,
        notas: notas.length,
      });
    } catch {
      // Métricas são só um resumo visual — se falhar, a lista principal
      // continua funcionando normalmente.
    }
  };

  const alternarArquivo = async (cliente: Cliente) => {
    try {
      const { error } = await supabase
        .from("clientes")
        .update({ arquivado: !cliente.arquivado })
        .eq("id", cliente.id);

      if (error) throw error;

      toast({
        title: cliente.arquivado ? "Cliente reativado" : "Cliente arquivado",
      });
      setClientes((prev) => prev.filter((c) => c.id !== cliente.id));
      carregarMetricasGlobais();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao arquivar cliente",
        variant: "destructive",
      });
    }
  };

  const abrirFormularioNovo = () => {
    setClienteEditando(undefined);
    setEquipeEditando([]);
    setShowForm(true);
  };

  const abrirFormularioEditar = async (cliente: Cliente) => {
    try {
      const { data: equipe, error } = await supabase
        .from("equipe_cliente")
        .select("*")
        .eq("cliente_id", cliente.id);

      if (error) throw error;

      setClienteEditando(cliente);
      setEquipeEditando(equipe || []);
      setShowForm(true);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao carregar equipe do cliente",
        variant: "destructive",
      });
    }
  };

  const salvarCliente = async (
    data: { nomeEspecialista: string; idade: number; nicho: string; metaAtual?: string; linkPainelReceita?: string },
    equipe: Array<{ id?: string; nomePessoa: string; papel: string }>,
    clienteId?: string
  ) => {
    try {
      let clienteIdFinal = clienteId;

      if (clienteId) {
        // Atualizar cliente existente
        const { error } = await supabase
          .from("clientes")
          .update({
            nome_especialista: data.nomeEspecialista,
            idade: data.idade,
            nicho: data.nicho,
            meta_atual: data.metaAtual || null,
            link_painel_receita: data.linkPainelReceita || null,
          })
          .eq("id", clienteId);

        if (error) throw error;


      } else {
        if (!user?.id) throw new Error("Entre na sua conta antes de criar um cliente.");
        // Registrar explicitamente quem criou o cliente.
        const { data: novoCliente, error } = await supabase
          .from("clientes")
          .insert({
            user_id: user.id,
            nome_especialista: data.nomeEspecialista,
            idade: data.idade,
            nicho: data.nicho,
            meta_atual: data.metaAtual || null,
            link_painel_receita: data.linkPainelReceita || null,
          })
          .select()
          .single();

        if (error) throw error;
        clienteIdFinal = novoCliente.id;
      }

      if (clienteIdFinal) {
        for (const membro of equipe.filter(m => m.nomePessoa.trim() && m.papel.trim())) {
          const payload = { cliente_id: clienteIdFinal, nome_pessoa: membro.nomePessoa.trim(), papel: membro.papel.trim() };
          const { error } = membro.id
            ? await supabase.from("equipe_cliente").update(payload).eq("id", membro.id).eq("cliente_id", clienteIdFinal)
            : await supabase.from("equipe_cliente").insert(payload);
          if (error) throw error;
        }
        const removidos = equipeEditando.filter(m => !equipe.some(n => n.id === m.id)).map(m => m.id);
        if (clienteId && removidos.length) {
          const { error } = await supabase.from("equipe_cliente").delete().eq("cliente_id", clienteId).in("id", removidos);
          if (error) throw error;
        }
      }

      await carregarClientes();
      carregarMetricasGlobais();
    } catch (error) {
      throw error;
    }
  };

  const categorias = useMemo(
    () => Array.from(new Set(clientes.map((c) => c.nicho).filter(Boolean))).sort(),
    [clientes],
  );

  const listaFiltrada = useMemo(() => {
    let lista = clientes;
    const termo = busca.trim().toLowerCase();
    if (termo) {
      lista = lista.filter(
        (c) => c.nome_especialista.toLowerCase().includes(termo) || c.nicho?.toLowerCase().includes(termo),
      );
    }
    if (categoria !== "todas") lista = lista.filter((c) => c.nicho === categoria);

    const comStats = lista.map((c) => ({ ...c, stats: statsPorCliente[c.id] ?? STATS_VAZIAS }));
    return comStats.sort((a, b) => {
      if (ordenacao === "notas") return b.stats.notas - a.stats.notas;
      if (ordenacao === "recente") return (b.stats.ultimaAtividade || "").localeCompare(a.stats.ultimaAtividade || "");
      return a.nome_especialista.localeCompare(b.nome_especialista);
    });
  }, [clientes, busca, categoria, ordenacao, statsPorCliente]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Projetos Milionários</h1>
          <p className="mt-1 text-muted-foreground">Gerencie seus projetos e acompanhe a execução em um só lugar.</p>
        </div>
        <Button onClick={abrirFormularioNovo} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Novo projeto
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Users} label="Clientes ativos" value={String(metricas.ativos)} tone="good" />
        <StatTile icon={Activity} label="Projetos em andamento" value={String(metricas.emAndamento)} tone="neutral" />
        <StatTile icon={Archive} label="Projetos concluídos" value={String(metricas.concluidos)} tone="neutral" />
        <StatTile icon={StickyNote} label="Notas registradas" value={String(metricas.notas)} tone="neutral" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-lg bg-muted p-0.5 w-fit">
          <button
            onClick={() => setMostrarArquivados(false)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              !mostrarArquivados ? "bg-background shadow-sm" : "text-muted-foreground"
            )}
          >
            Ativos
          </button>
          <button
            onClick={() => setMostrarArquivados(true)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              mostrarArquivados ? "bg-background shadow-sm" : "text-muted-foreground"
            )}
          >
            Arquivados
          </button>
        </div>

        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou categoria..." className="h-9 pl-8" />
        </div>

        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as Ordenacao)}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nome">Nome (A-Z)</SelectItem>
            <SelectItem value="recente">Última atividade</SelectItem>
            <SelectItem value="notas">Mais notas</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex shrink-0 items-center rounded-md bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setVisualizacao("lista")}
            className={cn("rounded p-1.5", visualizacao === "lista" ? "bg-background shadow-sm" : "text-muted-foreground")}
            aria-label="Ver em lista"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setVisualizacao("grid")}
            className={cn("rounded p-1.5", visualizacao === "grid" ? "bg-background shadow-sm" : "text-muted-foreground")}
            aria-label="Ver em grade"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">Carregando clientes...</div>
      ) : listaFiltrada.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          {clientes.length === 0
            ? mostrarArquivados
              ? "Nenhum cliente arquivado."
              : 'Nenhum cliente cadastrado. Clique em "Novo projeto" para começar.'
            : "Nenhum projeto encontrado com esses filtros."}
        </div>
      ) : (
        <div className={visualizacao === "grid" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
          {listaFiltrada.map((cliente) => (
            <ProjetoRow
              key={cliente.id}
              nome={cliente.nome_especialista}
              nicho={cliente.nicho}
              notas={cliente.stats.notas}
              atividades={cliente.stats.atividades}
              arquivado={cliente.arquivado}
              ultimaAtividade={cliente.stats.ultimaAtividade}
              podeGerenciar={cliente.user_id === user?.id}
              visualizacao={visualizacao}
              onAbrir={(event) => {
                const path = `/clientes/${cliente.id}`;
                if (event?.metaKey) openTab(path, cliente.nome_especialista);
                navigate(path);
              }}
              onEditar={() => abrirFormularioEditar(cliente)}
              onArquivar={() => alternarArquivo(cliente)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <ClienteForm
          cliente={clienteEditando}
          equipe={equipeEditando}
          onClose={() => setShowForm(false)}
          onSave={salvarCliente}
        />
      )}
    </div>
  );
};

export default Clientes;
