import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FolderOpen, Images, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isDesktop } from "@/lib/platform";
import { PassosTarefa } from "./PassosTarefa";

// Entrega que não é documento (19/10/2026, Davi: "diz que o vídeo do Danilo está pronto, mas ao clicar
// nada aparece"). Mostra o que existir: a nota inteira de quem entregou, os vídeos das edições ligadas
// à tarefa, os carrosséis do lote (Roy), os arquivos que ficaram no Mac (abre no Finder) e o passo a
// passo do que foi feito.
const db = supabase as unknown as SupabaseClient;

interface Edicao { id: string; titulo: string; previa_url: string | null; status: string }
interface Carrossel { id: string; numero: number; tema: string; status: string; paginas: string[] | null }

/** Caminhos de arquivo citados na nota (~/… ou /Users/…). */
export function arquivosCitados(texto: string): string[] {
  return [...new Set((texto.match(/(?:~|\/Users\/[^/\s]+)\/[^\s"'`)<>]+\.[a-z0-9]{2,4}/gi) ?? []).map((c) => c.replace(/[.,;:]+$/, "")))];
}

export function EntregaSemDocumento({ tarefaId, observacao }: { tarefaId: string; observacao: string | null }) {
  const [edicoes, setEdicoes] = useState<Edicao[]>([]);
  const [carrosseis, setCarrosseis] = useState<Carrossel[]>([]);
  useEffect(() => {
    let vivo = true;
    void Promise.all([
      db.from("edicoes_video").select("id, titulo, previa_url, status").eq("atividade_id", tarefaId).order("criado_em"),
      db.from("carrosseis").select("id, numero, tema, status, paginas").or(`atividade_roy_id.eq.${tarefaId},atividade_id.eq.${tarefaId}`).order("numero"),
    ]).then(([e, c]) => {
      if (!vivo) return;
      setEdicoes((e.data ?? []) as Edicao[]);
      setCarrosseis((c.data ?? []) as Carrossel[]);
    });
    return () => { vivo = false; };
  }, [tarefaId]);

  const arquivos = arquivosCitados(observacao ?? "");
  const abrirNoMac = async (caminho: string) => {
    const { homeDir } = await import("@tauri-apps/api/path");
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    const real = caminho.startsWith("~") ? `${(await homeDir()).replace(/\/$/, "")}${caminho.slice(1)}` : caminho;
    await revealItemInDir(real);
  };

  return (
    <div className="space-y-5">
      {observacao && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que foi entregue</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{observacao}</p>
        </div>
      )}

      {edicoes.map((e) => (
        <div key={e.id}>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Video className="h-3.5 w-3.5" />{e.titulo}</p>
          {e.previa_url
            ? <video src={e.previa_url} controls preload="metadata" className="max-h-[60vh] rounded-lg bg-black" />
            : <p className="text-sm text-muted-foreground">Ainda sem prévia ({e.status}).</p>}
        </div>
      ))}

      {carrosseis.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Images className="h-3.5 w-3.5" />{carrosseis.length} carrosséis · revise cada um em Conteúdo → Visão geral → Precisa de você</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {carrosseis.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-lg border bg-card">
                {c.paginas?.[0] ? <img src={c.paginas[0]} alt="" loading="lazy" className="aspect-[4/5] w-full object-cover" /> : <div className="aspect-[4/5] bg-muted" />}
                <p className="line-clamp-2 px-2 py-1.5 text-xs"><b>{String(c.numero).padStart(3, "0")}</b> · {c.tema}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {arquivos.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arquivos no Mac</p>
          <div className="flex flex-wrap gap-2">
            {arquivos.map((a) => (
              <button key={a} type="button" disabled={!isDesktop()} onClick={() => void abrirNoMac(a)} title={isDesktop() ? "Mostrar no Finder" : "Só no app do Mac"}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-50">
                <FolderOpen className="h-3.5 w-3.5" />{a.split("/").pop()}
              </button>
            ))}
          </div>
        </div>
      )}

      <PassosTarefa atividadeId={tarefaId} />
      {!observacao && !edicoes.length && !carrosseis.length && (
        <p className="py-8 text-center text-sm text-muted-foreground">Esta tarefa não tem documento nem arquivo ligado.</p>
      )}
    </div>
  );
}
