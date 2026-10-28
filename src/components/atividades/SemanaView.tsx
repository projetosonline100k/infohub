import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, format, isSameMonth, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle, CalendarClock, CalendarX2, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleDot,
  Eye, GripVertical, Loader2, Maximize2, MoreHorizontal, Plus, Target, Trash2, Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FocarTarefa } from "@/components/foco/FocarTarefa";
import { useWorkspaceTabsOpcional } from "@/components/workspace/WorkspaceTabs";
import { useIdentidadeResponsavel } from "@/hooks/useIdentidadeResponsavel";
import { filtrarPorResponsavel } from "@/lib/atividades/filtroResponsavel";
import { parseResponsaveis } from "@/lib/responsaveis";
import { criarAtividade } from "@/lib/atividades/criarAtividade";
import { excluirAtividade } from "@/lib/atividades/excluirAtividade";
import { definirAlarmeAtividade } from "@/lib/atividades/alarmeAtividade";
import {
  chaveDia, dataLocal, diaDaColuna, diaDaTarefa, diasDeAtraso, inicioDaSemana, situacaoDaTarefa, type Situacao,
} from "@/lib/atividades/semana";
import { AtividadesView } from "./AtividadesView";
import { AtividadeDetailPanel } from "./AtividadeDetailPanel";
import { ResponsavelAvatares } from "./ResponsavelAvatares";
import { SeletorProjeto, SeletorResponsavel, type MudancaAtividade } from "./EditarNaLinha";

// Visão "Semana" das Atividades (24/10, Davi, com uma imagem de referência): à esquerda os dias da semana
// (clicar mostra só aquele dia), no meio as tarefas do dia por situação, à direita um calendário (clicar num dia
// abre o dia e dá para já criar a tarefa nele) e embaixo o Kanban do projeto. Filtros: projeto (o meu, todos ou
// um) e pessoa (todas, só eu ou alguém). Em que dia cai cada tarefa: src/lib/atividades/semana.ts.

interface Tarefa {
  id: string; titulo: string; cliente_id: string | null; status: string; concluida: boolean; data_vencimento: string | null;
  concluida_em: string | null; timer_iniciado_em: string | null; progresso: number | null; situacao: string | null;
  responsavel_nome: string | null; prioridade: string; user_id: string | null; ordem: number | null;
}
interface Coluna { cliente_id: string | null; status_key: string; nome: string; eh_conclusao: boolean; ordem: number }
interface Projeto { id: string; nome_especialista: string }
type Foco = { tipo: "dia"; chave: string } | { tipo: "atrasadas" } | { tipo: "semdata" };

const SITUACOES: { id: Situacao; nome: string; cor: string; fundo: string; icone: typeof Circle }[] = [
  { id: "atrasada", nome: "Atrasadas", cor: "text-red-500", fundo: "bg-red-500/10", icone: AlertCircle },
  { id: "andamento", nome: "Em andamento", cor: "text-blue-500", fundo: "bg-blue-500/10", icone: CircleDot },
  { id: "revisao", nome: "Em revisão", cor: "text-purple-500", fundo: "bg-purple-500/10", icone: Eye },
  { id: "afazer", nome: "A fazer", cor: "text-muted-foreground", fundo: "bg-muted/60", icone: Circle },
  { id: "concluida", nome: "Concluídas", cor: "text-emerald-500", fundo: "bg-emerald-500/10", icone: CheckCircle2 },
];
const PONTO: Record<Situacao, string> = { atrasada: "bg-red-500", andamento: "bg-blue-500", revisao: "bg-purple-500", afazer: "bg-muted-foreground/50", concluida: "bg-emerald-500" };
const CORES_PROJETO = ["bg-yellow-400", "bg-red-500", "bg-sky-500", "bg-pink-400", "bg-orange-500", "bg-emerald-500", "bg-violet-500", "bg-teal-500"];
const NOMES_DIAS = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];

