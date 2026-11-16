import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, ChevronDown, Clapperboard, Clock, Film, Layers, LayoutGrid, List, Loader2, MessageCircle, Pencil, Search, UploadCloud, UserSearch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ROTULO_DANILO, type EdicaoVideo, type EtapaDanilo } from "@/lib/empresa/dashDanilo";
import { etapaEsteira } from "@/lib/empresa/dashDark";
import type { EdicaoResumo } from "./EditorVideo";
import { ProgramacaoDalila } from "./ProgramacaoDalila";
import type { MembroResumo } from "@/lib/empresa/visaoGeral";
import { cn } from "@/lib/utils";

const db = supabase as unknown as SupabaseClient;
const hojeBrasilia = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const PASTA_ENTRADA = "https://drive.google.com/drive/folders/177Bylb55x0CqLHO0b3Tmjb2070BtcZNN";   // "Precisa de edição": de onde o Danilo pega os brutos
type Filtro = "todos" | "fila" | "edicao" | "revisao" | "concluido";
const GRUPO: Record<EtapaDanilo, Exclude<Filtro, "todos">> = { fila: "fila", criando: "edicao", edicao: "edicao", revisao: "revisao", pronto: "concluido", programado: "concluido", postado: "concluido" };
const mmss = (s: number | null) => (s == null ? "" : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const percentual = (msg: string | null) => { const m = /(\d{1,3})\s*%/.exec(msg ?? ""); return m ? Math.min(100, Number(m[1])) : null; };

/** Edição de vídeos (abre ao clicar no Danilo; 16/11/2026, Davi: "a visualização parecida com essa"): banner, números por etapa, grade de vídeos com miniatura e status. */
export function DashDanilo({ membro, aberto, onFechar, onConversar, onAbrirEdicao, escritorioId }: {
  membro: MembroResumo | null; aberto: boolean; onFechar: () => void; onConversar: () => void; escritorioId: string | null;
  onAbrirEdicao?: (e: EdicaoResumo) => void;
}) {
  const [aba, setAba] = useState<"edicao" | "programacao">("edicao");
  const [edicoes, setEdicoes] = useState<(EdicaoVideo & { resumo: EdicaoResumo })[] | null>(null);
  const [erro, setErro] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState(false);
  const [limite, setLimite] = useState(48);

  useEffect(() => {
    if (!aberto || !membro || !escritorioId) return;
    let vivo = true;
    setEdicoes(null); setErro(false); setAba("edicao"); setFiltro("todos"); setBusca(""); setLimite(48);
    const ler = async () => {
      const { data, error } = await db.from("edicoes_video")
        .select("id, titulo, status, mensagem, versao, final_drive, duracao, formato, opcoes_formato, previa_url, projeto_em, cliente_id, criado_em, atualizado_em, video_vertical_id")
        .eq("cliente_id", escritorioId).or("formato.is.null,formato.neq.dark").order("atualizado_em", { ascending: false }).limit(400);
      if (!vivo) return;
      if (error) { setErro(true); return; }
      const lista = (data || []) as (EdicaoResumo & { cliente_id: string; criado_em: string; atualizado_em: string; video_vertical_id: string | null })[];
      const ids = lista.map((e) => e.video_vertical_id).filter((x): x is string => !!x);
      const { data: vid } = ids.length ? await db.from("videos_vertical").select("id, status, data_postagem").in("id", ids) : { data: [] };
      if (!vivo) return;
      const videos = new Map(((vid || []) as { id: string; status: string; data_postagem: string | null }[]).map((v) => [v.id, v]));
      setEdicoes(lista.map((e) => {
        const v = e.video_vertical_id ? videos.get(e.video_vertical_id) : undefined;
        return { id: e.id, titulo: e.titulo, status: e.status, cliente_id: e.cliente_id, criado_em: e.criado_em, atualizado_em: e.atualizado_em, formato: e.formato ?? null,
          video_status: v?.status ?? null, data_postagem: v?.data_postagem ?? null, resumo: e };
      }));
    };
    void ler();
    const t = window.setInterval(() => { if (!document.hidden) void ler(); }, 15000);   // o progresso das que estão renderizando anda sozinho
    return () => { vivo = false; window.clearInterval(t); };
  }, [aberto, membro, escritorioId]);

  const hoje = hojeBrasilia();
  const itens = useMemo(() => (edicoes ?? []).map((e) => ({ ...e, etapa: etapaEsteira(e, hoje) as EtapaDanilo | "cancelado" })).filter((e): e is typeof e & { etapa: EtapaDanilo } => e.etapa !== "cancelado"), [edicoes, hoje]);
  const conta = useMemo(() => {
    const c: Record<Exclude<Filtro, "todos">, number> = { fila: 0, edicao: 0, revisao: 0, concluido: 0 };
    for (const e of itens) c[GRUPO[e.etapa]]++;
    return c;
  }, [itens]);
  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return itens.filter((e) => (filtro === "todos" || GRUPO[e.etapa] === filtro) && (!b || e.titulo.toLowerCase().includes(b)));
  }, [itens, filtro, busca]);

  const tile = (id: Filtro, Icone: typeof Layers, valor: number, rotulo: string, cor: string, fundo: string) => (
    <button key={id} type="button" onClick={() => setFiltro(filtro === id ? "todos" : id)}
      className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors", filtro === id ? "border-violet-400/60 bg-violet-500/10" : "border-white/10 bg-[#0c1320] hover:bg-white/5")}>
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", fundo)}><Icone className={cn("h-5 w-5", cor)} /></span>
      <span><span className={cn("block text-2xl font-bold leading-none tabular-nums", id === "todos" ? "text-white" : cor)}>{valor}</span><span className="text-xs text-white/60">{rotulo}</span></span>
    </button>);

  const chip = (e: (typeof itens)[number]) => {
    const g = GRUPO[e.etapa];
    if (g === "edicao") return <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300"><Pencil className="h-3 w-3" />{e.etapa === "edicao" ? "Renderizando" : "Em edição"}</span>;
    if (g === "revisao") return <span className="inline-flex items-center gap-1 rounded-lg bg-violet-500/20 px-2.5 py-1 text-xs font-semibold text-violet-200"><UserSearch className="h-3 w-3" />Em revisão</span>;
    if (g === "concluido") return <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300"><CheckCircle2 className="h-3 w-3" />{e.etapa === "pronto" ? "Concluído" : ROTULO_DANILO[e.etapa]}</span>;
    return <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/70"><Clock className="h-3 w-3" />Na fila</span>;
  };
  const progresso = (e: (typeof itens)[number]) => {
    if (e.etapa !== "edicao" && e.etapa !== "criando") return null;
    const pct = percentual(e.resumo.mensagem);
    return (
      <div className="mt-2">
        <div className="flex items-center justify-between text-[11px] text-white/55"><span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{pct != null ? "Processando…" : "Editando…"}</span>{pct != null && <span>{pct}%</span>}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={cn("h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500", pct == null && "w-1/3 animate-pulse")} style={pct != null ? { width: `${pct}%` } : undefined} /></div>
      </div>);
  };
  const miniatura = (e: (typeof itens)[number], cls: string) => (e.resumo.previa_url
    ? <video src={`${e.resumo.previa_url}#t=1`} preload="metadata" muted playsInline className={cn("object-cover", cls)} />
    : <div className={cn("flex items-center justify-center bg-gradient-to-br from-[#1a2440] to-[#0d1424]", cls)}><Film className="h-8 w-8 text-white/25" /></div>);
  const abrir = (e: (typeof itens)[number]) => { onAbrirEdicao?.(e.resumo); };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="dark max-h-[92vh] w-[96vw] max-w-[1240px] overflow-y-auto border-white/10 bg-[#070b14] p-5 text-white sm:p-6 [&>button]:text-white/70">
        <DialogDescription className="sr-only">Vídeos em edição do Danilo</DialogDescription>
        {erro ? <><DialogTitle className="sr-only">Edição de vídeos</DialogTitle><p className="text-sm text-rose-300">Não consegui carregar as edições agora.</p></>
          : !edicoes ? <><DialogTitle className="sr-only">Edição de vídeos</DialogTitle><Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-white/50" /></> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-r from-[#141032] via-[#1b1546] to-[#2a1d6b] p-6">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-2xl font-bold tracking-tight">Envie seus vídeos e acompanhe a edição</DialogTitle>
                <p className="mt-1 text-sm text-white/65">Coloque o bruto na pasta do Drive; o {membro?.nome} pega, edita e deixa em revisão aqui.</p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <a href={PASTA_ENTRADA} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-400"><UploadCloud className="h-4 w-4" />Enviar vídeos</a>
                  <button type="button" onClick={onConversar} className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10"><MessageCircle className="h-4 w-4" />Conversar com o {membro?.nome}</button>
                </div>
              </div>
              <span className="hidden h-24 w-24 items-center justify-center rounded-3xl bg-white/5 ring-1 ring-white/10 sm:flex"><Clapperboard className="h-12 w-12 text-violet-300" /></span>
            </div>

            <div className="flex w-fit gap-1 rounded-2xl border border-white/10 bg-[#0c1320] p-1 text-sm">
              {([["edicao", "Edição de vídeos"], ["programacao", "Programação (Dalila)"]] as const).map(([v, r]) => (
                <button key={v} type="button" onClick={() => setAba(v)} className={cn("rounded-xl px-4 py-1.5", aba === v ? "bg-violet-500 font-bold text-white" : "text-white/65 hover:text-white")}>{r}</button>))}
            </div>
            {aba === "programacao" && escritorioId ? <ProgramacaoDalila clienteId={escritorioId} onAbrirEdicao={(e) => { onAbrirEdicao?.(e); }} /> : <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {tile("todos", Layers, itens.length, "Vídeos no projeto", "text-white", "bg-white/10")}
              {tile("fila", Clock, conta.fila, "Na fila", "text-sky-300", "bg-sky-500/15")}
              {tile("edicao", Pencil, conta.edicao, "Em edição", "text-amber-300", "bg-amber-500/15")}
              {tile("revisao", UserSearch, conta.revisao, "Em revisão", "text-violet-300", "bg-violet-500/15")}
              {tile("concluido", CheckCircle2, conta.concluido, "Concluídos", "text-emerald-300", "bg-emerald-500/15")}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xl font-bold">Vídeos ({visiveis.length})</h3>
              <div className="relative ml-auto w-full max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-white/40" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar vídeos…" className="w-full rounded-xl border border-white/10 bg-[#0c1320] py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-400/50" /></div>
              <div className="flex rounded-xl border border-white/10 bg-[#0c1320] p-0.5">
                <button type="button" title="Grade" onClick={() => setLista(false)} className={cn("rounded-lg p-2", !lista ? "bg-violet-500 text-white" : "text-white/55")}><LayoutGrid className="h-4 w-4" /></button>
                <button type="button" title="Lista" onClick={() => setLista(true)} className={cn("rounded-lg p-2", lista ? "bg-violet-500 text-white" : "text-white/55")}><List className="h-4 w-4" /></button>
              </div>
            </div>

            {visiveis.length === 0 ? <p className="rounded-2xl bg-white/5 p-10 text-center text-sm text-white/50">{itens.length === 0 ? "Nenhum vídeo ainda. Coloque um bruto na pasta do Drive e ele aparece aqui." : "Nenhum vídeo com esse filtro."}</p>
              : lista ? (
                <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-[#0c1320]">
                  {visiveis.slice(0, limite).map((e) => (
                    <button key={e.id} type="button" onClick={() => abrir(e)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5">
                      <span className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg">{miniatura(e, "h-full w-full")}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{e.titulo}</span><span className="text-xs text-white/45">{formatDistanceToNowStrict(new Date(e.atualizado_em), { locale: ptBR, addSuffix: true })}</span></span>
                      <span className="text-xs text-white/55">{mmss(e.resumo.duracao)}</span>{chip(e)}
                    </button>))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {visiveis.slice(0, limite).map((e) => (
                    <button key={e.id} type="button" onClick={() => abrir(e)} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c1320] text-left transition-colors hover:border-violet-400/40">
                      <div className="relative aspect-video w-full overflow-hidden">
                        {miniatura(e, "h-full w-full")}
                        {e.resumo.duracao != null && <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium">{mmss(e.resumo.duracao)}</span>}
                      </div>
                      <div className="p-3">
                        <p className="truncate text-sm font-semibold" title={e.titulo}>{e.titulo}</p>
                        <div className="mt-2">{chip(e)}</div>
                        {progresso(e)}
                      </div>
                    </button>))}
                </div>)}
            {visiveis.length > limite && <button type="button" onClick={() => setLimite((n) => n + 48)} className="mx-auto flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2 text-sm text-white/75 hover:bg-white/10">Ver mais<ChevronDown className="h-4 w-4" /></button>}
            </>}
          </div>)}
      </DialogContent>
    </Dialog>
  );
}
