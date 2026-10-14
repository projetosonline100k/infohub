import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { bate, conflitos, GATILHOS, separarPalavras, type Correspondencia, type Gatilho } from "@/lib/automacoes/instagram";
import {
  buscarPostsInstagram,
  type AutomacaoForm,
  type InstagramAutomacao,
  type InstagramPost,
} from "@/hooks/useInstagramAutomacoes";

const LIMITE_DM = 1000;

type Props = {
  aberto: boolean;
  onFechar: () => void;
  automacao: InstagramAutomacao | null; // null = nova
  todas: InstagramAutomacao[];
  conectado: boolean;
  onSalvar: (form: AutomacaoForm, id?: string) => Promise<void>;
};

export function AutomacaoDialog({ aberto, onFechar, automacao, todas, conectado, onSalvar }: Props) {
  const [nome, setNome] = useState("");
  const [palavrasTexto, setPalavrasTexto] = useState("");
  const [correspondencia, setCorrespondencia] = useState<Correspondencia>("contem");
  const [gatilhos, setGatilhos] = useState<Gatilho[]>(["comentario"]);
  const [mensagem, setMensagem] = useState("");
  const [respostas, setRespostas] = useState<string[]>([]);
  const [mediaIds, setMediaIds] = useState<string[] | null>(null);
  const [ativo, setAtivo] = useState(true);
  const [rastrear, setRastrear] = useState(true);
  const [frase, setFrase] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [posts, setPosts] = useState<InstagramPost[] | null>(null);
  const [carregandoPosts, setCarregandoPosts] = useState(false);
  const [erroPosts, setErroPosts] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setNome(automacao?.nome ?? "");
    setPalavrasTexto(automacao?.palavras_chave.join(", ") ?? "");
    setCorrespondencia((automacao?.correspondencia as Correspondencia) ?? "contem");
    setGatilhos((automacao?.gatilhos as Gatilho[]) ?? ["comentario"]);
    setMensagem(automacao?.mensagem_dm ?? "");
    setRespostas(automacao?.respostas_comentario ?? []);
    setMediaIds(automacao?.media_ids?.length ? automacao.media_ids : null);
    setAtivo(automacao?.ativo ?? true);
    setRastrear(automacao?.rastrear_links ?? true);
    setFrase("");
  }, [aberto, automacao]);

  const palavras = useMemo(() => separarPalavras(palavrasTexto), [palavrasTexto]);
  const repetidas = useMemo(
    () => conflitos(todas, { id: automacao?.id, palavras_chave: palavras, gatilhos }),
    [todas, automacao?.id, palavras, gatilhos],
  );
  const temComentario = gatilhos.includes("comentario");
  const porPost = temComentario && mediaIds !== null;

  const carregarPosts = async () => {
    if (posts || carregandoPosts) return;
    setCarregandoPosts(true);
    setErroPosts(null);
    try {
      setPosts(await buscarPostsInstagram());
    } catch (e) {
      setErroPosts(e instanceof Error ? e.message : "Não deu para buscar os posts.");
    } finally {
      setCarregandoPosts(false);
    }
  };

  useEffect(() => {
    if (aberto && porPost && conectado) carregarPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, porPost, conectado]);

  const alternarGatilho = (g: Gatilho) =>
    setGatilhos((atual) => (atual.includes(g) ? atual.filter((x) => x !== g) : [...atual, g]));

  const alternarPost = (id: string) =>
    setMediaIds((atual) => {
      const lista = atual ?? [];
      return lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
    });

  const erro =
    !nome.trim() ? "Dê um nome à automação."
    : !palavras.length ? "Informe ao menos uma palavra-chave."
    : !gatilhos.length ? "Escolha ao menos um gatilho."
    : !mensagem.trim() ? "Escreva a mensagem da DM."
    : mensagem.length > LIMITE_DM ? `A DM passa de ${LIMITE_DM} caracteres.`
    : porPost && !mediaIds?.length ? "Escolha ao menos um post ou volte para “todos os posts”."
    : null;

  const salvar = async () => {
    if (erro) return toast.error(erro);
    setSalvando(true);
    try {
      await onSalvar({
        nome: nome.trim(),
        palavras_chave: palavras,
        correspondencia,
        gatilhos,
        mensagem_dm: mensagem.trim(),
        respostas_comentario: respostas.map((r) => r.trim()).filter(Boolean),
        media_ids: porPost ? mediaIds : null,
        ativo,
        rastrear_links: rastrear,
      }, automacao?.id);
      toast.success(automacao ? "Automação atualizada" : "Automação criada");
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  const disparaFrase = frase.trim() ? bate(palavras, correspondencia, frase) : null;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{automacao ? "Editar automação" : "Nova automação"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="auto-nome">Nome</Label>
              <Input id="auto-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Isca da mentoria" />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <Switch id="auto-ativo" checked={ativo} onCheckedChange={setAtivo} />
              <Label htmlFor="auto-ativo">{ativo ? "Ativa" : "Pausada"}</Label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auto-palavras">Palavras-chave</Label>
            <Input id="auto-palavras" value={palavrasTexto} onChange={(e) => setPalavrasTexto(e.target.value)}
              placeholder="QUERO, eu quero, link" />
            <div className="flex flex-wrap items-center gap-1.5">
              {palavras.map((p) => (
                <span key={p} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{p}</span>
              ))}
              <span className="ml-auto inline-flex rounded-md border border-border p-0.5 text-xs">
                {(["contem", "exata"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setCorrespondencia(c)}
                    className={cn("rounded px-2 py-1", correspondencia === c ? "bg-muted font-medium text-foreground" : "text-muted-foreground")}>
                    {c === "contem" ? "Contém a palavra" : "Só a palavra"}
                  </button>
                ))}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Separe por vírgula. Maiúsculas, acentos e pontuação são ignorados.
            </p>
            {repetidas.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {repetidas.map((r) => `“${r.palavra}” já está em ${r.automacao}`).join("; ")}. Só uma dispara.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Quando disparar</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {GATILHOS.map((g) => {
                const ligado = gatilhos.includes(g.valor);
                return (
                  <button key={g.valor} type="button" onClick={() => alternarGatilho(g.valor)}
                    className={cn("rounded-lg border p-3 text-left transition-colors",
                      ligado ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
                    <span className="flex items-center justify-between text-sm font-medium">
                      {g.rotulo}
                      {ligado && <Check className="h-4 w-4 text-primary" />}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{g.descricao}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="auto-dm">Mensagem da DM</Label>
              <span className={cn("text-xs", mensagem.length > LIMITE_DM ? "text-destructive" : "text-muted-foreground")}>
                {mensagem.length}/{LIMITE_DM}
              </span>
            </div>
            <Textarea id="auto-dm" rows={4} value={mensagem} onChange={(e) => setMensagem(e.target.value)}
              placeholder="Oi! Que bom que você quer. Aqui está o link: https://..." />
            <label className="flex items-start gap-2 pt-1 text-xs text-muted-foreground">
              <Switch checked={rastrear} onCheckedChange={setRastrear} className="mt-0.5 scale-75" />
              <span>
                Contar cliques nos links. O link na DM vira um endereço do Hub que conta o clique e leva para o
                destino; desligue se preferir o link original aparecendo.
              </span>
            </label>
          </div>

          {temComentario && (
            <>
              <div className="space-y-1.5">
                <Label>Resposta pública no comentário <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <p className="text-xs text-muted-foreground">Com mais de uma, sorteia a cada comentário, para não parecer robô.</p>
                {respostas.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={r} onChange={(e) => setRespostas((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                      placeholder="Te mandei no direct! 📩" />
                    <Button type="button" variant="ghost" size="icon" aria-label="Remover resposta"
                      onClick={() => setRespostas((l) => l.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setRespostas((l) => [...l, ""])}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar resposta
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Em quais posts</Label>
                <div className="inline-flex rounded-md border border-border p-0.5 text-sm">
                  <button type="button" onClick={() => setMediaIds(null)}
                    className={cn("rounded px-3 py-1", !porPost ? "bg-muted font-medium" : "text-muted-foreground")}>
                    Todos os posts
                  </button>
                  <button type="button" onClick={() => setMediaIds((m) => m ?? [])}
                    className={cn("rounded px-3 py-1", porPost ? "bg-muted font-medium" : "text-muted-foreground")}>
                    Posts específicos
                  </button>
                </div>
                {porPost && (
                  !conectado ? (
                    <p className="text-xs text-muted-foreground">Conecte o Instagram para escolher os posts.</p>
                  ) : carregandoPosts ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando posts…</p>
                  ) : erroPosts ? (
                    <p className="text-xs text-destructive">{erroPosts}</p>
                  ) : (
                    <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
                      {(posts ?? []).map((p) => {
                        const marcado = mediaIds?.includes(p.id);
                        const imagem = p.thumbnail_url || p.media_url;
                        return (
                          <button key={p.id} type="button" onClick={() => alternarPost(p.id)} title={p.caption ?? ""}
                            className={cn("relative aspect-[4/5] overflow-hidden rounded-md border-2 bg-muted",
                              marcado ? "border-primary" : "border-transparent opacity-80 hover:opacity-100")}>
                            {imagem && <img src={imagem} alt="" className="h-full w-full object-cover" loading="lazy" />}
                            <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[10px] text-white">
                              {p.media_product_type === "REELS" ? "Reel" : "Post"} · {p.comments_count ?? 0} 💬
                            </span>
                            {marcado && (
                              <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {/* Escolhido antes mas fora dos 30 mais recentes: mantém e deixa tirar. */}
                      {(mediaIds ?? []).filter((id) => !posts?.some((p) => p.id === id)).map((id) => (
                        <button key={id} type="button" onClick={() => alternarPost(id)}
                          className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-md border-2 border-primary bg-muted p-1 text-[10px] text-muted-foreground">
                          Post antigo<br />{id.slice(-6)}
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  )
                )}
              </div>
            </>
          )}

          <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
            <Label htmlFor="auto-teste">Testar uma frase</Label>
            <div className="flex items-center gap-2">
              <Input id="auto-teste" value={frase} onChange={(e) => setFrase(e.target.value)} placeholder="Ex.: Eu quero!!! 🔥" />
              {disparaFrase !== null && (
                <span className={cn("shrink-0 rounded-full px-2 py-1 text-xs font-medium",
                  disparaFrase ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                  {disparaFrase ? "Dispara" : "Não dispara"}
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {automacao ? "Salvar" : "Criar automação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
