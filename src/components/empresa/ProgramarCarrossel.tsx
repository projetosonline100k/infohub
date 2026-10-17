import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarClock, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HORA_PADRAO, diaLocal, instante, problemaNoHorario, sugerirData } from "@/lib/empresa/programacao";
import { cn } from "@/lib/utils";

// "Escolher data do carrossel" (tarefa do Davi, tipo 'agendar'): ele escolhe
// dia e hora e a Dalila publica sozinha na nuvem (edge dalila-publicar).
// Desde 17/10 a Dalila já programa sozinha ao aprovar (1º dia livre às 10h):
// aqui o Davi muda o dia, a hora ou a legenda até a hora do post.
const LIMITE_LEGENDA = 2200;

// `carrosseis` ainda não está nos tipos gerados deste worktree.
const db = supabase as unknown as SupabaseClient;

interface CarrosselParaProgramar {
  id: string;
  cliente_id: string;
  numero: number | null;
  tema: string;
  status: string;
  mensagem: string | null;
  legenda: string | null;
  paginas: string[];
  programado_para: string | null;
}

export function ProgramarCarrossel({ tarefaId, onFechar }: { tarefaId: string | null; onFechar: () => void }) {
  const [carrossel, setCarrossel] = useState<CarrosselParaProgramar | null>(null);
  const [ocupados, setOcupados] = useState<string[]>([]);
  const [data, setData] = useState("");
  const [hora, setHora] = useState(HORA_PADRAO);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [agenda, setAgenda] = useState<ItemAgenda[]>([]);
  const [instagram, setInstagram] = useState<string | null>(null);
  const [legenda, setLegenda] = useState("");

  useEffect(() => {
    if (!tarefaId) return;
    setCarregando(true);
    void (async () => {
      const { data: c } = await db.from("carrosseis")
        .select("id, cliente_id, numero, tema, status, mensagem, legenda, paginas, programado_para")
        .eq("tarefa_data_id", tarefaId).maybeSingle();
      const agenda = c ? await carregarAgenda(c.cliente_id, c.id) : [];
      setInstagram(c ? await instagramDoProjeto(c.cliente_id) : null);
      setAgenda(agenda);
      const dias = agenda.filter(ocupaDia("carrossel")).map((a) => a.dia);
      setOcupados(dias);
      setCarrossel((c as CarrosselParaProgramar) ?? null);
      setLegenda(c?.legenda ?? "");
      if (c?.programado_para) {
        const d = new Date(c.programado_para);
        setData(diaLocal(d));
        setHora(format(d, "HH:mm"));
      } else {
        setData(sugerirData(new Date(), dias));
        setHora(HORA_PADRAO);
      }
      setCarregando(false);
    })();
  }, [tarefaId]);

  const quando = useMemo(() => instante(data, hora), [data, hora]);
  const problema = problemaNoHorario(quando, new Date())
    ?? (!legenda.trim() ? "Escreva a legenda." : legenda.length > LIMITE_LEGENDA ? `A legenda passa de ${LIMITE_LEGENDA} caracteres.` : null);
  const diaOcupado = data && ocupados.includes(data);
  const naoPublicou = carrossel?.mensagem?.startsWith("Não publicou") ? carrossel.mensagem : null;

  const programar = async () => {
    if (!carrossel || !quando || problema || !instagram) return;
    setSalvando(true);
    const { error } = await db.rpc("programar_carrossel", { p_carrossel: carrossel.id, p_quando: quando.toISOString(), p_legenda: legenda });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Programado: a Dalila publica ${format(quando, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}.`);
    onFechar();
  };

  const nome = carrossel ? `${carrossel.numero ? `${String(carrossel.numero).padStart(3, "0")} · ` : ""}${carrossel.tema}` : "";

  return (
    <Dialog open={!!tarefaId} onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Quando publicar?</DialogTitle>
          <DialogDescription>{nome || "Carrossel"}</DialogDescription>
        </DialogHeader>
        {carregando ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !carrossel ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Não achei o carrossel desta tarefa.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {carrossel.paginas.map((u, i) => (
                <img key={u} src={u} alt={`Página ${i + 1}`} className="h-28 w-auto shrink-0 rounded border object-cover" />
              ))}
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="flex items-center justify-between text-muted-foreground">
                Legenda (pode editar até a hora do post)
                <span className={legenda.length > LIMITE_LEGENDA ? "text-rose-600" : ""}>{legenda.length}/{LIMITE_LEGENDA}</span>
              </span>
              <Textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} className="min-h-[120px] text-sm" />
            </label>
            {naoPublicou && <p className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-sm text-rose-600 dark:text-rose-400">{naoPublicou}</p>}
            <CalendarioPosts agenda={agenda} tipo="carrossel" selecionado={data} onEscolher={setData} />
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="flex items-center justify-between text-muted-foreground">Dia
                  <button type="button" onClick={() => { setData(sugerirData(new Date(), ocupados)); setHora(HORA_PADRAO); }}
                    className="text-xs font-medium text-primary hover:underline">A Dalila escolhe</button>
                </span>
                <Input type="date" value={data} min={diaLocal(new Date())} onChange={(e) => setData(e.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Hora (Brasília)</span>
                <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              </label>
            </div>
            {diaOcupado && <p className="text-xs text-amber-600 dark:text-amber-400">Já tem um carrossel programado neste dia (o padrão é 1 carrossel por dia; o reel não conta).</p>}
            {problema && data && <p className="text-xs text-rose-600 dark:text-rose-400">{problema}</p>}
            {instagram ? (
              <p className="text-xs text-muted-foreground">
                A Dalila publica sozinha no @{instagram} neste dia e hora, mesmo com o Mac desligado. Escolher a data é o seu ok.
              </p>
            ) : <SemInstagram />}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onFechar}>Agora não</Button>
              <Button onClick={() => void programar()} disabled={!!problema || salvando || !instagram}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {quando && !problema ? `Programar para ${format(quando, "EEE, d MMM 'às' HH:mm", { locale: ptBR })}` : "Programar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Em qual Instagram a Dalila publica este projeto (regra única do banco,
// dalila_conexao_do_projeto): o @, ou null se o projeto não tem Instagram
// próprio. A conta geral só vale para o projeto Davi Queiroz.
export async function instagramDoProjeto(clienteId: string): Promise<string | null> {
  const { data } = await db.rpc("instagram_do_projeto", { p_cliente: clienteId });
  return (data as string | null) ?? null;
}

export function SemInstagram() {
  return (
    <p className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-sm text-rose-600 dark:text-rose-400">
      Este projeto não tem Instagram conectado. A Dalila só publica no perfil do próprio projeto: conecte o Instagram dele em Automações e volte aqui.
    </p>
  );
}

// O que já está na agenda de publicação do projeto: carrosséis (programados,
// publicando ou publicados) e vídeos com data de postagem.
export interface ItemAgenda { dia: string; tipo: "carrossel" | "reel" | "video"; titulo: string; capa: string | null; publicado: boolean; hora: string | null }
// Cada tipo ocupa o dia só para ele (pedido do Davi, 16/10): 1 carrossel e 1 reel
// por dia, um não toma o dia do outro.
export const ocupaDia = (tipo: "carrossel" | "reel") => (a: ItemAgenda) => a.tipo === tipo;

export async function carregarAgenda(clienteId: string, ignorar?: string): Promise<ItemAgenda[]> {
  const [cars, vids, reels] = await Promise.all([
    db.from("carrosseis").select("id, numero, tema, status, paginas, programado_para, publicado_em")
      .eq("cliente_id", clienteId).in("status", ["programado", "publicando", "publicado"]),
    db.from("videos_vertical").select("id, titulo, status, data_postagem").eq("cliente_id", clienteId).not("data_postagem", "is", null),
    db.from("reels").select("id, titulo, status, programado_para, publicado_em")
      .eq("cliente_id", clienteId).in("status", ["programado", "publicando", "publicado"]),
  ]);
  const itens: ItemAgenda[] = [];
  for (const c of (cars.data || []) as { id: string; numero: number | null; tema: string; status: string; paginas: string[] | null; programado_para: string | null; publicado_em: string | null }[]) {
    if (c.id === ignorar) continue;
    const quando = c.publicado_em ?? c.programado_para;
    if (!quando) continue;
    const d = new Date(quando);
    itens.push({ dia: diaLocal(d), tipo: "carrossel", titulo: `${c.numero ? `${String(c.numero).padStart(3, "0")} · ` : ""}${c.tema}`, capa: c.paginas?.[0] ?? null, publicado: c.status === "publicado", hora: format(d, "HH:mm") });
  }
  for (const r of (reels.data || []) as { id: string; titulo: string; status: string; programado_para: string | null; publicado_em: string | null }[]) {
    const quando = r.publicado_em ?? r.programado_para;
    if (r.id === ignorar || !quando) continue;
    const d = new Date(quando);
    itens.push({ dia: diaLocal(d), tipo: "reel", titulo: r.titulo, capa: null, publicado: r.status === "publicado", hora: format(d, "HH:mm") });
  }
  for (const v of (vids.data || []) as { titulo: string; status: string; data_postagem: string }[]) {
    itens.push({ dia: v.data_postagem.slice(0, 10), tipo: "video", titulo: v.titulo, capa: null, publicado: v.status === "postado", hora: null });
  }
  return itens;
}

// Calendário das próximas 5 semanas: o que já está programado em cada dia; clicar num dia escolhe.
// `tipo`: "livre" = dia sem post desse tipo (sem tipo: sem carrossel nem reel).
export function CalendarioPosts({ agenda, tipo, selecionado, onEscolher }: { agenda: ItemAgenda[]; tipo?: "carrossel" | "reel"; selecionado?: string; onEscolher?: (dia: string) => void }) {
  const hoje = diaLocal(new Date());
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7));   // segunda-feira desta semana
  const dias = Array.from({ length: 35 }, (_, k) => { const d = new Date(inicio); d.setDate(inicio.getDate() + k); return d; });
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dias.map((d) => {
          const dia = diaLocal(d);
          const itens = agenda.filter((a) => a.dia === dia);
          const passado = dia < hoje;
          const livre = !itens.some((a) => (tipo ? a.tipo === tipo : a.tipo !== "video"));
          return (
            <button key={dia} type="button" disabled={passado || !onEscolher} onClick={() => onEscolher?.(dia)}
              title={itens.map((a) => `${a.tipo === "carrossel" ? "Carrossel" : a.tipo === "reel" ? "Reel" : "Vídeo"} ${a.titulo}${a.hora ? ` · ${a.hora}` : ""}${a.publicado ? " (publicado)" : ""}`).join("\n") || (passado ? "" : "Livre")}
              className={cn("flex min-h-[58px] flex-col rounded-md border p-1 text-left transition-colors",
                passado ? "opacity-40" : livre ? "border-emerald-500/30 hover:bg-emerald-500/10" : "hover:bg-muted",
                selecionado === dia && "border-primary bg-primary/10 ring-2 ring-primary",
                dia === hoje && "border-sky-500")}>
              <span className={cn("text-[11px] font-semibold", dia === hoje && "text-sky-600 dark:text-sky-400")}>{d.getDate()}{d.getDate() === 1 ? ` ${format(d, "MMM", { locale: ptBR })}` : ""}</span>
              <span className="mt-0.5 flex flex-wrap gap-0.5">
                {itens.slice(0, 3).map((a, k) => a.capa
                  ? <img key={k} src={a.capa} alt="" className={cn("h-6 w-5 rounded-sm object-cover", a.publicado && "opacity-60 grayscale")} />
                  : <span key={k} className="rounded-sm bg-violet-500/20 px-1 text-[9px] text-violet-700 dark:text-violet-300">▶</span>)}
                {itens.length > 3 && <span className="text-[9px] text-muted-foreground">+{itens.length - 3}</span>}
              </span>
              {!passado && livre && <span className="mt-auto text-[9px] text-emerald-600 dark:text-emerald-400">livre</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">Miniatura = carrossel (cinza = já publicado) · ▶ = reel ou vídeo com data · verde = dia livre</p>
    </div>
  );
}
