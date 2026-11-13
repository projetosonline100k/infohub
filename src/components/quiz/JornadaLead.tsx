import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Clock, Flag, MousePointerClick, PauseCircle, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { duracaoCurta, jornadaDoLead, type PassoJornada } from "@/lib/quiz/jornada";
import type { EventoQuiz, LeadQuiz, PassoInfo } from "@/lib/quiz/painel";

// Jornada do lead no quiz (13/11/2026, Davi: "quando eu clicar na pessoa, queria ver o fluxo dela, onde ela parou, avançou, porque desse jeito está pouco visual").
// Em cima: o resumo e uma trilha com uma barrinha por tela (acesa = viu, apagada = não chegou). Embaixo: o passo a passo, com a resposta e o tempo em cada tela.
const COR: Record<PassoInfo["tipo"], { ponto: string; barra: string; nome: string }> = {
  intro: { ponto: "bg-cyan-400", barra: "bg-cyan-400/70", nome: "Abertura" },
  pergunta: { ponto: "bg-violet-400", barra: "bg-violet-400/70", nome: "Pergunta" },
  tela: { ponto: "bg-sky-400", barra: "bg-sky-400/70", nome: "Tela" },
  captura: { ponto: "bg-amber-400", barra: "bg-amber-400/70", nome: "Contato" },
  fim: { ponto: "bg-emerald-400", barra: "bg-emerald-400/70", nome: "Resultado" },
  nome: { ponto: "bg-pink-400", barra: "bg-pink-400/70", nome: "Nome" },
};
const quando = (iso: string | null) => (iso ? format(new Date(iso), "d MMM HH:mm:ss", { locale: ptBR }) : "—");

export function JornadaLead({ lead, eventos, passos }: { lead: LeadQuiz; eventos: EventoQuiz[]; passos: PassoInfo[] }) {
  const j = useMemo(() => jornadaDoLead(lead, eventos, passos), [lead, eventos, passos]);
  if (!passos.length) return null;
  const vistos = j.passos.filter((p) => p.alcancou);
  const naoVistos = j.passos.filter((p) => !p.alcancou);
  const maxSeg = Math.max(1, ...vistos.map((p) => p.segundos ?? 0));
  const ultimo = j.ultimoPasso >= 0 ? j.passos[j.ultimoPasso] : null;
  const acabou = j.ultimoPasso >= passos.length - 1;
  const paradoRotulo = ultimo ? ultimo.rotulo : "antes de começar";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/80">Entrou {j.entrouEm ? quando(j.entrouEm) : format(new Date(lead.criada_em), "d MMM HH:mm", { locale: ptBR })}</span>
        {j.duracaoSeg != null && <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-white/80"><Timer className="h-3 w-3" />{duracaoCurta(j.duracaoSeg)} no quiz</span>}
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/80">Viu {vistos.length} de {passos.length} telas</span>
        {j.terminou && <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-300"><CheckCircle2 className="h-3 w-3" />Terminou o quiz</span>}
        {j.clicouOferta ? <span className="flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-2.5 py-1 font-semibold text-fuchsia-200"><MousePointerClick className="h-3 w-3" />Clicou na oferta</span>
          : <span className="rounded-full bg-white/5 px-2.5 py-1 text-white/45">Não clicou na oferta</span>}
        {!acabou && <span className="flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-1 font-semibold text-rose-300"><PauseCircle className="h-3 w-3" />Parou em: {paradoRotulo}</span>}
        {!j.temEventos && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-200">Lead antigo: sem registro de tempo, só as respostas</span>}
      </div>

      <div>
        <div className="flex flex-wrap gap-[3px]" role="img" aria-label="Trilha das telas que a pessoa viu">
          {j.passos.map((p) => (
            <span key={p.indice} title={`${p.indice + 1}. ${p.rotulo}${p.alcancou ? "" : " (não chegou)"}${p.resposta ? ` → ${p.resposta}` : ""}${p.segundos != null ? ` · ${duracaoCurta(p.segundos)}` : ""}`}
              className={cn("h-5 w-2.5 rounded-sm", p.alcancou ? COR[p.tipo].barra : "bg-white/10", p.indice === j.ultimoPasso && "ring-2 ring-rose-400 ring-offset-1 ring-offset-[#0d1620]", p.indice === j.maisLenta && "outline outline-1 outline-amber-300")} />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/45">
          {(Object.keys(COR) as PassoInfo["tipo"][]).map((t) => <span key={t} className="flex items-center gap-1"><span className={cn("h-2 w-2 rounded-sm", COR[t].ponto)} />{COR[t].nome}</span>)}
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-white/10" />Não chegou</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm ring-2 ring-rose-400" />Última tela</span>
          {j.maisLenta != null && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm outline outline-1 outline-amber-300" />Onde mais demorou</span>}
        </div>
      </div>

      <ol className="max-h-[420px] space-y-0 overflow-y-auto pr-1">
        {vistos.map((p, k) => <Linha key={p.indice} p={p} maxSeg={maxSeg} ultima={p.indice === j.ultimoPasso && !acabou} lenta={p.indice === j.maisLenta} fim={k === vistos.length - 1 && naoVistos.length === 0} />)}
        {naoVistos.length > 0 && (
          <li className="flex gap-3 pt-1 text-xs text-white/40">
            <span className="mt-1 flex w-4 justify-center"><Flag className="h-3.5 w-3.5 text-rose-400" /></span>
            <span><b className="text-rose-300">Saiu aqui.</b> Faltaram {naoVistos.length} tela{naoVistos.length === 1 ? "" : "s"}: {naoVistos.slice(0, 4).map((p) => p.rotulo).join(" → ")}{naoVistos.length > 4 ? "…" : ""}</span>
          </li>)}
      </ol>
    </div>
  );
}

function Linha({ p, maxSeg, ultima, lenta, fim }: { p: PassoJornada; maxSeg: number; ultima: boolean; lenta: boolean; fim: boolean }) {
  const c = COR[p.tipo];
  return (
    <li className="flex gap-3">
      <span className="relative flex w-4 shrink-0 justify-center">
        {!fim && <span className="absolute bottom-[-2px] top-3 w-px bg-white/15" />}
        <span className={cn("relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full", c.ponto, ultima && "ring-2 ring-rose-400 ring-offset-1 ring-offset-[#0d1620]")} />
      </span>
      <div className="min-w-0 flex-1 pb-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="text-white/35">{p.indice + 1}</span>
          <span className={cn("font-medium", p.tipo === "pergunta" ? "text-white/80" : "text-white/60")}>{p.pergunta || p.rotulo}</span>
          {p.resposta != null && <span className="font-bold text-white">→ {p.resposta}</span>}
          {ultima && <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">Parou aqui</span>}
          {lenta && <span className="flex items-center gap-0.5 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200"><Clock className="h-2.5 w-2.5" />Demorou mais</span>}
        </div>
        {p.segundos != null && (
          <div className="mt-1 flex items-center gap-2"><span className="h-1 rounded-full bg-white/15"><span className={cn("block h-1 rounded-full", c.ponto)} style={{ width: `${Math.max(4, Math.round((p.segundos / maxSeg) * 100))}px` }} /></span>
            <span className="text-[10px] text-white/45">{duracaoCurta(p.segundos)}{p.em ? ` · ${format(new Date(p.em), "HH:mm:ss")}` : ""}</span></div>)}
      </div>
    </li>
  );
}
