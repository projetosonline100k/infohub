import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronLeft, ChevronRight, FileText, Loader2, MessageCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirmar } from "@/components/DialogosGlobais";
import { MidiaLocal } from "./MidiaLocal";
import { agruparPorDia, contarPorStatus, mensagemParaLauro, proximoDiaLivre, ROTULO_STATUS, semanasDoMes, type RoteiroDark, type StatusRoteiro } from "@/lib/empresa/roteirosDark";
import { cn } from "@/lib/utils";

const db = supabase as unknown as SupabaseClient;

// Roteiros em calendário (13/11/2026, Davi, com um desenho: "eu subo o roteiro, o Lauro faz o resto; visualização estilo calendário e o status embaixo de cada roteiro").
// Esquerda: a lista de roteiros do perfil (V1, V2…) com o "+" para subir um novo. Direita: o mês em calendário; cada dia mostra o roteiro com o status embaixo.
// Ao subir um roteiro, o Lauro é acionado (pedido no modo vivo) e vai atualizando o status: na fila → editando → programando → programado.
export interface PerfilRoteiro { id: string; nome: string; modo_vivo?: boolean; estilo?: unknown }

const CHIP: Record<StatusRoteiro, string> = {
  na_fila: "bg-white/10 text-white/70", editando: "bg-amber-500/20 text-amber-300", programando: "bg-sky-500/20 text-sky-300", programado: "bg-emerald-500/20 text-emerald-300", erro: "bg-rose-500/20 text-rose-300",
};
const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const hojeBrasilia = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const campo = "w-full rounded-lg border border-white/10 bg-[#0a1520] px-3 py-2 text-sm text-white outline-none focus:border-amber-200/60";

