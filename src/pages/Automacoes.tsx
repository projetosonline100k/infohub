import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AtSign, Loader2, MessageCircle, MessageSquareText, Pencil, Plus, RefreshCw, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { confirmar } from "@/components/DialogosGlobais";
import { AutomacaoDialog } from "@/components/automacoes/AutomacaoDialog";
import { AutomacoesResultados } from "@/components/automacoes/AutomacoesResultados";
import { ConectarContaDialog } from "@/components/automacoes/ConectarContaDialog";
import { GATILHOS } from "@/lib/automacoes/instagram";
import { cn } from "@/lib/utils";
import { nomeDaConta, useInstagramAutomacoes, type InstagramAutomacao } from "@/hooks/useInstagramAutomacoes";

const rotuloGatilho = (g: string) => GATILHOS.find((x) => x.valor === g)?.rotulo ?? g;

// Automações do Instagram ("comentou/mandou a palavra, recebe a DM"). Quem
// dispara é a edge function `instagram-automacoes` (webhook da Meta); esta
// tela só gerencia as regras e mostra o histórico. Setup em
// docs/INSTAGRAM_AUTOMACOES.md.
export default function Automacoes() {
  const { contas, conta, setContaId, automacoes, disparos, loading, recarregar, salvar, alternar, apagar } = useInstagramAutomacoes();
  const [conectarAberto, setConectarAberto] = useState(false);
  const [editando, setEditando] = useState<InstagramAutomacao | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const nomePorId = useMemo(() => new Map(automacoes.map((a) => [a.id, a.nome])), [automacoes]);
  const hoje = new Date().toDateString();
  const enviadasHoje = disparos.filter((d) => d.dm_status === "enviada" && new Date(d.criado_em).toDateString() === hoje).length;
  const comErro = disparos.filter((d) => d.dm_status === "erro").length;

  const abrir = (a: InstagramAutomacao | null) => { setEditando(a); setDialogAberto(true); };

  const remover = async (a: InstagramAutomacao) => {
    if (!(await confirmar(`Apagar a automação “${a.nome}”? O histórico de disparos fica.`, { botao: "Apagar", destrutivo: true }))) return;
    try { await apagar(a.id); toast.success("Automação apagada"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao apagar"); }
  };

  const atualizar = async () => {
    setAtualizando(true);
    try { await recarregar(); } finally { setAtualizando(false); }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Automações do Instagram</h1>
          <p className="text-sm text-muted-foreground">Comentou, mandou no direct ou respondeu o story com a palavra: recebe a DM.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={atualizar} aria-label="Atualizar" title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", atualizando && "animate-spin")} />
          </Button>
          <Button onClick={() => abrir(null)} disabled={!conta}><Plus className="mr-1.5 h-4 w-4" /> Nova automação</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4 sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Conta</p>
            <button type="button" onClick={() => setConectarAberto(true)} className="text-xs font-medium text-primary hover:underline">
              + Conectar conta
            </button>
          </div>
          {conta ? (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Conta do Instagram">
                {contas.map((c) => (
                  <button key={c.ig_user_id} type="button" onClick={() => setContaId(c.ig_user_id)} aria-pressed={c.ig_user_id === conta.ig_user_id}
                    className={cn("rounded-full border px-2.5 py-1 text-left text-xs transition-colors",
                      c.ig_user_id === conta.ig_user_id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted")}>
                    <span className="font-semibold">@{c.username ?? c.ig_user_id}</span>
                    <span className="ml-1 opacity-70">· {nomeDaConta(c)}</span>
                  </button>
                ))}
              </div>
              {conta.token_expira_em && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  acesso renova sozinho (vence {formatDistanceToNow(new Date(conta.token_expira_em), { locale: ptBR, addSuffix: true })})
                </p>
              )}
            </>
          ) : (
            <div className="mt-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="font-semibold">Nenhuma conta conectada</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Clique em “Conectar conta” para gerar o link de autorização.</p>
            </div>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">DMs hoje</p>
          <p className="mt-1 text-2xl font-bold">{enviadasHoje}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ativas</p>
          <p className="mt-1 text-2xl font-bold">{automacoes.filter((a) => a.ativo).length}</p>
          <p className="text-xs text-muted-foreground">de {automacoes.length} criada{automacoes.length === 1 ? "" : "s"} · sem limite</p>
        </Card>
      </div>

      <Tabs defaultValue={automacoes.length ? "resultados" : "automacoes"}>
        <TabsList>
          <TabsTrigger value="resultados">Resultados</TabsTrigger>
          <TabsTrigger value="automacoes">Automações</TabsTrigger>
          <TabsTrigger value="historico">
            Histórico{comErro > 0 && <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground">{comErro}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resultados" className="mt-4">
          <AutomacoesResultados automacoes={automacoes} disparos={disparos} />
        </TabsContent>

        <TabsContent value="automacoes" className="mt-4">
          {automacoes.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 p-10 text-center">
              <Zap className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Nenhuma automação ainda</p>
                <p className="text-sm text-muted-foreground">Crie aqui ou diga ao Claude: “cria a palavra QUERO mandando o link X”.</p>
              </div>
              <Button onClick={() => abrir(null)}><Plus className="mr-1.5 h-4 w-4" /> Criar a primeira</Button>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {automacoes.map((a) => (
                <Card key={a.id} className={cn("flex flex-col gap-3 p-4", !a.ativo && "opacity-60")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{a.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.disparos} {a.disparos === 1 ? "DM enviada" : "DMs enviadas"}
                        {" · "}{a.correspondencia === "exata" ? "só a palavra" : "contém a palavra"}
                      </p>
                    </div>
                    <Switch checked={a.ativo} aria-label={a.ativo ? "Pausar" : "Ativar"}
                      onCheckedChange={() => alternar(a).catch((e) => toast.error(e.message))} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.palavras_chave.map((p) => (
                      <span key={p} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{p}</span>
                    ))}
                  </div>
                  <p className="line-clamp-2 rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">{a.mensagem_dm}</p>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                      {a.gatilhos.map((g) => (
                        <span key={g} className="rounded border border-border px-1.5 py-0.5">{rotuloGatilho(g)}</span>
                      ))}
                      {a.gatilhos.includes("comentario") && (
                        <span className="rounded border border-border px-1.5 py-0.5">
                          {a.media_ids?.length ? `${a.media_ids.length} post${a.media_ids.length > 1 ? "s" : ""}` : "todos os posts"}
                        </span>
                      )}
                      {a.respostas_comentario.length > 0 && (
                        <span className="rounded border border-border px-1.5 py-0.5">{a.respostas_comentario.length} resposta{a.respostas_comentario.length > 1 ? "s" : ""} pública{a.respostas_comentario.length > 1 ? "s" : ""}</span>
                      )}
                    </div>
                    <div className="flex shrink-0">
                      <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => abrir(a)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label="Apagar" onClick={() => remover(a)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          {disparos.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">Nenhum disparo ainda.</Card>
          ) : (
            <Card className="divide-y divide-border">
              {disparos.slice(0, 100).map((d) => {
                const Icone = d.origem === "comentario" ? MessageSquareText : d.origem === "story" ? AtSign : MessageCircle;
                return (
                  <div key={d.id} className="flex items-start gap-3 p-3 text-sm">
                    <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        <span className="font-medium">{d.autor_username ? `@${d.autor_username}` : "Alguém"}</span>
                        <span className="text-muted-foreground"> · {rotuloGatilho(d.origem).toLowerCase()} · </span>
                        “{d.texto}”
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(d.automacao_id && nomePorId.get(d.automacao_id)) || "automação apagada"}
                        {" · "}{formatDistanceToNow(new Date(d.criado_em), { locale: ptBR, addSuffix: true })}
                      </p>
                      {(d.cliques > 0 || d.respondeu_em) && (
                        <p className="text-xs text-muted-foreground">
                          {d.cliques > 0 && `clicou no link${d.cliques > 1 ? ` (${d.cliques}×)` : ""}`}
                          {d.cliques > 0 && d.respondeu_em && " · "}
                          {d.respondeu_em && "respondeu a DM"}
                        </p>
                      )}
                      {d.erro && <p className="mt-0.5 text-xs text-destructive">{d.erro}</p>}
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      d.dm_status === "enviada" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : d.dm_status === "erro" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}>
                      {d.dm_status === "enviada" ? "DM enviada" : d.dm_status === "erro" ? "Falhou" : "Enviando"}
                    </span>
                  </div>
                );
              })}
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <ConectarContaDialog aberto={conectarAberto} onFechar={() => { setConectarAberto(false); recarregar(); }} />

      <AutomacaoDialog
        aberto={dialogAberto}
        onFechar={() => setDialogAberto(false)}
        automacao={editando}
        todas={automacoes}
        igUserId={conta?.ig_user_id ?? null}
        onSalvar={salvar}
      />
    </div>
  );
}
