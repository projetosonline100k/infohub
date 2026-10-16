import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, ChevronDown, Clock, Lightbulb, Loader2, Send, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { KanbanMelhorias } from "./KanbanMelhorias";

// Guia "Passar demanda" na janela do Pedro (pedido do Davi, 16/10/2026: "caçar
// o que passar para o pessoal … para a gente não ter pessoa ociosa, afinal,
// tempo é dinheiro"). Nas rodadas de 30 min o Pedro vê quem está sem tarefa (ou
// com pouca) e sugere um cartão por pessoa (scripts/pedro/demandas.py). O Davi
// passa, deixa para depois ou descarta. "Passar" manda a demanda na conversa
// de briefing do funcionário: ele responde o que entendeu e a tarefa só nasce
// quando o Davi confirma lá (o Pedro nunca passa tarefa sozinho).
const db = supabase as unknown as SupabaseClient;   // demandas_sugeridas ainda não está nos tipos gerados

type Status = "ideia" | "passada" | "adiada" | "descartada";
interface Demanda {
  id: string; membro_id: string; titulo: string; porque: string | null; produto: string | null; precisa: string | null;
  prazo_sugerido: string | null; status: Status; briefing_id: string | null; visto_em: string | null; criado_em: string;
}
interface Pessoa { id: string; nome: string; funcao: string | null; abertas: number }
// Igual a scripts/pedro/demandas.py: o dono, o gestor e o próprio Pedro não entram; até 1 tarefa = pouca carga.
const FORA = ["davi", "atlas", "jarvis", "pedro"];
const POUCA = 1;
const COLUNAS: { status: Status; titulo: string; icone: typeof Lightbulb; ajuda: string }[] = [
  { status: "ideia", titulo: "Sugestões", icone: Lightbulb, ajuda: "o que o Pedro acha que dá pra passar" },
  { status: "passada", titulo: "Passadas", icone: Send, ajuda: "já foram pra conversa da pessoa" },
  { status: "adiada", titulo: "Depois", icone: Clock, ajuda: "guardadas; passe quando quiser" },
];
const ESTADO_CONVERSA: Record<string, string> = { conversando: "esperando você confirmar na conversa dele", confirmado: "virou tarefa", cancelado: "conversa cancelada" };

// Quadro do Pedro: as duas guias. O NOVO da guia de demandas conta os cartões que o Davi ainda não abriu.
export function QuadroPedro({ clienteId }: { clienteId: string }) {
  const [novas, setNovas] = useState(0);
  return (
    <Tabs defaultValue="melhorias" className="space-y-2">
      <TabsList className="h-8">
        <TabsTrigger value="melhorias" className="h-7 text-xs">Melhorias do Infopro</TabsTrigger>
        <TabsTrigger value="demandas" className="h-7 gap-1.5 text-xs">
          Passar demanda
          {novas > 0 && <span className="rounded-full bg-fuchsia-600 px-1.5 text-[10px] font-bold text-white">{novas}</span>}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="melhorias" className="mt-0"><KanbanMelhorias clienteId={clienteId} /></TabsContent>
      <TabsContent value="demandas" className="mt-0 data-[state=inactive]:hidden" forceMount>
        {/* Sempre montada (escondida) para o contador da guia andar sozinho. */}
        <PassarDemanda clienteId={clienteId} onNovas={setNovas} />
      </TabsContent>
    </Tabs>
  );
}

