import { useEffect, useMemo, useState } from "react";
import { endOfDay, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BellOff, Check, Columns3, Crosshair, List, Maximize2 as Expandir, ExternalLink, Globe, Maximize2, Pause, Play, Plus, RotateCcw, SkipForward, Target, X } from "lucide-react";
import { toast } from "sonner";
import { useAssistantAtividades, type AssistantTarefa } from "@/hooks/useAssistantAtividades";
import { chamarGoogleCalendar, type GoogleCalendarEvent } from "@/lib/googleCalendar";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { AtividadeDetailPanel } from "@/components/atividades/AtividadeDetailPanel";
import { excluirAtividade } from "@/lib/atividades/excluirAtividade";
import { isDesktop } from "@/lib/platform";
import { CICLOS, mmss, useFocoTimer, type Ciclo } from "@/hooks/useFocoTimer";
import { ATALHO_DESLIGAR, ATALHO_LIGAR, CHAVE_SITES, desligarFocoTotal, ligarFocoTotal, lerSites } from "@/lib/foco/focoTotal";

// Modo Foco (27/10, Davi: "quero deixar algo parecido com esse; dentro, a atividade linkada às minhas
// atividades, ou eu posso criar; e os sites que vou usar"). Cronômetro com ciclos (foco/pausa), o foco atual
// (uma atividade: o cronômetro dela anda junto), as tarefas de hoje, a agenda do dia e os sites de trabalho.
// O estado do cronômetro fica salvo neste aparelho: trocar de guia ou recarregar não zera.

const urlDe = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);
const hoje = () => format(new Date(), "yyyy-MM-dd");

