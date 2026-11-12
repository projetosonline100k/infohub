import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { etapaDark, prontosParados, resumirDark, type EdicaoDark, type EtapaDark } from "@/lib/empresa/dashDark";
import type { MembroResumo } from "@/lib/empresa/visaoGeral";
import { cn } from "@/lib/utils";

const db = supabase as unknown as SupabaseClient;

// Dash que abre ao clicar no Lauro (12/11, Davi: "ao clicar em você, me mostre um dash de vídeos dark:
// fila, como estamos de vídeos"). Lê as edições de formato "dark" de todos os projetos e as tarefas dele.
interface TarefaLauro { id: string; titulo: string; data_vencimento: string | null; situacao: string | null }

const ETAPAS: { chave: Exclude<EtapaDark, "cancelado">; rotulo: string; cor: string }[] = [
  { chave: "fila", rotulo: "Na fila", cor: "text-amber-500" },
  { chave: "producao", rotulo: "Em produção", cor: "text-sky-500" },
  { chave: "revisar", rotulo: "Para revisar", cor: "text-violet-500" },
  { chave: "pronto", rotulo: "Prontos", cor: "text-emerald-500" },
  { chave: "postado", rotulo: "Postados", cor: "text-foreground" },
];
const ROTULO_ETAPA: Record<EtapaDark, string> = { fila: "na fila", producao: "em produção", revisar: "para revisar", pronto: "pronto", postado: "postado", cancelado: "cancelado" };

export function DashDark({ membro, aberto, onFechar, onConversar }: {
  membro: MembroResumo | null; aberto: boolean; onFechar: () => void; onConversar: () => void;
}) {
  const [edicoes, setEdicoes] = useState<EdicaoDark[] | null>(null);
  const [tarefas, setTarefas] = useState<TarefaLauro[]>([]);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!aberto || !membro) return;
    let vivo = true;
    setEdicoes(null); setErro(false);
    (async () => {
      const { data: eds, error } = await db.from("edicoes_video")
        .select("id, titulo, status, cliente_id, criado_em, video_vertical_id").eq("formato", "dark").order("criado_em", { ascending: false });
      if (!vivo) return;
      if (error) { setErro(true); return; }
      const lista = (eds || []) as (Omit<EdicaoDark, "perfil" | "video_status"> & { video_vertical_id: string | null })[];
      const clienteIds = [...new Set(lista.map((e) => e.cliente_id))];
      const videoIds = lista.map((e) => e.video_vertical_id).filter((x): x is string => !!x);
      const [cli, vid, tar] = await Promise.all([
        clienteIds.length ? db.from("clientes").select("id, nome_especialista").in("id", clienteIds) : { data: [] },
        videoIds.length ? db.from("videos_vertical").select("id, status").in("id", videoIds) : { data: [] },
        db.from("atividades").select("id, titulo, data_vencimento, situacao").eq("responsavel_id", membro.id).is("deleted_at", null).eq("concluida", false).order("data_vencimento", { nullsFirst: false }),
      ]);
      if (!vivo) return;
      const nomes = new Map(((cli.data || []) as { id: string; nome_especialista: string }[]).map((c) => [c.id, c.nome_especialista]));
      const statusVideo = new Map(((vid.data || []) as { id: string; status: string }[]).map((v) => [v.id, v.status]));
      setEdicoes(lista.map((e) => ({ id: e.id, titulo: e.titulo, status: e.status, cliente_id: e.cliente_id, criado_em: e.criado_em,
        perfil: nomes.get(e.cliente_id) ?? "Sem perfil", video_status: e.video_vertical_id ? statusVideo.get(e.video_vertical_id) ?? null : null })));
      setTarefas((tar.data || []) as TarefaLauro[]);
    })();
    return () => { vivo = false; };
  }, [aberto, membro]);

  const resumo = edicoes ? resumirDark(edicoes) : null;
  const parados = edicoes ? prontosParados(edicoes, new Date()) : 0;
  const recentes = (edicoes || []).filter((e) => etapaDark(e) !== "cancelado").slice(0, 8);

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vídeos dark · {membro?.nome}</DialogTitle>
          <DialogDescription>Como estão os vídeos dark de todos os perfis.</DialogDescription>
        </DialogHeader>
        {erro ? <p className="text-sm text-destructive">Não consegui carregar os vídeos agora.</p>
          : !resumo ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /> : (
          <div className="space-y-5">
            <div className="grid grid-cols-5 gap-2">
              {ETAPAS.map((e) => (
                <div key={e.chave} className="rounded-lg border border-foreground/10 p-3 text-center">
                  <p className={cn("text-2xl font-bold", e.cor)}>{resumo.geral[e.chave]}</p>
                  <p className="text-[11px] text-muted-foreground">{e.rotulo}</p>
                </div>
              ))}
            </div>
            <p className="text-sm">
              <strong>{resumo.geral.total}</strong> vídeos dark no total.
              {resumo.geral.pronto > 0 && <> <strong>{resumo.geral.pronto}</strong> {resumo.geral.pronto === 1 ? "pronto esperando" : "prontos esperando"} para postar{parados > 0 && <> ({parados} há mais de 7 dias)</>}.</>}
              {resumo.geral.fila + resumo.geral.producao + resumo.geral.revisar === 0 && " Nada na fila agora."}
            </p>

            <section>
              <h3 className="mb-1.5 text-sm font-semibold">Fila de tarefas do {membro?.nome}</h3>
              {tarefas.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma tarefa esperando.</p> : (
                <ul className="space-y-1">
                  {tarefas.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                      {t.data_vencimento && <span className="shrink-0 text-xs text-muted-foreground">{t.data_vencimento.split("-").reverse().slice(0, 2).join("/")}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-1.5 text-sm font-semibold">Por perfil</h3>
              {resumo.porPerfil.length === 0 ? <p className="text-xs text-muted-foreground">Ainda não tem vídeo dark.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] text-muted-foreground">
                    <th className="py-1 font-normal">Perfil</th><th className="font-normal">Fila</th><th className="font-normal">Produção</th>
                    <th className="font-normal">Revisar</th><th className="font-normal">Prontos</th><th className="font-normal">Postados</th>
                  </tr></thead>
                  <tbody>
                    {resumo.porPerfil.map((p) => (
                      <tr key={p.perfil} className="border-t border-foreground/10">
                        <td className="py-1.5 pr-2">{p.perfil}</td><td>{p.fila}</td><td>{p.producao}</td><td>{p.revisar}</td><td>{p.pronto}</td><td>{p.postado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {recentes.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-sm font-semibold">Últimos vídeos</h3>
                <ul className="space-y-1">
                  {recentes.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{e.titulo.replace(/^Versão dark:\s*/i, "")}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{e.perfil} · {ROTULO_ETAPA[etapaDark(e)]}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <button type="button" onClick={onConversar}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <MessageCircle className="h-4 w-4" />Conversar com o {membro?.nome}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
