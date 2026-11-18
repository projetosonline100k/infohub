import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, Instagram, Loader2, MessageCircle, Plus, Search, Settings2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { confirmar } from "@/components/DialogosGlobais";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { ImportarSeguidores } from "./ImportarSeguidores";
import { ConversaInstagram } from "./ConversaInstagram";
import { limparTelefone, ROTULO_ORIGEM, ROTULO_EVENTO } from "@/lib/crm/crm";

const db = supabase as unknown as SupabaseClient;   // crm_* ainda não está nos tipos gerados

export interface Etapa { id: string; nome: string; chave: string | null; ordem: number }
export interface Pessoa {
  id: string; nome: string | null; telefone: string | null; email: string | null; instagram: string | null; origem: string;
  etapa_id: string | null; valor_vendido: number; notas: string | null; ultima_interacao_em: string; criado_em: string;
  recebeu_dm_em: string | null; respondeu_em: string | null; clicou_botao_em: string | null; clicou_link_em: string | null; fluxo_concluido_em: string | null;
}
// Situação no funil (18/11, Davi: "quem respondeu, quem clicou, quem avançou e não comprou"): cada chip filtra o quadro.
type Situacao = "todas" | "abordadas" | "responderam" | "botao" | "link" | "concluiu" | "avancou" | "sem_resposta" | "compraram";
const comprou = (p: Pessoa) => p.valor_vendido > 0;
const avancou = (p: Pessoa) => !!(p.respondeu_em || p.clicou_botao_em || p.clicou_link_em || p.fluxo_concluido_em);
const SITUACOES: { id: Situacao; rotulo: string; dica: string; vale: (p: Pessoa) => boolean }[] = [
  { id: "todas", rotulo: "Todas", dica: "Todo mundo", vale: () => true },
  { id: "abordadas", rotulo: "Receberam DM", dica: "Receberam mensagem do fluxo ou da automação", vale: (p) => !!p.recebeu_dm_em },
  { id: "responderam", rotulo: "Responderam", dica: "Escreveram ou tocaram num botão", vale: (p) => !!p.respondeu_em },
  { id: "botao", rotulo: "Clicaram no botão", dica: "Tocaram num botão do fluxo", vale: (p) => !!p.clicou_botao_em },
  { id: "link", rotulo: "Clicaram no link", dica: "Abriram o link da mensagem", vale: (p) => !!p.clicou_link_em },
  { id: "concluiu", rotulo: "Concluíram o fluxo", dica: "Chegaram ao fim do fluxo", vale: (p) => !!p.fluxo_concluido_em },
  { id: "avancou", rotulo: "Avançaram e não compraram", dica: "Responderam, clicaram ou concluíram, mas ainda não compraram: a hora de abordar", vale: (p) => avancou(p) && !comprou(p) },
  { id: "sem_resposta", rotulo: "Receberam e não responderam", dica: "Receberam DM e nunca responderam", vale: (p) => !!p.recebeu_dm_em && !p.respondeu_em && !comprou(p) },
  { id: "compraram", rotulo: "Compraram", dica: "Já compraram", vale: comprou },
];
interface Evento { id: string; tipo: string; texto: string | null; valor: number | null; em: string }

const POR_COLUNA = 40;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const quando = (iso: string) => formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true });
const titulo = (p: Pessoa) => p.nome?.trim() || (p.instagram ? `@${p.instagram}` : p.email || p.telefone || "Sem nome");

