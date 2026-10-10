import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Copy, FileText, Loader2, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pedirTexto } from "@/components/DialogosGlobais";
import { isDesktop } from "@/lib/platform";
import { cn } from "@/lib/utils";

interface Mentorado { id: string; nome: string; cliente_id: string; cliente: string }

interface Ideia {
  id: string;
  numero: number;
  link: string;
  idioma: string | null;
  headline_original: string | null;
  headline_pt: string | null;
  traducao_pt: string | null;
  status: "pendente" | "pronta" | "erro";
  erro: string | null;
  documento_id: string | null;
}

const CHAVE_MENTORADO = "jarvis:creator-mentorado";

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1400); }
        catch { toast.error("Não consegui copiar"); }
      }}
      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label="Copiar"
    >
      {ok ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// Modo Creator → "Separar ideias". O mentorado é uma pasta do Docs. Com o
// modo ligado, todo link mandado do iPhone (Atalho "Jarvis") vira a próxima
// ideia numerada desse mentorado: headline do vídeo + tradução, preenchidas
// pela Inteligência do Infopro (scripts/creator-ideia.py), e acrescentadas
// no documento "Ideias de headline — <nome>" da pasta.
export function CreatorSepararIdeias({ userId }: { userId: string }) {
  const [mentorados, setMentorados] = useState<Mentorado[]>([]);
  const [selecionado, setSelecionadoState] = useState<string>(() => { try { return localStorage.getItem(CHAVE_MENTORADO) || ""; } catch { return ""; } });
  const [modoPasta, setModoPasta] = useState<string | null>(null);
  const [ideias, setIdeias] = useState<Ideia[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);
  const setSelecionado = (id: string) => { setSelecionadoState(id); try { localStorage.setItem(CHAVE_MENTORADO, id); } catch { /* sem storage */ } };

  const carregarMentorados = useCallback(async () => {
    const { data } = await supabase.from("pastas_atividade")
      .select("id, nome, cliente_id, clientes(nome_especialista)")
      .eq("origem", "documentos").is("deleted_at", null).order("nome");
    setMentorados(((data || []) as unknown as { id: string; nome: string; cliente_id: string; clientes: { nome_especialista: string } | null }[])
      .map((p) => ({ id: p.id, nome: p.nome, cliente_id: p.cliente_id, cliente: p.clientes?.nome_especialista?.trim() || "" })));
  }, []);

  const carregarModo = useCallback(async () => {
    const { data } = await supabase.from("creator_modo").select("pasta_id").eq("user_id", userId).maybeSingle();
    setModoPasta(data?.pasta_id ?? null);
  }, [userId]);

  const carregarIdeias = useCallback(async () => {
    if (!selecionado) { setIdeias([]); return; }
    const { data } = await supabase.from("creator_ideias")
      .select("id, numero, link, idioma, headline_original, headline_pt, traducao_pt, status, erro, documento_id")
      .eq("pasta_id", selecionado).order("numero", { ascending: true });
    setIdeias((data || []) as Ideia[]);
  }, [selecionado]);

  useEffect(() => { void carregarMentorados(); void carregarModo(); }, [carregarMentorados, carregarModo]);
  useEffect(() => {
    void carregarIdeias();
    const canal = supabase
      .channel(`creator-ideias-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "creator_ideias", filter: `user_id=eq.${userId}` }, () => { void carregarIdeias(); })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [userId, carregarIdeias]);

  // Mentorado novo vai pro mesmo projeto onde já ficam as pastas de
  // mentorados (o que tem mais pastas no Docs — hoje, "Core").
  const projetoDosMentorados = useMemo(() => {
    const contagem = new Map<string, number>();
    mentorados.forEach((m) => contagem.set(m.cliente_id, (contagem.get(m.cliente_id) ?? 0) + 1));
    return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [mentorados]);

  const criarMentorado = async () => {
    if (!projetoDosMentorados) { toast.error("Crie antes uma pasta no Docs de algum projeto"); return; }
    const nome = (await pedirTexto("Nome do mentorado (vira uma pasta no Docs):"))?.trim();
    if (!nome) return;
    const { data, error } = await supabase.from("pastas_atividade")
      .insert({ nome, cliente_id: projetoDosMentorados, user_id: userId, origem: "documentos" })
      .select("id").single();
    if (error || !data) { toast.error("Não consegui criar o mentorado"); return; }
    await carregarMentorados();
    setSelecionado(data.id);
    toast.success(`Mentorado “${nome}” criado`);
  };

  const alternarModo = async () => {
    const novo = modoPasta === selecionado ? null : selecionado || null;
    const { error } = await supabase.from("creator_modo")
      .upsert({ user_id: userId, pasta_id: novo, atualizado_em: new Date().toISOString() });
    if (error) { toast.error("Não consegui mudar o modo"); return; }
    setModoPasta(novo);
  };

  const apagar = async (id: string) => {
    await supabase.from("creator_ideias").delete().eq("id", id);
    setIdeias((l) => l.filter((x) => x.id !== id));
  };

  const abrirDocumento = async (documentoId: string) => {
    const m = mentorados.find((x) => x.id === selecionado);
    const rota = `/clientes/${m?.cliente_id}?documento=${documentoId}`;
    if (isDesktop()) {
      const { openMainWindow } = await import("@/lib/desktop/window");
      await openMainWindow(rota);
    } else {
      window.location.assign(rota);
    }
  };

  const atual = mentorados.find((m) => m.id === selecionado);
  const ligado = !!selecionado && modoPasta === selecionado;
  const nomeModo = mentorados.find((m) => m.id === modoPasta)?.nome;
  const documentoId = ideias.find((i) => i.documento_id)?.documento_id;

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground">
        Escolha o mentorado e ligue o modo: cada vídeo que você mandar do iPhone vira uma ideia numerada, com a headline e a tradução, e entra no documento dele no Docs.
      </p>

      <div className="flex gap-1.5">
        <select
          value={selecionado}
          onChange={(e) => setSelecionado(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[13px]"
        >
          <option value="">Escolher mentorado…</option>
          {mentorados.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.cliente ? ` · ${m.cliente}` : ""}</option>)}
        </select>
        <button type="button" onClick={() => void criarMentorado()} title="Novo mentorado" className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-[12px] hover:bg-accent">
          <Plus className="h-3.5 w-3.5" /> Novo
        </button>
      </div>

      {selecionado && (
        <button
          type="button"
          onClick={() => void alternarModo()}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border-2 px-3 py-2 text-left text-[12.5px] transition-colors",
            ligado ? "border-green-600 bg-green-500/10" : "border-border hover:bg-accent",
          )}
        >
          <Power className={cn("h-4 w-4 shrink-0", ligado ? "text-green-600" : "text-muted-foreground")} />
          <span className="flex-1">
            {ligado
              ? <><b>Modo ligado</b> — tudo que você mandar do iPhone vira ideia da <b>{atual?.nome}</b>.</>
              : <><b>Ligar modo</b> para {atual?.nome}</>}
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", ligado ? "bg-green-600 text-white" : "bg-muted text-muted-foreground")}>{ligado ? "ON" : "OFF"}</span>
        </button>
      )}
      {!ligado && nomeModo && (
        <p className="text-[11px] text-amber-600">O modo está ligado para <b>{nomeModo}</b>. Ligar aqui troca para {atual?.nome ?? "este mentorado"}.</p>
      )}

      {selecionado && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Ideias de {atual?.nome} ({ideias.length})
            </span>
            {documentoId && (
              <button type="button" onClick={() => void abrirDocumento(documentoId)} className="inline-flex items-center gap-1 text-[11px] text-violet-600 hover:underline dark:text-violet-300">
                <FileText className="h-3 w-3" /> Abrir no Docs
              </button>
            )}
          </div>
          {ideias.length === 0 && <p className="text-[11.5px] text-muted-foreground">Nenhuma ideia ainda. Com o modo ligado, mande um reel pelo Atalho “Jarvis”.</p>}
          <div className="space-y-1">
            {ideias.map((i) => {
              const traduzida = !!i.idioma && !i.idioma.startsWith("pt");
              return (
                <div key={i.id} className="rounded-lg border border-border bg-card">
                  <button type="button" onClick={() => setAberta(aberta === i.id ? null : i.id)} className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left">
                    <span className="mt-0.5 w-7 shrink-0 text-[12px] font-bold tabular-nums text-violet-600 dark:text-violet-300">{String(i.numero).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      {i.status === "pronta" ? (
                        <>
                          <div className="text-[12.5px] font-medium leading-snug">{i.headline_pt}</div>
                          {traduzida && i.headline_original && <div className="text-[11px] italic text-muted-foreground">{i.headline_original}</div>}
                        </>
                      ) : i.status === "erro" ? (
                        <div className="text-[12px] text-red-500">Erro: {i.erro}</div>
                      ) : (
                        <div className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> separando headline e traduzindo…</div>
                      )}
                    </div>
                    <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", aberta === i.id && "rotate-180")} />
                  </button>
                  {aberta === i.id && (
                    <div className="space-y-1.5 border-t border-border px-2.5 py-2 text-[12px]">
                      {i.headline_pt && (
                        <div className="flex items-start gap-1"><span className="flex-1"><b>Headline:</b> {i.headline_pt}</span><Copiar texto={i.headline_pt} /></div>
                      )}
                      {i.traducao_pt && (
                        <div>
                          <div className="flex items-center justify-between"><b>Tradução</b><Copiar texto={i.traducao_pt} /></div>
                          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed text-muted-foreground">{i.traducao_pt}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <a href={i.link} target="_blank" rel="noreferrer" className="truncate text-[11px] text-muted-foreground underline" onClick={async (e) => {
                          if (!isDesktop()) return;
                          e.preventDefault();
                          const { abrirLinkExterno } = await import("@/lib/abrirLink");
                          void abrirLinkExterno(i.link);
                        }}>abrir vídeo</a>
                        <button type="button" onClick={() => void apagar(i.id)} className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Apagar ideia">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
