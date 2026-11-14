import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, ChevronLeft, ChevronRight, FileText, Loader2, MessageCircle, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirmar } from "@/components/DialogosGlobais";
import { MidiaLocal } from "./MidiaLocal";
import { ConectarInstagramDark, ProgramarPublicacao, useInstagramDoPerfil } from "./PublicacaoDark";
import { DesempenhoDark, NumerosDoVideo } from "./DesempenhoDark";
import { useDesempenhoDark } from "@/hooks/useDesempenhoDark";
import { agruparPorDia, contarPorStatus, mensagemAjuste, mensagemParaLauro, proximoDiaLivre, ROTULO_STATUS, semanasDoMes, versoesDoRoteiro, type RoteiroDark, type StatusRoteiro } from "@/lib/empresa/roteirosDark";
import { midiasDoTexto } from "@/lib/empresa/midiasChat";
import { cn } from "@/lib/utils";

const db = supabase as unknown as SupabaseClient;

// Roteiros em calendário (13/11/2026, Davi, com um desenho: "eu subo o roteiro, o Lauro faz o resto; visualização estilo calendário e o status embaixo de cada roteiro").
// Esquerda: a lista de roteiros do perfil (V1, V2…) com o "+" para subir um novo. Direita: o mês em calendário; cada dia mostra o roteiro com o status embaixo.
// Ao subir um roteiro, o Lauro é acionado (pedido no modo vivo) e vai atualizando o status: na fila → editando → programando → programado.
export interface PerfilRoteiro { id: string; nome: string; modo_vivo?: boolean; estilo?: unknown }

const CHIP: Record<StatusRoteiro, string> = {
  na_fila: "bg-white/10 text-white/70", editando: "bg-amber-500/20 text-amber-300", revisar: "bg-violet-500/30 text-violet-200 ring-1 ring-violet-400/40", programando: "bg-sky-500/20 text-sky-300", programado: "bg-emerald-500/20 text-emerald-300", publicando: "bg-sky-500/20 text-sky-300", publicado: "bg-emerald-500/30 text-emerald-200 ring-1 ring-emerald-400/40", erro: "bg-rose-500/20 text-rose-300",
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
    const { data } = await db.from("esteira_dark_roteiros").select("id, perfil_id, numero, titulo, texto, data_postagem, status, arquivo, obs, versoes, criado_em, legenda, video_url, programado_para, permalink, mensagem, ig_media_id").eq("perfil_id", perfilId).order("numero");
    setRoteiros((data ?? []) as RoteiroDark[]);
  }, [perfilId]);
  useEffect(() => {
    setRoteiros(null); void carregar();
    const t = window.setInterval(() => { if (!document.hidden) void carregar(); }, 8000);   // o Lauro vai mudando o status
    return () => window.clearInterval(t);
  }, [carregar]);

  const perfil = perfis.find((p) => p.id === perfilId);
  const ig = useInstagramDoPerfil(perfilId);
  const desempenho = useDesempenhoDark(ig.conta?.ig_user_id, (roteiros ?? []).map((r) => r.ig_media_id).filter((x): x is string => !!x));
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
        <span className="ml-auto"><ConectarInstagramDark perfilId={perfilId} conta={ig.conta} recarregar={ig.recarregar} /></span>
        <button type="button" onClick={() => perfil && onConversar(perfil.id)} className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10"><MessageCircle className="h-4 w-4" />Conversar com o Lauro</button>
      </div>

      {ig.conta && <DesempenhoDark username={ig.conta.username} dias={desempenho.dias} posts={desempenho.posts} leads={desempenho.leads} atualizando={desempenho.atualizando} carregou={desempenho.carregou} onAtualizar={() => void desempenho.atualizar()} hoje={hoje} />}

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
                  {r.ig_media_id && <span className="mt-1.5 block"><NumerosDoVideo pequeno post={desempenho.posts[r.ig_media_id]} leads={desempenho.leads[r.ig_media_id]} /></span>}
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
      <EstudioRoteiro roteiro={atual} perfil={perfil} numeros={atual?.ig_media_id ? { post: desempenho.posts[atual.ig_media_id], leads: desempenho.leads[atual.ig_media_id] } : undefined} onFechar={() => setAberto(null)} onMudou={() => void carregar()} />
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

