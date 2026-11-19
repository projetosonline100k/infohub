import { FormEvent, useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Copy, ExternalLink, Link2, Loader2, Pause, Play, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/DialogosGlobais";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { codigoEmbaixador, conviteDoEmbaixador } from "@/lib/embaixador";

const db = supabase as unknown as SupabaseClient;

interface Embaixador { id: string; nome: string; email: string; codigo: string; comissao_pct: number; ativo: boolean; convite: string | null; auth_user_id: string | null; leads: number }
interface LinkLiberado { id: string; titulo: string; destino: string; ativo: boolean; embaixador_id: string | null }

const campo = "h-9 rounded-md border border-border bg-background px-3 text-sm";

/** Escritório → Embaixadores: cadastro, convite e links liberados (19/11/2026). A área deles é /embaixador. */
export function EmbaixadoresProjeto({ clienteId }: { clienteId: string }) {
  const [lista, setLista] = useState<Embaixador[] | null>(null);
  const [links, setLinks] = useState<LinkLiberado[]>([]);
  const [quizzes, setQuizzes] = useState<{ slug: string; titulo: string }[]>([]);
  const [f, setF] = useState({ nome: "", email: "", comissao: "30" });
  const [l, setL] = useState({ titulo: "", destino: "", para: "" });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const [{ data: e }, { data: ls }, { data: qz }, { data: resp }] = await Promise.all([
      db.from("embaixadores").select("id, nome, email, codigo, comissao_pct, ativo, convite, auth_user_id").eq("cliente_id", clienteId).order("criado_em"),
      db.from("embaixador_links").select("id, titulo, destino, ativo, embaixador_id").eq("cliente_id", clienteId).order("ordem").order("criado_em"),
      db.from("quizzes").select("slug, titulo").eq("cliente_id", clienteId).is("variante_de", null),
      db.from("quiz_respostas").select("utm").eq("cliente_id", clienteId).like("utm->>utm_content", "aff_%").limit(5000),
    ]);
    const porCodigo = new Map<string, number>();
    for (const r of (resp ?? []) as { utm: Record<string, string> | null }[]) { const c = (r.utm?.utm_content ?? "").toLowerCase(); porCodigo.set(c, (porCodigo.get(c) ?? 0) + 1); }
    setLista(((e ?? []) as Omit<Embaixador, "leads">[]).map((x) => ({ ...x, comissao_pct: Number(x.comissao_pct), leads: porCodigo.get(`aff_${x.codigo}`) ?? 0 })));
    setLinks((ls ?? []) as LinkLiberado[]);
    setQuizzes((qz ?? []) as { slug: string; titulo: string }[]);
  }, [clienteId]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function cadastrar(ev: FormEvent) {
    ev.preventDefault();
    const base = codigoEmbaixador(f.nome);
    if (!base) { toast.error("Nome muito curto para gerar o código."); return; }
    setSalvando(true);
    let erro: { code?: string; message: string } | null = null;
    for (const sufixo of ["", "2", "3", String(Math.floor(Math.random() * 900 + 100))]) {
      const codigo = codigoEmbaixador(f.nome, sufixo)!;
      const { error } = await db.from("embaixadores").insert({ cliente_id: clienteId, nome: f.nome.trim(), email: f.email.trim().toLowerCase(), codigo, comissao_pct: Number(f.comissao) || 0 });
      erro = error;
      if (!error || error.code !== "23505") break;   // 23505 = código já existe: tenta outro
    }
    setSalvando(false);
    if (erro) { toast.error(erro.message); return; }
    setF({ nome: "", email: "", comissao: f.comissao });
    toast.success("Embaixador cadastrado. Copie o convite e mande para ele.");
    void carregar();
  }

  async function copiar(texto: string, aviso: string) { await navigator.clipboard.writeText(texto); toast.success(aviso); }
  async function alternar(x: Embaixador) { await db.from("embaixadores").update({ ativo: !x.ativo }).eq("id", x.id); void carregar(); }
  async function remover(x: Embaixador) {
    if (!(await confirmar(`Remover ${x.nome}?`, { descricao: "Ele perde o acesso. As vendas e os leads continuam no sistema, mas deixam de aparecer para ele.", botao: "Remover" }))) return;
    await db.from("embaixadores").delete().eq("id", x.id); void carregar();
  }
  async function novoLink(ev: FormEvent) {
    ev.preventDefault();
    const { error } = await db.from("embaixador_links").insert({ cliente_id: clienteId, titulo: l.titulo.trim(), destino: l.destino.trim(), embaixador_id: l.para || null, ordem: links.length });
    if (error) { toast.error(error.message.includes("check") ? "Use um endereço completo (https://…)." : error.message); return; }
    setL({ titulo: "", destino: "", para: "" }); void carregar();
  }

  const origem = window.location.origin;
  if (!lista) return <div className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h2 className="text-xl font-semibold">Embaixadores</h2>
        <p className="mt-1 text-sm text-muted-foreground">Cada embaixador entra pelo convite e vê só a área dele: vendas, leads (sem contato), quantas pessoas trouxe, esteira e os links que você liberar.</p>
        <button className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline" onClick={() => void copiar(`${origem}/embaixador`, "Endereço de acesso copiado")}><ExternalLink className="h-3 w-3" />Copiar o endereço de acesso ({origem.replace(/^https?:\/\//, "")}/embaixador)</button>
      </div>

      <form onSubmit={cadastrar} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
        <label className="space-y-1 text-xs text-muted-foreground">Nome<Input className="h-9 w-48" required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">E-mail<Input className="h-9 w-56" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">Comissão (%)<Input className="h-9 w-24" type="number" min={0} max={100} step="0.5" value={f.comissao} onChange={(e) => setF({ ...f, comissao: e.target.value })} /></label>
        <Button type="submit" disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="mr-1.5 h-4 w-4" />Cadastrar</>}</Button>
      </form>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {!lista.length ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhum embaixador ainda.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Embaixador</th><th className="px-4 py-2 font-medium">Código</th><th className="px-4 py-2 font-medium">Comissão</th><th className="px-4 py-2 font-medium">Leads</th><th className="px-4 py-2 font-medium">Acesso</th><th /></tr></thead>
            <tbody>{lista.map((x) => (
              <tr key={x.id} className="border-t border-border">
                <td className="px-4 py-2"><div className="font-medium">{x.nome}</div><div className="text-xs text-muted-foreground">{x.email}</div></td>
                <td className="px-4 py-2 font-mono text-xs">aff_{x.codigo}</td>
                <td className="px-4 py-2">{x.comissao_pct}%</td>
                <td className="px-4 py-2 tabular-nums">{x.leads}</td>
                <td className="px-4 py-2">
                  {!x.ativo ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Pausado</span>
                    : x.auth_user_id ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600">Conta criada</span>
                    : <button className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600" onClick={() => x.convite && void copiar(conviteDoEmbaixador(origem, x.convite), "Convite copiado")}><Copy className="h-3 w-3" />Copiar convite</button>}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="icon" title={x.ativo ? "Pausar" : "Reativar"} onClick={() => void alternar(x)}>{x.ativo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
                  <Button variant="ghost" size="icon" title="Remover" onClick={() => void remover(x)}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" />Links liberados</h3>
        <p className="text-xs text-muted-foreground">O embaixador recebe cada link já com a marca dele. Vale para o quiz, ofertas únicas ou qualquer página.</p>
        <form onSubmit={novoLink} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
          <label className="space-y-1 text-xs text-muted-foreground">Nome do link<Input className="h-9 w-44" required placeholder="Ex.: Quiz Instalivros" value={l.titulo} onChange={(e) => setL({ ...l, titulo: e.target.value })} /></label>
          <label className="space-y-1 text-xs text-muted-foreground">Endereço<Input className="h-9 w-72" required placeholder="https://…" value={l.destino} onChange={(e) => setL({ ...l, destino: e.target.value })} /></label>
          {!!quizzes.length && (
            <label className="space-y-1 text-xs text-muted-foreground">ou um quiz
              <select className={campo} value="" onChange={(e) => { const q = quizzes.find((z) => z.slug === e.target.value); if (q) setL({ ...l, titulo: l.titulo || q.titulo, destino: `${origem}/quiz/${q.slug}` }); }}>
                <option value="">Escolher…</option>{quizzes.map((q) => <option key={q.slug} value={q.slug}>{q.titulo}</option>)}
              </select>
            </label>
          )}
          <label className="space-y-1 text-xs text-muted-foreground">Para
            <select className={campo} value={l.para} onChange={(e) => setL({ ...l, para: e.target.value })}>
              <option value="">Todos os embaixadores</option>{lista.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </label>
          <Button type="submit">Liberar</Button>
        </form>
        {links.map((k) => (
          <div key={k.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1"><div className="font-medium">{k.titulo}</div><div className="truncate text-xs text-muted-foreground">{k.destino}</div></div>
            <span className="text-xs text-muted-foreground">{k.embaixador_id ? lista.find((x) => x.id === k.embaixador_id)?.nome ?? "—" : "Todos"}</span>
            <Button variant="ghost" size="icon" title={k.ativo ? "Esconder" : "Mostrar"} onClick={() => void db.from("embaixador_links").update({ ativo: !k.ativo }).eq("id", k.id).then(carregar)}>{k.ativo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
            <Button variant="ghost" size="icon" title="Remover" onClick={() => void db.from("embaixador_links").delete().eq("id", k.id).then(carregar)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
