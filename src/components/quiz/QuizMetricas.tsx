import { useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { montarPassos, type EstruturaQuiz, type QuizResumo } from "@/lib/quiz/quiz";
import { cn } from "@/lib/utils";

// Métricas do quiz publicado (pedido do Davi, 15/10): quantos abriram,
// começaram, terminaram (viraram lead) e clicaram na oferta; o funil tela a
// tela (onde as pessoas desistem) e as visitas por dia. Vem de quiz_eventos
// (registrado pelo link público, sem dado pessoal) + quiz_respostas.
const db = supabase as unknown as SupabaseClient;   // quiz_eventos ainda não está nos tipos gerados

interface Evento { sessao: string; tipo: "visita" | "passo" | "fim" | "cta"; passo: number; criado_em: string }

function rotuloDoPasso(e: EstruturaQuiz, p: ReturnType<typeof montarPassos>[number]): string {
  if (p.tipo === "intro") return "Abertura";
  if (p.tipo === "pergunta") return `P${p.indice + 1}. ${e.perguntas[p.indice]?.texto ?? ""}`;
  if (p.tipo === "tela") return e.telas?.[p.indice]?.titulo || "Tela de respiro";
  if (p.tipo === "captura") return "Contato (nome/WhatsApp)";
  return "Resultado e oferta";
}

export function QuizMetricas({ quiz, respostas, onFechar }: {
  quiz: QuizResumo | null; respostas: { perfil: string | null }[]; onFechar: () => void;
}) {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  useEffect(() => {
    setEventos(null);
    if (!quiz) return;
    void db.from("quiz_eventos").select("sessao, tipo, passo, criado_em").eq("quiz_id", quiz.id)
      .order("criado_em", { ascending: false }).limit(50000)
      .then(({ data }) => setEventos((data || []) as Evento[]));
  }, [quiz]);

  const m = useMemo(() => {
    if (!quiz?.estrutura || !eventos) return null;
    const e = quiz.estrutura;
    const passos = montarPassos(e, (e.captura?.ativa !== false) && !!e.captura?.pedir?.length);
    const sessoes = (tipo: Evento["tipo"]) => new Set(eventos.filter((x) => x.tipo === tipo).map((x) => x.sessao));
    const visitas = sessoes("visita");
    // Até que tela cada sessão chegou (a abertura conta pra quem visitou).
    const maxPasso = new Map<string, number>();
    for (const s of visitas) maxPasso.set(s, 0);
    for (const x of eventos) if (x.tipo === "passo") maxPasso.set(x.sessao, Math.max(maxPasso.get(x.sessao) ?? 0, x.passo));
    const chegaram = passos.map((_, i) => [...maxPasso.values()].filter((v) => v >= i).length);
    const comecaram = [...maxPasso.values()].filter((v) => v >= 1).length;
    const terminaram = Math.max(sessoes("fim").size, respostas.length);
    const cta = sessoes("cta").size;
    // Maior perda entre uma tela e a seguinte (onde mais gente desiste).
    let pior = -1, perda = 0;
    for (let i = 1; i < chegaram.length; i++) {
      const d = chegaram[i - 1] - chegaram[i];
      if (d > perda) { perda = d; pior = i; }
    }
    const hoje = new Date();
    const dias = Array.from({ length: 14 }, (_, k) => format(subDays(hoje, 13 - k), "yyyy-MM-dd"));
    const porDia = dias.map((d) => ({ dia: d, n: new Set(eventos.filter((x) => x.tipo === "visita" && x.criado_em.slice(0, 10) === d).map((x) => x.sessao)).size }));
    const perfis = new Map<string, number>();
    for (const r of respostas) perfis.set(r.perfil ?? "sem perfil", (perfis.get(r.perfil ?? "sem perfil") ?? 0) + 1);
    return {
      visitas: visitas.size, comecaram, terminaram, cta, pior,
      passos: passos.map((p, i) => ({ rotulo: rotuloDoPasso(e, p), n: chegaram[i] })),
      porDia, perfis: [...perfis.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [quiz, eventos, respostas]);

  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <Dialog open={!!quiz} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Métricas · {quiz?.titulo}</DialogTitle>
          <DialogDescription>Contadas desde que o link passou a registrar (15/10). Cada aba aberta conta como uma visita.</DialogDescription>
        </DialogHeader>
        {!m ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { rotulo: "Visitas", valor: m.visitas, sub: "abriram o link" },
                { rotulo: "Começaram", valor: m.comecaram, sub: `${pct(m.comecaram, m.visitas)} das visitas` },
                { rotulo: "Terminaram", valor: m.terminaram, sub: `${pct(m.terminaram, m.visitas)} viraram lead` },
                { rotulo: "Clicaram na oferta", valor: m.cta, sub: `${pct(m.cta, m.terminaram)} de quem terminou` },
              ].map((c) => (
                <div key={c.rotulo} className="rounded-xl border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{c.rotulo}</p>
                  <p className="text-2xl font-bold tabular-nums">{c.valor}</p>
                  <p className="text-[11px] text-muted-foreground">{c.sub}</p>
                </div>
              ))}
            </div>

            <section>
              <h3 className="mb-1 text-sm font-semibold">Até onde as pessoas chegam</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                {m.pior > 0 && m.visitas > 0
                  ? <>Onde mais gente sai: <b className="text-foreground">{m.passos[m.pior].rotulo}</b> ({m.passos[m.pior - 1].n - m.passos[m.pior].n} pessoas).</>
                  : "Ainda sem visitas suficientes para ver onde as pessoas saem."}
              </p>
              <div className="space-y-1">
                {m.passos.map((p, i) => {
                  const largura = m.visitas ? (p.n / m.visitas) * 100 : 0;
                  return (
                    <div key={i} title={`${p.rotulo}: ${p.n} ${p.n === 1 ? "pessoa" : "pessoas"} (${pct(p.n, m.visitas)})`}
                      className={cn("grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_3.5rem] items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted", i === m.pior && "bg-rose-500/5")}>
                      <span className="truncate text-muted-foreground">{p.rotulo}</span>
                      <span className="h-3 overflow-hidden rounded-r bg-muted">
                        <span className={cn("block h-full rounded-r", i === m.pior ? "bg-rose-500" : "bg-primary")} style={{ width: `${Math.max(largura, p.n ? 1.5 : 0)}%` }} />
                      </span>
                      <span className="text-right tabular-nums">{p.n} <span className="text-muted-foreground">{pct(p.n, m.visitas)}</span></span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Visitas por dia (14 dias)</h3>
              <div className="flex h-28 items-end gap-1">
                {(() => {
                  const max = Math.max(1, ...m.porDia.map((d) => d.n));
                  return m.porDia.map((d) => (
                    <div key={d.dia} className="group flex h-full flex-1 flex-col justify-end" title={`${format(new Date(`${d.dia}T12:00:00`), "EEE, d MMM", { locale: ptBR })}: ${d.n} ${d.n === 1 ? "visita" : "visitas"}`}>
                      <span className="mb-0.5 text-center text-[10px] tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100">{d.n}</span>
                      <span className="block rounded-t bg-primary group-hover:opacity-80" style={{ height: `${(d.n / max) * 100}%`, minHeight: d.n ? 3 : 1 }} />
                    </div>
                  ));
                })()}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{format(new Date(`${m.porDia[0].dia}T12:00:00`), "d MMM", { locale: ptBR })}</span>
                <span>hoje</span>
              </div>
            </section>

            {m.perfis.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Resultado de quem terminou</h3>
                <div className="space-y-1">
                  {m.perfis.map(([perfil, n]) => (
                    <div key={perfil} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_3.5rem] items-center gap-2 text-xs" title={`${perfil}: ${n}`}>
                      <span className="truncate text-muted-foreground">{perfil}</span>
                      <span className="h-3 overflow-hidden rounded-r bg-muted"><span className="block h-full rounded-r bg-primary" style={{ width: `${(n / m.terminaram) * 100}%` }} /></span>
                      <span className="text-right tabular-nums">{n} <span className="text-muted-foreground">{pct(n, m.terminaram)}</span></span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