export function CrmView({ clienteId }: { clienteId: string }) {
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState<string>("todas");
  const [situacao, setSituacao] = useState<Situacao>("todas");
  const [aberta, setAberta] = useState<string | null>(null);
  const [novaEm, setNovaEm] = useState<string | null | undefined>(undefined);   // undefined = fechado; null = sem etapa
  const [gerenciar, setGerenciar] = useState(false);
  const [importando, setImportando] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [mostrando, setMostrando] = useState<Record<string, number>>({});
  // Instagram do projeto: de qual conta, qual contato é cada @ e o que cada um comentou por último (mostra "de onde veio" no cartão).
  const [igUserId, setIgUserId] = useState<string | null>(null);
  const [contatoPorUser, setContatoPorUser] = useState<Map<string, string>>(new Map());
  const [comentou, setComentou] = useState<Map<string, string>>(new Map());

  const carregar = useCallback(async () => {
    const [e, p] = await Promise.all([
      db.from("crm_etapas").select("id, nome, chave, ordem").eq("cliente_id", clienteId).order("ordem"),
      db.from("crm_pessoas").select("id, nome, telefone, email, instagram, origem, etapa_id, valor_vendido, notas, ultima_interacao_em, criado_em, recebeu_dm_em, respondeu_em, clicou_botao_em, clicou_link_em, fluxo_concluido_em")
        .eq("cliente_id", clienteId).order("ultima_interacao_em", { ascending: false }).limit(3000),
    ]);
    if (e.error || p.error) toast.error("Não consegui carregar o CRM");
    setEtapas((e.data ?? []) as Etapa[]);
    setPessoas(((p.data ?? []) as Pessoa[]).map((x) => ({ ...x, valor_vendido: Number(x.valor_vendido) })));
    setCarregando(false);
  }, [clienteId]);
  useEffect(() => { setCarregando(true); void carregar(); }, [carregar]);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data: contas } = await supabase.rpc("instagram_contas");
      const ig = (contas ?? []).find((c) => c.cliente_id === clienteId)?.ig_user_id ?? null;
      if (!vivo) return;
      setIgUserId(ig);
      if (!ig) { setContatoPorUser(new Map()); setComentou(new Map()); return; }
      const [c, m] = await Promise.all([
        db.from("instagram_contatos").select("contato_id, username").eq("ig_user_id", ig).limit(5000),
        db.from("instagram_mensagens").select("contato_id, texto").eq("ig_user_id", ig).eq("tipo", "comentario").order("enviada_em", { ascending: false }).limit(3000),
      ]);
      if (!vivo) return;
      setContatoPorUser(new Map(((c.data ?? []) as { contato_id: string; username: string | null }[]).filter((x) => x.username).map((x) => [x.username!.toLowerCase(), x.contato_id])));
      const mapa = new Map<string, string>();
      for (const x of (m.data ?? []) as { contato_id: string; texto: string | null }[]) if (x.texto && !mapa.has(x.contato_id)) mapa.set(x.contato_id, x.texto);
      setComentou(mapa);
    })();
    return () => { vivo = false; };
  }, [clienteId]);
  const contatoDe = (p: Pessoa) => (p.instagram ? contatoPorUser.get(p.instagram) ?? null : null);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDig = q.replace(/\D/g, "");
    const vale = SITUACOES.find((x) => x.id === situacao)!.vale;
    return pessoas.filter((p) => (origem === "todas" || p.origem === origem) && vale(p) && (!q
      || (p.nome ?? "").toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q) || (p.instagram ?? "").includes(q.replace(/^@/, ""))
      || (qDig.length >= 4 && (p.telefone ?? "").includes(qDig))));
  }, [pessoas, busca, origem, situacao]);

  const porEtapa = useMemo(() => {
    const m: Record<string, Pessoa[]> = {};
    const primeira = etapas[0]?.id;
    for (const p of filtradas) { const k = p.etapa_id && etapas.some((e) => e.id === p.etapa_id) ? p.etapa_id : primeira; if (k) (m[k] ??= []).push(p); }
    return m;
  }, [filtradas, etapas]);

  const mover = async (pessoaId: string, etapaId: string) => {
    const p = pessoas.find((x) => x.id === pessoaId);
    if (!p || p.etapa_id === etapaId) return;
    const antes = pessoas;
    setPessoas((l) => l.map((x) => x.id === pessoaId ? { ...x, etapa_id: etapaId } : x));
    const { error } = await db.from("crm_pessoas").update({ etapa_id: etapaId, atualizado_em: new Date().toISOString() }).eq("id", pessoaId);
    if (error) { setPessoas(antes); toast.error("Não consegui mover"); return; }
    await db.from("crm_eventos").insert({ pessoa_id: pessoaId, cliente_id: clienteId, tipo: "etapa", texto: `Foi para ${etapas.find((e) => e.id === etapaId)?.nome}` });
  };

  const totalVendido = pessoas.reduce((s, p) => s + p.valor_vendido, 0);
  const pessoaAberta = pessoas.find((p) => p.id === aberta) ?? null;

  if (carregando) return <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex h-full min-h-[480px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, @, telefone ou e-mail" className="pl-8" />
        </div>
        <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="h-10 rounded-md border bg-background px-2 text-sm">
          <option value="todas">Todas as origens</option>
          {Object.entries(ROTULO_ORIGEM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
          <span>{pessoas.length} pessoas</span>
          <span>Vendido: <b className="text-foreground">{brl(totalVendido)}</b></span>
          <Button variant="outline" size="sm" onClick={() => setImportando(true)}><Upload className="mr-1 h-4 w-4" />Seguidores</Button>
          <Button variant="outline" size="sm" onClick={() => setGerenciar(true)}><Settings2 className="mr-1 h-4 w-4" />Etapas</Button>
          <Button size="sm" onClick={() => setNovaEm(null)}><Plus className="mr-1 h-4 w-4" />Pessoa</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SITUACOES.map((x) => {
          const n = pessoas.filter((p) => (origem === "todas" || p.origem === origem) && x.vale(p)).length;
          return (
            <button key={x.id} title={x.dica} onClick={() => setSituacao(x.id)}
              className={cn("rounded-full border px-3 py-1 text-xs transition", situacao === x.id ? "border-primary bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:bg-muted")}>
              {x.rotulo} <b className="ml-0.5">{n}</b>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {etapas.map((e) => {
          const lista = porEtapa[e.id] ?? [];
          const limite = mostrando[e.id] ?? POR_COLUNA;
          const soma = lista.reduce((s, p) => s + p.valor_vendido, 0);
          return (
            <div key={e.id}
              onDragOver={(ev) => { ev.preventDefault(); setSobre(e.id); }}
              onDragLeave={() => setSobre((s) => (s === e.id ? null : s))}
              onDrop={(ev) => { ev.preventDefault(); setSobre(null); const id = ev.dataTransfer.getData("text/plain") || arrastando; if (id) void mover(id, e.id); setArrastando(null); }}
              className={cn("flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30", sobre === e.id && "border-primary bg-primary/5")}>
              <div className="flex items-center justify-between px-3 py-2">
                <div className="text-sm font-semibold">{e.nome} <span className="ml-1 font-normal text-muted-foreground">{lista.length}</span></div>
                <div className="flex items-center gap-1">
                  {soma > 0 && <span className="text-xs text-muted-foreground">{brl(soma)}</span>}
                  <button className="rounded p-1 text-muted-foreground hover:bg-muted" title="Adicionar pessoa nesta etapa" onClick={() => setNovaEm(e.id)}><Plus className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {lista.slice(0, limite).map((p) => (
                  <button key={p.id} draggable
                    onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", p.id); setArrastando(p.id); }}
                    onDragEnd={() => { setArrastando(null); setSobre(null); }}
                    onClick={() => setAberta(p.id)}
                    className={cn("w-full rounded-lg border bg-card p-2.5 text-left shadow-sm transition hover:border-primary/50", arrastando === p.id && "opacity-40")}>
                    <div className="flex items-center justify-between gap-1">
                      <div className="truncate text-sm font-medium">{titulo(p)}</div>
                      {p.instagram && (
                        <span role="button" tabIndex={0} title="Abrir a conversa no Instagram" onClick={(ev) => { ev.stopPropagation(); void abrirLinkExterno(`https://ig.me/m/${p.instagram}`); }}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Instagram className="h-3.5 w-3.5" /></span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {p.instagram && p.nome && <span className="truncate">@{p.instagram}</span>}
                      {p.telefone && <span>{p.telefone}</span>}
                    </div>
                    {(() => { const c = contatoDe(p); const t = c ? comentou.get(c) : null; return t ? <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">💬 Comentou: “{t}”</div> : null; })()}
                    <Selos p={p} />
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5">{ROTULO_ORIGEM[p.origem] ?? p.origem}</span>
                      <span>{p.valor_vendido > 0 ? <b className="text-emerald-500">{brl(p.valor_vendido)}</b> : quando(p.ultima_interacao_em)}</span>
                    </div>
                  </button>
                ))}
                {lista.length > limite && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setMostrando((m) => ({ ...m, [e.id]: limite + POR_COLUNA }))}>Ver mais ({lista.length - limite})</Button>
                )}
                {lista.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">Ninguém aqui</div>}
              </div>
            </div>
          );
        })}
      </div>

      <FichaPessoa pessoa={pessoaAberta} igUserId={igUserId} contatoId={pessoaAberta ? contatoDe(pessoaAberta) : null} comentario={pessoaAberta && contatoDe(pessoaAberta) ? comentou.get(contatoDe(pessoaAberta)!) ?? null : null} etapas={etapas} clienteId={clienteId} onFechar={() => setAberta(null)}
        onMudou={(nova) => { if (nova) setPessoas((l) => l.map((x) => (x.id === nova.id ? nova : x))); else void carregar(); }} onMover={mover}
        onExcluida={(id) => { setAberta(null); setPessoas((l) => l.filter((x) => x.id !== id)); }} />
      <NovaPessoa etapaId={novaEm} etapas={etapas} clienteId={clienteId} onFechar={() => setNovaEm(undefined)} onCriada={() => { setNovaEm(undefined); void carregar(); }} />
      <ImportarSeguidores aberto={importando} clienteId={clienteId} etapaId={etapas.find((e) => e.chave === "seguidor")?.id ?? etapas[0]?.id ?? null}
        jaTem={new Set(pessoas.map((p) => p.instagram).filter(Boolean) as string[])} onFechar={() => setImportando(false)} onImportou={() => { setImportando(false); void carregar(); }} />
      <GerenciarEtapas aberto={gerenciar} etapas={etapas} clienteId={clienteId} onFechar={() => setGerenciar(false)} onMudou={carregar} />
    </div>
  );
}

function FichaPessoa({ pessoa, igUserId, contatoId, comentario, etapas, clienteId, onFechar, onMudou, onMover, onExcluida }: {
  pessoa: Pessoa | null; igUserId: string | null; contatoId: string | null; comentario: string | null; etapas: Etapa[]; clienteId: string; onFechar: () => void;
  onMudou: (p: Pessoa | null) => void; onMover: (pessoaId: string, etapaId: string) => Promise<void>; onExcluida: (id: string) => void;
}) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [nota, setNota] = useState("");
  const [campos, setCampos] = useState({ nome: "", telefone: "", email: "", instagram: "", notas: "" });
  const id = pessoa?.id;
  const [aba, setAba] = useState<"dados" | "conversa">("dados");
  useEffect(() => { setAba("dados"); }, [id]);
  useEffect(() => {
    if (!pessoa) return;
    setCampos({ nome: pessoa.nome ?? "", telefone: pessoa.telefone ?? "", email: pessoa.email ?? "", instagram: pessoa.instagram ?? "", notas: pessoa.notas ?? "" });
    setNota("");
    let vivo = true;
    void db.from("crm_eventos").select("id, tipo, texto, valor, em").eq("pessoa_id", pessoa.id).order("em", { ascending: false }).limit(200)
      .then(({ data }) => { if (vivo) setEventos((data ?? []) as Evento[]); });
    return () => { vivo = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async () => {
    if (!pessoa) return;
    const dados = {
      nome: campos.nome.trim() || null, telefone: limparTelefone(campos.telefone), email: campos.email.trim().toLowerCase() || null,
      instagram: campos.instagram.trim().replace(/^@/, "").toLowerCase() || null, notas: campos.notas.trim() || null, atualizado_em: new Date().toISOString(),
    };
    const { error } = await db.from("crm_pessoas").update(dados).eq("id", pessoa.id);
    if (error) { toast.error("Não consegui salvar"); return; }
    onMudou({ ...pessoa, ...dados });
    toast.success("Salvo");
  };
  const anotar = async () => {
    if (!pessoa || !nota.trim()) return;
    const { data, error } = await db.from("crm_eventos").insert({ pessoa_id: pessoa.id, cliente_id: clienteId, tipo: "nota", texto: nota.trim() }).select("id, tipo, texto, valor, em").single();
    if (error) { toast.error("Não consegui anotar"); return; }
    setEventos((l) => [data as Evento, ...l]);
    setNota("");
    await db.from("crm_pessoas").update({ ultima_interacao_em: new Date().toISOString() }).eq("id", pessoa.id);
  };
  const excluir = async () => {
    if (!pessoa) return;
    if (!(await confirmar(`Excluir ${titulo(pessoa)} do CRM?`, { descricao: "A linha do tempo dela também some.", botao: "Excluir", destrutivo: true }))) return;
    const { error } = await db.from("crm_pessoas").delete().eq("id", pessoa.id);
    if (error) { toast.error("Não consegui excluir"); return; }
    onExcluida(pessoa.id);
  };

  return (
    <Sheet open={!!pessoa} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {pessoa && (
          <>
            <SheetHeader><SheetTitle>{titulo(pessoa)}</SheetTitle></SheetHeader>
            {igUserId && contatoId && (
              <div className="mt-3 flex gap-1 rounded-lg bg-muted p-1 text-sm">
                {(["dados", "conversa"] as const).map((a) => (
                  <button key={a} onClick={() => setAba(a)} className={cn("flex-1 rounded-md px-3 py-1.5 font-medium", aba === a ? "bg-background shadow" : "text-muted-foreground")}>{a === "dados" ? "Ficha" : "Conversa no Instagram"}</button>
                ))}
              </div>
            )}
            {aba === "conversa" && igUserId && contatoId ? <div className="mt-3"><ConversaInstagram igUserId={igUserId} contatoId={contatoId} /></div> : (
            <div className="mt-4 space-y-4">
              {comentario && <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">💬 Veio do Instagram. Comentou: “{comentario}”</div>}
              <div className="flex flex-wrap gap-2">
                {pessoa.telefone && <Button size="sm" variant="outline" onClick={() => abrirLinkExterno(`https://wa.me/${pessoa.telefone}`)}><MessageCircle className="mr-1 h-4 w-4" />WhatsApp</Button>}
                {pessoa.instagram && <Button size="sm" onClick={() => abrirLinkExterno(`https://ig.me/m/${pessoa.instagram}`)}><Instagram className="mr-1 h-4 w-4" />Abrir conversa<ExternalLink className="ml-1 h-3 w-3" /></Button>}
                {pessoa.instagram && <Button size="sm" variant="outline" onClick={() => abrirLinkExterno(`https://instagram.com/${pessoa.instagram}`)}>Perfil</Button>}
                <span className="ml-auto self-center text-xs text-muted-foreground">Origem: {ROTULO_ORIGEM[pessoa.origem] ?? pessoa.origem}</span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Etapa</label>
                <select value={pessoa.etapa_id ?? ""} onChange={(e) => void onMover(pessoa.id, e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm">
                  {!pessoa.etapa_id && <option value="">—</option>}
                  {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              {pessoa.valor_vendido > 0 && <div className="rounded-lg border bg-emerald-500/10 px-3 py-2 text-sm">Já comprou: <b>{brl(pessoa.valor_vendido)}</b></div>}
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Nome" valor={campos.nome} aoMudar={(v) => setCampos((c) => ({ ...c, nome: v }))} />
                <Campo rotulo="Telefone" valor={campos.telefone} aoMudar={(v) => setCampos((c) => ({ ...c, telefone: v }))} />
                <Campo rotulo="E-mail" valor={campos.email} aoMudar={(v) => setCampos((c) => ({ ...c, email: v }))} />
                <Campo rotulo="Instagram" valor={campos.instagram} aoMudar={(v) => setCampos((c) => ({ ...c, instagram: v }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Observações</label>
                <Textarea value={campos.notas} onChange={(e) => setCampos((c) => ({ ...c, notas: e.target.value }))} rows={3} className="mt-1" />
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" size="sm" className="text-destructive" onClick={excluir}><Trash2 className="mr-1 h-4 w-4" />Excluir</Button>
                <Button size="sm" onClick={salvar}>Salvar</Button>
              </div>

              <div className="border-t pt-3">
                <div className="mb-2 text-sm font-semibold">Linha do tempo</div>
                <div className="flex gap-2">
                  <Input value={nota} onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void anotar(); }} placeholder="Anotar (ex.: liguei, pediu proposta)" />
                  <Button size="sm" onClick={anotar} disabled={!nota.trim()}>Anotar</Button>
                </div>
                <ol className="mt-3 space-y-2">
                  {eventos.map((ev) => (
                    <li key={ev.id} className="rounded-lg border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{ROTULO_EVENTO[ev.tipo] ?? ev.tipo}</span><span>{quando(ev.em)}</span>
                      </div>
                      {ev.texto && <div className="mt-0.5">{ev.texto}{ev.valor != null && ` · ${brl(Number(ev.valor))}`}</div>}
                    </li>
                  ))}
                  {eventos.length === 0 && <li className="text-xs text-muted-foreground">Nada ainda.</li>}
                </ol>
              </div>
            </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Selos({ p }: { p: Pessoa }) {
  const lista = [
    p.fluxo_concluido_em && ["Concluiu o fluxo", "bg-emerald-500/15 text-emerald-400"],
    p.clicou_botao_em && ["Clicou no botão", "bg-fuchsia-500/15 text-fuchsia-300"],
    p.clicou_link_em && ["Clicou no link", "bg-sky-500/15 text-sky-300"],
    p.respondeu_em && !p.clicou_botao_em && ["Respondeu", "bg-emerald-500/15 text-emerald-300"],
    p.recebeu_dm_em && !p.respondeu_em && ["Sem resposta", "bg-amber-500/15 text-amber-300"],
  ].filter(Boolean) as [string, string][];
  if (!lista.length) return null;
  return <div className="mt-1.5 flex flex-wrap gap-1">{lista.map(([t, c]) => <span key={t} className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", c)}>{t}</span>)}</div>;
}

function Campo({ rotulo, valor, aoMudar }: { rotulo: string; valor: string; aoMudar: (v: string) => void }) {
  return <div><label className="text-xs text-muted-foreground">{rotulo}</label><Input value={valor} onChange={(e) => aoMudar(e.target.value)} className="mt-1" /></div>;
}

function NovaPessoa({ etapaId, etapas, clienteId, onFechar, onCriada }: {
  etapaId: string | null | undefined; etapas: Etapa[]; clienteId: string; onFechar: () => void; onCriada: () => void;
}) {
  const [c, setC] = useState({ nome: "", telefone: "", email: "", instagram: "" });
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (etapaId !== undefined) setC({ nome: "", telefone: "", email: "", instagram: "" }); }, [etapaId]);
  const criar = async () => {
    const tel = limparTelefone(c.telefone);
    const ig = c.instagram.trim().replace(/^@/, "").toLowerCase() || null;
    const mail = c.email.trim().toLowerCase() || null;
    if (!c.nome.trim() && !tel && !ig && !mail) { toast.error("Preencha ao menos um: nome, telefone, e-mail ou Instagram"); return; }
    setSalvando(true);
    const { error } = await db.from("crm_pessoas").insert({
      cliente_id: clienteId, nome: c.nome.trim() || null, telefone: tel, email: mail, instagram: ig, origem: "manual", etapa_id: etapaId ?? etapas[0]?.id ?? null,
    });
    setSalvando(false);
    if (error) { toast.error("Não consegui cadastrar"); return; }
    onCriada();
  };
  return (
    <Dialog open={etapaId !== undefined} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nova pessoa{etapaId ? ` em ${etapas.find((e) => e.id === etapaId)?.nome}` : ""}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Campo rotulo="Nome" valor={c.nome} aoMudar={(v) => setC((x) => ({ ...x, nome: v }))} />
          <Campo rotulo="Telefone (com DDD)" valor={c.telefone} aoMudar={(v) => setC((x) => ({ ...x, telefone: v }))} />
          <Campo rotulo="E-mail" valor={c.email} aoMudar={(v) => setC((x) => ({ ...x, email: v }))} />
          <Campo rotulo="Instagram (@)" valor={c.instagram} aoMudar={(v) => setC((x) => ({ ...x, instagram: v }))} />
          <Button className="w-full" onClick={criar} disabled={salvando}>{salvando ? "Cadastrando…" : "Cadastrar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GerenciarEtapas({ aberto, etapas, clienteId, onFechar, onMudou }: {
  aberto: boolean; etapas: Etapa[]; clienteId: string; onFechar: () => void; onMudou: () => Promise<void>;
}) {
  const [nova, setNova] = useState("");
  const renomear = async (e: Etapa, nome: string) => {
    const n = nome.trim();
    if (!n || n === e.nome) return;
    const { error } = await db.from("crm_etapas").update({ nome: n }).eq("id", e.id);
    if (error) toast.error("Não consegui renomear"); else await onMudou();
  };
  const mover = async (e: Etapa, dir: -1 | 1) => {
    const i = etapas.findIndex((x) => x.id === e.id);
    const outro = etapas[i + dir];
    if (!outro) return;
    await Promise.all([db.from("crm_etapas").update({ ordem: outro.ordem }).eq("id", e.id), db.from("crm_etapas").update({ ordem: e.ordem }).eq("id", outro.id)]);
    await onMudou();
  };
  const adicionar = async () => {
    const n = nova.trim();
    if (!n) return;
    const { error } = await db.from("crm_etapas").insert({ cliente_id: clienteId, nome: n, ordem: (etapas[etapas.length - 1]?.ordem ?? 0) + 1 });
    if (error) { toast.error("Não consegui adicionar"); return; }
    setNova("");
    await onMudou();
  };
  const excluir = async (e: Etapa) => {
    if (!(await confirmar(`Excluir a etapa "${e.nome}"?`, { descricao: "As pessoas dela vão para a primeira etapa.", botao: "Excluir", destrutivo: true }))) return;
    const { error } = await db.from("crm_etapas").delete().eq("id", e.id);
    if (error) toast.error("Não consegui excluir"); else await onMudou();
  };
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Etapas do CRM</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {etapas.map((e, i) => (
            <div key={e.id} className="flex items-center gap-1">
              <Input defaultValue={e.nome} onBlur={(ev) => void renomear(e, ev.target.value)} className="h-9" />
              <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => void mover(e, -1)}>↑</Button>
              <Button size="sm" variant="ghost" disabled={i === etapas.length - 1} onClick={() => void mover(e, 1)}>↓</Button>
              <Button size="sm" variant="ghost" className="text-destructive" disabled={!!e.chave} title={e.chave ? "Etapa padrão: só dá para renomear" : "Excluir"} onClick={() => void excluir(e)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Input value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void adicionar(); }} placeholder="Nova etapa" className="h-9" />
            <Button size="sm" onClick={adicionar} disabled={!nova.trim()}>Adicionar</Button>
          </div>
          <p className="text-xs text-muted-foreground">As etapas padrão (Novo, Abordado, Respondeu, Proposta, Vendido, Pós-venda) não podem ser excluídas porque o quiz, as abordagens e as compras usam elas para mover as pessoas sozinhos.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
