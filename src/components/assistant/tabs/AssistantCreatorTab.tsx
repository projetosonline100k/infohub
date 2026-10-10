import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, ChevronDown, Copy, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { isDesktop } from "@/lib/platform";
import { cn } from "@/lib/utils";
import {
  definirLink, limparAtual, transcrever, useTranscricao, type ModoTranscricao, type Transcricao,
} from "@/lib/creator/transcricaoStore";
import { CreatorIphone } from "./CreatorIphone";
import { CreatorAnalises } from "./CreatorAnalises";
import { CreatorSepararIdeias } from "./CreatorSepararIdeias";

function BotaoCopiar({ texto, className }: { texto: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1600); }
        catch { toast.error("Não consegui copiar"); }
      }}
      className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]", ok ? "border-green-600 text-green-700 dark:text-green-400" : "border-border hover:bg-accent", className)}
    >
      {ok ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{ok ? "Copiado" : "Copiar"}
    </button>
  );
}

const minutos = (s: number | null | undefined) => (s == null ? null : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}min${String(Math.round(s % 60)).padStart(2, "0")}`);

type Modo = ModoTranscricao;
type Ferramenta = "transcrever" | "ideias";
const CHAVE_FERRAMENTA = "jarvis:creator-ferramenta";
const CHAVE_MODO = "jarvis:creator-modo";

// Modo Creator do Jarvis (⌘ + J + C). Primeira ferramenta: "Transcrever" —
// cola o link do vídeo (Instagram, TikTok, YouTube) e recebe o texto falado.
// Roda no próprio Mac, grátis (src-tauri/src/creator.rs); o histórico fica em
// creator_transcricoes. A transcrição roda fora da tela (transcricaoStore):
// sair do Creator não cancela, e o link colado fica guardado.
export function AssistantCreatorTab({ foco }: { foco: number }) {
  const { user } = useAuth();
  const { link, rodando, iniciadoEm, linkRodando, atual, versaoHistorico } = useTranscricao();
  const setLink = definirLink;
  const [historico, setHistorico] = useState<Transcricao[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [modo, setModoState] = useState<Modo>(() => { try { return (localStorage.getItem(CHAVE_MODO) as Modo) || "preciso"; } catch { return "preciso"; } });
  const setModo = (m: Modo) => { setModoState(m); try { localStorage.setItem(CHAVE_MODO, m); } catch { /* sem storage */ } };
  const campoRef = useRef<HTMLInputElement>(null);
  // Ferramentas do modo Creator: Transcrever | Separar ideias (lembrada).
  const [ferramenta, setFerramentaState] = useState<Ferramenta>(() => { try { return (localStorage.getItem(CHAVE_FERRAMENTA) as Ferramenta) || "transcrever"; } catch { return "transcrever"; } });
  const setFerramenta = (f: Ferramenta) => { setFerramentaState(f); try { localStorage.setItem(CHAVE_FERRAMENTA, f); } catch { /* sem storage */ } };
  const disponivel = isDesktop() && /Mac/i.test(navigator.platform || navigator.userAgent);
  // "Analisar para cliente": reels marcados + cliente (ou nicho escrito).
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [clientes, setClientes] = useState<{ id: string; nome: string; nicho: string | null }[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [nichoLivre, setNichoLivre] = useState("");
  const [pedindo, setPedindo] = useState(false);
  const alternarSelecao = (id: string) => setSelecionadas((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  useEffect(() => {
    void supabase.from("clientes").select("id, nome_especialista, nicho").eq("arquivado", false).order("nome_especialista")
      .then(({ data }) => setClientes((data || []).map((c) => ({ id: c.id, nome: c.nome_especialista, nicho: c.nicho }))));
  }, []);

  const pedirAnalise = async () => {
    if (!user?.id || !selecionadas.size || pedindo) return;
    if (!clienteId && !nichoLivre.trim()) { toast.error("Escolha o cliente ou escreva o nicho"); return; }
    setPedindo(true);
    const { data, error } = await supabase.from("creator_analises")
      .insert({ cliente_id: clienteId || null, nicho_livre: nichoLivre.trim() || null, transcricao_ids: [...selecionadas] })
      .select("id").single();
    if (error || !data) { setPedindo(false); toast.error("Não consegui pedir a análise"); return; }
    // Avisa a Inteligência do Infopro pela Conversa (ela já ouve o Jarvis).
    await supabase.from("jarvis_conversa").insert({ papel: "davi", texto: `/analisar ${data.id}`, status: "enviada" });
    setPedindo(false);
    setSelecionadas(new Set());
    toast.success("Análise pedida", { description: "Aparece em “Análises” quando ficar pronta (1–3 min)." });
  };

  const carregar = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from("creator_transcricoes")
      .select("id, link, titulo, autor, texto, idioma, duracao_segundos, levou_segundos, criada_em")
      .eq("user_id", user.id).order("criada_em", { ascending: false }).limit(30);
    setHistorico((data || []) as Transcricao[]);
  }, [user?.id]);

  useEffect(() => { void carregar(); }, [carregar, versaoHistorico]);
  useEffect(() => { campoRef.current?.focus(); }, [foco]);

  // Cronômetro enquanto transcreve — conta desde o início de verdade, então
  // continua certo mesmo voltando pro Creator no meio da transcrição.
  useEffect(() => {
    if (!rodando || !iniciadoEm) return;
    const tick = () => setSegundos(Math.round((Date.now() - iniciadoEm) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [rodando, iniciadoEm]);

  const apagar = async (id: string) => {
    const { error } = await supabase.from("creator_transcricoes").delete().eq("id", id);
    if (error) { toast.error("Não consegui apagar"); return; }
    limparAtual(id);
    setHistorico((h) => h.filter((t) => t.id !== id));
  };

  const seletorFerramenta = (
    <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-[12px]">
      {([["transcrever", "Transcrever"], ["ideias", "Separar ideias"]] as [Ferramenta, string][]).map(([id, rotulo]) => (
        <button
          key={id}
          type="button"
          onClick={() => setFerramenta(id)}
          className={cn("flex-1 rounded-md px-2 py-1 font-medium transition-colors", ferramenta === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );

  if (ferramenta === "ideias") {
    return (
      <div className="space-y-3 text-sm">
        {seletorFerramenta}
        {user?.id && <CreatorSepararIdeias userId={user.id} />}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {seletorFerramenta}
      <p className="text-[12px] text-muted-foreground">Cole o link de um vídeo e receba o texto falado.</p>

      {!disponivel ? (
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">A transcrição roda no app do Mac (de graça, no próprio computador). Abra o Jarvis pelo app desktop.</p>
      ) : (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void transcrever(modo); }}>
          <input
            ref={campoRef}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Cole o link do reel, TikTok ou YouTube"
            disabled={rodando}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
          />
          <button type="submit" disabled={!link.trim() || rodando} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
            {rodando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {rodando ? `${segundos}s` : "Transcrever"}
          </button>
        </form>
      )}
      {disponivel && (
        <div className="flex items-center gap-1 text-[11px]">
          {([["preciso", "Preciso", "melhor texto · ~10s"], ["rapido", "Rápido", "~3s · pode errar algumas palavras"]] as [Modo, string, string][]).map(([id, rotulo, dica]) => (
            <button
              key={id}
              type="button"
              disabled={rodando}
              onClick={() => setModo(id)}
              title={dica}
              className={cn("rounded-full border px-2.5 py-0.5", modo === id ? "border-violet-500 bg-violet-500/15 font-semibold text-violet-600 dark:text-violet-300" : "border-border text-muted-foreground hover:bg-accent")}
            >
              {rotulo}
            </button>
          ))}
          <span className="ml-1 text-muted-foreground">{modo === "preciso" ? "melhor texto · ~10s" : "~3s · pode errar algumas palavras"}</span>
        </div>
      )}
      {rodando && (
        <p className="text-[11px] text-muted-foreground">
          Transcrevendo <span className="font-medium text-foreground">{linkRodando?.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}</span>… pode sair daqui, continua em segundo plano.
          {segundos > 15 && " A primeira vez depois de um tempo parado demora mais (carrega a IA na memória)."}
        </p>
      )}

      {atual && (
        <div className="rounded-xl border border-violet-500/40 bg-card p-3">
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">{atual.titulo || "Transcrição"}</div>
              <div className="text-[11px] text-muted-foreground">
                {[atual.autor, minutos(atual.duracao_segundos), atual.levou_segundos != null && `pronto em ${minutos(atual.levou_segundos)}`].filter(Boolean).join(" · ")}
              </div>
            </div>
            <BotaoCopiar texto={atual.texto} className="shrink-0" />
          </div>
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed">{atual.texto}</p>
        </div>
      )}

      {user?.id && (
        <CreatorAnalises
          userId={user.id}
          titulos={Object.fromEntries([...historico, ...(atual ? [atual] : [])].map((t) => [t.id, { titulo: t.titulo, link: t.link }]))}
          clientes={Object.fromEntries(clientes.map((c) => [c.id, c.nome]))}
        />
      )}

      {disponivel && user?.id && (
        <CreatorIphone
          userId={user.id}
          versao={versaoHistorico}
          onAbrirTranscricao={(id) => {
            setAberta(id);
            requestAnimationFrame(() => document.getElementById(`transcricao-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
          }}
        />
      )}

      {selecionadas.size > 0 && (
        <div className="sticky top-0 z-10 space-y-1.5 rounded-lg border border-violet-500/50 bg-popover p-2.5 shadow-md">
          <div className="flex items-center justify-between text-[12px] font-semibold">
            <span>Analisar {selecionadas.size} {selecionadas.size === 1 ? "reel" : "reels"} para…</span>
            <button type="button" onClick={() => setSelecionadas(new Set())} className="text-[11px] font-normal text-muted-foreground hover:text-foreground">limpar</button>
          </div>
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px]">
            <option value="">Escolher cliente (opcional)</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.nicho ? ` · ${c.nicho}` : ""}</option>)}
          </select>
          <input
            value={nichoLivre}
            onChange={(e) => setNichoLivre(e.target.value)}
            placeholder="Nicho / público (ex.: ansiedade e fé, mulheres 25–40)"
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px]"
          />
          <button
            type="button"
            onClick={() => void pedirAnalise()}
            disabled={pedindo || (!clienteId && !nichoLivre.trim())}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-violet-600 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            {pedindo && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Analisar e gerar 5 headlines
          </button>
        </div>
      )}

      {historico.filter((t) => t.id !== atual?.id).length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Histórico</div>
          <div className="space-y-1">
            {historico.filter((t) => t.id !== atual?.id).map((t) => (
              <div key={t.id} id={`transcricao-${t.id}`} className="rounded-lg border border-border bg-card">
                <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={selecionadas.has(t.id)}
                  onChange={() => alternarSelecao(t.id)}
                  aria-label="Selecionar para analisar"
                  title="Selecionar para analisar para um cliente"
                  className="ml-2.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-violet-600"
                />
                <button type="button" onClick={() => setAberta(aberta === t.id ? null : t.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{t.titulo || t.texto.slice(0, 60)}</div>
                    <div className="text-[10.5px] text-muted-foreground">{[t.autor, format(new Date(t.criada_em), "dd/MM HH:mm", { locale: ptBR })].filter(Boolean).join(" · ")}</div>
                  </div>
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", aberta === t.id && "rotate-180")} />
                </button>
                </div>
                {aberta === t.id && (
                  <div className="border-t border-border px-2.5 py-2">
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed">{t.texto}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <BotaoCopiar texto={t.texto} />
                      <a href={t.link} target="_blank" rel="noreferrer" className="truncate text-[11px] text-muted-foreground underline" onClick={async (e) => {
                        if (!isDesktop()) return;
                        e.preventDefault();
                        const { abrirLinkExterno } = await import("@/lib/abrirLink");
                        void abrirLinkExterno(t.link);
                      }}>abrir vídeo</a>
                      <button type="button" onClick={() => void apagar(t.id)} className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Apagar transcrição">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
