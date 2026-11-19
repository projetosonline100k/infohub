import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Perguntas como conversa (19/11/2026, Davi: "bora fazer tipo um typebot: o Insta vai perguntando e a pessoa seleciona").
// O "Instalivros" digita (três pontinhos), manda a pergunta (com a imagem) e a pessoa responde em balão. O mesmo componente fica na tela
// durante todas as perguntas seguidas (a `chave` muda, o elemento não), então a conversa só cresce para baixo, sem recarregar nem pular.
export interface OpcaoChat { texto: string; imagem?: string }
export interface HistoricoChat { texto: string; subtitulo?: string; imagem?: string; aparencia?: "livro" | "normal"; resposta: string; respostaImagem?: string }
type Msg = { texto?: string; imagem?: string; nota?: string; forte?: boolean };

const reduzido = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Avatar({ avatar, nome, cor, pequeno = false }: { avatar?: string; nome: string; cor: string; pequeno?: boolean }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-extrabold text-white", pequeno ? "h-7 w-7" : "h-10 w-10")} style={{ background: cor }}>
      {avatar ? <img src={avatar} alt="" draggable={false} className="h-full w-full object-cover object-top" /> : nome[0]}
    </span>
  );
}

function Digitando({ escuro }: { escuro: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-2xl rounded-tl-md px-4 py-3", escuro ? "bg-white/10" : "bg-gray-100")} aria-label="Instalivros está digitando">
      {[0, 1, 2].map((i) => <span key={i} className={cn("h-2 w-2 rounded-full motion-safe:animate-bounce", escuro ? "bg-white/50" : "bg-gray-400")} style={{ animationDelay: `${i * 140}ms` }} />)}
    </span>
  );
}

function Cabecalho({ avatar, nome, cor, escuro, digitando }: { avatar?: string; nome: string; cor: string; escuro: boolean; digitando: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 rounded-2xl border px-3 py-2", escuro ? "border-white/10 bg-white/5" : "border-black/5 bg-white shadow-sm")}>
      <Avatar avatar={avatar} nome={nome} cor={cor} />
      <div className="min-w-0 leading-tight">
        <p className="flex items-center gap-1 text-sm font-extrabold">{nome}<BadgeCheck className="h-4 w-4 text-sky-500" aria-label="Conta verificada" /></p>
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{digitando ? "digitando…" : "online agora"}</p>
      </div>
    </div>
  );
}

function Balao({ m, i, aparencia, escuro, avatar, nome, cor, animar }: { m: Msg; i: number; aparencia?: "livro" | "normal"; escuro: boolean; avatar?: string; nome: string; cor: string; animar: boolean }) {
  const balaoInsta = escuro ? "bg-white/10 text-white" : "bg-gray-100 text-neutral-900";
  return (
    <div className={cn("flex items-end gap-2", animar && "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300")}>
      {i === 0 ? <Avatar avatar={avatar} nome={nome} cor={cor} pequeno /> : <span className="w-7 shrink-0" />}
      <div className={cn("max-w-[82%] space-y-2 rounded-2xl rounded-tl-md px-3.5 py-2.5", balaoInsta)}>
        {m.imagem && <img src={m.imagem} alt="" draggable={false} className={cn("mx-auto rounded-xl object-cover", aparencia === "livro" ? "aspect-[2/3] h-[22dvh] max-h-[190px] shadow-md" : "max-h-[22dvh] w-full")} />}
        {m.nota && <p className="rounded-lg border border-dashed border-amber-500/60 px-2 py-3 text-center text-xs text-amber-600">{m.nota}</p>}
        {m.texto && <p className={cn("leading-snug", m.forte ? "text-[17px] font-bold" : "text-[15px] font-semibold")}>{m.texto}</p>}
      </div>
    </div>
  );
}

function Resposta({ texto, imagem, cor, animar }: OpcaoChat & { cor: string; animar: boolean }) {
  return (
    <div className={cn("flex justify-end", animar && "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300")}>
      <span className="flex flex-col items-end gap-1.5 rounded-2xl rounded-br-md px-3.5 py-2 text-[15px] font-bold text-white" style={{ background: cor }}>
        {imagem && <img src={imagem} alt="" draggable={false} className="h-20 w-28 rounded-lg object-cover" />}{texto}
      </span>
    </div>
  );
}

const mensagensDe = (texto: string, imagem?: string, nota?: string, subtitulo?: string): Msg[] => {
  const m: Msg[] = [];
  if (texto || imagem || nota) m.push({ texto, imagem, nota: imagem ? undefined : nota, forte: true });
  if (subtitulo) m.push({ texto: subtitulo });
  return m;
};

