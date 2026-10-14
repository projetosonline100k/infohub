import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { chamarGoogleCalendar, type GoogleCalendarEvent } from "@/lib/googleCalendar";

// Iniciar o dia → "Quanto tempo real de foco você tem hoje?" no jeito da
// Agenda (pedido do Davi): as 24h do dia numa régua, com os compromissos do
// Google em cinza e o que já passou apagado. Clica, segura e arrasta pra
// marcar blocos de foco (15 em 15 min); clicar num bloco tira. A soma vira
// focusTimeAvailableMinutes. Os blocos ficam guardados no aparelho, por dia,
// pra voltar ao passo sem perder o desenho.
type Bloco = [number, number];   // minutos desde 00:00
const PASSO = 15;
const ALTURA_HORA = 32;
const PX_MIN = ALTURA_HORA / 60;
const chaveDia = () => `jarvis:foco-blocos:${format(new Date(), "yyyy-MM-dd")}`;

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const duracao = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m}min`);

function juntar(blocos: Bloco[]): Bloco[] {
  const ord = [...blocos].sort((a, b) => a[0] - b[0]);
  const out: Bloco[] = [];
  for (const [a, b] of ord) {
    const ult = out[out.length - 1];
    if (ult && a <= ult[1]) ult[1] = Math.max(ult[1], b); else out.push([a, b]);
  }
  return out;
}
const total = (blocos: Bloco[]) => blocos.reduce((s, [a, b]) => s + (b - a), 0);

function lerBlocos(): Bloco[] {
  try { return JSON.parse(localStorage.getItem(chaveDia()) || "[]"); } catch { return []; }
}

export function StartDayFocoTimeline({ onMudar }: { onMudar: (minutos: number | null) => void }) {
  const [blocos, setBlocos] = useState<Bloco[]>(lerBlocos);
  const [rascunho, setRascunho] = useState<Bloco | null>(null);
  const [eventos, setEventos] = useState<{ a: number; b: number; titulo: string }[]>([]);
  const [diaInteiro, setDiaInteiro] = useState<string[]>([]);
  const [agora, setAgora] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  const gradeRef = useRef<HTMLDivElement>(null);
  const rolagemRef = useRef<HTMLDivElement>(null);
  const inicioArraste = useRef<number | null>(null);

  // Compromissos de hoje no Google (se a Agenda estiver conectada).
  useEffect(() => {
    let cancelado = false;
    const ini = new Date(); ini.setHours(0, 0, 0, 0);
    const fim = new Date(ini); fim.setDate(fim.getDate() + 1);
    chamarGoogleCalendar<{ events: GoogleCalendarEvent[] }>({
      action: "events", calendarIds: ["primary"], timeMin: ini.toISOString(), timeMax: fim.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).then((r) => {
      if (cancelado) return;
      const validos = r.events.filter((e) => e.status !== "cancelled");
      setDiaInteiro(validos.filter((e) => e.start.date && !e.start.dateTime).map((e) => e.summary || "(sem título)"));
      setEventos(validos.filter((e) => e.start.dateTime && e.end.dateTime).map((e) => {
        const s = new Date(e.start.dateTime!), t = new Date(e.end.dateTime!);
        const a = s < ini ? 0 : s.getHours() * 60 + s.getMinutes();
        const b = t >= fim ? 24 * 60 : t.getHours() * 60 + t.getMinutes();
        return { a, b: Math.max(b, a + 15), titulo: e.summary || "(sem título)" };
      }));
    }).catch(() => { /* Agenda não conectada: só a régua */ });
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => { const d = new Date(); setAgora(d.getHours() * 60 + d.getMinutes()); }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  // Abre mostrando a hora atual.
  useEffect(() => { if (rolagemRef.current) rolagemRef.current.scrollTop = Math.max(0, (agora - 60) * PX_MIN); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { localStorage.setItem(chaveDia(), JSON.stringify(blocos)); } catch { /* sem storage */ }
    const t = total(blocos);
    onMudar(t > 0 ? t : null);
  }, [blocos]);   // eslint-disable-line react-hooks/exhaustive-deps

  const minutoNoY = (clientY: number) => {
    const r = gradeRef.current!.getBoundingClientRect();
    const m = Math.round(((clientY - r.top) / PX_MIN) / PASSO) * PASSO;
    return Math.max(0, Math.min(24 * 60, m));
  };

  const livreAteFimDoDia = useMemo(() => {
    // Do próximo quarto de hora até 24h, tirando os compromissos.
    const ini = Math.ceil(agora / PASSO) * PASSO;
    const ocupado = juntar(eventos.map((e) => [Math.max(ini, e.a), Math.max(ini, e.b)] as Bloco).filter(([a, b]) => b > a));
    return Math.max(0, 24 * 60 - ini - total(ocupado));
  }, [agora, eventos]);

  const marcado = total(blocos);
  const conflitos = blocos.some(([a, b]) => eventos.some((e) => e.a < b && e.b > a));

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium leading-snug">Quanto tempo real de foco você tem hoje?</h3>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span>Foco marcado: <b className="text-primary">{marcado ? duracao(marcado) : "—"}</b></span>
        <span className="text-xs text-muted-foreground">Livre até o fim do dia (tirando a agenda): {duracao(livreAteFimDoDia)}</span>
      </div>
      <p className="text-xs text-muted-foreground">Clique, segure e arraste na régua pra marcar seus blocos de foco. Clique num bloco pra tirar.</p>
      {conflitos && <p className="text-xs text-amber-500">Algum bloco de foco cai em cima de um compromisso da agenda.</p>}
      {diaInteiro.length > 0 && <p className="truncate text-xs text-muted-foreground">Dia todo: {diaInteiro.join(" · ")}</p>}

      <div ref={rolagemRef} className="max-h-[380px] overflow-y-auto rounded-lg border border-border">
        <div className="flex select-none">
          <div className="w-11 shrink-0">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="relative border-b border-transparent text-right text-[10px] text-muted-foreground" style={{ height: ALTURA_HORA }}>
                <span className="absolute -top-1.5 right-1.5">{h ? `${String(h).padStart(2, "0")}:00` : ""}</span>
              </div>
            ))}
          </div>
          <div ref={gradeRef} className="relative flex-1 cursor-crosshair touch-none border-l border-border" style={{ height: 24 * ALTURA_HORA }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).dataset.bloco) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const m = minutoNoY(e.clientY);
              inicioArraste.current = m;
              setRascunho([m, m]);
            }}
            onPointerMove={(e) => {
              if (inicioArraste.current == null) return;
              const m = minutoNoY(e.clientY), i = inicioArraste.current;
              setRascunho([Math.min(i, m), Math.max(i, m)]);
            }}
            onPointerUp={() => {
              const r = rascunho;
              inicioArraste.current = null;
              setRascunho(null);
              if (r && r[1] - r[0] >= PASSO) setBlocos((b) => juntar([...b, r]));
            }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="pointer-events-none absolute left-0 right-0 border-t border-border/60" style={{ top: h * ALTURA_HORA }}>
                <div className="absolute left-0 right-0 border-t border-dashed border-border/30" style={{ top: ALTURA_HORA / 2 }} />
              </div>
            ))}
            {/* O que já passou */}
            <div className="pointer-events-none absolute left-0 right-0 top-0 bg-muted/60" style={{ height: agora * PX_MIN }} />
            {/* Compromissos da agenda */}
            {eventos.map((e, i) => (
              <div key={i} className="pointer-events-none absolute left-1 right-1/2 overflow-hidden rounded border border-zinc-500/40 bg-zinc-500/25 px-1.5 text-[10px] leading-tight text-foreground/80"
                style={{ top: e.a * PX_MIN, height: Math.max(12, (e.b - e.a) * PX_MIN - 1) }} title={`${hhmm(e.a)}–${hhmm(e.b)} ${e.titulo}`}>
                {hhmm(e.a)} {e.titulo}
              </div>
            ))}
            {/* Blocos de foco */}
            {blocos.map(([a, b], i) => (
              <button key={i} type="button" data-bloco="1" title="Clique pra tirar"
                onClick={() => setBlocos((bs) => bs.filter((_, j) => j !== i))}
                className="absolute left-1/2 right-1 overflow-hidden rounded border border-primary bg-primary/25 px-1.5 text-left text-[10px] font-medium leading-tight text-primary hover:bg-primary/35"
                style={{ top: a * PX_MIN, height: (b - a) * PX_MIN - 1 }}>
                <span data-bloco="1">Foco {hhmm(a)}–{hhmm(b)} · {duracao(b - a)}</span>
              </button>
            ))}
            {rascunho && rascunho[1] > rascunho[0] && (
              <div className="pointer-events-none absolute left-1/2 right-1 rounded border border-dashed border-primary bg-primary/15 px-1.5 text-[10px] text-primary"
                style={{ top: rascunho[0] * PX_MIN, height: (rascunho[1] - rascunho[0]) * PX_MIN }}>
                {hhmm(rascunho[0])}–{hhmm(rascunho[1])} · {duracao(rascunho[1] - rascunho[0])}
              </div>
            )}
            {/* Agora */}
            <div className="pointer-events-none absolute left-0 right-0 border-t-2 border-rose-500" style={{ top: agora * PX_MIN }}>
              <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-rose-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
