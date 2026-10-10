import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { AlertCircle, Check, CheckCircle2, ChevronDown, Copy, Loader2, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/DialogosGlobais";
import { cn } from "@/lib/utils";
import { CreatorAtalhoClientes } from "./CreatorAtalhoClientes";

interface LinkRecebido {
  id: string;
  link: string;
  status: "nova" | "transcrevendo" | "transcrita" | "erro";
  erro: string | null;
  transcricao_id: string | null;
  criada_em: string;
}

const URL_ATALHO = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/receber_link_atalho`;
const CHAVE_PUBLICA = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function Copiavel({ rotulo, valor, segredo }: { rotulo: string; valor: string; segredo?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-20 shrink-0 text-[10.5px] text-muted-foreground">{rotulo}</span>
      <code className={cn("min-w-0 flex-1 truncate rounded bg-muted px-1.5 py-0.5 text-[10.5px]", segredo && "text-violet-600 dark:text-violet-300")}>{valor}</code>
      <button
        type="button"
        onClick={async () => {
          try { await navigator.clipboard.writeText(valor); setOk(true); setTimeout(() => setOk(false), 1500); }
          catch { toast.error("Não consegui copiar"); }
        }}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={`Copiar ${rotulo}`}
      >
        {ok ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

const STATUS: Record<LinkRecebido["status"], { rotulo: string; icone: React.ReactNode }> = {
  nova: { rotulo: "na fila", icone: <Loader2 className="h-3 w-3 text-muted-foreground" /> },
  transcrevendo: { rotulo: "transcrevendo…", icone: <Loader2 className="h-3 w-3 animate-spin text-violet-500" /> },
  transcrita: { rotulo: "pronto", icone: <CheckCircle2 className="h-3 w-3 text-green-600" /> },
  erro: { rotulo: "erro", icone: <AlertCircle className="h-3 w-3 text-red-500" /> },
};

// Parte do Creator ligada ao iPhone: (1) o passo a passo do Atalho "Jarvis"
// no menu Compartilhar e (2) a lista do que chegou por ele. A transcrição em
// si roda sozinha (useFilaCreator); aqui só mostra e deixa abrir/apagar.
export function CreatorIphone({ userId, versao, onAbrirTranscricao }: {
  userId: string; versao: number; onAbrirTranscricao: (id: string) => void;
}) {
  const [links, setLinks] = useState<LinkRecebido[]>([]);
  const [configuradoEm, setConfiguradoEm] = useState<string | null | undefined>(undefined);
  const [token, setToken] = useState<string | null>(null);
  const [mostrarGuia, setMostrarGuia] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("creator_links").select("id, link, status, erro, transcricao_id, criada_em")
      .eq("user_id", userId).order("criada_em", { ascending: false }).limit(20);
    setLinks((data || []) as LinkRecebido[]);
  }, [userId]);

  useEffect(() => { void carregar(); }, [carregar, versao]);
  useEffect(() => {
    void supabase.rpc("atalho_configurado").then(({ data }) => setConfiguradoEm(data ?? null));
    const canal = supabase
      .channel(`creator-links-tela-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "creator_links", filter: `user_id=eq.${userId}` }, () => { void carregar(); })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [userId, carregar]);

  const gerarChave = async () => {
    if (configuradoEm && !(await confirmar("Gerar uma chave nova? O Atalho que já está no iPhone para de funcionar até você trocar a chave nele.", { botao: "Gerar nova" }))) return;
    const { data, error } = await supabase.rpc("gerar_token_atalho");
    if (error || !data) { toast.error("Não consegui gerar a chave"); return; }
    setToken(data);
    setConfiguradoEm(new Date().toISOString());
    setMostrarGuia(true);
  };

  const apagar = async (id: string) => {
    await supabase.from("creator_links").delete().eq("id", id);
    setLinks((l) => l.filter((x) => x.id !== id));
  };

  const naoConfigurado = configuradoEm === null;

  return (
    <div className="space-y-2">
      {links.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Smartphone className="h-3 w-3" /> Recebidos do iPhone
          </div>
          <div className="space-y-1">
            {links.map((l) => (
              <div key={l.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12px]">
                {STATUS[l.status].icone}
                <button
                  type="button"
                  disabled={!l.transcricao_id}
                  onClick={() => l.transcricao_id && onAbrirTranscricao(l.transcricao_id)}
                  className="min-w-0 flex-1 truncate text-left enabled:hover:underline"
                  title={l.erro || l.link}
                >
                  {l.link.replace(/^https?:\/\/(www\.)?/, "")}
                </button>
                <span className={cn("shrink-0 text-[10.5px]", l.status === "erro" ? "text-red-500" : "text-muted-foreground")}>
                  {STATUS[l.status].rotulo} · {format(new Date(l.criada_em), "HH:mm")}
                </span>
                <button type="button" onClick={() => void apagar(l.id)} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Remover da lista">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={cn("rounded-lg border", naoConfigurado ? "border-violet-500/50 bg-violet-500/5" : "border-border")}>
        <button type="button" onClick={() => setMostrarGuia((v) => !v)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[12px]">
          <Smartphone className="h-3.5 w-3.5 text-violet-500" />
          <span className="flex-1 font-medium">{naoConfigurado ? "Conectar iPhone (mandar reels pelo Compartilhar)" : "Atalho do iPhone conectado"}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", mostrarGuia && "rotate-180")} />
        </button>
        {mostrarGuia && (
          <div className="space-y-2 border-t border-border px-2.5 py-2 text-[11.5px] leading-relaxed">
            <p className="text-muted-foreground">
              No Instagram (ou em qualquer app), toque em <b>Compartilhar → Jarvis</b> e o link chega aqui e é transcrito sozinho.
            </p>

            {!token ? (
              <button type="button" onClick={() => void gerarChave()} className="rounded-md bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-violet-700">
                {configuradoEm ? "Gerar chave nova (para refazer o Atalho)" : "1. Gerar minha chave"}
              </button>
            ) : (
              <div className="space-y-1 rounded-md bg-muted/50 p-2">
                <p className="text-[10.5px] font-semibold text-violet-600 dark:text-violet-300">Copie agora: a chave não aparece de novo.</p>
                <Copiavel rotulo="Chave" valor={token} segredo />
              </div>
            )}

            <ol className="list-decimal space-y-1 pl-4">
              <li>No iPhone, abra o app <b>Atalhos</b> → <b>+</b> e dê o nome <b>Jarvis</b>.</li>
              <li>Toque no <b>ⓘ</b> (ou ⚙) e ligue <b>Mostrar na Folha de Compartilhamento</b>. Em tipos, deixe <b>URLs</b> e <b>Texto</b>.</li>
              <li>Adicione a ação <b>Obter Conteúdo de URL</b> e preencha:
                <div className="mt-1 space-y-1">
                  <Copiavel rotulo="URL" valor={URL_ATALHO} />
                  <div className="text-[10.5px] text-muted-foreground">Toque em <b>Mostrar Mais</b>: Método <b>POST</b>.</div>
                  <div className="text-[10.5px] text-muted-foreground">Cabeçalhos — adicione dois:</div>
                  <Copiavel rotulo="apikey" valor={CHAVE_PUBLICA} />
                  <Copiavel rotulo="Content-Type" valor="application/json" />
                  <div className="text-[10.5px] text-muted-foreground">Corpo da Requisição: <b>JSON</b>, com dois campos de <b>Texto</b>:</div>
                  <Copiavel rotulo="p_token" valor={token ?? "(a chave do passo 1)"} segredo={!!token} />
                  <div className="flex items-center gap-1.5">
                    <span className="w-20 shrink-0 text-[10.5px] text-muted-foreground">p_url</span>
                    <span className="text-[10.5px]">escolha a variável <b>Entrada do Atalho</b></span>
                  </div>
                </div>
              </li>
              <li>(Opcional) Adicione <b>Mostrar Notificação</b> com o texto “Enviado pro Jarvis”.</li>
              <li>Teste: no Instagram, abra um reel → <b>Compartilhar</b> → role a fileira de baixo até <b>Jarvis</b>. Ele aparece em “Recebidos do iPhone”.</li>
            </ol>
            <p className="text-[10.5px] text-muted-foreground">
              Se o Jarvis não aparecer no Compartilhar do Instagram, toque em <b>Compartilhar no…</b> (menu do iPhone) e escolha <b>Jarvis</b> lá.
              A chave só serve para mandar links pra sua fila — nada mais. Se vazar, gere uma nova.
            </p>
          </div>
        )}
      </div>
      <CreatorAtalhoClientes userId={userId} />
    </div>
  );
}
