import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AtSign, GitBranch, Loader2, MessageSquareText, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const db = supabase as unknown as SupabaseClient;

interface Dados {
  conta_criada: boolean;
  contas: { ig_user_id: string; username: string | null; token_expira_em: string | null }[];
  automacoes: { id: string; nome: string; ativo: boolean; palavras_chave: string[]; gatilhos: string[]; disparos: number }[];
  fluxos: { id: string; nome: string; ativo: boolean; palavras_chave: string[]; disparos: number }[];
  disparos: { autor_username: string | null; texto: string | null; dm_status: string; criado_em: string }[];
}
const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const cartao = "rounded-2xl border border-white/10 bg-white/[0.04] p-4";

/** Guia do administrador: o Many Hub de cada embaixador (somente leitura). */
export function ManyHubDosEmbaixadores({ embaixadores }: { embaixadores: { id: string; nome: string }[] }) {
  const [id, setId] = useState(embaixadores[0]?.id ?? "");
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (!id) return;
    setDados(null); setErro("");
    void db.rpc("embaixador_manyhub_admin", { p_embaixador: id }).then(({ data, error }) => { if (error) setErro(error.message); else setDados(data as Dados); });
  }, [id]);

  if (!embaixadores.length) return <p className="py-10 text-center text-sm text-white/60">Cadastre um embaixador para ver o Many Hub dele.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {embaixadores.map((x) => <button key={x.id} onClick={() => setId(x.id)} className={cn("rounded-full border px-4 py-1.5 text-sm font-medium", id === x.id ? "border-violet-500 bg-violet-600 text-white" : "border-white/10 bg-white/5 text-white/70 hover:text-white")}>{x.nome}</button>)}
        <span className="ml-auto text-xs text-white/50">Somente leitura: cada embaixador gerencia o próprio Many Hub.</span>
      </div>
      {erro ? <p className="text-sm text-red-300">{erro}</p> : !dados ? <div className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : !dados.conta_criada ? (
        <p className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-sm text-white/60">Este embaixador ainda não criou a conta de acesso.</p>
      ) : (
        <>
          <div className={cardGrid}>
            <section className={cartao}>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><AtSign className="h-4 w-4 text-violet-300" />Instagram conectado</h3>
              {!dados.contas.length ? <p className="text-sm text-white/60">Ainda não conectou nenhuma conta.</p> : dados.contas.map((c) => <div key={c.ig_user_id} className="text-sm font-medium">@{c.username ?? c.ig_user_id}</div>)}
            </section>
            <section className={cartao}>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-violet-300" />Automações ({dados.automacoes.length})</h3>
              {!dados.automacoes.length ? <p className="text-sm text-white/60">Nenhuma automação criada.</p> : <ul className="space-y-2">{dados.automacoes.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm"><span className={cn("h-2 w-2 rounded-full", a.ativo ? "bg-emerald-400" : "bg-white/30")} /><span className="min-w-0 flex-1 truncate">{a.nome} <span className="text-xs text-white/50">· {a.palavras_chave.join(", ")}</span></span><span className="text-xs text-white/50">{a.disparos} disparos</span></li>))}</ul>}
            </section>
            <section className={cartao}>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><GitBranch className="h-4 w-4 text-violet-300" />Fluxos ({dados.fluxos.length})</h3>
              {!dados.fluxos.length ? <p className="text-sm text-white/60">Nenhum fluxo criado.</p> : <ul className="space-y-2">{dados.fluxos.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-sm"><span className={cn("h-2 w-2 rounded-full", f.ativo ? "bg-emerald-400" : "bg-white/30")} /><span className="min-w-0 flex-1 truncate">{f.nome}</span><span className="text-xs text-white/50">{f.disparos} disparos</span></li>))}</ul>}
            </section>
          </div>
          <section className={cartao}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><MessageSquareText className="h-4 w-4 text-violet-300" />Últimos disparos</h3>
            {!dados.disparos.length ? <p className="text-sm text-white/60">Nenhum disparo ainda.</p> : (
              <table className="w-full text-sm"><tbody>{dados.disparos.map((d, i) => (
                <tr key={i} className="border-t border-white/10 first:border-0"><td className="py-2 pr-3 font-medium">@{d.autor_username ?? "—"}</td><td className="max-w-md truncate py-2 pr-3 text-white/60">{d.texto}</td><td className="py-2 pr-3"><span className={cn("rounded-full px-2 py-0.5 text-xs", d.dm_status === "enviada" ? "bg-emerald-500/15 text-emerald-300" : d.dm_status === "erro" ? "bg-red-500/15 text-red-300" : "bg-white/10 text-white/70")}>{d.dm_status}</span></td><td className="py-2 text-right text-xs text-white/50">{quando(d.criado_em)}</td></tr>))}</tbody></table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
const cardGrid = "grid gap-4 lg:grid-cols-3";
