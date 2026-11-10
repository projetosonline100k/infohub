import { useCallback, useEffect, useRef, useState } from "react";
import { useRascunho } from "@/hooks/useRascunho";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, MessageCircle, Radio, Send, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useImagensChat } from "@/hooks/useImagensChat";
import { duracaoCurta, esperandoResposta, segundosEsperando, type MensagemBriefing } from "@/lib/empresa/briefing";
import { cn } from "@/lib/utils";
import { TextoMensagem } from "./BriefingTarefa";
import { CabecaBoneco } from "./BonecoMesa";
import { useAbaAtiva } from "@/lib/workspace/abaAtiva";
import { marcarConversaLida } from "@/lib/empresa/notificacoes";
import { ehCoordenador } from "@/lib/empresa/visaoGeral";
import { useMencaoDocumentos } from "./MencaoDocumentos";
import { useAuth } from "@/auth/AuthProvider";
import { ehAdmin } from "@/lib/admin";
import { confirmar } from "@/components/DialogosGlobais";

const db = supabase as unknown as SupabaseClient;   // participantes e membro_id ainda não estão nos tipos gerados
type Mensagem = MensagemBriefing & { membro_id?: string | null };
export interface PedidoAndamento { id: string; texto: string; quando: string; feito: boolean; resposta: { quem: string; texto: string; quando: string } | null }
export interface Andamento { esperando: boolean; fazendo: string | null; desde: string | null; quem: string; pedidos: PedidoAndamento[] }
interface Colega { id: string; nome: string; eh_ia: boolean }

