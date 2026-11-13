import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, ExternalLink, Instagram, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/DialogosGlobais";
import { gerarLinkConexao } from "@/hooks/useInstagramAutomacoes";
import { cn } from "@/lib/utils";
import type { RoteiroDark } from "@/lib/empresa/roteirosDark";

const db = supabase as unknown as SupabaseClient;

// Instagram do perfil dark (13/11/2026, Davi: "nesse perfil dark eu preciso ter a opção de conectar um instagram para ele já programar o vídeo e postar").
// Mesmo processo da Dalila: o perfil conecta a conta pelo OAuth do Hub; o Mac prepara o vídeo aprovado; o Davi escolhe a data e confirma a legenda
// (= o ok); a edge `lauro-publicar` publica na hora. Nada sai sem essa data.
export interface InstagramDoPerfil { ig_user_id: string; username: string | null }

export function useInstagramDoPerfil(perfilId: string) {
  const [conta, setConta] = useState<InstagramDoPerfil | null | undefined>(undefined);
  const carregar = useCallback(async () => {
    if (!perfilId) { setConta(null); return; }
    const { data } = await db.rpc("dark_instagram_do_perfil", { p_perfil: perfilId });
    setConta(((data ?? []) as InstagramDoPerfil[])[0] ?? null);
  }, [perfilId]);
  useEffect(() => { setConta(undefined); void carregar(); }, [carregar]);
  return { conta, recarregar: carregar };
}

/** Botão "Conectar Instagram" do perfil: abre a autorização do Instagram e fica conferindo até a conta aparecer. */
export function ConectarInstagramDark({ perfilId, conta, recarregar, compacto }: { perfilId: string; conta: InstagramDoPerfil | null | undefined; recarregar: () => Promise<void>; compacto?: boolean }) {
  const [aguardando, setAguardando] = useState(false);
  useEffect(() => {
    if (!aguardando) return;
    const t = window.setInterval(() => void recarregar(), 4000);
    const fim = window.setTimeout(() => setAguardando(false), 10 * 60_000);
    return () => { window.clearInterval(t); window.clearTimeout(fim); };
  }, [aguardando, recarregar]);
  useEffect(() => { if (conta) setAguardando(false); }, [conta]);

  const conectar = async () => {
    try {
      const url = await gerarLinkConexao(null, perfilId);
      window.open(url, "_blank", "noopener");
      setAguardando(true);
      toast.info("Autorize no Instagram que abriu. Quando terminar, a conta aparece aqui.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não deu para gerar o link"); }
  };
  const desconectar = async () => {
    if (!(await confirmar("Desconectar o Instagram deste perfil?", { descricao: "Os vídeos não serão mais publicados nessa conta até você conectar de novo.", botao: "Desconectar" }))) return;
    const { error } = await db.rpc("dark_desconectar_instagram", { p_perfil: perfilId });
    if (error) { toast.error(error.message.replace(/^.*?: /, "")); return; }
    await recarregar();
  };
  if (conta === undefined) return null;
  if (conta) return (
    <span className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
      <Instagram className="h-4 w-4" />@{conta.username ?? conta.ig_user_id}
      <button type="button" onClick={() => void desconectar()} title="Desconectar" className="rounded p-0.5 text-emerald-200/60 hover:text-rose-300"><Unlink className="h-3.5 w-3.5" /></button>
    </span>
  );
  return (
    <button type="button" onClick={() => void conectar()} disabled={aguardando}
      className={cn("flex items-center gap-2 rounded-xl border border-pink-400/40 bg-pink-500/10 px-3 py-2 text-sm font-semibold text-pink-200 hover:bg-pink-500/20 disabled:opacity-70", compacto && "py-1.5 text-xs")}>
      {aguardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="h-4 w-4" />}{aguardando ? "Esperando você autorizar…" : "Conectar Instagram"}
    </button>
  );
}

const hojeLocal = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const campo = "w-full rounded-lg border border-white/10 bg-[#0a1520] px-3 py-2 text-sm text-white outline-none focus:border-amber-200/60";
const emBrasilia = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 16);
const dataHoraBr = (iso: string) => { const [d, h] = emBrasilia(iso).split("T"); return `${d.split("-").reverse().slice(0, 2).join("/")} às ${h}`; };

