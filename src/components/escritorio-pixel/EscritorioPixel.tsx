import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckSquare, Eye, Loader2, LocateFixed, MessageCircle, Play, Users, X } from "lucide-react";
import { addDays, format, isToday, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { chamarGoogleCalendar, type GoogleCalendarEvent } from "@/lib/googleCalendar";
import type { Funcionario3D, Resultado3D } from "@/components/escritorio3d/EscritorioVirtual";
import { criarMundo, type EstadoPixel, type ModoCamera, type MundoPixel, type PessoaPixel } from "./motor";
import { montarCena, salaDoSetor } from "./cena";

// Escritório em pixel art (24/10: cena fixa copiada da imagem de referência do Davi).
// O PixiJS desenha o mapa; o React cuida do painel da direita. Ocupa a área da página, entre a barra
// lateral do app e o painel. Só roda no `npm run dev`: os sprites gratuitos da LimeZu têm licença não comercial.

const COR: Record<EstadoPixel, string> = {
  trabalhando: "bg-emerald-500", esperando: "bg-amber-400", problema: "bg-rose-500", parado: "bg-slate-400", reuniao: "bg-violet-500",
};
const ROTULO: Record<EstadoPixel, string> = {
  trabalhando: "Trabalhando", esperando: "Esperando você", problema: "Com problema", parado: "Sem tarefa", reuniao: "Em reunião",
};
const LEGENDA: [string, string][] = [
  ["bg-sky-400", "Você"], ["bg-emerald-500", "Funcionário trabalhando"], ["bg-violet-500", "Reunião"],
  ["bg-amber-400", "Tarefa esperando você"], ["bg-rose-500", "Problema"], ["bg-slate-400", "Sem tarefa"],
];
const CORES_AVATAR = ["bg-amber-600", "bg-sky-600", "bg-emerald-600", "bg-rose-600", "bg-violet-600", "bg-orange-600"];

function Avatar({ nome, className }: { nome: string; className?: string }) {
  const k = [...nome].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES_AVATAR.length;
  return (
    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-black/40 text-xs font-black text-white", CORES_AVATAR[k], className)}>
      {nome.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

const Card = ({ icone: Icone, titulo, children }: { icone: typeof Users; titulo: string; children: React.ReactNode }) => (
  <section className="rounded-lg border border-white/10 bg-[#121a2b] p-3">
    <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-white/90"><Icone className="h-3.5 w-3.5 text-sky-300" />{titulo}</h3>
    {children}
  </section>
);

/** Ocupa exatamente a área do <main> do app (a barra lateral e as abas de cima continuam visíveis). */
function useAreaDaPagina() {
  const [area, setArea] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = document.querySelector("main");
    if (!el) return;
    const medir = () => { const r = el.getBoundingClientRect(); setArea({ left: r.left, top: r.top, width: r.width, height: r.height }); };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    window.addEventListener("resize", medir);
    return () => { obs.disconnect(); window.removeEventListener("resize", medir); };
  }, []);
  return area;
}

/** Próximo evento da agenda do Google (7 dias); null quando não há (ou a agenda não está ligada). */
function useProximaReuniao() {
  const [evento, setEvento] = useState<GoogleCalendarEvent | null | undefined>(undefined);
  useEffect(() => {
    let cancelado = false;
    const agora = new Date();
    chamarGoogleCalendar<{ events: GoogleCalendarEvent[] }>({
      action: "events", calendarIds: ["primary"], timeMin: agora.toISOString(), timeMax: addDays(agora, 7).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).then((r) => {
      if (cancelado) return;
      const futuros = r.events
        .filter((e) => e.status !== "cancelled" && e.start.dateTime && new Date(e.start.dateTime) >= agora)
        .sort((a, b) => +new Date(a.start.dateTime!) - +new Date(b.start.dateTime!));
      setEvento(futuros.find((e) => /reuni|call|meet|alinhamento/i.test(e.summary ?? "")) ?? futuros[0] ?? null);
    }).catch(() => { if (!cancelado) setEvento(null); });
    return () => { cancelado = true; };
  }, []);
  return evento;
}

export default function EscritorioPixel({ setores, funcionarios, resultado, onSair, onConversar, onAbrirTarefa }: {
  setores: { id: string; nome: string }[];
  funcionarios: (Funcionario3D & { setorId?: string | null })[];
  resultado: Resultado3D | null;
  onSair: () => void;
  onConversar: (id: string) => void;
  onAbrirTarefa: (f: Funcionario3D) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mundo = useRef<MundoPixel | null>(null);
  const area = useAreaDaPagina();
  const reuniao = useProximaReuniao();
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [camera, setCamera] = useState<ModoCamera>("geral");
  const cena = useMemo(() => montarCena(), []);

  const nomeSetor = useMemo(() => new Map(setores.map((s) => [s.id, s.nome])), [setores]);
  // Cada pessoa vai para a sala do setor dela (pelo nome do setor); setor sem sala trabalha na Área Colaborativa.
  const pessoas = useMemo<PessoaPixel[]>(() => funcionarios.map((f) => ({
    id: f.id, nome: f.nome, estado: f.sinal, agora: f.agora ?? null,
    setorId: salaDoSetor(nomeSetor.get(f.setorId ?? "") ?? ""),
  })), [funcionarios, nomeSetor]);

  useEffect(() => {
    let cancelado = false;
    let criado: MundoPixel | null = null;
    criarMundo(caixa.current!, { aoClicar: setSelecionado, aoMudarCamera: setCamera }, cena).then((m) => {
      if (cancelado) { m.destruir(); return; }
      criado = m;
      mundo.current = m;
      setPronto(true);
    }).catch((e) => {
      console.error(e);
      if (!cancelado) setErro("Não consegui carregar os sprites. Eles ficam em public/escritorio-pixel (só no computador do Davi, fora do git).");
    });
    return () => { cancelado = true; criado?.destruir(); mundo.current = null; };
  }, [cena]);

  useEffect(() => { if (pronto) mundo.current?.atualizar(pessoas, resultado); }, [pronto, pessoas, resultado]);
  useEffect(() => { mundo.current?.selecionar(selecionado); }, [pronto, selecionado]);
  useEffect(() => { mundo.current?.camera(camera); }, [pronto, camera]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { if (selecionado) setSelecionado(null); else onSair(); } };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [selecionado, onSair]);

  // Card "Tarefa atual": quem está selecionado; sem seleção, quem está mais adiantado numa tarefa.
  const emFoco = funcionarios.find((f) => f.id === selecionado)
    ?? [...funcionarios].filter((f) => f.tarefa && f.sinal === "trabalhando").sort((a, b) => (b.tarefa?.progresso ?? -1) - (a.tarefa?.progresso ?? -1))[0]
    ?? null;
  const setorDe = (f: { setorId?: string | null }) => nomeSetor.get(f.setorId ?? "") ?? "Sem setor";
  const quando = (e: GoogleCalendarEvent) => {
    const d = new Date(e.start.dateTime!);
    return `${isToday(d) ? "Hoje" : isTomorrow(d) ? "Amanhã" : format(d, "EEE dd/MM", { locale: ptBR })} · ${format(d, "HH:mm")}`;
  };

  return (
    <div className="fixed z-[40] flex bg-[#0b1120] text-white"
      style={area ? { left: area.left, top: area.top, width: area.width, height: area.height } : { inset: 0 }}>
      <div className="relative min-w-0 flex-1">
        <div ref={caixa} className="absolute inset-0" />
        {!pronto && !erro && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Montando o escritório…</div>
        )}
        {erro && <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-rose-300">{erro}</div>}
        <p className="pointer-events-none absolute bottom-1.5 left-2 text-[10px] text-white/35">Setas ou WASD andam · E conversa · Z alterna a câmera · Esc sai · sprites gratuitos LimeZu (uso não comercial)</p>
      </div>

      <aside className="flex w-[264px] shrink-0 flex-col gap-2.5 overflow-y-auto border-l border-white/10 bg-[#0b1120] p-2.5">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setCamera((c) => (c === "geral" ? "seguir" : "geral"))}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-[#121a2b] px-2 py-1.5 text-[11px] font-semibold hover:bg-[#18233a]">
            {camera === "geral" ? <><LocateFixed className="h-3.5 w-3.5" />Seguir meu boneco</> : <><Eye className="h-3.5 w-3.5" />Visão geral</>}
          </button>
          <button type="button" onClick={onSair} className="rounded-md border border-white/10 bg-[#121a2b] p-1.5 text-white/60 hover:text-white" title="Sair (Esc)"><X className="h-3.5 w-3.5" /></button>
        </div>

        <Card icone={CheckSquare} titulo="Tarefa atual">
          {emFoco ? (
            <div>
              <div className="flex items-center gap-2">
                <Avatar nome={emFoco.nome} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold">{emFoco.tarefa?.titulo ?? emFoco.agora ?? ROTULO[emFoco.sinal]}</p>
                  {emFoco.tarefa?.progresso != null && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(emFoco.tarefa.progresso)}%` }} /></div>
                      <span className="text-[10px] font-semibold">{Math.round(emFoco.tarefa.progresso)}%</span>
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-white/55">{emFoco.nome} · {setorDe(emFoco)}{emFoco.tarefa?.minutosRestantes != null && ` · ~${emFoco.tarefa.minutosRestantes} min`}</p>
              <div className="mt-2 flex gap-1.5">
                <button type="button" disabled={!emFoco.tarefa} onClick={() => onAbrirTarefa(emFoco)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] font-medium hover:bg-white/15 disabled:opacity-40"><Play className="h-3 w-3" />Abrir tarefa</button>
                <button type="button" disabled={emFoco.clicavel === false} onClick={() => onConversar(emFoco.id)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md bg-sky-600 px-2 py-1 text-[11px] font-medium hover:bg-sky-500 disabled:opacity-40"><MessageCircle className="h-3 w-3" />Conversar</button>
              </div>
            </div>
          ) : <p className="text-[11px] text-white/55">Ninguém com tarefa agora.</p>}
        </Card>

        <Card icone={CalendarDays} titulo="Próxima reunião">
          {reuniao === undefined ? <p className="text-[11px] text-white/45">Carregando a agenda…</p>
            : reuniao ? (
              <div className="flex items-center gap-2">
                <Avatar nome={reuniao.summary ?? "R"} />
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold">{reuniao.summary ?? "Reunião"}</p>
                  <p className="text-[11px] text-white/55">{quando(reuniao)}</p>
                </div>
              </div>
            ) : <p className="text-[11px] text-white/45">Nada marcado nos próximos 7 dias.</p>}
        </Card>

        <Card icone={Users} titulo="Funcionários online">
          <ul className="space-y-0.5">
            <li className="flex items-center gap-2 rounded px-1 py-0.5 text-[12px]">
              <span className="h-2 w-2 rounded-full bg-sky-400" /><span className="flex-1 font-medium">Davi</span><span className="text-[10px] text-white/45">CEO · você</span>
            </li>
            {funcionarios.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => setSelecionado(f.id)} title={ROTULO[f.sinal]}
                  className={cn("flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[12px] hover:bg-white/5", selecionado === f.id && "bg-white/10")}>
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", COR[f.sinal])} />
                  <span className="flex-1 truncate font-medium">{f.nome}</span>
                  <span className="truncate text-[10px] text-white/45">{setorDe(f)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card icone={Eye} titulo="Legenda">
          <ul className="grid grid-cols-1 gap-1">
            {LEGENDA.map(([cor, rotulo]) => (
              <li key={rotulo} className="flex items-center gap-2 text-[11px] text-white/75"><span className={cn("h-2 w-2 rounded-full", cor)} />{rotulo}</li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}
