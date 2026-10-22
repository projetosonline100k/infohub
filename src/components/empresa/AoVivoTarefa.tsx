import { useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { FilePen, Globe, ImageIcon, MessageSquareText, Play, Terminal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BonecoMesa, CabecaBoneco } from "./BonecoMesa";

// "Ao vivo" (22/10, Davi: "quando eu clicar na atividade sendo feita, quero ver a operação mesmo —
// animação ou a imagem do que está sendo feito"). Em cima, a última imagem que o funcionário criou ou
// conferiu (passos com foto, scripts/empresa/passos.py); sem imagem, ele trabalhando com a tela mostrando
// o passo atual. Embaixo, cada ação aparecendo na hora, como num terminal.
const db = supabase as unknown as SupabaseClient;
interface Passo { em: string; texto: string; tipo: string; url?: string }
const ICONE: Record<string, typeof Terminal> = { comando: Terminal, arquivo: FilePen, pesquisa: Globe, nota: MessageSquareText, inicio: Play, imagem: ImageIcon };

export interface AlvoAoVivo { atividadeId: string; titulo: string; nome: string; ehIa: boolean; progresso?: number | null; detalhe?: string | null }

export function AoVivoTarefa({ alvo, onFechar }: { alvo: AlvoAoVivo | null; onFechar: () => void }) {
  const [passos, setPassos] = useState<Passo[]>([]);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [fixada, setFixada] = useState<string | null>(null);   // imagem que o Davi clicou na lista
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPassos([]); setFixada(null); setProgresso(alvo?.progresso ?? null);
    if (!alvo) return;
    let vivo = true;
    const carregar = async () => {
      const { data } = await db.from("atividades").select("passos, progresso").eq("id", alvo.atividadeId).maybeSingle();
      if (!vivo || !data) return;
      if (Array.isArray(data.passos)) setPassos(data.passos as Passo[]);
      if (typeof data.progresso === "number") setProgresso(data.progresso);
    };
    void carregar();
    const t = window.setInterval(() => void carregar(), 3000);
    return () => { vivo = false; window.clearInterval(t); };
  }, [alvo]);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [passos.length]);

  const imagens = useMemo(() => passos.filter((p) => p.url), [passos]);
  const palco = fixada ?? imagens[imagens.length - 1]?.url ?? null;
  const atual = [...passos].reverse().find((p) => p.tipo !== "imagem") ?? null;
  const recente = passos.length > 0 && Date.now() - new Date(passos[passos.length - 1].em).getTime() < 3 * 60_000;

  return (
    <Dialog open={!!alvo} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="flex h-[88vh] max-w-5xl flex-col gap-3 overflow-hidden p-4">
        <DialogDescription className="sr-only">O que o funcionário está fazendo agora, ao vivo</DialogDescription>
        {alvo && (
          <>
            {/* Quem, o quê e quanto falta */}
            <div className="flex items-center gap-3 pr-6">
              <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-sky-100 dark:bg-slate-700"><CabecaBoneco nome={alvo.nome} ehIa={alvo.ehIa} className="h-full w-full" /></span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2 text-base">
                  {alvo.nome}
                  <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", recente ? "bg-rose-500/15 text-rose-600" : "bg-muted text-muted-foreground")}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", recente ? "animate-pulse bg-rose-500" : "bg-muted-foreground")} />{recente ? "AO VIVO" : "pausado"}
                  </span>
                </DialogTitle>
                <p className="truncate text-sm text-muted-foreground">{alvo.titulo}</p>
              </div>
              {progresso != null && <span className="shrink-0 text-sm font-semibold tabular-nums">{progresso}%</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              {progresso != null && progresso > 0
                ? <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${progresso}%` }} />
                : <div className="h-full w-1/3 animate-[barra-correndo_1.6s_ease-in-out_infinite] rounded-full bg-emerald-500/70" />}
            </div>

            {/* Palco: a imagem do que está sendo feito, ou ele trabalhando com a tela mostrando o passo */}
            <div className="relative flex min-h-0 flex-[3] items-center justify-center overflow-hidden rounded-xl border bg-slate-950">
              {palco ? (
                <img key={palco} src={palco} alt="" className="max-h-full max-w-full object-contain animate-in fade-in-0 zoom-in-95 duration-500" />
              ) : (
                <div className="flex flex-col items-center gap-3 p-6 text-center">
                  <svg viewBox="0 0 104 92" className="h-40 w-48"><BonecoMesa nome={alvo.nome} ehIa={alvo.ehIa} sinal="trabalhando" x={0} y={0} width={104} height={92} /></svg>
                  <p className="max-w-md font-mono text-sm text-emerald-300">
                    {atual?.texto ?? alvo.detalhe ?? "Começando…"}<span className="ml-0.5 inline-block w-2 animate-pulse bg-emerald-300">&nbsp;</span>
                  </p>
                  <p className="text-xs text-slate-400">As imagens que ele criar ou conferir aparecem aqui.</p>
                </div>
              )}
              {palco && atual && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-8 text-sm text-white">
                  {fixada ? "Imagem escolhida na lista" : atual.texto}
                </div>
              )}
              {fixada && (
                <button type="button" onClick={() => setFixada(null)} className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">Voltar ao vivo</button>
              )}
            </div>

            {/* As ações, uma a uma, como num terminal */}
            <div className="min-h-0 flex-[2] overflow-y-auto rounded-xl border bg-slate-950 p-3 font-mono text-[12px] leading-relaxed text-slate-300">
              {passos.length === 0 && <p className="text-slate-500">Esperando a primeira ação…</p>}
              {passos.map((p, i) => {
                const Icone = ICONE[p.tipo] ?? Terminal;
                const ultimo = i === passos.length - 1;
                return (
                  <div key={`${p.em}-${i}`} className={cn("flex items-start gap-2 py-0.5", ultimo && "animate-in fade-in-0 slide-in-from-bottom-1 duration-500")}>
                    <span className="w-11 shrink-0 tabular-nums text-slate-500">{format(new Date(p.em), "HH:mm")}</span>
                    <Icone className={cn("mt-1 h-3 w-3 shrink-0", p.tipo === "nota" ? "text-sky-400" : p.tipo === "imagem" ? "text-amber-400" : "text-emerald-400")} />
                    <span className={cn("min-w-0 flex-1 break-words", p.tipo === "nota" && "text-slate-100")}>{p.texto}</span>
                    {p.url && (
                      <button type="button" onClick={() => setFixada(p.url!)} className="shrink-0 overflow-hidden rounded border border-slate-700 hover:border-amber-400">
                        <img src={p.url} alt="" className="h-10 w-10 object-cover" loading="lazy" />
                      </button>
                    )}
                  </div>
                );
              })}
              {recente && <div className="flex gap-2 py-0.5 text-emerald-400"><span className="w-11" />▍</div>}
              <div ref={fim} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