// Chat sobre a entrega (pedido do Davi, 15/10): na tela "Ver e aprovar" ele
// conversa com quem entregou: elogia, reforça o que deve ficar, pergunta ou
// pede mudança. É um briefing 'revisando' ligado à tarefa; o ouvinte do Atlas
// responde como o funcionário, anota o reforço nos aprendizados e, se for
// mudança clara, atualiza o mesmo documento (onDocumentoMudou recarrega).
// Conversa em grupo (15/10): "Chamar" põe outro funcionário IA na conversa;
// cada um responde pela sua área e cada fala mostra quem disse.
// melhoriaId (16/10): a mesma conversa, sobre uma melhoria do kanban do Pedro (pendências).
export function ConversaEntrega({ clienteId, tarefaId, melhoriaId, membroId, nome, textoInicial, onDocumentoMudou, onEsperando, participantesIniciais, onEnviou, onAndamento, pedidoExterno }: {
  clienteId: string; tarefaId?: string; melhoriaId?: string; membroId: string; nome: string; textoInicial?: string; onDocumentoMudou: () => void;
  onEsperando?: (esperando: boolean) => void;
  /** Conversa em grupo desde o começo (ex.: chat da esteira com o trio, 17/10). */
  participantesIniciais?: string[];
  /** O Davi mandou uma mensagem (ex.: o carrossel aberto vira o "da vez" no chat do lote). */
  onEnviou?: () => void;
  /** 25/10 (aba "Em andamento" da revisão): o que estão fazendo agora e cada pedido do Davi, feito ou não. */
  onAndamento?: (a: Andamento) => void;
  /** Pedido mandado de fora do chat (ex.: o campo embaixo de cada tela na vista em fileira); envia ao mudar o id. */
  pedidoExterno?: { id: number; texto: string } | null;
}) {
  const sobre = melhoriaId ? { campo: "melhoria_id", id: melhoriaId } : { campo: "atividade_id", id: tarefaId ?? "" };
  // O que ele está fazendo agora (briefing.py agora): "lendo o documento", "reescrevendo as chamadas"…
  const [fazendo, setFazendo] = useState<string | null>(null);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [colegas, setColegas] = useState<Colega[]>([]);
  const [participantes, setParticipantes] = useState<string[]>([]);
  const [chamando, setChamando] = useState(false);
  const [texto, setTexto] = useRascunho(`entrega:${sobre.id}:${membroId}`);
  const fotos = useImagensChat();
  // Modo vivo (10/11, Davi): a conversa passa a ser atendida por um Claude no Mac dele (Chrome, comandos). Só o Davi liga.
  const { user } = useAuth();
  const podeVivo = ehAdmin(user?.email);
  const [vivo, setVivo] = useState(false);
  const mencao = useMencaoDocumentos(texto, setTexto);
  const [enviando, setEnviando] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const fimRef = useRef<HTMLDivElement>(null);
  const abaAtiva = useAbaAtiva();
  const abaAtivaRef = useRef(abaAtiva);
  abaAtivaRef.current = abaAtiva;
  const respostas = useRef(0);
  // Por ref: o pai passa uma função nova a cada render (18/10: com o quadro atualizando a cada 5 s,
  // o chat zerava e recarregava, e as mensagens piscavam).
  const aoMudarDocumento = useRef(onDocumentoMudou);
  aoMudarDocumento.current = onDocumentoMudou;

  const carregar = useCallback(async (id: string) => {
    const [{ data }, { data: b }] = await Promise.all([
      db.from("briefing_mensagens").select("id, papel, texto, status, criada_em, membro_id").eq("briefing_id", id).order("criada_em"),
      db.from("briefings").select("proposta, participantes, modo_vivo").eq("id", id).maybeSingle(),
    ]);
    setParticipantes(((b as { participantes?: string[] } | null)?.participantes) ?? []);
    setVivo(!!(b as { modo_vivo?: boolean } | null)?.modo_vivo);
    const agora = (b?.proposta as { agora?: string } | null)?.agora;
    setFazendo(typeof agora === "string" && agora.trim() ? agora.trim() : null);
    const lista = (data || []) as Mensagem[];
    const n = lista.filter((m) => m.papel === "funcionario").length;
    if (n > respostas.current && respostas.current > 0) aoMudarDocumento.current();   // a resposta pode ter vindo com nova versão
    respostas.current = n;
    setMensagens(lista);
    if (abaAtivaRef.current) marcarConversaLida(id);   // está na tela: conta como lida
  }, []);

  useEffect(() => {
    let vivo = true;
    setConversaId(null); setMensagens([]); respostas.current = 0;
    void db.from("briefings").select("id").eq(sobre.campo, sobre.id).eq("status", "revisando")
      .order("atualizado_em", { ascending: false }).limit(1).then(({ data }) => {
        if (!vivo || !data?.[0]) return;
        setConversaId(data[0].id);
        void carregar(data[0].id).then(() => { respostas.current = Math.max(respostas.current, 1); });
      });
    return () => { vivo = false; };
  }, [sobre.campo, sobre.id, carregar]);

  useEffect(() => {
    void supabase.from("membros").select("id, nome, eh_ia").eq("cliente_id", clienteId).eq("ativo", true).order("ordem")
      .then(({ data }) => setColegas((data || []) as Colega[]));
  }, [clienteId]);
  const nomeDe = (id?: string | null) => (id ? colegas.find((c) => c.id === id)?.nome : null) ?? nome;
  const emGrupo = participantes.length > 0;
  const paraChamar = colegas.filter((c) => c.eh_ia && !ehCoordenador(c) && c.id !== membroId && !participantes.includes(c.id));

  // Garante a conversa (briefing 'revisando' da tarefa) e devolve o id.
  const garantirConversa = async () => {
    if (conversaId) return conversaId;
    const id = crypto.randomUUID();
    const { error } = await db.from("briefings").insert({ id, cliente_id: clienteId, membro_id: membroId, [sobre.campo]: sobre.id, status: "revisando" });
    if (error) throw error;
    if (participantesIniciais?.length) {
      await db.from("briefings").update({ participantes: participantesIniciais }).eq("id", id);
      setParticipantes(participantesIniciais);
    }
    setConversaId(id);
    respostas.current = Math.max(respostas.current, 1);
    return id;
  };

  const alternarVivo = async () => {
    if (!vivo && !(await confirmar(
      `Ligar o modo vivo com ${nome}? As mensagens passam a ser atendidas por um Claude que roda NESTE Mac, ao vivo: ele pode usar o seu Chrome (com as suas contas abertas), rodar comandos e mexer em arquivos do projeto. Só as suas mensagens são obedecidas, e ele não publica nem envia nada sem você confirmar no chat. O Mac precisa estar ligado, com o ouvinte do Atlas rodando.`,
      { botao: "Ligar modo vivo" }))) return;
    try {
      const id = await garantirConversa();
      const { error } = await db.from("briefings").update({ modo_vivo: !vivo }).eq("id", id);
      if (error) throw error;
      setVivo(!vivo);
      toast.success(!vivo ? `${nome} está ao vivo no seu Mac` : "Modo vivo desligado: volta ao chat normal");
    } catch {
      toast.error("Não consegui mudar o modo vivo");
    }
  };

  const chamar = async (c: Colega) => {
    setChamando(false);
    try {
      const id = await garantirConversa();
      const novos = [...participantes, c.id];
      const { error } = await db.from("briefings").update({ participantes: novos }).eq("id", id);
      if (error) throw error;
      setParticipantes(novos);
      toast.success(`${c.nome} entrou na conversa: responde na próxima mensagem, pela área dele`);
    } catch {
      toast.error(`Não consegui chamar ${c.nome}`);
    }
  };

  // Texto que o Davi já tinha escrito na caixa de baixo vem pro chat.
  useEffect(() => { if (textoInicial) setTexto(textoInicial); }, [textoInicial, setTexto]);

  const esperando = esperandoResposta(mensagens);
  useEffect(() => { onEsperando?.(esperando); }, [esperando, onEsperando]);
  useEffect(() => () => onEsperando?.(false), [onEsperando]);
  useEffect(() => {
    if (!conversaId || !esperando) return;
    const t = window.setInterval(() => { setAgora(Date.now()); void carregar(conversaId); }, 3000);
    return () => window.clearInterval(t);
  }, [conversaId, esperando, carregar]);
  useEffect(() => { fimRef.current?.scrollIntoView({ block: "nearest" }); }, [mensagens.length, esperando]);

  const enviar = async (externo?: string) => {
    const valor = externo?.trim() || fotos.comImagens(mencao.comAnexos(texto.trim()));
    if (!valor || (!externo && (enviando || fotos.subindo))) return;
    setEnviando(true);
    try {
      const id = await garantirConversa();
      const { error } = await supabase.from("briefing_mensagens").insert({ briefing_id: id, cliente_id: clienteId, papel: "davi", texto: valor });
      if (error) throw error;
      onEnviou?.();
      if (!externo) { setTexto(""); fotos.limpar(); mencao.limpar(); }
      setAgora(Date.now());
      await carregar(id);
    } catch {
      toast.error("Não consegui mandar a mensagem");
    } finally {
      setEnviando(false);
    }
  };

  const esperou = segundosEsperando(mensagens, agora);

  const enviarRef = useRef(enviar);
  enviarRef.current = enviar;
  // Só pedidos novos: o que já estava ali quando o chat abriu (ex.: trocou de entrega) não é reenviado.
  const pedidoVisto = useRef(pedidoExterno?.id);
  useEffect(() => {
    if (!pedidoExterno?.texto || pedidoExterno.id === pedidoVisto.current) return;
    pedidoVisto.current = pedidoExterno.id;
    void enviarRef.current(pedidoExterno.texto);
  }, [pedidoExterno?.id, pedidoExterno?.texto]);

  const andamentoRef = useRef(onAndamento);
  andamentoRef.current = onAndamento;
  useEffect(() => {
    if (!andamentoRef.current) return;
    const pedidos: PedidoAndamento[] = [];
    mensagens.forEach((m, i) => {
      if (m.papel !== "davi") return;
      const r = mensagens.slice(i + 1).find((x) => x.papel !== "davi");
      pedidos.push({
        id: m.id, texto: m.texto, quando: m.criada_em, feito: !!r || m.status === "respondida",
        resposta: r ? { quem: nomeDe(r.membro_id), texto: r.texto, quando: r.criada_em } : null,
      });
    });
    const quem = emGrupo ? [nome, ...participantes.map((p) => nomeDe(p))].join(" + ") : nome;
    andamentoRef.current({ esperando, fazendo, desde: esperando ? mensagens[mensagens.length - 1]?.criada_em ?? null : null, quem, pedidos });
    // nomeDe muda junto com colegas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensagens, esperando, fazendo, colegas, participantes, nome]);
  // 'lida' = o ouvinte já pegou a mensagem: está trabalhando, não é ouvinte desligado.
  const pegou = mensagens[mensagens.length - 1]?.status === "lida";

  return (
    <div className="relative flex h-full min-h-0 flex-col rounded-lg border bg-card" {...fotos.props}>
      <fotos.Soltar />
      <div className="relative flex items-center gap-1.5 border-b px-3 py-2">
        <MessageCircle className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {emGrupo ? `${nome} + ${participantes.map((p) => nomeDe(p)).join(", ")}` : `Conversar com ${nome}`}
        </p>
        {(podeVivo || vivo) && (
          <button type="button" onClick={() => void (podeVivo ? alternarVivo() : undefined)} disabled={!podeVivo}
            title={vivo ? `${nome} está ao vivo no seu Mac (Chrome, comandos). Clique para desligar.` : `Ligar o modo vivo: ${nome} passa a responder ao vivo, no seu Mac, com Chrome e comandos`}
            className={cn("flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs", vivo ? "bg-emerald-500/15 font-semibold text-emerald-600 dark:text-emerald-300" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <Radio className={cn("h-3.5 w-3.5", vivo && "animate-pulse")} />{vivo ? "Ao vivo" : "Modo vivo"}
          </button>
        )}
        {paraChamar.length > 0 && (
          <button type="button" onClick={() => setChamando(!chamando)} title="Chamar alguém da equipe pra esta conversa"
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            <UserPlus className="h-3.5 w-3.5" />Chamar
          </button>
        )}
        {chamando && (
          <div className="absolute right-2 top-full z-20 mt-1 w-56 rounded-lg border bg-popover p-1 shadow-lg">
            <p className="px-2 py-1 text-[11px] text-muted-foreground">Quem entra na conversa?</p>
            {paraChamar.map((c) => (
              <button key={c.id} type="button" onClick={() => void chamar(c)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-sky-100 dark:bg-slate-700"><CabecaBoneco nome={c.nome} ehIa={c.eh_ia} className="h-full w-full" /></span>
                {c.nome}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {mensagens.length === 0 && (
          <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
            Converse como num chat: elogie o que gostou (ele guarda para manter nas próximas), pergunte, peça uma mudança ou que refaça. {nome} entende pela conversa e, se for mexer, você vê o documento mudando aqui do lado.
          </p>
        )}
        {mensagens.map((m) => (
          <div key={m.id} className={cn("flex items-end gap-1.5", m.papel === "davi" ? "justify-end" : "justify-start")}>
            {m.papel !== "davi" && emGrupo && (
              <span className="mb-1 h-6 w-6 shrink-0 overflow-hidden rounded-full bg-sky-100 dark:bg-slate-700" title={nomeDe(m.membro_id)}>
                <CabecaBoneco nome={nomeDe(m.membro_id)} ehIa className="h-full w-full" />
              </span>
            )}
            <div className={cn("max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
              m.papel === "davi" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted")}>
              {m.papel !== "davi" && emGrupo && <span className="mb-0.5 block text-[11px] font-semibold text-primary">{nomeDe(m.membro_id)}</span>}
              <TextoMensagem texto={m.texto} />
              <span className="mt-0.5 block text-right text-[10px] opacity-60">{format(new Date(m.criada_em), "HH:mm", { locale: ptBR })}</span>
            </div>
          </div>
        ))}
        {esperando && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {fazendo ? `${nome}: ${fazendo} · ${duracaoCurta(esperou)}`
              : esperou > 180 && !emGrupo && !pegou ? "Ninguém respondeu ainda. O ouvinte do Atlas está ligado neste Mac?"
              : `${emGrupo ? `${[...participantes.map((p) => nomeDe(p)), nome].join(", ")} lendo e respondendo, um de cada vez…` : `${nome} está lendo…`}${esperou >= 60 ? ` · ${duracaoCurta(esperou)}` : ""}`}
          </p>
        )}
        <div ref={fimRef} />
      </div>
      <fotos.Pendentes />
      <form className="relative flex items-end gap-1.5 border-t p-2"
        onSubmit={(e) => { e.preventDefault(); void enviar(); }} title="Cole (⌘V) ou arraste um print aqui">
        {mencao.lista}
        <Textarea ref={mencao.campoRef} value={texto} onChange={(e) => mencao.aoDigitar(e.target.value, e.target.selectionStart ?? e.target.value.length)} rows={2} className="min-h-0 text-sm"
          placeholder={emGrupo ? "Fale com o grupo… (@ para um documento)" : `Fale com ${nome}… (@ para um documento)`}
          onKeyDown={(e) => {
            if (mencao.tecla(e)) return;
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); }
          }} />
        <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={(!texto.trim() && !fotos.imagens.length) || enviando || fotos.subindo > 0}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
