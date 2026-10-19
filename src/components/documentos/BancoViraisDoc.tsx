import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { isDesktop } from "@/lib/platform";
import { lerAnalise, montarBlocoReferencia, proximoNumeroHeadline } from "@/lib/conteudo/blocoReferencia";

// ⌘H no documento (18/10/2026, Davi): "mostra os vídeos que já estão salvos no banco; ao
// selecionar, aparece em abre e fecha — link, transcrição, conteúdo notável, por que viralizou —
// e já marca que aquele vídeo foi usado". No Mac, o Claude (rápido) escreve a headline em
// português, o conteúdo notável e o porquê; na web entram só link e transcrição.
const db = supabase as unknown as SupabaseClient;

interface Referencia {
  id: string; titulo: string; titulo_pt: string | null; link_video: string | null; criador: string | null;
  visualizacoes: number | null; transcricao: string | null; transcricao_pt: string | null; usado_em: string | null;
}

const PEDIDO = (r: Referencia, transcricao: string) => `Você analisa um vídeo curto viral (Reels) que vai servir de referência para um roteiro novo.
Criador: ${r.criador ?? "?"} · ${r.visualizacoes ? `${r.visualizacoes.toLocaleString("pt-BR")} visualizações` : "visualizações desconhecidas"}
Título: ${r.titulo_pt || r.titulo}
Transcrição:
"""
${transcricao.slice(0, 6000)}
"""
Responda SOMENTE com um JSON:
{"headline": "a frase de abertura (gancho) do vídeo, em português do Brasil, natural",
 "notavel": ["3 a 5 fatos, dados, estudos ou exemplos marcantes e verdadeiros sobre o tema, que enriqueceriam um roteiro novo (cite a fonte entre parênteses quando souber; se não tiver certeza, escreva (conferir))"],
 "porque": ["3 a 5 motivos objetivos de o vídeo ter viralizado: gancho, curiosidade, emoção, estrutura, ritmo, CTA, identificação…"]}`;

export function BancoViraisDoc({ editor, clienteId }: { editor: Editor; clienteId: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<Referencia[]>([]);
  const [preparando, setPreparando] = useState<string | null>(null);

  // ⌘H (o menu do Mac não usa mais essa tecla para ocultar o app).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "h") return;
      e.preventDefault();
      e.stopPropagation();
      setAberto(true);
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    let q = db.from("videos_referencia")
      .select("id, titulo, titulo_pt, link_video, criador, visualizacoes, transcricao, transcricao_pt, usado_em")
      .order("visualizacoes", { ascending: false, nullsFirst: false }).limit(300);
    if (clienteId) q = q.eq("cliente_id", clienteId);
    void q.then(({ data, error }) => {
      if (error) { toast.error("Não consegui carregar o banco de virais"); return; }
      // Os ainda não usados primeiro.
      setLista(((data ?? []) as Referencia[]).sort((a, b) => Number(!!a.usado_em) - Number(!!b.usado_em)));
    });
  }, [aberto, clienteId]);

  const escolher = useCallback(async (r: Referencia) => {
    if (preparando) return;
    setPreparando(r.id);
    const transcricao = (r.transcricao_pt || r.transcricao || "").trim();
    let analise: ReturnType<typeof lerAnalise> = { notavel: [], porque: [] };
    if (isDesktop() && transcricao) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        analise = lerAnalise(await invoke<string>("claude_rapido", { pedido: PEDIDO(r, transcricao), modelo: "sonnet" }));
      } catch {
        toast("Não consegui gerar o conteúdo notável agora; entrou o resto.");
      }
    }
    const html = montarBlocoReferencia({
      numero: proximoNumeroHeadline(editor.getHTML()),
      headline: analise.headline || r.titulo_pt || r.titulo,
      link: r.link_video, transcricao: transcricao || null, notavel: analise.notavel, porque: analise.porque,
    });
    editor.chain().focus().insertContent(html).run();
    const { error } = await db.from("videos_referencia").update({ usado_em: new Date().toISOString() }).eq("id", r.id);
    if (error) toast.error("Entrou no documento, mas não consegui marcar o vídeo como usado");
    setPreparando(null);
    setAberto(false);
  }, [editor, preparando]);

  const fmt = (n: number | null) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} mi` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(n));

  return (
    <CommandDialog open={aberto} onOpenChange={(a) => { if (!preparando) setAberto(a); }}>
      <CommandInput placeholder="Buscar no banco de vídeos virais… (⌘H)" disabled={!!preparando} />
      <CommandList className="max-h-[420px]">
        {preparando ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Preparando: transcrição, conteúdo notável e por que viralizou…
          </div>
        ) : (
          <>
            <CommandEmpty>Nenhum vídeo no banco.</CommandEmpty>
            <CommandGroup heading={`Banco de virais (${lista.length})`}>
              {lista.map((r) => (
                <CommandItem key={r.id} value={`${r.titulo_pt ?? ""} ${r.titulo} ${r.criador ?? ""} ${r.id}`} onSelect={() => void escolher(r)}
                  className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm">{r.titulo_pt || r.titulo}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {[r.criador, r.visualizacoes ? `${fmt(r.visualizacoes)} views` : null, r.transcricao || r.transcricao_pt ? null : "sem transcrição"].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {r.usado_em && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">usado</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