type Msg = { papel: "user" | "assistant"; texto: string };

// Estúdio do roteiro (13/11/2026, Davi: "ao clicar, um editor estilo Premiere onde eu converso com o Lauro; quando ele editar, vem 'aprovar'").
// Esquerda: o vídeo atual (com o histórico de versões v1, v2…) e o roteiro. Direita: a conversa com o Lauro sobre ESTE roteiro. Quando o Lauro termina uma
// versão ele marca "revisar" e aparece o botão Aprovar; aprovar prepara o vídeo, e a publicação sai pela nuvem na data que o Davi escolher (PublicacaoDark). Nada é publicado sem o Aprovar e a data.
function EstudioRoteiro({ roteiro, perfil, numeros, onFechar, onMudou }: { roteiro: RoteiroDark | null; perfil?: PerfilRoteiro; numeros?: { post?: import("@/lib/empresa/desempenhoDark").PostMetrica; leads?: number }; onFechar: () => void; onMudou: () => void }) {
  const r = roteiro;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [pendentes, setPendentes] = useState(0);
  const pendentesRef = useRef(0);
  const [versaoSel, setVersaoSel] = useState<number | null>(null);
  const [verRoteiro, setVerRoteiro] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const roteiroId = r?.id;
  const versoes = r ? versoesDoRoteiro(r) : [];
  const indice = versaoSel === null ? versoes.length - 1 : Math.min(versaoSel, versoes.length - 1);
  const versao = indice >= 0 ? versoes[indice] : null;

  const mudar = (d: number) => { pendentesRef.current = Math.max(0, pendentesRef.current + d); setPendentes(pendentesRef.current); };
  const aguardar = useCallback(async (id: string) => {
    mudar(1);
    try {
      for (let i = 0; i < 800; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        const { data: p } = await db.from("esteira_dark_pedidos").select("status, resposta, erro, encaminhado_id").eq("id", id).maybeSingle();
        const x = p as { status: string; resposta: string | null; erro: string | null; encaminhado_id: string | null } | null;
        if (x?.status === "respondido") { setMsgs((m) => [...m, { papel: "assistant", texto: x.resposta ?? "" }]); if (x.encaminhado_id) void aguardar(x.encaminhado_id); return; }
        if (x?.status === "erro") { toast.error(x.erro || "O Lauro não conseguiu responder agora"); return; }
      }
      toast.error("O Lauro não respondeu. O Mac está ligado e o app aberto?");
    } finally { mudar(-1); }
  }, []);

  useEffect(() => {
    if (!roteiroId) return;
    setMsgs([]); setTexto(""); setVersaoSel(null); setVerRoteiro(false); pendentesRef.current = 0; setPendentes(0);
    void (async () => {
      const { data: ps } = await db.from("esteira_dark_pedidos").select("id, mensagem, status, resposta, criado_em, encaminhado_id").eq("contexto->>roteiro_id", roteiroId).order("criado_em", { ascending: true }).limit(80);
      type P = { id: string; mensagem: string; status: string; resposta: string | null; criado_em: string; encaminhado_id: string | null };
      const lista = (ps ?? []) as P[];
      const encaminhados = new Set(lista.map((p) => p.encaminhado_id).filter((x): x is string => !!x));
      const m: Msg[] = [];
      for (const p of lista) {
        if (!encaminhados.has(p.id)) {
          const t = p.mensagem.startsWith("NOVO ROTEIRO") ? `📄 ${p.mensagem.split("\n")[0]}` : p.mensagem.startsWith("APROVADO:") ? "✅ Aprovado" : p.mensagem.startsWith("AJUSTE no roteiro") ? p.mensagem.replace(/^AJUSTE no roteiro[^:]*:\s*/, "").split("\n\n")[0] : p.mensagem;
          m.push({ papel: "user", texto: t });
        }
        if (p.status === "respondido" && p.resposta) m.push({ papel: "assistant", texto: p.resposta });
      }
      setMsgs(m);
      for (const p of lista) if ((p.status === "pendente" || p.status === "processando") && Date.now() - new Date(p.criado_em).getTime() < 30 * 60_000) void aguardar(p.id);
    })();
  }, [roteiroId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [msgs, pendentes]);

  const pedir = async (mensagem: string, mostrar: string) => {
    if (!r || !perfil) return false;
    setMsgs((m) => [...m, { papel: "user", texto: mostrar }]);
    const { data, error } = await db.from("esteira_dark_pedidos").insert({
      perfil_id: perfil.id, mensagem, rapido: pendentesRef.current > 0, estilo_atual: perfil.estilo ?? {}, historico: [], contexto: { perfil: perfil.nome, origem: "roteiro", roteiro_id: r.id },
    }).select("id").single();
    if (error || !data) { toast.error("Não consegui falar com o Lauro"); return false; }
    void aguardar((data as { id: string }).id);
    return true;
  };
  const enviar = async () => {
    const t = texto.trim();
    if (!t || !r) return;
    setTexto("");
    await pedir(mensagemAjuste(r, t), t);
  };
  const aprovar = async () => {
    if (!r || !perfil) return;
    if (!(await confirmar(`Aprovar o V${r.numero}?`, { descricao: "O vídeo é preparado para o Instagram. Nada é publicado até você conectar a conta, escolher a data e programar.", botao: "Aprovar", destrutivo: false }))) return;
    const { error } = await db.from("esteira_dark_roteiros").update({ status: "programando", atualizado_em: new Date().toISOString() }).eq("id", r.id);
    if (error) { toast.error("Não consegui aprovar"); return; }
    onMudou();
    toast.success("Aprovado: preparando o vídeo para o Instagram");
  };
  const atualizar = async (mudanca: Record<string, unknown>) => {
    if (!r) return;
    const { error } = await db.from("esteira_dark_roteiros").update({ ...mudanca, atualizado_em: new Date().toISOString() }).eq("id", r.id);
    if (error) toast.error("Não consegui salvar"); else onMudou();
  };
  const apagar = async () => {
    if (!r || !(await confirmar(`Apagar o roteiro V${r.numero}?`, { descricao: "O roteiro some do calendário. Os vídeos que o Lauro já gerou continuam guardados no Mac.", botao: "Apagar" }))) return;
    const { error } = await db.from("esteira_dark_roteiros").delete().eq("id", r.id);
    if (error) { toast.error("Não consegui apagar"); return; }
    onMudou(); onFechar();
  };
  const midiasPorMsg = useMemo(() => { let pasta: string | null = null; return msgs.map((m) => { const x = midiasDoTexto(m.texto, pasta); pasta = x.pasta; return x.midias; }); }, [msgs]);
  const ocupado = r?.status === "editando" || r?.status === "programando" || r?.status === "na_fila";

  return (
    <Dialog open={!!r} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="dark flex h-[92vh] max-h-[92vh] w-[97vw] max-w-[1400px] flex-col gap-0 overflow-hidden border-white/10 bg-[#0a1520] p-0 text-white">
        {r && (
          <>
            <DialogDescription className="sr-only">Estúdio do roteiro: vídeo, versões e conversa com o Lauro</DialogDescription>
            <div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#0c1b27] px-5 py-3">
              <DialogTitle className="flex min-w-0 items-center gap-2 text-lg"><span className="rounded bg-white/10 px-1.5 py-0.5 text-sm font-bold">V{r.numero}</span><span className="truncate">{r.titulo}</span></DialogTitle>
              <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", CHIP[r.status])}>{ocupado && r.status !== "na_fila" && <Loader2 className="h-3 w-3 animate-spin" />}{r.status === "editando" ? "Lauro editando…" : r.status === "programando" ? "Aprovado" : ROTULO_STATUS[r.status]}</span>
              <span className="text-xs text-white/45">{perfil?.nome}</span>
              <div className="ml-auto flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-white/55">Dia <input type="date" className={cn(campo, "w-36 py-1")} value={r.data_postagem ?? ""} onChange={(e) => void atualizar({ data_postagem: e.target.value || null })} /></label>
                {r.status === "revisar" && <button type="button" onClick={() => void aprovar()} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"><CheckCircle2 className="h-4 w-4" />Aprovar</button>}
                <button type="button" onClick={() => void apagar()} title="Apagar roteiro" className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
              <section className="min-h-0 space-y-3 overflow-y-auto p-4">
                {versao ? <MidiaLocal key={versao.arquivo} grande midia={{ caminho: versao.arquivo, nome: versao.arquivo.split("/").pop() ?? "video.mp4", tipo: "video" }} />
                  : <div className="flex h-[46vh] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-black/30 text-center text-sm text-white/50">
                    {r.status === "erro" ? <p className="px-6 text-rose-200">O Lauro travou: {r.obs || "veja a conversa ao lado"}</p> : <><Loader2 className="h-6 w-6 animate-spin text-white/30" /><p>O Lauro ainda está produzindo o vídeo.</p><p className="text-xs text-white/35">Quando ficar pronto ele aparece aqui, com o botão Aprovar.</p></>}</div>}
                {versoes.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs"><span className="text-white/45">Versões:</span>
                    {versoes.map((v, i) => <button key={v.arquivo} type="button" onClick={() => setVersaoSel(i)} title={v.nota || v.arquivo} className={cn("rounded-lg px-2.5 py-1 font-semibold", i === indice ? "bg-[#f3c98b] text-black" : "bg-white/10 text-white/70 hover:bg-white/15")}>v{i + 1}</button>)}
                    {indice !== versoes.length - 1 && <span className="text-amber-300">(não é a mais nova)</span>}
                  </div>
                )}
                {versao?.nota && <p className="rounded-lg bg-white/5 p-2 text-xs text-white/65">Lauro: {versao.nota}</p>}
                <ProgramarPublicacao roteiro={r} perfilId={r.perfil_id} onMudou={onMudou} numeros={numeros?.post ? <NumerosDoVideo post={numeros.post} leads={numeros.leads} /> : undefined} />
                <button type="button" onClick={() => setVerRoteiro((v) => !v)} className="text-xs text-white/50 hover:text-white">{verRoteiro ? "Esconder o roteiro" : "Ver o roteiro"}</button>
                {verRoteiro && <p className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-sm text-white/80">{r.texto}</p>}
              </section>

              <section className="flex min-h-0 flex-col border-t border-white/10 bg-[#0b141a] lg:border-l lg:border-t-0">
                <div className="flex items-center gap-2 border-b border-white/10 bg-[#111b21] px-3 py-2 text-sm"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-200">L</span><span className="font-semibold">Lauro</span><span className="text-xs text-white/45">peça mudanças neste vídeo</span></div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                  {msgs.length === 0 && pendentes === 0 && <p className="rounded-xl bg-white/5 p-3 text-xs text-white/50">Converse com o Lauro sobre este vídeo: “a legenda está atrasada no começo”, “troque essa imagem”, “deixa a voz mais lenta”. Ele gera uma nova versão e ela aparece aqui para você aprovar.</p>}
                  {msgs.map((m, i) => (
                    <div key={i} className={cn("max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", m.papel === "user" ? "ml-auto bg-[#005c4b]" : "bg-[#202c33]")}>
                      {m.papel === "assistant" && <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-cyan-300">Lauro</span>}{m.texto}
                      {midiasPorMsg[i]?.map((md) => <MidiaLocal key={md.caminho} midia={md} />)}
                    </div>
                  ))}
                  {pendentes > 0 && <div className="flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" />Lauro está trabalhando…<span className="text-white/35">· pode escrever</span></div>}
                  <div ref={fim} />
                </div>
                <div className="flex gap-2 border-t border-white/10 bg-[#111b21] p-2">
                  <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }} placeholder="Peça uma mudança neste vídeo…" className="min-h-0 flex-1 resize-none rounded-xl border border-white/10 bg-[#2a3942] px-3 py-2 text-sm outline-none" />
                  <button type="button" disabled={!texto.trim()} onClick={() => void enviar()} className="self-end rounded-full bg-emerald-500 p-2.5 text-black disabled:opacity-40"><Send className="h-4 w-4" /></button>
                </div>
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
