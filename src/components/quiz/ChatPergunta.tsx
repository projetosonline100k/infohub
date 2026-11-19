import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Perguntas de sim ou não como conversa (19/11/2026, Davi: "bora fazer tipo um typebot: o Insta vai perguntando e a pessoa seleciona;
// quero que apareça que o Insta está perguntando"). O "Instalivros" digita (três pontinhos), manda a pergunta (com a imagem) e depois o
// "isso tem a ver com você?"; aí aparecem Não/Sim, a resposta vira balão da pessoa e a próxima pergunta chega logo abaixo.
// As perguntas anteriores do mesmo bloco ficam em cima como histórico (sem animar de novo).
export interface ItemChat { texto: string; imagem?: string; opcoes: [string, string] }
export interface HistoricoChat { texto: string; subtitulo?: string; miniatura?: string; resposta: string }

const reduzido = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Digitando({ escuro }: { escuro: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-2xl rounded-tl-md px-4 py-3", escuro ? "bg-white/10" : "bg-gray-100")} aria-label="Instalivros está digitando">
      {[0, 1, 2].map((i) => <span key={i} className={cn("h-2 w-2 rounded-full motion-safe:animate-bounce", escuro ? "bg-white/50" : "bg-gray-400")} style={{ animationDelay: `${i * 140}ms` }} />)}
    </span>
  );
}

export function ChatPergunta({ avatar, nome = "Instalivros", cor, escuro, historico, texto, subtitulo, imagem, imagemNota, aparencia, opcoes, marcada, aoEscolher, atraso = 650 }: {
  avatar?: string; nome?: string; cor: string; escuro: boolean; historico: HistoricoChat[];
  texto: string; subtitulo?: string; imagem?: string; imagemNota?: string; aparencia?: "livro" | "normal";
  opcoes: [string, string]; marcada?: number; aoEscolher: (k: 0 | 1) => void; atraso?: number;
}) {
  // mensagens que o Insta manda para esta pergunta, uma de cada vez
  const mensagens: { texto?: string; imagem?: string; nota?: string; forte?: boolean }[] = [];
  if (texto || imagem || imagemNota) mensagens.push({ texto, imagem, nota: imagem ? undefined : imagemNota, forte: true });
  if (subtitulo) mensagens.push({ texto: subtitulo });
  const [vistas, setVistas] = useState(() => (reduzido() ? mensagens.length : 0));
  const [escolhida, setEscolhida] = useState<0 | 1 | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const digitando = vistas < mensagens.length;
  const respondeu = escolhida !== null;

  useEffect(() => {
    if (!digitando) return;
    const id = window.setTimeout(() => setVistas((v) => v + 1), vistas === 0 ? 600 : atraso);
    return () => window.clearTimeout(id);
  }, [vistas, digitando, atraso]);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end", behavior: reduzido() ? "auto" : "smooth" }); }, [vistas, escolhida]);

  const balaoInsta = escuro ? "bg-white/10 text-white" : "bg-gray-100 text-neutral-900";
  const Avatar = ({ pequeno = false }: { pequeno?: boolean }) => (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-extrabold text-white", pequeno ? "h-7 w-7" : "h-10 w-10")} style={{ background: cor }}>
      {avatar ? <img src={avatar} alt="" draggable={false} className="h-full w-full object-cover object-top" /> : nome[0]}
    </span>
  );
  const marcadaFinal = escolhida ?? (marcada === 0 || marcada === 1 ? marcada : null);

  return (
    <div className="space-y-3">
      <div className={cn("flex items-center gap-2.5 rounded-2xl border px-3 py-2", escuro ? "border-white/10 bg-white/5" : "border-black/5 bg-white shadow-sm")}>
        <Avatar />
        <div className="min-w-0 leading-tight">
          <p className="flex items-center gap-1 text-sm font-extrabold">{nome}<BadgeCheck className="h-4 w-4 text-sky-500" aria-label="Conta verificada" /></p>
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{digitando ? "digitando…" : "online agora"}</p>
        </div>
      </div>

      <div className="space-y-2">
        {historico.map((h, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-end gap-2"><Avatar pequeno />
              <div className={cn("max-w-[82%] space-y-1 rounded-2xl rounded-tl-md px-3.5 py-2 text-[15px] font-semibold leading-snug", balaoInsta)}>
                {h.miniatura && <img src={h.miniatura} alt="" draggable={false} className="h-14 w-10 rounded object-cover" />}
                {h.texto && <p>{h.texto}</p>}{h.subtitulo && <p className="text-[13px] font-normal opacity-70">{h.subtitulo}</p>}
              </div>
            </div>
            <div className="flex justify-end"><span className="rounded-2xl rounded-br-md px-3.5 py-2 text-[15px] font-bold text-white" style={{ background: cor }}>{h.resposta}</span></div>
          </div>
        ))}

        {mensagens.slice(0, vistas).map((m, i) => (
          <div key={i} className="flex items-end gap-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
            {i === 0 ? <Avatar pequeno /> : <span className="w-7 shrink-0" />}
            <div className={cn("max-w-[82%] space-y-2 rounded-2xl px-3.5 py-2.5", i === 0 ? "rounded-tl-md" : "rounded-tl-md", balaoInsta)}>
              {m.imagem && <img src={m.imagem} alt="" draggable={false} className={cn("mx-auto rounded-xl object-cover", aparencia === "livro" ? "aspect-[2/3] h-[22dvh] max-h-[190px] shadow-md" : "max-h-[22dvh] w-full")} />}
              {m.nota && <p className="rounded-lg border border-dashed border-amber-500/60 px-2 py-3 text-center text-xs text-amber-600">{m.nota}</p>}
              {m.texto && <p className={cn("leading-snug", m.forte ? "text-[17px] font-bold" : "text-[15px] font-semibold")}>{m.texto}</p>}
            </div>
          </div>
        ))}
        {digitando && <div className="flex items-end gap-2"><Avatar pequeno /><Digitando escuro={escuro} /></div>}

        {respondeu && (
          <div className="flex justify-end motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
            <span className="rounded-2xl rounded-br-md px-3.5 py-2 text-[15px] font-bold text-white" style={{ background: cor }}>{opcoes[escolhida]}</span>
          </div>
        )}
      </div>

      {!digitando && !respondeu && (
        <div className="grid grid-cols-2 gap-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-300">
          {([0, 1] as const).map((k) => (
            <button key={k} type="button" onClick={() => { setEscolhida(k); aoEscolher(k); }}
              className={cn("flex items-center justify-center gap-2 rounded-full border-2 px-4 py-3 text-base font-bold transition active:scale-95",
                marcadaFinal === k ? "text-white" : escuro ? "border-white/20 bg-white/5" : "border-black/10 bg-white hover:border-black/30")}
              style={marcadaFinal === k ? { background: cor, borderColor: cor } : undefined}>
              {k === 0 ? <X className={cn("h-5 w-5", marcadaFinal === k ? "text-white" : "text-orange-500")} /> : <Check className={cn("h-5 w-5", marcadaFinal === k ? "text-white" : "text-green-600")} />}
              {opcoes[k]}
            </button>
          ))}
        </div>
      )}
      <div ref={fim} className="h-1" />
    </div>
  );
}