export function ChatPergunta({ chave, avatar, nome = "Instalivros", cor, escuro, historico, texto, subtitulo, imagem, imagemNota, aparencia, opcoes, simNao = false, marcada, aoEscolher, atraso = 650 }: {
  /** Identifica a pergunta atual; muda de uma pergunta para a outra SEM remontar o componente (a conversa não pisca). */
  chave: string;
  avatar?: string; nome?: string; cor: string; escuro: boolean; historico: HistoricoChat[];
  texto: string; subtitulo?: string; imagem?: string; imagemNota?: string; aparencia?: "livro" | "normal";
  opcoes: OpcaoChat[]; simNao?: boolean; marcada?: number; aoEscolher: (k: number) => void; atraso?: number;
}) {
  const mensagens = mensagensDe(texto, imagem, imagemNota, subtitulo);
  // estado por pergunta: quando a chave muda, começa do zero sem passar por um quadro com o estado da pergunta anterior
  const novo = (): { chave: string; vistas: number; escolhida: number | null } => ({ chave, vistas: reduzido() ? mensagens.length : 0, escolhida: null });
  const [est, setEst] = useState(novo);
  const atual = est.chave === chave ? est : novo();
  const { vistas, escolhida } = atual;
  const mudar = (p: Partial<typeof est>) => setEst((e) => ({ ...(e.chave === chave ? e : novo()), ...p }));
  const fim = useRef<HTMLDivElement>(null);
  const digitando = vistas < mensagens.length;
  const respondeu = escolhida !== null;

  useEffect(() => {
    if (!digitando) return;
    const id = window.setTimeout(() => mudar({ vistas: vistas + 1 }), vistas === 0 ? 600 : atraso);
    return () => window.clearTimeout(id);
  }, [chave, vistas, digitando, atraso]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fim.current?.scrollIntoView({ block: "end", behavior: reduzido() ? "auto" : "smooth" }); }, [chave, vistas, escolhida]);

  const marcadaFinal = escolhida ?? (marcada !== undefined && marcada >= 0 && marcada < opcoes.length ? marcada : null);

  return (
    <div className="space-y-3">
      <Cabecalho avatar={avatar} nome={nome} cor={cor} escuro={escuro} digitando={digitando} />
      <div className="space-y-2">
        {historico.map((h, hi) => (
          <div key={hi} className="space-y-2">
            {mensagensDe(h.texto, h.imagem, undefined, h.subtitulo).map((m, i) => <Balao key={i} m={m} i={i} aparencia={h.aparencia} escuro={escuro} avatar={avatar} nome={nome} cor={cor} animar={false} />)}
            <Resposta texto={h.resposta} imagem={h.respostaImagem} cor={cor} animar={false} />
          </div>
        ))}
        {mensagens.slice(0, vistas).map((m, i) => <Balao key={`${chave}-${i}`} m={m} i={i} aparencia={aparencia} escuro={escuro} avatar={avatar} nome={nome} cor={cor} animar />)}
        {digitando && <div className="flex items-end gap-2"><Avatar avatar={avatar} nome={nome} cor={cor} pequeno /><Digitando escuro={escuro} /></div>}
        {respondeu && <Resposta texto={opcoes[escolhida].texto} imagem={opcoes[escolhida].imagem} cor={cor} animar />}
      </div>

      {!digitando && !respondeu && (
        <div className={cn("grid gap-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300", opcoes.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {opcoes.map((o, k) => {
            const marcadaEsta = marcadaFinal === k;
            return (
              <button key={k} type="button" onClick={() => { mudar({ escolhida: k }); aoEscolher(k); }}
                className={cn("flex items-center justify-center gap-2 border-2 font-bold transition active:scale-95",
                  o.imagem ? "flex-col rounded-2xl p-2 text-sm" : "rounded-full px-4 py-3 text-base",
                  marcadaEsta ? "text-white" : escuro ? "border-white/20 bg-white/5" : "border-black/10 bg-white hover:border-black/30")}
                style={marcadaEsta ? { background: cor, borderColor: cor } : undefined}>
                {o.imagem && <img src={o.imagem} alt="" draggable={false} className="h-28 w-full rounded-xl object-cover" />}
                {simNao && (k === 0 ? <X className={cn("h-5 w-5", marcadaEsta ? "text-white" : "text-orange-500")} /> : <Check className={cn("h-5 w-5", marcadaEsta ? "text-white" : "text-green-600")} />)}
                <span className="leading-tight">{o.texto}</span>
              </button>
            );
          })}
        </div>
      )}
      <div ref={fim} className="h-1" />
    </div>
  );
}

/** Mensagens do Instalivros sem pergunta (ex.: a prévia do perfil): ele digita uma de cada vez e, no fim, aparece o botão. */
export function ChatMensagens({ avatar, nome = "Instalivros", cor, escuro, mensagens, botao, aoContinuar, atraso = 1100 }: {
  avatar?: string; nome?: string; cor: string; escuro: boolean; mensagens: string[]; botao: string; aoContinuar: () => void; atraso?: number;
}) {
  const [vistas, setVistas] = useState(() => (reduzido() ? mensagens.length : 0));
  const fim = useRef<HTMLDivElement>(null);
  const digitando = vistas < mensagens.length;
  useEffect(() => {
    if (!digitando) return;
    const id = window.setTimeout(() => setVistas((v) => v + 1), vistas === 0 ? 700 : atraso);
    return () => window.clearTimeout(id);
  }, [vistas, digitando, atraso]);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end", behavior: reduzido() ? "auto" : "smooth" }); }, [vistas]);
  return (
    <div className="space-y-3">
      <Cabecalho avatar={avatar} nome={nome} cor={cor} escuro={escuro} digitando={digitando} />
      <div className="space-y-2">
        {mensagens.slice(0, vistas).map((t, i) => <Balao key={i} m={{ texto: t, forte: i === 1 }} i={i} escuro={escuro} avatar={avatar} nome={nome} cor={cor} animar />)}
        {digitando && <div className="flex items-end gap-2"><Avatar avatar={avatar} nome={nome} cor={cor} pequeno /><Digitando escuro={escuro} /></div>}
      </div>
      {!digitando && (
        <button type="button" onClick={aoContinuar} className="flex w-full items-center justify-center rounded-2xl px-6 py-4 text-base font-bold text-white shadow-lg transition active:scale-95 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
          style={{ background: cor, boxShadow: `0 8px 24px -8px ${cor}` }}>{botao}</button>
      )}
      <div ref={fim} className="h-1" />
    </div>
  );
}