const CHAVE_PROJETO = "atividades-semana:projeto";
const CHAVE_PESSOA = "atividades-semana:pessoa";
const ler = (k: string, padrao: string) => { try { return localStorage.getItem(k) ?? padrao; } catch { return padrao; } };
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function SemanaView() {
  const { user } = useAuth();
  const meusNomes = useIdentidadeResponsavel();
  const guias = useWorkspaceTabsOpcional();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [colunas, setColunas] = useState<Coluna[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const hoje = useMemo(() => new Date(), []);
  const [foco, setFoco] = useState<Foco>({ tipo: "dia", chave: chaveDia(hoje) });
  const [semana, setSemana] = useState(() => inicioDaSemana(hoje));
  const [mes, setMes] = useState(() => startOfMonth(hoje));
  const [filtroSit, setFiltroSit] = useState<Situacao | "todas">("todas");
  // "meu" = o projeto com o nome do Davi; "todos"; "pessoal" (sem projeto); ou o id de um projeto.
  const [projeto, setProjetoEstado] = useState(() => ler(CHAVE_PROJETO, "meu"));
  const [pessoa, setPessoaEstado] = useState(() => ler(CHAVE_PESSOA, "todas"));
  const [fechadas, setFechadas] = useState<Set<string>>(() => new Set(["concluida"]));
  // dia/hora (28/10, Davi: "ao criar, preciso escolher a data, a hora…"): o dia começa no que está na tela; a hora
  // é opcional e vira o alarme da tarefa.
  const [nova, setNova] = useState<{ titulo: string; projeto: string; dia?: string; hora?: string } | null>(null);
  const [aberta, setAberta] = useState<{ atividade: Record<string, unknown>; colunas: Coluna[] } | null>(null);
  const [kanbanProjeto, setKanbanProjeto] = useState<string | null>(null);

  const setProjeto = (v: string) => { setProjetoEstado(v); guardar(CHAVE_PROJETO, v); };
  const setPessoa = (v: string) => { setPessoaEstado(v); guardar(CHAVE_PESSOA, v); };

  const carregar = useCallback(async () => {
    const [a, c, p] = await Promise.all([
      supabase.from("atividades")
        .select("id, titulo, cliente_id, status, concluida, data_vencimento, concluida_em, timer_iniciado_em, progresso, situacao, responsavel_nome, prioridade, user_id, ordem")
        .is("deleted_at", null).order("data_vencimento", { ascending: true, nullsFirst: false }).limit(3000),
      supabase.from("colunas_atividade").select("cliente_id, status_key, nome, eh_conclusao, ordem").order("ordem"),
      supabase.from("clientes").select("id, nome_especialista").eq("arquivado", false).order("nome_especialista"),
    ]);
    setTarefas((a.data ?? []) as unknown as Tarefa[]);
    setColunas((c.data ?? []) as Coluna[]);
    setProjetos((p.data ?? []) as Projeto[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
    window.addEventListener("focus", carregar);
    if (!user) return () => window.removeEventListener("focus", carregar);
    const canal = supabase.channel(`atividades-semana-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "atividades", filter: `user_id=eq.${user.id}` }, () => void carregar())
      .subscribe();
    return () => { window.removeEventListener("focus", carregar); void supabase.removeChannel(canal); };
  }, [carregar, user]);

  const meuProjeto = useMemo(() => {
    const nomes = meusNomes.map(normalizar);
    return projetos.find((p) => nomes.includes(normalizar(p.nome_especialista)))
      ?? projetos.find((p) => normalizar(p.nome_especialista).startsWith("davi"));
  }, [projetos, meusNomes]);
  const projetoId = projeto === "meu" ? meuProjeto?.id ?? null : projeto;
  const nomeProjeto = (id: string | null) => (id ? projetos.find((p) => p.id === id)?.nome_especialista ?? "Projeto" : "Pessoal");
  const corProjeto = (id: string | null) => (id ? CORES_PROJETO[Math.max(0, projetos.findIndex((p) => p.id === id)) % CORES_PROJETO.length] : "bg-slate-400");

  const colunaDe = useCallback((t: { cliente_id: string | null; status: string; user_id?: string | null }) =>
    colunas.find((c) => c.cliente_id === t.cliente_id && c.status_key === t.status), [colunas]);

  // Tarefas no filtro de projeto e pessoa, já com dia e situação.
  const lista = useMemo(() => {
    const idsAtivos = new Set(projetos.map((p) => p.id));
    let r = tarefas.filter((t) => !t.cliente_id || idsAtivos.has(t.cliente_id));
    if (projeto === "pessoal") r = r.filter((t) => !t.cliente_id);
    else if (projeto !== "todos" && projetoId) r = r.filter((t) => t.cliente_id === projetoId);
    if (pessoa === "eu") r = filtrarPorResponsavel(r, "minhas", meusNomes, user?.id);
    else if (pessoa !== "todas") r = r.filter((t) => parseResponsaveis(t.responsavel_nome).some((n) => normalizar(n) === normalizar(pessoa)));
    return r.map((t) => {
      const coluna = colunaDe(t);
      return { ...t, dia: diaDaTarefa(t, coluna, hoje), sit: situacaoDaTarefa(t, coluna, hoje) };
    });
  }, [tarefas, projetos, projeto, projetoId, pessoa, meusNomes, user?.id, colunaDe, hoje]);

  const pessoas = useMemo(() => {
    const todas = new Map<string, string>();
    for (const t of tarefas) for (const n of parseResponsaveis(t.responsavel_nome)) todas.set(normalizar(n), n);
    return [...todas.values()].sort((a, b) => a.localeCompare(b));
  }, [tarefas]);

  const diasDaSemana = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(semana, i)), [semana]);
  const chavesSemana = useMemo(() => new Set(diasDaSemana.map(chaveDia)), [diasDaSemana]);
  const daSemana = lista.filter((t) => t.dia && chavesSemana.has(t.dia));
  const atrasadas = lista.filter((t) => t.sit === "atrasada");
  const semData = lista.filter((t) => !t.dia && !t.concluida);
  const porDia = useMemo(() => {
    const m = new Map<string, typeof lista>();
    for (const t of lista) if (t.dia) m.set(t.dia, [...(m.get(t.dia) ?? []), t]);
    return m;
  }, [lista]);

  const doFoco = foco.tipo === "dia" ? porDia.get(foco.chave) ?? [] : foco.tipo === "atrasadas" ? atrasadas : semData;
  const visiveis = filtroSit === "todas" ? doFoco : doFoco.filter((t) => t.sit === filtroSit);
  // Grupos da lista (28/10, Davi: "em vez de A fazer, quero o nome do projeto — Core, Yuri, Davi"): as tarefas em
  // aberto por projeto (só os que têm tarefa); as concluídas num grupo no fim. Filtrando por situação (os botões
  // de cima), a lista mostra aquela situação, ainda por projeto. A bolinha de cada tarefa mostra a situação.
  const grupos = useMemo(() => {
    const porOrdem = (a: { ordem: number | null }, b: { ordem: number | null }) => (a.ordem ?? 0) - (b.ordem ?? 0);
    const abertas = visiveis.filter((t) => t.sit !== "concluida" && (filtroSit === "todas" || t.sit === filtroSit));
    const porProjeto = new Map<string | null, typeof abertas>();
    for (const t of abertas) porProjeto.set(t.cliente_id, [...(porProjeto.get(t.cliente_id) ?? []), t]);
    const lista: { id: string; nome: string; fundo: string; ts: typeof visiveis; projeto?: string | null; icone?: typeof Circle; cor?: string }[] =
      [...porProjeto].sort(([a], [b]) => nomeProjeto(a).localeCompare(nomeProjeto(b), "pt-BR"))
        .map(([id, ts]) => ({ id: `projeto:${id ?? "pessoal"}`, nome: nomeProjeto(id), fundo: "bg-muted/60", ts: ts.sort(porOrdem), projeto: id }));
    if (filtroSit === "todas" || filtroSit === "concluida") {
      const feitas = visiveis.filter((t) => t.sit === "concluida").sort(porOrdem);
      const s = SITUACOES.find((x) => x.id === "concluida")!;
      if (feitas.length) lista.push({ id: "concluida", nome: s.nome, fundo: s.fundo, ts: feitas, icone: s.icone, cor: s.cor });
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, filtroSit, projetos]);
  const contar = (s: Situacao) => doFoco.filter((t) => t.sit === s).length;

  const irParaDia = (d: Date) => {
    setFoco({ tipo: "dia", chave: chaveDia(d) });
    setSemana(inicioDaSemana(d));
    if (!isSameMonth(d, mes)) setMes(startOfMonth(d));
    setFiltroSit("todas");
  };

  // ── mudar a ordem arrastando (25/10, Davi: "quero conseguir mover a ordem das atividades") ──
  // Reaproveita os valores de "ordem" das próprias tarefas do grupo, redistribuídos na nova ordem: o resto do
  // Kanban não muda de lugar em relação a elas.
  // 28/10 (Davi: "preciso jogar uma atividade para o dia seguinte"): soltar num dia da semana (lista da esquerda)
  // ou do calendário muda a data — a coluna do projeto acompanha (gatilho trg_atividades_dia_coluna).
  const [arrastoT, setArrastoT] = useState<{ id: string; grupo: string; alvo: string | null; depois: boolean; dia?: string | null } | null>(null);
  const inicioT = useRef<{ x: number; y: number; id: string; grupo: string; ids: string[] } | null>(null);
  const arrastoTRef = useRef(arrastoT);
  arrastoTRef.current = arrastoT;
  const tarefasRef = useRef(tarefas);
  tarefasRef.current = tarefas;
  useEffect(() => {
    const mover = (e: PointerEvent) => {
      const ini = inicioT.current;
      if (!ini) return;
      if (!arrastoTRef.current && Math.abs(e.clientY - ini.y) < 5 && Math.abs(e.clientX - ini.x) < 5) return;
      const sob = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
      const el = sob?.closest<HTMLElement>(`[data-tarefa-grupo="${ini.grupo}"]`);
      const dia = sob?.closest<HTMLElement>("[data-dia-alvo]")?.dataset.diaAlvo ?? null;
      const alvo = el?.dataset.tarefaId ?? null;
      const r = el?.getBoundingClientRect();
      const depois = r ? e.clientY > r.top + r.height / 2 : false;
      setArrastoT((a) => (a && a.alvo === alvo && a.depois === depois && a.dia === dia ? a : { id: ini.id, grupo: ini.grupo, alvo, depois, dia }));
    };
    const soltar = () => {
      const ini = inicioT.current, a = arrastoTRef.current;
      inicioT.current = null;
      document.body.style.userSelect = "";
      setArrastoT(null);
      if (ini && a?.dia) { void moverParaDiaRef.current(ini.id, a.dia); return; }
      if (!ini || !a?.alvo || a.alvo === a.id) return;
      const nova = ini.ids.filter((x) => x !== a.id);
      const i = nova.indexOf(a.alvo);
      if (i < 0) return;
      nova.splice(a.depois ? i + 1 : i, 0, a.id);
      const atuais = tarefasRef.current;
      const valores = ini.ids.map((id) => atuais.find((t) => t.id === id)?.ordem ?? 0).sort((x, y) => x - y);
      const distintos = new Set(valores).size === valores.length;
      const novaOrdem = new Map(nova.map((id, k) => [id, distintos ? valores[k] : valores[0] + k]));
      setTarefas((ts) => ts.map((t) => (novaOrdem.has(t.id) ? { ...t, ordem: novaOrdem.get(t.id)! } : t)));
      void Promise.all([...novaOrdem].filter(([id, ordem]) => atuais.find((t) => t.id === id)?.ordem !== ordem)
        .map(([id, ordem]) => supabase.from("atividades").update({ ordem }).eq("id", id)))
        .then((rs) => { if (rs.some((r) => r.error)) { toast.error("Não consegui salvar a nova ordem"); void carregar(); } });
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    return () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); };
  }, [carregar]);

  // ── ações ──
  const concluir = async (t: Tarefa, concluida: boolean) => {
    const cols = colunas.filter((c) => c.cliente_id === t.cliente_id);
    const status = concluida ? cols.find((c) => c.eh_conclusao)?.status_key ?? "finalizado" : (cols.find((c) => !c.eh_conclusao) ?? cols[0])?.status_key ?? "backlog";
    setTarefas((ts) => ts.map((x) => (x.id === t.id ? { ...x, concluida, status, concluida_em: concluida ? new Date().toISOString() : null } : x)));
    const { error } = await supabase.from("atividades").update({ concluida, status }).eq("id", t.id);
    if (error) { toast.error("Não consegui atualizar a tarefa"); void carregar(); }
  };
  const moverParaDia = async (id: string, dia: string) => {
    const t = tarefasRef.current.find((x) => x.id === id);
    if (!t || (t.data_vencimento ?? "").slice(0, 10) === dia) return;
    setTarefas((ts) => ts.map((x) => (x.id === id ? { ...x, data_vencimento: dia } : x)));
    const { error } = await supabase.from("atividades").update({ data_vencimento: dia }).eq("id", id);
    if (error) toast.error("Não consegui mudar a data");
    else toast.success(`Movida para ${format(dataLocal(dia), "EEEE, dd/MM", { locale: ptBR })}`);
    void carregar();
  };
  const moverParaDiaRef = useRef(moverParaDia);
  moverParaDiaRef.current = moverParaDia;
  // "Focar" da tarefa (28/10, Davi): pergunta quanto tempo e se liga o foco total; aí começa (FocarTarefa).
  const [focando, setFocando] = useState<{ id: string; titulo: string } | null>(null);
  const adiar = async (t: Tarefa & { dia: string | null; sit: Situacao }, dias: number) => {
    const base = t.dia ? dataLocal(t.dia) : new Date(hoje);
    const destino = chaveDia(addDays(t.sit === "atrasada" ? new Date(hoje) : base, dias));
    const { error } = await supabase.from("atividades").update({ data_vencimento: destino }).eq("id", t.id);
    if (error) toast.error("Não consegui mudar a data"); else { toast.success(`Movida para ${format(dataLocal(destino), "EEEE, dd/MM", { locale: ptBR })}`); void carregar(); }
  };
  const mudarNaLinha = (id: string, mudanca: MudancaAtividade) =>
    setTarefas((ts) => ts.map((x) => (x.id === id ? { ...x, ...mudanca } : x)));
  const projetosSeletor = useMemo(() => projetos.map((p) => ({ id: p.id, nome: p.nome_especialista })), [projetos]);
  const abrir = async (id: string) => {
    const { data } = await supabase.from("atividades").select("*").eq("id", id).maybeSingle();
    if (!data) return;
    setAberta({ atividade: data as Record<string, unknown>, colunas: colunas.filter((c) => c.cliente_id === data.cliente_id) });
  };
  const excluir = async (id: string) => {
    // Só preenche deleted_at (dá para desfazer); some na hora da lista e dos contadores.
    if (!(await excluirAtividade(id, () => void carregar()))) return;
    setAberta(null);
    setTarefas((ts) => ts.filter((x) => x.id !== id));
  };

  const diaNovo = foco.tipo === "dia" ? foco.chave : chaveDia(hoje);
  const criar = async () => {
    if (!nova?.titulo.trim()) return;
    const cliente = nova.projeto === "pessoal" ? null : nova.projeto;
    const cols = colunas.filter((c) => c.cliente_id === cliente);
    // No projeto com colunas de dia (como o do Davi), cai na coluna daquele dia; senão, na primeira.
    const dia = nova.dia || diaNovo;
    const diaSemana = dataLocal(dia).getDay();
    const coluna = cols.find((c) => !c.eh_conclusao && diaDaColuna(c.nome) === diaSemana) ?? cols.find((c) => !c.eh_conclusao);
    try {
      const criada = await criarAtividade({
        titulo: nova.titulo.trim(), clienteId: cliente, pastaId: null, dataAtividade: chaveDia(hoje), statusKey: coluna?.status_key ?? "backlog",
        // Com o filtro "Só eu", a tarefa já nasce sua — sem responsável ela sumia da lista na hora (28/10).
        concluida: false, ordem: 0, dataVencimento: dia, responsavelNome: pessoa === "eu" ? meusNomes[0] ?? null : pessoa !== "todas" ? pessoa : null,
      });
      if (nova.hora) {
        const [h, m] = nova.hora.split(":").map(Number);
        const quando = dataLocal(dia);
        quando.setHours(h, m, 0, 0);
        await definirAlarmeAtividade({ id: criada.id, titulo: criada.titulo }, quando).catch(() => toast.error("A tarefa foi criada, mas não consegui pôr o alarme"));
      }
      setNova(null);
      toast.success(`Tarefa criada para ${format(dataLocal(dia), "EEEE, dd/MM", { locale: ptBR })}${nova.hora ? ` às ${nova.hora}` : ""}`);
      void carregar();
    } catch {
      toast.error("Não consegui criar a tarefa");
    }
  };
  const abrirNova = (d?: Date) => {
    if (d) irParaDia(d);
    setNova({ titulo: "", projeto: projeto === "todos" ? meuProjeto?.id ?? "pessoal" : projeto === "meu" ? meuProjeto?.id ?? "pessoal" : projeto });
  };

  const kanbanId = kanbanProjeto ?? (projeto !== "todos" && projeto !== "pessoal" ? projetoId : meuProjeto?.id ?? null);

  if (carregando) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const tituloFoco = foco.tipo === "dia"
    ? (() => { const d = dataLocal(foco.chave); return `${NOMES_DIAS[(d.getDay() + 6) % 7]}${chaveDia(d) === chaveDia(hoje) ? " · hoje" : ""}`; })()
    : foco.tipo === "atrasadas" ? "Atrasadas" : "Sem data";
  const ehEstaSemana = chaveDia(semana) === chaveDia(inicioDaSemana(hoje));

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── Esquerda: a semana ── */}
          <Card className="space-y-4 p-4">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{ehEstaSemana ? "Esta semana" : `Semana de ${format(semana, "dd/MM")}`}</h2>
                <div className="flex">
                  <Button variant="ghost" size="icon" className="h-6 w-6" title="Semana anterior" onClick={() => irParaDia(addDays(semana, -7))}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" title="Próxima semana" onClick={() => irParaDia(addDays(semana, 7))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{projeto === "todos" ? "Todas as tarefas de todos os projetos." : projeto === "pessoal" ? "Tarefas sem projeto." : projetoId ? `Tarefas de ${nomeProjeto(projetoId)}.` : "Tarefas do seu projeto."}</p>
            </div>
            <div className="space-y-0.5">
              {diasDaSemana.map((d, i) => {
                const ch = chaveDia(d);
                const ts = porDia.get(ch) ?? [];
                const feitas = ts.filter((t) => t.sit === "concluida").length;
                const atr = ts.filter((t) => t.sit === "atrasada").length;
                const sel = foco.tipo === "dia" && foco.chave === ch;
                return (
                  <button key={ch} type="button" onClick={() => irParaDia(d)} data-dia-alvo={ch}
                    className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors", sel ? "bg-primary/10 font-semibold" : "hover:bg-muted",
                      arrastoT?.dia === ch && "bg-primary/20 ring-2 ring-primary")}>
                    <span className={cn("w-24 shrink-0 truncate", ch === chaveDia(hoje) && "text-primary")}>{NOMES_DIAS[i]}</span>
                    <span className="w-5 shrink-0 text-right font-semibold tabular-nums" title={`${ts.length} tarefa${ts.length === 1 ? "" : "s"} no dia`}>{ts.length}</span>
                    {/* Progresso do dia: concluídas sobre o total; o número à direita são as atrasadas (some quando 0). */}
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" title={`${feitas} de ${ts.length} concluída${feitas === 1 ? "" : "s"}`}>
                      <span className="block h-full rounded-full bg-emerald-500" style={{ width: ts.length ? `${(feitas / ts.length) * 100}%` : "0%" }} />
                    </span>
                    <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-red-500" title={atr ? `${atr} atrasada${atr > 1 ? "s" : ""}` : undefined}>{atr || ""}</span>
                  </button>
                );
              })}
            </div>
            {/* Calendário em segundo, depois dos dias da semana (25/10, Davi). */}
            <div className="rounded-lg border p-2">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold capitalize">{format(mes, "MMMM yyyy", { locale: ptBR })}</h3>
                <div className="flex">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMes(addMonths(mes, -1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMes(addMonths(mes, 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
                {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => <span key={i} className="py-1">{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5 text-center">
                {Array.from({ length: 42 }, (_, i) => addDays(inicioDaSemana(mes), i)).map((d) => {
                  const ch = chaveDia(d);
                  const ts = porDia.get(ch) ?? [];
                  const sel = foco.tipo === "dia" && foco.chave === ch;
                  const ehHoje = ch === chaveDia(hoje);
                  const temAtrasada = ts.some((t) => t.sit === "atrasada");
                  return (
                    <button key={ch} type="button" onClick={() => irParaDia(d)} onDoubleClick={() => abrirNova(d)} data-dia-alvo={ch}
                      title={`${ts.length} tarefa${ts.length === 1 ? "" : "s"} · clique duas vezes para criar uma tarefa neste dia`}
                      className={cn("relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px] tabular-nums transition-colors",
                        !isSameMonth(d, mes) && "text-muted-foreground/40",
                        sel ? "bg-primary text-primary-foreground" : ehHoje ? "font-bold text-primary ring-1 ring-primary" : "hover:bg-muted",
                        arrastoT?.dia === ch && "bg-primary/30 ring-2 ring-primary")}>
                      {d.getDate()}
                      {ts.length > 0 && !sel && <span className={cn("absolute bottom-0.5 h-1 w-1 rounded-full", temAtrasada ? "bg-red-500" : "bg-primary/70")} />}
                    </button>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" className="mt-2 h-7 w-full gap-1 text-xs" onClick={() => abrirNova()}>
                <Plus className="h-4 w-4" />Tarefa em {format(dataLocal(diaNovo), "dd/MM")}
              </Button>
              <p className="mt-1.5 text-center text-[10.5px] text-muted-foreground">Clique no dia para ver · dois cliques para criar</p>
            </div>
            <div className="space-y-1 rounded-lg border p-2">
              {[
                { id: "atrasadas" as const, nome: "Atrasadas", n: atrasadas.length, icone: AlertCircle, cor: "text-red-500" },
                { id: "semdata" as const, nome: "Sem data", n: semData.length, icone: CalendarX2, cor: "text-muted-foreground" },
              ].map((x) => (
                <button key={x.id} type="button" onClick={() => { setFoco({ tipo: x.id }); setFiltroSit("todas"); }}
                  className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted", foco.tipo === x.id && "bg-primary/10 font-semibold")}>
                  <x.icone className={cn("h-4 w-4", x.cor)} /><span className="flex-1 text-left">{x.nome}</span><span className="font-semibold tabular-nums">{x.n}</span>
                </button>
              ))}
              <div className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
                <CalendarClock className="h-4 w-4 text-primary" /><span className="flex-1">{ehEstaSemana ? "Esta semana" : "Na semana"}</span><span className="font-semibold tabular-nums">{daSemana.length}</span>
              </div>
            </div>
            {projeto === "todos" && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Por projeto (na semana)</p>
                {[...projetos.map((p) => p.id), null].map((id) => {
                  const n = daSemana.filter((t) => t.cliente_id === id).length;
                  if (!n && id === null) return null;
                  const max = Math.max(1, ...projetos.map((p) => daSemana.filter((t) => t.cliente_id === p.id).length));
                  return (
                    <button key={id ?? "pessoal"} type="button" onClick={() => setProjeto(id ?? "pessoal")} title="Ver só este projeto"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-muted">
                      <span className={cn("h-3 w-3 shrink-0 rounded-sm", corProjeto(id))} />
                      <span className="min-w-0 flex-1 truncate text-left">{nomeProjeto(id)}</span>
                      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary/70" style={{ width: `${(n / max) * 100}%` }} /></span>
                      <span className="w-5 text-right tabular-nums text-muted-foreground">{n}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* ── Meio: o dia ── */}
        <Card className="min-w-0 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-2xl font-bold capitalize">{tituloFoco}</h2>
              <p className="text-xs text-muted-foreground">
                {foco.tipo === "dia" && `${format(dataLocal(foco.chave), "dd 'de' MMMM", { locale: ptBR })} · `}
                {doFoco.length} {doFoco.length === 1 ? "tarefa" : "tarefas"}{contar("atrasada") ? ` · ${contar("atrasada")} atrasada${contar("atrasada") > 1 ? "s" : ""}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={projeto} onValueChange={setProjeto}>
                <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meu">Meu projeto{meuProjeto ? ` (${meuProjeto.nome_especialista})` : ""}</SelectItem>
                  <SelectItem value="todos">Todos os projetos</SelectItem>
                  <SelectItem value="pessoal">Pessoal (sem projeto)</SelectItem>
                  <SelectSeparator />
                  {projetos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_especialista}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={pessoa} onValueChange={setPessoa}>
                <SelectTrigger className="h-8 w-[160px] text-xs"><Users className="mr-1 h-3.5 w-3.5" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as pessoas</SelectItem>
                  <SelectItem value="eu">Só eu</SelectItem>
                  <SelectSeparator />
                  {pessoas.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8 gap-1" onClick={() => abrirNova()}><Plus className="h-4 w-4" />Nova tarefa</Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setFiltroSit("todas")}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium", filtroSit === "todas" ? "bg-foreground text-background" : "bg-muted hover:bg-muted/70")}>
              Todas <span className="ml-1 opacity-70">{doFoco.length}</span>
            </button>
            {SITUACOES.map((s) => (
              <button key={s.id} type="button" onClick={() => setFiltroSit(filtroSit === s.id ? "todas" : s.id)}
                className={cn("flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium", filtroSit === s.id ? "border-foreground" : "border-transparent bg-muted/60 hover:bg-muted")}>
                <span className={cn("h-2 w-2 rounded-full", PONTO[s.id])} />{s.nome}<span className="opacity-60">{contar(s.id)}</span>
              </button>
            ))}
          </div>

          {nova && (
            <form className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2" onSubmit={(e) => { e.preventDefault(); void criar(); }}>
              <Input autoFocus value={nova.titulo} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} placeholder={`Nova tarefa para ${format(dataLocal(nova.dia || diaNovo), "EEEE, dd/MM", { locale: ptBR })}`}
                className="h-8 min-w-[200px] flex-1 text-sm" onKeyDown={(e) => { if (e.key === "Escape") setNova(null); }} />
              <Select value={nova.projeto} onValueChange={(v) => setNova({ ...nova, projeto: v })}>
                <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pessoal">Pessoal</SelectItem>
                  {projetos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_especialista}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={nova.dia || diaNovo} onChange={(e) => setNova({ ...nova, dia: e.target.value })} title="Dia"
                className="h-8 w-[140px] text-xs" />
              <Input type="time" value={nova.hora ?? ""} onChange={(e) => setNova({ ...nova, hora: e.target.value })} title="Hora (opcional — vira o alarme)"
                className="h-8 w-[100px] text-xs" />
              <Button type="submit" size="sm" className="h-8" disabled={!nova.titulo.trim()}>Criar</Button>
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setNova(null)}>Cancelar</Button>
            </form>
          )}

          <div className="mt-3 space-y-3">
            {doFoco.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nada aqui. {foco.tipo === "dia" && "Use “Nova tarefa” ou clique duas vezes no dia do calendário."}</p>}
            {grupos.map((s) => {
              const ts = s.ts;
              const fechada = fechadas.has(s.id) && filtroSit !== s.id;
              return (
                <div key={s.id}>
                  <button type="button" onClick={() => setFechadas((f) => { const n = new Set(f); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                    className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-semibold", s.fundo)}>
                    {s.projeto !== undefined ? <span className={cn("h-3 w-3 shrink-0 rounded-sm", corProjeto(s.projeto))} /> : s.icone && <s.icone className={cn("h-4 w-4", s.cor)} />}
                    <span className={s.id === "atrasada" ? "text-red-600 dark:text-red-400" : ""}>{s.nome} ({ts.length})</span>
                    <ChevronDown className={cn("ml-auto h-4 w-4 opacity-60 transition-transform", fechada && "-rotate-90")} />
                  </button>
                  {!fechada && (
                    <ul className="mt-1 divide-y">
                      {ts.map((t) => {
                        const atraso = diasDeAtraso(t, hoje);
                        const nomes = parseResponsaveis(t.responsavel_nome);
                        return (
                          <li key={t.id} data-tarefa-id={t.id} data-tarefa-grupo={s.id}
                            className={cn("group relative flex items-center gap-2.5 px-2 py-1.5 text-[13px] hover:bg-muted/40",
                              arrastoT?.id === t.id && "opacity-40",
                              arrastoT?.grupo === s.id && arrastoT.alvo === t.id && arrastoT.id !== t.id && (arrastoT.depois
                                ? "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded after:bg-primary after:content-['']"
                                : "before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded before:bg-primary before:content-['']"))}>
                            {/* Segure e arraste para mudar a ordem (25/10, Davi) — ou solte num dia da esquerda para mudar a data. */}
                            <span title="Segure e arraste: muda a ordem, ou solte num dia da semana (à esquerda) para mudar o dia" aria-hidden
                              onPointerDown={(e) => { e.preventDefault(); document.body.style.userSelect = "none"; inicioT.current = { x: e.clientX, y: e.clientY, id: t.id, grupo: s.id, ids: ts.map((x) => x.id) }; }}
                              className="-ml-1 -mr-1.5 cursor-grab text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground group-hover:opacity-100 active:cursor-grabbing">
                              <GripVertical className="h-3.5 w-3.5" />
                            </span>
                            <Checkbox checked={t.concluida} onCheckedChange={(v) => void concluir(t, v === true)} aria-label="Concluir" />
                            <span className={cn("h-2 w-2 shrink-0 rounded-full", PONTO[t.sit])} />
                            <button type="button" onClick={() => void abrir(t.id)} className={cn("min-w-0 flex-1 truncate text-left hover:underline", t.concluida && "text-muted-foreground line-through")}>{t.titulo}</button>
                            {foco.tipo !== "dia" && t.dia && <span className="shrink-0 text-[11px] text-muted-foreground">{format(dataLocal(t.dia), "dd/MM")}</span>}
                            <span className="hidden max-w-[120px] shrink-0 sm:flex">
                              <SeletorProjeto atividade={t} projetos={projetosSeletor} onMudou={(m) => mudarNaLinha(t.id, m)}>
                                <span className="flex min-w-0 items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  <span className={cn("h-2 w-2 shrink-0 rounded-sm", corProjeto(t.cliente_id))} /><span className="truncate">{nomeProjeto(t.cliente_id)}</span>
                                </span>
                              </SeletorProjeto>
                            </span>
                            <span className="hidden w-24 shrink-0 md:flex">
                              <SeletorResponsavel atividadeId={t.id} clienteId={t.cliente_id} responsavelNome={t.responsavel_nome} onMudou={(m) => mudarNaLinha(t.id, m)}>
                                <ResponsavelAvatares responsavelNome={t.responsavel_nome} max={2} />
                                <span className="truncate pr-1 text-xs">{nomes[0]?.split(" ")[0] ?? ""}</span>
                              </SeletorResponsavel>
                            </span>
                            <span className="hidden w-24 shrink-0 justify-end lg:flex">
                              {atraso > 0 ? <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">{atraso}d atrasada</span>
                                : (t.progresso ?? 0) > 0 && !t.concluida ? (
                                  <span className="flex w-full items-center gap-1.5"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-blue-500" style={{ width: `${Math.min(100, t.progresso ?? 0)}%` }} /></span><span className="text-[11px] tabular-nums text-muted-foreground">{t.progresso}%</span></span>
                                ) : t.prioridade === "alta" ? <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[11px] text-orange-600">Alta</span> : null}
                            </span>
                            {!t.concluida && (
                              <button type="button" onClick={() => setFocando({ id: t.id, titulo: t.titulo })} title="Focar nesta tarefa"
                                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-primary opacity-0 transition-opacity hover:bg-primary/10 group-hover:opacity-100">
                                <Target className="h-3.5 w-3.5" />Focar
                              </button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-50 group-hover:opacity-100" aria-label="Mais"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => void abrir(t.id)}>Abrir</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void adiar(t, 1)}>{t.sit === "atrasada" ? "Passar para amanhã" : "Adiar 1 dia"}</DropdownMenuItem>
                                {t.sit === "atrasada" && <DropdownMenuItem onClick={() => void adiar(t, 0)}>Passar para hoje</DropdownMenuItem>}
                                <DropdownMenuItem onClick={() => void adiar(t, 7)}>Próxima semana</DropdownMenuItem>
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>Mover para…</DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    {Array.from({ length: 7 }, (_, k) => addDays(hoje, k)).map((d) => (
                                      <DropdownMenuItem key={chaveDia(d)} disabled={t.dia === chaveDia(d)} onClick={() => void moverParaDia(t.id, chaveDia(d))}>
                                        <span className="capitalize">{chaveDia(d) === chaveDia(hoje) ? "Hoje" : format(d, "EEEE", { locale: ptBR })}</span>
                                        <span className="ml-auto pl-4 text-xs text-muted-foreground">{format(d, "dd/MM")}</span>
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => void excluir(t.id)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4" />Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

      </div>

      {/* ── Embaixo: o Kanban do projeto ── */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">Kanban do projeto{kanbanId ? ` (${nomeProjeto(kanbanId)})` : ""}</h2>
            <p className="text-xs text-muted-foreground">O mesmo quadro do projeto: o que mudar aqui muda lá.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={kanbanId ?? ""} onValueChange={setKanbanProjeto}>
              <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Escolha o projeto" /></SelectTrigger>
              <SelectContent>{projetos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_especialista}</SelectItem>)}</SelectContent>
            </Select>
            {kanbanId && guias && (
              <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => guias.openTab(`/clientes/${kanbanId}?secao=atividades`, nomeProjeto(kanbanId), { nova: true })}>
                <Maximize2 className="h-3.5 w-3.5" />Ver em tela cheia
              </Button>
            )}
          </div>
        </div>
        {kanbanId ? <AtividadesView key={kanbanId} clienteId={kanbanId} /> : <p className="py-8 text-center text-sm text-muted-foreground">Escolha um projeto para ver o Kanban.</p>}
      </Card>

      <FocarTarefa tarefa={focando} onFechar={() => setFocando(null)} />
      <AtividadeDetailPanel
        open={!!aberta}
        onClose={() => setAberta(null)}
        atividade={aberta?.atividade as never}
        colunas={aberta?.colunas ?? []}
        onUpdate={() => void carregar()}
        onDelete={(id) => void excluir(id)}
      />
    </div>
  );
}