export function RoteirosDark({ perfis, onConversar }: { perfis: PerfilRoteiro[]; onConversar: (perfilId: string) => void }) {
  const [perfilId, setPerfilId] = useState(perfis[0]?.id ?? "");
  const [roteiros, setRoteiros] = useState<RoteiroDark[] | null>(null);
  const hoje = hojeBrasilia();
  const [mes, setMes] = useState({ ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) });
  const [novo, setNovo] = useState<{ dia: string } | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => { if (!perfis.some((p) => p.id === perfilId)) setPerfilId(perfis[0]?.id ?? ""); }, [perfis, perfilId]);
  const carregar = useCallback(async () => {
    if (!perfilId) { setRoteiros([]); return; }
    const { data } = await db.from("esteira_dark_roteiros").select("id, perfil_id, numero, titulo, texto, data_postagem, status, arquivo, obs, criado_em").eq("perfil_id", perfilId).order("numero");
    setRoteiros((data ?? []) as RoteiroDark[]);
  }, [perfilId]);
  useEffect(() => {
    setRoteiros(null); void carregar();
    const t = window.setInterval(() => { if (!document.hidden) void carregar(); }, 8000);   // o Lauro vai mudando o status
    return () => window.clearInterval(t);
  }, [carregar]);

  const perfil = perfis.find((p) => p.id === perfilId);
  const porDia = useMemo(() => agruparPorDia(roteiros ?? []), [roteiros]);
  const semanas = useMemo(() => semanasDoMes(mes.ano, mes.mes), [mes]);
  const contagem = contarPorStatus(roteiros ?? []);
  const atual = roteiros?.find((r) => r.id === aberto) ?? null;
  const mover = (d: number) => setMes((m) => { const n = m.mes - 1 + d; return { ano: m.ano + Math.floor(n / 12), mes: ((n % 12) + 12) % 12 + 1 }; });

  if (!perfis.length) return <p className="rounded-xl bg-white/5 p-8 text-center text-sm text-white/50">Cadastre um perfil na esteira primeiro (botão “Novo perfil”): os roteiros ficam dentro de cada perfil.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm text-white/70">Perfil
          <select value={perfilId} onChange={(e) => setPerfilId(e.target.value)} className="bg-transparent text-white outline-none">{perfis.map((p) => <option key={p.id} value={p.id} className="bg-[#0a1520]">{p.nome}</option>)}</select></label>
        <div className="flex flex-wrap gap-1.5 text-xs">{(Object.keys(ROTULO_STATUS) as StatusRoteiro[]).filter((s) => contagem[s] > 0).map((s) => <span key={s} className={cn("rounded-full px-2.5 py-1 font-semibold", CHIP[s])}>{contagem[s]} {ROTULO_STATUS[s].toLowerCase()}</span>)}</div>
        <button type="button" onClick={() => perfil && onConversar(perfil.id)} className="ml-auto flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10"><MessageCircle className="h-4 w-4" />Conversar com o Lauro</button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1b27] to-[#08121c] p-4">
          <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-white/70" /><h3 className="text-lg font-bold">Roteiros</h3>
            <button type="button" onClick={() => setNovo({ dia: proximoDiaLivre(roteiros ?? [], hoje) })} title="Subir um roteiro novo" className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3c98b] text-black hover:brightness-105"><Plus className="h-4 w-4" /></button></div>
          {roteiros === null ? <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-white/40" /> : roteiros.length === 0 ? <p className="mt-3 rounded-xl bg-white/5 p-4 text-center text-sm text-white/50">Nenhum roteiro ainda. Clique no + e suba o primeiro: o Lauro faz o resto.</p> : (
            <ul className="mt-3 max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
              {[...roteiros].reverse().map((r) => (
                <li key={r.id}><button type="button" onClick={() => setAberto(r.id)} className="w-full rounded-xl border border-white/10 bg-black/20 p-2.5 text-left hover:bg-white/5">
                  <span className="flex items-center gap-2"><span className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-bold">V{r.numero}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{r.titulo}</span></span>
                  <span className="mt-1.5 flex items-center gap-2 text-[11px]"><span className={cn("rounded-full px-2 py-0.5 font-semibold", CHIP[r.status])}>{ROTULO_STATUS[r.status]}</span><span className="text-white/45">{r.data_postagem ? r.data_postagem.split("-").reverse().slice(0, 2).join("/") : "sem dia"}</span></span>
                </button></li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1b27] to-[#08121c] p-4">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => mover(-1)} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"><ChevronLeft className="h-5 w-5" /></button>
            <h3 className="min-w-[10rem] text-center text-lg font-bold capitalize">{MESES[mes.mes - 1]} {mes.ano}</h3>
            <button type="button" onClick={() => mover(1)} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"><ChevronRight className="h-5 w-5" /></button>
            <button type="button" onClick={() => setMes({ ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) })} className="ml-2 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10">Hoje</button>
          </div>
          <div className="mt-3 overflow-x-auto"><div className="min-w-[720px]">
            <div className="grid grid-cols-7 gap-1.5 pb-1.5 text-center text-xs uppercase tracking-wide text-white/45">{DIAS.map((d) => <span key={d}>{d}</span>)}</div>
            <div className="space-y-1.5">
              {semanas.map((s, i) => (
                <div key={i} className="grid grid-cols-7 gap-1.5">
                  {s.map((d) => {
                    const lista = porDia.get(d.dia) ?? [];
                    return (
                      <div key={d.dia} onClick={() => { if (!lista.length && d.dia >= hoje) setNovo({ dia: d.dia }); }}
                        className={cn("min-h-[104px] rounded-xl border p-1.5", d.doMes ? "border-white/10 bg-black/20" : "border-transparent bg-black/5 opacity-50", d.dia === hoje && "border-amber-300/60", !lista.length && d.dia >= hoje && "cursor-pointer hover:bg-white/5")}>
                        <p className={cn("text-xs font-semibold", d.dia === hoje ? "text-amber-300" : "text-white/55")}>{d.numero}</p>
                        <div className="mt-1 space-y-1">
                          {lista.slice(0, 2).map((r) => (
                            <button key={r.id} type="button" onClick={(e) => { e.stopPropagation(); setAberto(r.id); }} className="block w-full rounded-lg border border-white/10 bg-[#0d1a26] p-1.5 text-left hover:border-white/30">
                              <span className="flex items-center gap-1 text-xs font-bold"><span>v{r.numero}</span><span className="min-w-0 flex-1 truncate font-medium text-white/80">{r.titulo}</span></span>
                              <span className={cn("mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold", CHIP[r.status])}>{ROTULO_STATUS[r.status]}</span>
                            </button>
                          ))}
                          {lista.length > 2 && <p className="text-[10px] text-white/50">+{lista.length - 2} no dia</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div></div>
          <p className="mt-2 text-[11px] text-white/40">Clique num dia vazio para subir um roteiro nele. O status embaixo de cada roteiro é atualizado pelo Lauro.</p>
        </section>
      </div>

      <NovoRoteiro aberto={!!novo} dia={novo?.dia ?? hoje} perfil={perfil} onFechar={() => setNovo(null)} onCriado={() => { setNovo(null); void carregar(); }} />
      <DetalheRoteiro roteiro={atual} perfil={perfil} onFechar={() => setAberto(null)} onMudou={() => void carregar()} onConversar={() => { if (perfil) { setAberto(null); onConversar(perfil.id); } }} />
    </div>
  );
}

function NovoRoteiro({ aberto, dia, perfil, onFechar, onCriado }: { aberto: boolean; dia: string; perfil?: PerfilRoteiro; onFechar: () => void; onCriado: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [data, setData] = useState(dia);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (aberto) { setTitulo(""); setTexto(""); setData(dia); } }, [aberto, dia]);

  const criar = async () => {
    if (!perfil || !titulo.trim() || !texto.trim() || salvando) return;
    setSalvando(true);
    try {
      const { data: criado, error } = await db.from("esteira_dark_roteiros").insert({ perfil_id: perfil.id, numero: 0, titulo: titulo.trim().slice(0, 160), texto: texto.trim(), data_postagem: data || null }).select("id, numero, titulo, data_postagem").single();
      if (error || !criado) { toast.error("Não consegui salvar o roteiro"); return; }
      // O Lauro precisa do Mac (modo vivo) para produzir o vídeo: liga para este perfil (só o Davi consegue) e o aciona.
      if (!perfil.modo_vivo) {
        const { error: e2 } = await db.from("esteira_dark_perfis").update({ modo_vivo: true }).eq("id", perfil.id);
        if (e2) toast.error("Roteiro salvo, mas o Modo vivo não ligou (só o Davi liga). O Lauro precisa dele para produzir.");
      }
      const c = criado as { id: string; numero: number; titulo: string; data_postagem: string | null };
      const { error: e3 } = await db.from("esteira_dark_pedidos").insert({
        perfil_id: perfil.id, mensagem: mensagemParaLauro({ id: c.id, numero: c.numero, titulo: c.titulo, data_postagem: c.data_postagem }, perfil.nome),
        estilo_atual: perfil.estilo ?? {}, contexto: { perfil: perfil.nome, origem: "roteiro", roteiro_id: c.id }, historico: [],
      });
      if (e3) { toast.error("Roteiro salvo, mas não consegui avisar o Lauro. Abra o chat dele e peça para começar."); onCriado(); return; }
      toast.success(`Roteiro V${c.numero} enviado: o Lauro já está começando`);
      onCriado();
    } finally { setSalvando(false); }
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="dark max-h-[90vh] max-w-xl overflow-y-auto border-white/10 bg-[#0c1b27] text-white">
        <DialogHeader><DialogTitle>Novo roteiro · {perfil?.nome}</DialogTitle><DialogDescription className="text-white/55">Cole o roteiro. O Lauro faz o resto: produz o vídeo no estilo do perfil, mostra para você aprovar e programa a publicação.</DialogDescription></DialogHeader>
        <div className="space-y-2.5">
          <input className={campo} placeholder="Título do vídeo" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          <textarea className={cn(campo, "min-h-[220px] resize-y")} placeholder="Cole aqui o roteiro (a fala, do começo ao fim)" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-white/70">Postar em <input type="date" className={cn(campo, "w-44")} value={data} onChange={(e) => setData(e.target.value)} /></label>
          <button type="button" disabled={!titulo.trim() || !texto.trim() || salvando} onClick={() => void criar()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f3c98b] py-2.5 text-sm font-bold text-black disabled:opacity-40">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Subir roteiro e chamar o Lauro</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetalheRoteiro({ roteiro, perfil, onFechar, onMudou, onConversar }: { roteiro: RoteiroDark | null; perfil?: PerfilRoteiro; onFechar: () => void; onMudou: () => void; onConversar: () => void }) {
  const r = roteiro;
  const atualizar = async (mudanca: Record<string, unknown>) => {
    if (!r) return;
    const { error } = await db.from("esteira_dark_roteiros").update({ ...mudanca, atualizado_em: new Date().toISOString() }).eq("id", r.id);
    if (error) toast.error("Não consegui salvar"); else onMudou();
  };
  const reenviar = async () => {
    if (!r || !perfil) return;
    const { error } = await db.from("esteira_dark_pedidos").insert({
      perfil_id: perfil.id, mensagem: mensagemParaLauro({ id: r.id, numero: r.numero, titulo: r.titulo, data_postagem: r.data_postagem }, perfil.nome),
      estilo_atual: perfil.estilo ?? {}, contexto: { perfil: perfil.nome, origem: "roteiro", roteiro_id: r.id }, historico: [],
    });
    if (error) toast.error("Não consegui chamar o Lauro"); else toast.success("Lauro chamado de novo para este roteiro");
  };
  const apagar = async () => {
    if (!r || !(await confirmar(`Apagar o roteiro V${r.numero}?`, { descricao: "O roteiro some do calendário. O vídeo que o Lauro já gerou continua guardado no Mac.", botao: "Apagar" }))) return;
    const { error } = await db.from("esteira_dark_roteiros").delete().eq("id", r.id);
    if (error) { toast.error("Não consegui apagar"); return; }
    onMudou(); onFechar();
  };
  return (
    <Dialog open={!!r} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="dark max-h-[90vh] max-w-2xl overflow-y-auto border-white/10 bg-[#0c1b27] text-white">
        {r && (
          <>
            <DialogHeader><DialogTitle>V{r.numero} · {r.titulo}</DialogTitle><DialogDescription className="text-white/55">{perfil?.nome}</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-2 text-white/70">Status
                  <select className={cn(campo, "w-40")} value={r.status} onChange={(e) => void atualizar({ status: e.target.value })}>{(Object.keys(ROTULO_STATUS) as StatusRoteiro[]).map((s) => <option key={s} value={s} className="bg-[#0a1520]">{ROTULO_STATUS[s]}</option>)}</select></label>
                <label className="flex items-center gap-2 text-white/70">Dia <input type="date" className={cn(campo, "w-44")} value={r.data_postagem ?? ""} onChange={(e) => void atualizar({ data_postagem: e.target.value || null })} /></label>
              </div>
              {r.obs && <p className="rounded-lg bg-rose-500/10 p-2 text-xs text-rose-200">Lauro: {r.obs}</p>}
              {r.arquivo && /\.(mp4|mov|webm|m4v)$/i.test(r.arquivo) && <MidiaLocal midia={{ caminho: r.arquivo, nome: r.arquivo.split("/").pop() ?? "video.mp4", tipo: "video" }} />}
              <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/45">Roteiro</p><p className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-sm text-white/85">{r.texto}</p></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onConversar} className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10"><MessageCircle className="h-4 w-4" />Falar com o Lauro</button>
                <button type="button" onClick={() => void reenviar()} className="rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10">Chamar o Lauro de novo</button>
                <button type="button" onClick={() => void apagar()} className="ml-auto flex items-center gap-1.5 text-xs text-rose-300/80 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" />Apagar</button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