export default function ModoFoco() {
  const { tarefas, atrasadas, iniciarTimer, pausarTimer, concluir, criarAtividade, colunasDoProjeto, moverParaStatus } = useAssistantAtividades();
  const { estado, rodando, restante, total, focoHojeMin, tocar, comecar, reiniciar, pular, escolherCiclo, escolherTarefa, marcarTotal } =
    useFocoTimer({ iniciarTimer: (id) => iniciarTimer(id), pausarTimer: (id) => pausarTimer(id) });
  const [personalizado, setPersonalizado] = useState<{ foco: string; pausa: string } | null>(null);

  // Foco total (Não Perturbe + só os sites de trabalho + janelinha lateral; tela cheia opcional).
  const [telaCheia, setTelaCheia] = useState(() => { try { return localStorage.getItem("modo-foco:tela-cheia") === "1"; } catch { return false; } });
  const [ajudaAtalhos, setAjudaAtalhos] = useState(false);
  const alternarTotal = async () => {
    if (estado.total) {
      await desligarFocoTotal();
      marcarTotal(false);
      toast.success("Foco total desligado. Notificações e sites de volta.");
      return;
    }
    const r = await ligarFocoTotal({ telaCheia });
    marcarTotal(true);
    if (estado.fase === "foco") comecar();
    abrirSites();
    if (!r.naoPerturbe) { setAjudaAtalhos(true); toast.info("Foco total ligado — falta só criar os atalhos do Não Perturbe (veja abaixo)."); }
    else toast.success("Foco total ligado: Não Perturbe, só os sites de trabalho e o cronômetro no canto.");
  };

  // Tarefas de hoje: as suas que vencem hoje ou já atrasaram (em aberto); a do foco atual sempre aparece.
  const dia = hoje();
  const deHoje = useMemo(() => {
    const lista = [...atrasadas, ...tarefas].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i)
      .filter((t) => (t.data_vencimento ?? t.data_atividade ?? "").slice(0, 10) <= dia && (t.data_vencimento || t.data_atividade))
      // Só as suas: tarefas feitas à mão (sem tipo) com você de responsável (ou sem ninguém). Ficam de fora os
      // avisos e entregas dos agentes ("Revisar edição", "Travou", carrossel, programação…).
      .filter((t) => !t.tipo && (!t.responsavel_nome || /^davi\b/i.test(t.responsavel_nome.trim())));
    return lista.slice(0, 30);
  }, [tarefas, atrasadas, dia]);
  const tarefaAtual = [...tarefas, ...atrasadas].find((t) => t.id === estado.tarefaId) ?? null;

  // Projeto (27/10, Davi: "escolher o projeto, mostrar qual é em cada atividade e clicar nela para ver mais").
  const [projetos, setProjetos] = useState<{ id: string; nome: string }[]>([]);
  useEffect(() => {
    void supabase.from("clientes").select("id, nome_especialista").eq("arquivado", false).order("nome_especialista")
      .then(({ data }) => setProjetos((data ?? []).map((c) => ({ id: c.id, nome: c.nome_especialista }))));
  }, []);
  const nomeProjeto = (id: string | null) => (id ? projetos.find((p) => p.id === id)?.nome ?? "Projeto" : "Pessoal");
  const [filtroProjeto, setFiltroProjetoBruto] = useState<string>(() => { try { return localStorage.getItem("modo-foco:projeto") || "todos"; } catch { return "todos"; } });
  const setFiltroProjeto = (v: string) => { setFiltroProjetoBruto(v); try { localStorage.setItem("modo-foco:projeto", v); } catch { /* */ } };
  const doProjeto = (t: AssistantTarefa) => filtroProjeto === "todos" || (filtroProjeto === "pessoal" ? !t.cliente_id : t.cliente_id === filtroProjeto);
  const visiveis = deHoje.filter(doProjeto);

  // Kanban (27/10, Davi: "visualização de kanban e funcional; ao selecionar, a mesma função de foco"): todas as
  // suas tarefas em aberto do projeto (não só as de hoje), nas colunas dele; arrastar muda a coluna (soltar na
  // de conclusão conclui) e clicar no cartão o coloca em foco. Em "Todos", as colunas padrão.
  const [vista, setVistaBruta] = useState<"lista" | "kanban">(() => { try { return localStorage.getItem("modo-foco:vista") === "kanban" ? "kanban" : "lista"; } catch { return "lista"; } });
  const setVista = (v: "lista" | "kanban") => { setVistaBruta(v); try { localStorage.setItem("modo-foco:vista", v); } catch { /* */ } };
  const [colunas, setColunas] = useState<{ nome: string; status_key: string; eh_conclusao: boolean }[]>([]);
  useEffect(() => {
    if (vista !== "kanban") return;
    const padrao = [{ nome: "Backlog", status_key: "backlog", eh_conclusao: false }, { nome: "Em execução", status_key: "em_progresso", eh_conclusao: false },
      { nome: "Revisão", status_key: "revisao", eh_conclusao: false }, { nome: "Finalizado", status_key: "finalizado", eh_conclusao: true }];
    if (filtroProjeto === "todos") { setColunas(padrao); return; }
    void colunasDoProjeto(filtroProjeto === "pessoal" ? null : filtroProjeto).then((c) => setColunas(c.length ? c : padrao)).catch(() => setColunas(padrao));
  }, [vista, filtroProjeto, colunasDoProjeto]);
  const minhasAbertas = useMemo(() => [...atrasadas, ...tarefas].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i)
    .filter((t) => !t.tipo && (!t.responsavel_nome || /^davi\b/i.test(t.responsavel_nome.trim()))), [tarefas, atrasadas]);
  const doKanban = minhasAbertas.filter(doProjeto);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const soltar = (statusKey: string, ehConclusao: boolean) => {
    const id = arrastando;
    setArrastando(null); setSobre(null);
    if (!id) return;
    const t = doKanban.find((x) => x.id === id);
    if (!t || t.status === statusKey) return;
    if (ehConclusao && estado.tarefaId === id) escolherTarefa(null);
    void moverParaStatus(id, statusKey, ehConclusao);
  };
  const [aberta, setAberta] = useState<{ atividade: Record<string, unknown>; colunas: unknown[] } | null>(null);
  const abrirDetalhes = async (id: string) => {
    const { data } = await supabase.from("atividades").select("*").eq("id", id).maybeSingle();
    if (!data) return;
    let q = supabase.from("colunas_atividade").select("*").order("ordem");
    q = data.cliente_id ? q.eq("cliente_id", data.cliente_id) : q.is("cliente_id", null);
    const { data: colunas } = await q;
    setAberta({ atividade: data as Record<string, unknown>, colunas: colunas ?? [] });
  };
  const [nova, setNova] = useState("");
  const adicionar = async () => {
    const titulo = nova.trim();
    if (!titulo) return;
    setNova("");
    try {
      await criarAtividade({ titulo, clienteId: filtroProjeto !== "todos" && filtroProjeto !== "pessoal" ? filtroProjeto : null, dataAtividade: dia, tempoEstimado: null, prioridade: "media", statusKey: (vista === "kanban" && filtroProjeto !== "todos" && colunas.find((c) => !c.eh_conclusao)?.status_key) || "backlog" });
    } catch { toast.error("Não consegui criar a tarefa"); }
  };

  // Agenda de hoje (Google Agenda).
  const [agenda, setAgenda] = useState<GoogleCalendarEvent[] | null>(null);
  useEffect(() => {
    const d = new Date();
    void chamarGoogleCalendar<{ events: GoogleCalendarEvent[] }>({
      action: "events", calendarIds: ["primary"], timeMin: startOfDay(d).toISOString(), timeMax: endOfDay(d).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).then((r) => setAgenda((r.events ?? []).filter((e) => e.status !== "cancelled")
      .sort((a, b) => (a.start.dateTime ?? a.start.date ?? "").localeCompare(b.start.dateTime ?? b.start.date ?? ""))))
      .catch(() => setAgenda([]));
  }, []);

  // Sites de trabalho.
  const [sites, setSitesBruto] = useState<string[]>(lerSites);
  const setSites = (l: string[]) => { setSitesBruto(l); try { localStorage.setItem(CHAVE_SITES, JSON.stringify(l)); } catch { /* */ } };
  const [novoSite, setNovoSite] = useState("");
  const addSite = () => {
    const s = novoSite.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (!s) return;
    if (!sites.includes(s)) setSites([...sites, s]);
    setNovoSite("");
  };
  const abrirSites = () => { for (const s of sites) void abrirLinkExterno(urlDe(s)); };
  // Mudou a lista com o foco total ligado: o navegador passa a liberar a lista nova na hora.
  useEffect(() => {
    if (!estado.total || !isDesktop()) return;
    void import("@tauri-apps/api/core").then(({ invoke }) => invoke("foco_sites_ligar", { permitidos: sites })).catch(() => undefined);
  }, [sites, estado.total]);

  const progresso = total ? 1 - restante / total : 0;
  const raio = 118, volta = 2 * Math.PI * raio;
  const cartao = "rounded-3xl border bg-card/80 p-6 shadow-sm backdrop-blur";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Modo Foco</h1>
          <p className="text-sm capitalize text-muted-foreground">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
        </div>
        {isDesktop() && (
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground" title="Abre o Infopro em tela cheia, numa área de trabalho só dele">
              <input type="checkbox" checked={telaCheia} onChange={(e) => { setTelaCheia(e.target.checked); try { localStorage.setItem("modo-foco:tela-cheia", e.target.checked ? "1" : "0"); } catch { /* */ } }} />
              <Maximize2 className="h-3.5 w-3.5" />Área própria
            </label>
            <button type="button" onClick={() => void alternarTotal()}
              className={cn("flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm", estado.total ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-[#3d7fe0] text-white hover:bg-[#4b8cf0]")}>
              <Target className="h-4 w-4" />{estado.total ? "Sair do foco total" : "Foco total"}
            </button>
          </div>
        )}
      </div>
      {ajudaAtalhos && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <div className="mb-1 flex items-center gap-2 font-semibold"><BellOff className="h-4 w-4" />Para silenciar as notificações (uma vez só)</div>
          <p className="text-muted-foreground">O Mac não deixa um app ligar o Não Perturbe sozinho. Crie dois atalhos no app <b>Atalhos</b>:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Novo atalho com o nome <b>{ATALHO_LIGAR}</b> e a ação <b>Definir Foco</b> → <b>Não Perturbe</b> → <b>Ativar</b>.</li>
            <li>Outro com o nome <b>{ATALHO_DESLIGAR}</b> e a ação <b>Definir Foco</b> → <b>Não Perturbe</b> → <b>Desativar</b>.</li>
          </ol>
          <p className="mt-2 text-muted-foreground">Pronto: da próxima vez que ligar o foco total, as notificações silenciam sozinhas.</p>
          <button type="button" onClick={() => setAjudaAtalhos(false)} className="mt-2 text-xs underline">Entendi</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        {/* Cronômetro */}
        <div className="rounded-3xl bg-gradient-to-b from-[#1f3f73] to-[#16305a] p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wider">{estado.fase === "foco" ? "MODO FOCO" : "PAUSA"}</span>
            <span className="text-xs text-white/70">Hoje: {focoHojeMin} min de foco</span>
          </div>
          <div className="relative mx-auto my-6 h-64 w-64">
            <svg viewBox="0 0 260 260" className="h-full w-full -rotate-90">
              <circle cx="130" cy="130" r={raio} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
              <circle cx="130" cy="130" r={raio} fill="none" stroke={estado.fase === "foco" ? "#7cc4ff" : "#7fe3b4"} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={volta} strokeDashoffset={volta * (1 - progresso)} className="transition-[stroke-dashoffset] duration-500" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-6xl font-bold tabular-nums">{mmss(restante)}</span>
              <span className="mt-1 text-sm text-white/70">{estado.fase === "foco" ? "Trabalho profundo" : "Respira, levanta, bebe água"}</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4">
            <button type="button" onClick={reiniciar} title="Recomeçar este bloco" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><RotateCcw className="h-4 w-4" /></button>
            <button type="button" onClick={tocar} title={rodando ? "Pausar" : "Começar"} className="flex h-16 w-16 items-center justify-center rounded-full bg-[#3d7fe0] shadow-lg hover:bg-[#4b8cf0]">
              {rodando ? <Pause className="h-6 w-6 fill-current" /> : <Play className="ml-1 h-6 w-6 fill-current" />}
            </button>
            <button type="button" onClick={pular} title={estado.fase === "foco" ? "Ir para a pausa" : "Pular a pausa"} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><SkipForward className="h-4 w-4" /></button>
          </div>
          <div className="mt-6 grid grid-cols-4 gap-2 text-sm">
            {CICLOS.map((c) => (
              <button key={c.id} type="button" onClick={() => escolherCiclo(c)}
                className={cn("rounded-xl py-2 font-medium", estado.ciclo.id === c.id ? "bg-[#3d7fe0]" : "bg-white/10 hover:bg-white/20")}>{c.rotulo}</button>
            ))}
            <button type="button" onClick={() => setPersonalizado(personalizado ? null : { foco: String(estado.ciclo.foco), pausa: String(estado.ciclo.pausa) })}
              className={cn("rounded-xl py-2 font-medium", !CICLOS.some((c) => c.id === estado.ciclo.id) ? "bg-[#3d7fe0]" : "bg-white/10 hover:bg-white/20")}>Pers.</button>
          </div>
          {personalizado && (
            <form className="mt-3 flex items-center gap-2 text-sm" onSubmit={(e) => {
              e.preventDefault();
              const f = Math.max(1, Math.min(240, Number(personalizado.foco) || 0)), p = Math.max(1, Math.min(60, Number(personalizado.pausa) || 0));
              escolherCiclo({ id: `p${f}/${p}`, rotulo: `${f}/${p}`, foco: f, pausa: p }); setPersonalizado(null);
            }}>
              <input value={personalizado.foco} onChange={(e) => setPersonalizado({ ...personalizado, foco: e.target.value })} inputMode="numeric" className="w-16 rounded-lg bg-white/10 px-2 py-1.5 outline-none" />
              <span className="text-white/70">min foco</span>
              <input value={personalizado.pausa} onChange={(e) => setPersonalizado({ ...personalizado, pausa: e.target.value })} inputMode="numeric" className="w-14 rounded-lg bg-white/10 px-2 py-1.5 outline-none" />
              <span className="text-white/70">pausa</span>
              <button type="submit" className="ml-auto rounded-lg bg-[#3d7fe0] px-3 py-1.5 font-medium">Usar</button>
            </form>
          )}
          <label className="mt-6 block text-xs text-white/70">Foco atual</label>
          <select value={estado.tarefaId ?? ""} onChange={(e) => escolherTarefa(e.target.value || null)}
            className="mt-1 w-full rounded-xl bg-white/10 px-3 py-3 text-sm outline-none [&>option]:text-black">
            <option value="">Sem tarefa específica</option>
            {[...deHoje, ...(tarefaAtual && !deHoje.some((t) => t.id === tarefaAtual.id) ? [tarefaAtual] : [])].map((t) => (
              <option key={t.id} value={t.id}>{t.titulo}</option>
            ))}
          </select>
          {tarefaAtual && <p className="mt-2 text-[11px] text-white/60">O cronômetro desta atividade anda junto com os blocos de foco.</p>}
        </div>

        <div className="space-y-5">
          {/* Tarefas de hoje */}
          <div className={cartao}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{vista === "kanban" ? "Tarefas" : "Tarefas de hoje"}</h2>
                <span className="flex rounded-lg bg-muted p-0.5">
                  {([["lista", List, "Lista (as de hoje)"], ["kanban", Columns3, "Kanban (todas em aberto)"]] as const).map(([v, Icone, rotulo]) => (
                    <button key={v} type="button" onClick={() => setVista(v)} title={rotulo}
                      className={cn("rounded-md px-2 py-1", vista === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}><Icone className="h-3.5 w-3.5" /></button>
                  ))}
                </span>
              </div>
              <select value={filtroProjeto} onChange={(e) => setFiltroProjeto(e.target.value)} title="Projeto"
                className="max-w-[220px] rounded-lg border bg-background/60 px-2 py-1 text-xs outline-none">
                <option value="todos">Todos os projetos</option>
                <option value="pessoal">Pessoal</option>
                {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            {vista === "kanban" ? (
              <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
                {colunas.map((c) => {
                  const cartoes = c.eh_conclusao ? [] : doKanban.filter((t) => (t.status === c.status_key) || (!colunas.some((x) => x.status_key === t.status) && c === colunas[0]))
                    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
                  return (
                    <div key={c.status_key}
                      onDragOver={(e) => { e.preventDefault(); setSobre(c.status_key); }} onDragLeave={() => setSobre((x) => (x === c.status_key ? null : x))}
                      onDrop={(e) => { e.preventDefault(); soltar(c.status_key, c.eh_conclusao); }}
                      className={cn("flex w-60 shrink-0 flex-col rounded-2xl bg-muted/50 p-2 transition-colors", sobre === c.status_key && "bg-primary/10 ring-2 ring-primary/40",
                        c.eh_conclusao && "border-2 border-dashed border-emerald-500/40 bg-emerald-500/5")}>
                      <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
                        <span className="truncate">{c.nome}</span>
                        {!c.eh_conclusao && <span className="text-muted-foreground">{cartoes.length}</span>}
                      </div>
                      {c.eh_conclusao ? (
                        <p className="flex flex-1 items-center justify-center px-2 py-6 text-center text-[11px] text-emerald-700 dark:text-emerald-400">Solte aqui para concluir</p>
                      ) : (
                        <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
                          {cartoes.map((t) => (
                            <div key={t.id} draggable onDragStart={() => setArrastando(t.id)} onDragEnd={() => { setArrastando(null); setSobre(null); }}
                              onClick={() => escolherTarefa(estado.tarefaId === t.id ? null : t.id)} title={estado.tarefaId === t.id ? "Em foco (clique para tirar)" : "Clique para focar nesta"}
                              className={cn("group cursor-pointer rounded-xl border bg-card p-2.5 text-sm shadow-sm transition hover:border-primary/40",
                                estado.tarefaId === t.id && "border-primary ring-2 ring-primary/30", arrastando === t.id && "opacity-50")}>
                              <div className="flex items-start gap-1.5">
                                <span className="min-w-0 flex-1 leading-snug">{t.titulo}</span>
                                <button type="button" onClick={(e) => { e.stopPropagation(); void abrirDetalhes(t.id); }} title="Abrir a atividade"
                                  className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"><Expandir className="h-3.5 w-3.5" /></button>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10.5px]">
                                {estado.tarefaId === t.id && <span className="rounded-full bg-primary px-1.5 py-0.5 font-medium text-primary-foreground">em foco</span>}
                                {filtroProjeto === "todos" && <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">{nomeProjeto(t.cliente_id)}</span>}
                                {t.data_vencimento && <span className={cn("rounded-full px-1.5 py-0.5", t.data_vencimento.slice(0, 10) < dia ? "bg-rose-500/15 text-rose-600" : "bg-muted text-muted-foreground")}>
                                  {format(new Date(`${t.data_vencimento.slice(0, 10)}T12:00:00`), "dd/MM")}</span>}
                              </div>
                            </div>
                          ))}
                          {cartoes.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">Nada aqui</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
            <div className="space-y-1">
              {visiveis.length === 0 && <p className="py-2 text-sm text-muted-foreground">Nada vencendo hoje{filtroProjeto !== "todos" ? " neste projeto" : ""}. Crie uma abaixo ou escolha o foco livre.</p>}
              {visiveis.map((t: AssistantTarefa) => (
                <div key={t.id} className={cn("group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/60", estado.tarefaId === t.id && "bg-primary/10")}>
                  <button type="button" onClick={() => { if (estado.tarefaId === t.id) escolherTarefa(null); void concluir(t.id); }} title="Concluir"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 text-transparent hover:border-emerald-500 hover:text-emerald-500"><Check className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => void abrirDetalhes(t.id)} className="min-w-0 flex-1 truncate text-left text-sm" title="Ver e editar a atividade">
                    {t.titulo}
                    {(t.data_vencimento ?? "").slice(0, 10) < dia && t.data_vencimento && <span className="ml-2 text-[11px] text-rose-500">atrasada</span>}
                  </button>
                  <span className="max-w-[140px] shrink-0 truncate rounded-full bg-muted px-2 py-0.5 text-[10.5px] text-muted-foreground" title={nomeProjeto(t.cliente_id)}>{nomeProjeto(t.cliente_id)}</span>
                  {estado.tarefaId === t.id
                    ? <button type="button" onClick={() => escolherTarefa(null)} title="Tirar do foco" className="shrink-0 text-[11px] font-medium text-primary hover:underline">em foco</button>
                    : <button type="button" onClick={() => escolherTarefa(t.id)} title="Focar nesta" className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 hover:bg-primary/10 hover:text-primary group-hover:opacity-100"><Crosshair className="h-3.5 w-3.5" />Focar</button>}
                </div>
              ))}
            </div>
            )}
            <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void adicionar(); }}>
              <input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Adicionar uma tarefa…"
                className="w-full rounded-xl border bg-background/60 px-4 py-2.5 text-sm outline-none focus:border-primary/50" />
            </form>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {/* Agenda de hoje */}
            <div className={cartao}>
              <h2 className="mb-3 font-semibold">Agenda de hoje</h2>
              {agenda == null ? <p className="text-sm text-muted-foreground">Carregando…</p>
                : agenda.length === 0 ? <p className="text-sm text-muted-foreground">Nada na agenda hoje (ou o Google Agenda não está conectado).</p>
                : (
                  <div className="space-y-1.5">
                    {agenda.map((e) => {
                      const h = e.start.dateTime ? format(new Date(e.start.dateTime), "HH:mm") : "dia todo";
                      const passou = e.start.dateTime && new Date(e.start.dateTime).getTime() < Date.now();
                      return (
                        <div key={e.id} className={cn("flex items-center gap-3 rounded-xl border-l-4 border-primary/50 bg-muted/50 px-3 py-2 text-sm", passou && "opacity-60")}>
                          <span className="w-12 shrink-0 font-semibold tabular-nums">{h}</span>
                          <span className="min-w-0 truncate">{e.summary || "(sem título)"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>

            {/* Sites de trabalho */}
            <div className={cartao}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Sites de trabalho</h2>
                {sites.length > 0 && (
                  <button type="button" onClick={abrirSites} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10">
                    <ExternalLink className="h-3.5 w-3.5" />Abrir todos
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sites.map((s) => (
                  <span key={s} className="group flex items-center gap-1 rounded-full border bg-background/60 py-1 pl-2.5 pr-1 text-xs">
                    <Globe className="h-3 w-3 text-muted-foreground" />
                    <button type="button" onClick={() => void abrirLinkExterno(urlDe(s))} className="hover:underline">{s}</button>
                    <button type="button" onClick={() => setSites(sites.filter((x) => x !== s))} aria-label={`Tirar ${s}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                {sites.length === 0 && <p className="text-sm text-muted-foreground">Os sites que você usa para trabalhar (ex.: docs.google.com, canva.com). No foco total, só eles ficam liberados.</p>}
              </div>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); addSite(); }}>
                <input value={novoSite} onChange={(e) => setNovoSite(e.target.value)} placeholder="Adicionar site (ex.: notion.so)"
                  className="min-w-0 flex-1 rounded-xl border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button type="submit" className="flex items-center gap-1 rounded-xl bg-primary px-3 text-sm text-primary-foreground"><Plus className="h-4 w-4" /></button>
              </form>
            </div>
          </div>
        </div>
      </div>
      <AtividadeDetailPanel open={!!aberta} onClose={() => setAberta(null)} atividade={aberta?.atividade as never}
        colunas={(aberta?.colunas ?? []) as never} onUpdate={() => void (aberta && abrirDetalhes(String(aberta.atividade.id)))}
        onDelete={(id) => void excluirAtividade(id, () => undefined).then((ok) => { if (ok) setAberta(null); })} />
    </div>
  );
}
