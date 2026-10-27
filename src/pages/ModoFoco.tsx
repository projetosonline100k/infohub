import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { endOfDay, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, ExternalLink, Globe, Pause, Play, Plus, RotateCcw, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import { useAssistantAtividades, type AssistantTarefa } from "@/hooks/useAssistantAtividades";
import { chamarGoogleCalendar, type GoogleCalendarEvent } from "@/lib/googleCalendar";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { cn } from "@/lib/utils";

// Modo Foco (27/10, Davi: "quero deixar algo parecido com esse; dentro, a atividade linkada às minhas
// atividades, ou eu posso criar; e os sites que vou usar"). Cronômetro com ciclos (foco/pausa), o foco atual
// (uma atividade: o cronômetro dela anda junto), as tarefas de hoje, a agenda do dia e os sites de trabalho.
// O estado do cronômetro fica salvo neste aparelho: trocar de guia ou recarregar não zera.

type Ciclo = { id: string; rotulo: string; foco: number; pausa: number };
const CICLOS: Ciclo[] = [
  { id: "50/10", rotulo: "50/10", foco: 50, pausa: 10 },
  { id: "25/5", rotulo: "25/5", foco: 25, pausa: 5 },
  { id: "90/15", rotulo: "90/15", foco: 90, pausa: 15 },
];
interface Estado {
  ciclo: Ciclo; fase: "foco" | "pausa";
  /** Rodando: quando termina (ms). Parado: quanto falta (s). */
  terminaEm: number | null; restante: number;
  tarefaId: string | null;
  focoHoje: { dia: string; segundos: number };
}
const CHAVE = "modo-foco:estado";
const CHAVE_SITES = "modo-foco:sites";
const hoje = () => format(new Date(), "yyyy-MM-dd");
const inicial = (): Estado => ({ ciclo: CICLOS[0], fase: "foco", terminaEm: null, restante: CICLOS[0].foco * 60, tarefaId: null, focoHoje: { dia: hoje(), segundos: 0 } });
function ler(): Estado {
  try {
    const e = JSON.parse(localStorage.getItem(CHAVE) || "null") as Estado | null;
    if (!e) return inicial();
    return e.focoHoje?.dia === hoje() ? e : { ...e, focoHoje: { dia: hoje(), segundos: 0 } };
  } catch { return inicial(); }
}
const lerSites = (): string[] => { try { return JSON.parse(localStorage.getItem(CHAVE_SITES) || "[]"); } catch { return []; } };
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const urlDe = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);

function tocarFim() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
  } catch { /* sem áudio */ }
}

