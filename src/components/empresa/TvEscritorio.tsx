import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, CheckCircle2, GalleryHorizontal, Loader2, Plus, Trophy, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { carregarSemana, moverParaDia, type Semana, type TarefaSemana } from "@/lib/empresa/semana";
import { criarTarefaParaMembro } from "./FilaPessoa";

// A TV grande do escritório (pedido do Davi, 15/10): "lá eu posso clicar nela
// e programar as atividades da semana… de 15 em 15 segundos troca para nosso
// resultado". TelaTv é o que passa na tela (dentro do desenho do escritório);
// clicando, abre ProgramarSemana.
const TROCA_MS = 15_000;
const DIA_CURTO = (d: string) => format(new Date(`${d}T12:00:00`), "EEE", { locale: ptBR }).replace(".", "").slice(0, 3);
const hojeIso = () => format(new Date(), "yyyy-MM-dd");
const dinheiro = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function TelaTv({ semana, onAbrir, telaInicial = 0 }: { semana: Semana | null; onAbrir: () => void; telaInicial?: number }) {
  const [tela, setTela] = useState(telaInicial);
  const [parado, setParado] = useState(false);
  useEffect(() => {
    if (parado) return;
    const t = window.setInterval(() => setTela((x) => (x + 1) % 2), TROCA_MS);
    return () => window.clearInterval(t);
  }, [parado]);
  const hoje = hojeIso();

  return (
    <button type="button" onClick={onAbrir} onMouseEnter={() => setParado(true)} onMouseLeave={() => setParado(false)}
      title="Programar as atividades da semana"
      className="group/tv relative flex h-full w-full flex-col overflow-hidden rounded-[3px] bg-[#0b1220] text-left text-white outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
      {/* Cabeçalho da TV */}
      <div className="flex items-center gap-1.5 px-[4%] pt-[3%] text-[clamp(7px,1vw,11px)] font-semibold uppercase tracking-wide text-sky-300">
        {tela === 0 ? <><CalendarDays className="h-[1.2em] w-[1.2em]" />Semana</> : <><Trophy className="h-[1.2em] w-[1.2em] text-amber-300" /><span className="text-amber-300">Nosso resultado</span></>}
        <span className="ml-auto flex gap-1">
          {[0, 1].map((k) => <span key={k} className={cn("h-[5px] w-[5px] rounded-full", k === tela ? "bg-white" : "bg-white/30")} />)}
        </span>
      </div>
      {!semana ? (
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-white/50" /></div>
      ) : tela === 0 ? (
        <div className="grid flex-1 grid-cols-7 gap-[2px] px-[3%] pb-[3%] pt-[2%]">
          {semana.dias.map((d) => {
            const itens = semana.tarefas.filter((t) => t.dia === d);
            const posts = semana.posts.filter((p) => p.dia === d);
            return (
              <div key={d} className={cn("min-w-0 overflow-hidden rounded-[2px] p-[3px]", d === hoje ? "bg-sky-500/25 ring-1 ring-sky-400/70" : "bg-white/[.06]")}>
                <p className={cn("mb-[2px] text-[clamp(7px,.95vw,11px)] font-bold uppercase", d === hoje ? "text-sky-200" : "text-white/60")}>
                  {DIA_CURTO(d)} <span className="font-normal opacity-70">{Number(d.slice(8))}</span>
                </p>
                {itens.slice(0, 3).map((t) => (
                  <div key={t.id} className={cn("mb-[2px] rounded-[2px] bg-white/[.07] px-[2px] text-[clamp(6.5px,.85vw,10px)] leading-[1.15]", t.concluida && "opacity-60")}>
                    {t.responsavel && <p className={cn("truncate font-bold", t.concluida ? "text-emerald-300" : "text-sky-300")}>{t.concluida ? "✓ " : ""}{t.responsavel.split(" ")[0]}</p>}
                    <p className={cn("line-clamp-2 break-words text-white/90", t.concluida && "line-through")}>{t.titulo}</p>
                  </div>
                ))}
                {itens.length > 3 && <p className="text-[clamp(6px,.75vw,9px)] text-white/50">+{itens.length - 3}</p>}
                {posts.slice(0, 2).map((p, k) => (
                  <p key={k} className="line-clamp-2 break-words text-[clamp(6.5px,.85vw,10px)] leading-[1.15] text-amber-200">{p.tipo === "video" ? "▶" : "▦"} {p.titulo}</p>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <Resultados semana={semana} />
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent py-[2%] text-center text-[clamp(6px,.8vw,9px)] font-semibold opacity-0 transition-opacity group-hover/tv:opacity-100">
        Clique para programar a semana
      </span>
    </button>
  );
}

function Resultados({ semana }: { semana: Semana }) {
  const r = semana.resultado;
  const seta = (agora: number, antes: number) => (agora > antes ? <span className="text-emerald-300">▲ {agora - antes}</span> : agora < antes ? <span className="text-rose-300">▼ {antes - agora}</span> : <span className="text-white/50">=</span>);
  const cartoes = [
    { rotulo: "Tarefas entregues", valor: String(r.concluidas), extra: <>{seta(r.concluidas, r.concluidasAntes)} vs semana passada</> },
    { rotulo: "Posts publicados", valor: String(r.publicados), extra: <>{seta(r.publicados, r.publicadosAntes)} vs semana passada</> },
    { rotulo: "Faltam na semana", valor: String(r.abertasSemana), extra: r.atrasadas ? <span className="text-rose-300">{r.atrasadas} atrasada{r.atrasadas > 1 ? "s" : ""}</span> : <span className="text-emerald-300">nada atrasado</span> },
    r.receitaMes != null
      ? { rotulo: "Faturamento do mês", valor: dinheiro(r.receitaMes), extra: <>{r.vendasMes ?? 0} vendas</> }
      : { rotulo: "Destaque", valor: r.porPessoa[0]?.nome ?? "—", extra: <>{r.porPessoa[0] ? `${r.porPessoa[0].feitas} entregas na semana` : "ninguém entregou ainda"}</> },
  ];
  return (
    <div className="grid flex-1 grid-cols-2 gap-[3px] px-[3%] pb-[3%] pt-[2%]">
      {cartoes.map((c) => (
        <div key={c.rotulo} className="flex min-w-0 flex-col justify-center rounded-[2px] bg-white/[.06] px-[6%]">
          <p className="truncate text-[clamp(5.5px,.75vw,9px)] uppercase text-white/60">{c.rotulo}</p>
          <p className="truncate text-[clamp(11px,1.9vw,22px)] font-bold leading-tight">{c.valor}</p>
          <p className="truncate text-[clamp(5.5px,.72vw,8.5px)] text-white/70">{c.extra}</p>
        </div>
      ))}
    </div>
  );
}

// Programar a semana: um quadro por dia; arraste a tarefa de um dia pro outro
// (ou de "Sem data" pra um dia) e crie tarefas direto no dia, já com o responsável.
export function ProgramarSemana({ clienteId, aberto, semana, membros, onFechar, onMudou }: {
  clienteId: string; aberto: boolean; semana: Semana | null; membros: { id: string; nome: string; eh_ia: boolean }[];
  onFechar: () => void; onMudou: () => void;
}) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ dia: string; titulo: string; membro: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const hoje = hojeIso();
  const equipe = membros.filter((m) => !(m.eh_ia && m.nome === "Jarvis"));

  const soltar = async (dia: string | null) => {
    const id = arrastando;
    setArrastando(null); setAlvo(null);
    if (!id) return;
    try { await moverParaDia(id, dia); onMudou(); } catch { toast.error("Não consegui mudar o dia"); }
  };
  const criar = async () => {
    if (!novo?.titulo.trim() || !novo.membro) return;
    setSalvando(true);
    try {
      await criarTarefaParaMembro(clienteId, novo.membro, { titulo: novo.titulo.trim(), tipo: null, prazo: novo.dia, descricao: "Programada pela TV da semana." });
      toast.success(`Tarefa para ${equipe.find((m) => m.id === novo.membro)?.nome ?? "a equipe"} na ${DIA_CURTO(novo.dia)}`);
      setNovo({ ...novo, titulo: "" });
      onMudou();
    } catch {
      toast.error("Não consegui criar a tarefa");
    } finally {
      setSalvando(false);
    }
  };

  const Cartao = ({ t }: { t: TarefaSemana }) => (
    <div draggable onDragStart={(e) => { setArrastando(t.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setArrastando(null); setAlvo(null); }}
      className={cn("cursor-grab rounded-md border bg-card p-1.5 text-xs shadow-sm active:cursor-grabbing", arrastando === t.id && "opacity-40", t.concluida && "opacity-60")}>
      <p className={cn("break-words font-medium leading-snug", t.concluida && "line-through")}>{t.titulo}</p>
      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        {t.concluida ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : null}
        {t.responsavel ?? "sem responsável"}
        {!t.concluida && t.progresso ? ` · ${t.progresso}%` : ""}
      </p>
    </div>
  );

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="flex max-h-[92vh] max-w-[min(96vw,1400px)] flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Semana da equipe</DialogTitle>
          <DialogDescription>Arraste as tarefas entre os dias. Clique em + para programar uma tarefa nova num dia, já com quem vai fazer.</DialogDescription>
        </DialogHeader>
        {!semana ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="grid min-w-[980px] grid-cols-7 gap-2">
              {semana.dias.map((d) => {
                const itens = semana.tarefas.filter((t) => t.dia === d);
                const posts = semana.posts.filter((p) => p.dia === d);
                return (
                  <div key={d} onDragOver={(e) => { e.preventDefault(); setAlvo(d); }} onDragLeave={() => setAlvo((a) => (a === d ? null : a))} onDrop={(e) => { e.preventDefault(); void soltar(d); }}
                    className={cn("flex min-h-[300px] flex-col gap-1.5 rounded-lg border p-2 transition-colors",
                      d === hoje ? "border-sky-500/60 bg-sky-500/5" : "bg-muted/30", alvo === d && "border-primary bg-primary/10")}>
                    <div className="flex items-center justify-between">
                      <p className={cn("text-xs font-bold uppercase", d === hoje && "text-sky-600 dark:text-sky-400")}>
                        {format(new Date(`${d}T12:00:00`), "EEE d", { locale: ptBR })}{d === hoje ? " · hoje" : ""}
                      </p>
                      <button type="button" title="Programar tarefa neste dia" onClick={() => setNovo({ dia: d, titulo: "", membro: novo?.membro ?? equipe[0]?.id ?? "" })}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Plus className="h-4 w-4" /></button>
                    </div>
                    {novo?.dia === d && (
                      <form className="space-y-1 rounded-md border bg-card p-1.5" onSubmit={(e) => { e.preventDefault(); void criar(); }}>
                        <Input autoFocus value={novo.titulo} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} placeholder="O que fazer?" className="h-7 text-xs" />
                        <select value={novo.membro} onChange={(e) => setNovo({ ...novo, membro: e.target.value })} className="h-7 w-full rounded-md border bg-background px-1 text-xs" aria-label="Quem faz">
                          {equipe.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.eh_ia ? " (IA)" : ""}</option>)}
                        </select>
                        <div className="flex gap-1">
                          <Button type="submit" size="sm" className="h-6 flex-1 text-xs" disabled={!novo.titulo.trim() || salvando}>{salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : "Programar"}</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setNovo(null)}>×</Button>
                        </div>
                      </form>
                    )}
                    {itens.map((t) => <Cartao key={t.id} t={t} />)}
                    {posts.map((p, k) => (
                      <p key={k} className="flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                        {p.tipo === "video" ? <Video className="h-3 w-3 shrink-0" /> : <GalleryHorizontal className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{p.publicado ? "Publicado: " : "Publica: "}{p.titulo}</span>
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
            {semana.semData.length > 0 && (
              <div onDragOver={(e) => { e.preventDefault(); setAlvo("sem"); }} onDrop={(e) => { e.preventDefault(); void soltar(null); }}
                className={cn("mt-3 rounded-lg border border-dashed p-2", alvo === "sem" && "border-primary bg-primary/5")}>
                <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Sem data · arraste para um dia ({semana.semData.length})</p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1.5">
                  {semana.semData.map((t) => <Cartao key={t.id} t={t} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