/** Painel do estúdio: depois do Aprovar, conectar a conta, escolher a data e a legenda e programar; mostra o que já saiu. */
export function ProgramarPublicacao({ roteiro: r, perfilId, onMudou }: { roteiro: RoteiroDark; perfilId: string; onMudou: () => void }) {
  const { conta, recarregar } = useInstagramDoPerfil(perfilId);
  const padrao = `${r.data_postagem && r.data_postagem >= hojeLocal() ? r.data_postagem : hojeLocal()}T18:00`;
  const [quando, setQuando] = useState(r.programado_para ? emBrasilia(r.programado_para) : padrao);
  const [legenda, setLegenda] = useState(r.legenda ?? r.titulo);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (r.legenda) setLegenda(r.legenda); }, [r.legenda]);

  if (!["programando", "programado", "publicando", "publicado"].includes(r.status)) return null;
  const programar = async () => {
    setSalvando(true);
    const { error } = await db.rpc("programar_roteiro_dark", { p_roteiro: r.id, p_quando: new Date(`${quando}:00-03:00`).toISOString(), p_legenda: legenda });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Programado: publica sozinho na hora marcada");
    onMudou();
  };
  const desprogramar = async () => {
    const { error } = await db.rpc("desprogramar_roteiro_dark", { p_roteiro: r.id });
    if (error) { toast.error(error.message); return; }
    onMudou();
  };

  return (
    <div className="space-y-3 rounded-2xl border border-pink-400/25 bg-pink-500/5 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2"><Instagram className="h-4 w-4 text-pink-300" /><span className="font-semibold">Publicar no Instagram</span>
        <span className="ml-auto"><ConectarInstagramDark perfilId={perfilId} conta={conta} recarregar={recarregar} compacto /></span></div>
      {r.status === "publicado" ? (
        <p className="flex flex-wrap items-center gap-2 text-emerald-300"><CheckCircle2 className="h-4 w-4" />Publicado{r.programado_para ? ` em ${dataHoraBr(r.programado_para)}` : ""}.
          {r.permalink && <a href={r.permalink} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline">Ver no Instagram<ExternalLink className="h-3 w-3" /></a>}</p>
      ) : r.status === "publicando" ? (
        <p className="flex items-center gap-2 text-sky-300"><Loader2 className="h-4 w-4 animate-spin" />{r.mensagem || "Publicando agora…"}</p>
      ) : r.status === "programado" ? (
        <div className="space-y-2">
          <p className="text-emerald-300">Programado: publica sozinho {r.programado_para ? dataHoraBr(r.programado_para) : ""}{conta ? ` em @${conta.username ?? ""}` : ""}.</p>
          {r.legenda && <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-xs text-white/70">{r.legenda}</p>}
          <button type="button" onClick={() => void desprogramar()} className="text-xs text-white/55 underline hover:text-white">Desmarcar (volta para “aprovado”)</button>
        </div>
      ) : !r.video_url ? (
        <p className="flex items-center gap-2 text-white/60"><Loader2 className="h-4 w-4 animate-spin" />{r.mensagem || "Aprovado: preparando o vídeo para o Instagram…"}</p>
      ) : (
        <div className="space-y-2">
          {r.mensagem?.startsWith("Não publicou") && <p className="rounded-lg bg-rose-500/10 p-2 text-xs text-rose-200">{r.mensagem}</p>}
          {!conta && <p className="text-xs text-amber-200">Conecte o Instagram deste perfil para programar.</p>}
          <label className="block text-xs text-white/55">Quando publicar (horário de Brasília)<input type="datetime-local" className={cn(campo, "mt-1")} value={quando} onChange={(e) => setQuando(e.target.value)} /></label>
          <label className="block text-xs text-white/55">Legenda<textarea rows={4} maxLength={2200} className={cn(campo, "mt-1 resize-y")} value={legenda} onChange={(e) => setLegenda(e.target.value)} /></label>
          <button type="button" disabled={!conta || salvando || !legenda.trim()} onClick={() => void programar()}
            className="flex items-center gap-2 rounded-xl bg-pink-500 px-4 py-2 text-sm font-bold text-white hover:bg-pink-400 disabled:opacity-40">{salvando && <Loader2 className="h-4 w-4 animate-spin" />}Programar publicação</button>
          <p className="text-[11px] text-white/40">Escolher a data é o seu ok: sem ela, nada é publicado.</p>
        </div>
      )}
    </div>
  );
}