export function PassarDemanda({ clienteId, onNovas }: { clienteId: string; onNovas?: (n: number) => void }) {
  const [itens, setItens] = useState<Demanda[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [conversas, setConversas] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);
  const [passando, setPassando] = useState<string | null>(null);
  const [verDescartadas, setVerDescartadas] = useState(false);

  const carregar = useCallback(async () => {
    const [{ data: ds }, { data: ms }, { data: ats }] = await Promise.all([
      db.from("demandas_sugeridas").select("*").eq("cliente_id", clienteId).order("criado_em", { ascending: false }),
      db.from("membros").select("id, nome, funcao").eq("cliente_id", clienteId).eq("ativo", true).order("ordem"),
      // Tarefa aberta = na fila ou em andamento (aguardando aprovação espera o Davi, não ocupa a pessoa).
      db.from("atividades").select("responsavel_id, situacao").eq("cliente_id", clienteId).is("deleted_at", null)
        .eq("concluida", false).not("responsavel_id", "is", null),
    ]);
    const lista = (ds || []) as Demanda[];
    const abertas: Record<string, number> = {};
    for (const a of (ats || []) as { responsavel_id: string; situacao: string | null }[]) {
      if ((a.situacao ?? "fila") === "fila" || a.situacao === "andamento") abertas[a.responsavel_id] = (abertas[a.responsavel_id] ?? 0) + 1;
    }
    setPessoas(((ms || []) as Omit<Pessoa, "abertas">[])
      .filter((m) => !FORA.includes(m.nome.trim().toLowerCase()))
      .map((m) => ({ ...m, abertas: abertas[m.id] ?? 0 }))
      .sort((a, b) => a.abertas - b.abertas));
    const ids = lista.map((d) => d.briefing_id).filter((x): x is string => !!x);
    if (ids.length) {
      const { data: bs } = await db.from("briefings").select("id, status").in("id", ids);
      setConversas(Object.fromEntries(((bs || []) as { id: string; status: string }[]).map((b) => [b.id, b.status])));
    }
    setItens(lista);
    setCarregando(false);
  }, [clienteId]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    const t = window.setInterval(() => void carregar(), 60000);
    return () => window.clearInterval(t);
  }, [carregar]);
  const novas = itens.filter((d) => d.status === "ideia" && !d.visto_em).length;
  useEffect(() => { onNovas?.(novas); }, [novas, onNovas]);

  const nomeDe = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "alguém";
  const abrir = (d: Demanda) => {
    setAberta(aberta === d.id ? null : d.id);
    if (d.visto_em) return;
    const visto_em = new Date().toISOString();
    setItens((xs) => xs.map((x) => (x.id === d.id ? { ...x, visto_em } : x)));
    void db.from("demandas_sugeridas").update({ visto_em }).eq("id", d.id);
  };
  const mover = async (d: Demanda, status: Status) => {
    setItens((xs) => xs.map((x) => (x.id === d.id ? { ...x, status } : x)));
    const { error } = await db.from("demandas_sugeridas").update({ status }).eq("id", d.id);
    if (error) { toast.error("Não consegui mover"); void carregar(); return; }
    if (status === "adiada") toast("Guardada em Depois");
    if (status === "descartada") toast("Sugestão descartada", { action: { label: "Desfazer", onClick: () => void mover({ ...d, status }, d.status) } });
  };
  const apagar = async (d: Demanda) => {
    if (!window.confirm(`Apagar de vez "${d.titulo}"?`)) return;
    setItens((xs) => xs.filter((x) => x.id !== d.id));
    const { error } = await db.from("demandas_sugeridas").delete().eq("id", d.id);
    if (error) { toast.error("Não consegui apagar"); void carregar(); }
  };
  // Passar: a demanda vai como mensagem do Davi na conversa de briefing da
  // pessoa (a aberta, se já tiver uma). Ela responde o que entendeu; o Davi
  // confirma na janela dela e aí vira tarefa, como qualquer outra.
  const passar = async (d: Demanda) => {
    setPassando(d.id);
    try {
      const { data: abertas } = await db.from("briefings").select("id").eq("membro_id", d.membro_id).eq("status", "conversando")
        .order("atualizado_em", { ascending: false }).limit(1);
      let id = (abertas?.[0] as { id: string } | undefined)?.id;
      if (!id) {
        id = crypto.randomUUID();
        const { error } = await db.from("briefings").insert({ id, cliente_id: clienteId, membro_id: d.membro_id });
        if (error) throw error;
      }
      const texto = [
        `Nova demanda (sugestão do Pedro, aprovada por mim): ${d.titulo}`,
        d.porque && `Por quê: ${d.porque}`,
        d.produto && `Produto: ${d.produto}`,
        d.precisa && `O que você vai precisar: ${d.precisa}`,
        d.prazo_sugerido && `Prazo sugerido: ${format(new Date(`${d.prazo_sugerido}T12:00:00`), "dd/MM")}`,
        "Me diga o que entendeu, se consegue e o que falta.",
      ].filter(Boolean).join("\n");
      const { error } = await db.from("briefing_mensagens").insert({ briefing_id: id, cliente_id: clienteId, papel: "davi", texto });
      if (error) throw error;
      const { error: e2 } = await db.from("demandas_sugeridas").update({ status: "passada", briefing_id: id, visto_em: d.visto_em ?? new Date().toISOString() }).eq("id", d.id);
      if (e2) throw e2;
      toast.success(`Mandei para ${nomeDe(d.membro_id)}`, { description: "Ele responde na conversa dele. Confirme lá para virar tarefa." });
      void carregar();
    } catch {
      toast.error("Não consegui passar a demanda");
    } finally {
      setPassando(null);
    }
  };

  const descartadas = itens.filter((d) => d.status === "descartada");
  const cartao = (d: Demanda) => {
    const nova = d.status === "ideia" && !d.visto_em;
    const conversa = d.briefing_id ? conversas[d.briefing_id] : undefined;
    return (
      <div key={d.id} className={cn("group relative rounded-lg border bg-card p-2 text-xs shadow-sm", nova && "border-fuchsia-500/60 bg-fuchsia-500/5", aberta === d.id && "ring-1 ring-primary/40")}>
        {(d.status === "ideia" || d.status === "descartada") && aberta !== d.id && (
          <button type="button" onClick={() => void (d.status === "descartada" ? apagar(d) : mover(d, "descartada"))} title={d.status === "descartada" ? "Apagar de vez" : "Descartar"}
            className="absolute -right-1.5 -top-1.5 z-10 hidden h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:bg-rose-500 hover:text-white group-hover:flex">
            <X className="h-3 w-3" />
          </button>
        )}
        <button type="button" onClick={() => abrir(d)} className="flex w-full items-start gap-1 text-left">
          <span className="min-w-0 flex-1 break-words">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-primary">{nomeDe(d.membro_id)}</span>
            <span className="text-[13px] font-medium leading-snug">{d.titulo}</span>
          </span>
          <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", aberta === d.id && "rotate-180")} />
        </button>
        <p className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          {nova && <span className="rounded bg-fuchsia-600 px-1 font-bold text-white" title={`Chegou ${format(new Date(d.criado_em), "d/MM 'às' HH:mm")}; some quando você abre`}>NOVO</span>}
          {d.produto && <span className="rounded bg-primary/10 px-1 text-primary">{d.produto}</span>}
          {d.prazo_sugerido && <span>prazo {format(new Date(`${d.prazo_sugerido}T12:00:00`), "dd/MM")}</span>}
        </p>
        {d.status === "passada" && conversa && (
          <p className={cn("mt-1 flex items-center gap-1 text-[10px]", conversa === "confirmado" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300")}>
            {conversa === "confirmado" && <CheckCircle2 className="h-3 w-3" />}{ESTADO_CONVERSA[conversa] ?? conversa}
          </p>
        )}
        {aberta === d.id && (
          <div className="mt-1.5 space-y-1.5 border-t pt-1.5 text-[11px] leading-relaxed">
            {d.porque && <p><b>Por quê:</b> {d.porque}</p>}
            {d.precisa && <p><b>Vai precisar de você:</b> {d.precisa}</p>}
            {d.status !== "passada" && (
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <Button type="button" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={passando === d.id} onClick={() => void passar(d)}>
                  {passando === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}Passar para {nomeDe(d.membro_id)}
                </Button>
                {d.status !== "ideia" && <button type="button" onClick={() => void mover(d, "ideia")} className="text-muted-foreground hover:text-foreground">Voltar para sugestões</button>}
                {d.status !== "adiada" && <button type="button" onClick={() => void mover(d, "adiada")} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Clock className="h-3 w-3" />Depois</button>}
                {d.status !== "descartada" && <button type="button" onClick={() => void mover(d, "descartada")} className="flex items-center gap-1 text-muted-foreground hover:text-rose-600"><Trash2 className="h-3 w-3" />Descartar</button>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passar demanda</p>
        <span className="text-[11px] text-muted-foreground">O Pedro sugere o que passar pra quem está parado. Você decide: <b>Passar</b> manda pra conversa da pessoa.</span>
      </div>
      {carregando ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Carga de cada um: vermelho = ocioso, âmbar = pouca carga. */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-muted/30 p-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {pessoas.map((p) => (
              <span key={p.id} title={p.funcao ?? undefined}
                className={cn("rounded-full border px-2 py-0.5 text-[11px]",
                  p.abertas === 0 ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                    : p.abertas <= POUCA ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>
                <b>{p.nome}</b> · {p.abertas === 0 ? "ocioso" : `${p.abertas} ${p.abertas === 1 ? "tarefa" : "tarefas"}`}
              </span>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {COLUNAS.map((c) => {
              const daColuna = itens.filter((d) => d.status === c.status);
              const Icone = c.icone;
              return (
                <div key={c.status} className={cn("flex min-h-[160px] flex-col gap-1.5 rounded-xl border bg-muted/30 p-2", c.status === "adiada" && "border-dashed")}>
                  <p className="flex items-center gap-1 text-xs font-semibold"><Icone className="h-3.5 w-3.5" />{c.titulo}<span className="font-normal text-muted-foreground">{daColuna.length}</span></p>
                  <p className="-mt-1 text-[10px] text-muted-foreground">{c.ajuda}</p>
                  <div className="flex max-h-[440px] flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
                    {daColuna.map(cartao)}
                    {daColuna.length === 0 && (
                      <p className="py-3 text-center text-[11px] text-muted-foreground">{c.status === "ideia" ? "O Pedro traz sugestões nas rodadas de 30 min (8h–22h)" : "—"}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {descartadas.length > 0 && (
            <div>
              <button type="button" onClick={() => setVerDescartadas(!verDescartadas)} className="text-[11px] text-muted-foreground hover:text-foreground">
                {verDescartadas ? "Esconder" : "Ver"} descartadas ({descartadas.length})
              </button>
              {verDescartadas && <div className="mt-1.5 grid max-h-[260px] gap-1.5 overflow-y-auto sm:grid-cols-2">{descartadas.map(cartao)}</div>}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">Conta como tarefa aberta o que está na fila ou em andamento; o que espera sua aprovação não ocupa a pessoa. Atualizado {format(new Date(), "HH:mm", { locale: ptBR })}.</p>
        </>
      )}
    </section>
  );
}