export default function ModoFoco() {
  const { tarefas, atrasadas, iniciarTimer, pausarTimer, concluir, criarAtividade } = useAssistantAtividades();
  const [estado, setEstadoBruto] = useState<Estado>(ler);
  const estadoRef = useRef(estado);
  const setEstado = useCallback((f: (e: Estado) => Estado) => {
    setEstadoBruto((atual) => { const novo = f(atual); estadoRef.current = novo; try { localStorage.setItem(CHAVE, JSON.stringify(novo)); } catch { /* */ } return novo; });
  }, []);
  const [agora, setAgora] = useState(Date.now());
  const [personalizado, setPersonalizado] = useState<{ foco: string; pausa: string } | null>(null);

  const rodando = estado.terminaEm != null;
  const restante = rodando ? Math.max(0, (estado.terminaEm! - agora) / 1000) : estado.restante;
  const total = (estado.fase === "foco" ? estado.ciclo.foco : estado.ciclo.pausa) * 60;

  // Relógio: um tique por segundo só enquanto roda; ao zerar, troca de fase.
  useEffect(() => {
    if (!rodando) return;
    const t = window.setInterval(() => setAgora(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [rodando]);
  const ultimoTique = useRef(Date.now());
  useEffect(() => {
    const e = estadoRef.current;
    if (e.terminaEm == null) { ultimoTique.current = Date.now(); return; }
    const passou = Math.min(5, (agora - ultimoTique.current) / 1000);
    ultimoTique.current = agora;
    if (e.fase === "foco" && passou > 0) setEstado((x) => ({ ...x, focoHoje: { dia: hoje(), segundos: (x.focoHoje.dia === hoje() ? x.focoHoje.segundos : 0) + passou } }));
    if (agora >= e.terminaEm) {
      tocarFim();
      const proxima = e.fase === "foco" ? "pausa" : "foco";
      if (e.fase === "foco" && e.tarefaId) void pausarTimer(e.tarefaId);
      toast.success(proxima === "pausa" ? `Bloco de foco feito! Pausa de ${e.ciclo.pausa} min.` : "Pausa acabou. Bora para o próximo bloco?");
      setEstado((x) => ({ ...x, fase: proxima, terminaEm: null, restante: (proxima === "foco" ? x.ciclo.foco : x.ciclo.pausa) * 60 }));
    }
  }, [agora, setEstado, pausarTimer]);

  const tocar = () => {
    if (rodando) {
      setEstado((x) => ({ ...x, terminaEm: null, restante: Math.max(1, Math.round((x.terminaEm! - Date.now()) / 1000)) }));
      if (estado.fase === "foco" && estado.tarefaId) void pausarTimer(estado.tarefaId);
    } else {
      ultimoTique.current = Date.now();
      setEstado((x) => ({ ...x, terminaEm: Date.now() + x.restante * 1000 }));
      if (estado.fase === "foco" && estado.tarefaId) void iniciarTimer(estado.tarefaId);
    }
  };
  const reiniciar = () => {
    if (rodando && estado.fase === "foco" && estado.tarefaId) void pausarTimer(estado.tarefaId);
    setEstado((x) => ({ ...x, terminaEm: null, restante: (x.fase === "foco" ? x.ciclo.foco : x.ciclo.pausa) * 60 }));
  };
  const pular = () => {
    if (rodando && estado.fase === "foco" && estado.tarefaId) void pausarTimer(estado.tarefaId);
    setEstado((x) => { const f = x.fase === "foco" ? "pausa" : "foco"; return { ...x, fase: f, terminaEm: null, restante: (f === "foco" ? x.ciclo.foco : x.ciclo.pausa) * 60 }; });
  };
  const escolherCiclo = (c: Ciclo) => {
    if (rodando && estado.fase === "foco" && estado.tarefaId) void pausarTimer(estado.tarefaId);
    setEstado((x) => ({ ...x, ciclo: c, fase: "foco", terminaEm: null, restante: c.foco * 60 }));
  };
  const escolherTarefa = (id: string | null) => {
    if (rodando && estado.fase === "foco") {
      if (estado.tarefaId) void pausarTimer(estado.tarefaId);
      if (id) void iniciarTimer(id);
    }
    setEstado((x) => ({ ...x, tarefaId: id }));
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
  const [nova, setNova] = useState("");
  const adicionar = async () => {
    const titulo = nova.trim();
    if (!titulo) return;
    setNova("");
    try {
      await criarAtividade({ titulo, clienteId: null, dataAtividade: dia, tempoEstimado: null, prioridade: "media", statusKey: "backlog" });
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

  const progresso = total ? 1 - restante / total : 0;
  const raio = 118, volta = 2 * Math.PI * raio;
  const cartao = "rounded-3xl border bg-card/80 p-6 shadow-sm backdrop-blur";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Modo Foco</h1>
        <p className="text-sm capitalize text-muted-foreground">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        {/* Cronômetro */}
        <div className="rounded-3xl bg-gradient-to-b from-[#1f3f73] to-[#16305a] p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wider">{estado.fase === "foco" ? "MODO FOCO" : "PAUSA"}</span>
            <span className="text-xs text-white/70">Hoje: {Math.round(estado.focoHoje.segundos / 60)} min de foco</span>
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
            <h2 className="mb-3 font-semibold">Tarefas de hoje</h2>
            <div className="space-y-1">
              {deHoje.length === 0 && <p className="py-2 text-sm text-muted-foreground">Nada vencendo hoje. Crie uma abaixo ou escolha o foco livre.</p>}
              {deHoje.map((t: AssistantTarefa) => (
                <div key={t.id} className={cn("group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/60", estado.tarefaId === t.id && "bg-primary/10")}>
                  <button type="button" onClick={() => { if (estado.tarefaId === t.id) escolherTarefa(null); void concluir(t.id); }} title="Concluir"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 text-transparent hover:border-emerald-500 hover:text-emerald-500"><Check className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => escolherTarefa(t.id)} className="min-w-0 flex-1 truncate text-left text-sm" title="Focar nesta">
                    {t.titulo}
                    {(t.data_vencimento ?? "").slice(0, 10) < dia && t.data_vencimento && <span className="ml-2 text-[11px] text-rose-500">atrasada</span>}
                  </button>
                  {estado.tarefaId === t.id && <span className="text-[11px] font-medium text-primary">em foco</span>}
                </div>
              ))}
            </div>
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
    </div>
  );
}
