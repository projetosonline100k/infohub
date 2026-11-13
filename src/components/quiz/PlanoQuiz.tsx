import type { ReactNode } from "react";
import { Headphones, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROTULO_TEMA, rotuloDoDia, tituloBonito, type PlanoMontado, type RazaoDoPerfil, type Tema } from "@/lib/quiz/plano";
import type { PerfilQuiz } from "@/lib/quiz/quiz";

// Telas "perfil" e "plano_livros" do quiz (13/11/2026, Davi: "com base nas suas respostas, seu perfil é esse, e o porquê; os livros que mais combinam e um plano:
// amanhã ela já escuta X, dia 2 Y…; o restante fica oculto e ela vai vendo ao avançar até a oferta"). Só visual: quem escolhe os livros é src/lib/quiz/plano.ts.

const curto = (t: string, n = 78) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** "Com base nas suas respostas, seu perfil é X, porque…" */
export function PerfilTela({ perfil, razoes, titulo, botao, cor, escuro, suave }: {
  perfil: PerfilQuiz | null; razoes: RazaoDoPerfil[]; titulo: ReactNode; botao: ReactNode; cor: string; escuro: boolean; suave: string;
}) {
  return (
    <div className="space-y-5 py-2 text-center">
      <div className="text-sm font-semibold">{titulo}</div>
      <div className="mx-auto flex max-w-sm flex-col items-center gap-2 rounded-3xl border-2 px-5 py-6 shadow-lg" style={{ borderColor: cor, background: escuro ? "rgba(255,255,255,.05)" : `${cor}0f` }}>
        <span className="text-6xl leading-none drop-shadow">{perfil?.emoji ?? "📚"}</span>
        <h2 className="text-3xl font-extrabold leading-tight tracking-tight" style={{ color: escuro ? undefined : cor }}>{perfil?.nome ?? "Leitor"}</h2>
        {perfil?.frase && <p className={cn("text-base font-medium", suave)}>{perfil.frase}</p>}
      </div>
      {perfil?.descricao && <p className="mx-auto max-w-sm text-left text-[15px] leading-relaxed">{perfil.descricao.split("\n")[0]}</p>}
      {razoes.length > 0 && (
        <div className="mx-auto max-w-sm space-y-2 text-left">
          <p className={cn("text-xs font-bold uppercase tracking-wider", suave)}>Por que é este o seu perfil</p>
          {razoes.map((r, i) => (
            <div key={i} className={cn("flex items-start gap-3 rounded-2xl border px-3.5 py-3", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white")}>
              <span className="text-2xl leading-none">{r.emoji ?? "✅"}</span>
              <span className="min-w-0 flex-1 text-sm leading-snug"><span className={suave}>{curto(r.pergunta)}</span><br /><b>{r.resposta}</b></span>
            </div>
          ))}
        </div>
      )}
      <div className="sticky bottom-3 z-10 pt-1 text-left">{botao}</div>
    </div>
  );
}

/** Os livros escolhidos, os 5 primeiros dias e o resto escondido. */
export function PlanoLivrosTela({ plano, carregando, areas, titulo, botao, cor, escuro, suave }: {
  plano: PlanoMontado | null; carregando: boolean; areas: string[]; titulo: ReactNode; botao: ReactNode; cor: string; escuro: boolean; suave: string;
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1 text-center">
        <div className="text-2xl font-extrabold leading-snug">{titulo}</div>
        {areas.length > 0 && <p className={cn("text-sm", suave)}>Escolhidos a dedo para quem quer evoluir em <b>{areas.join(", ")}</b></p>}
      </div>
      {carregando || !plano ? (
        <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className={cn("h-24 animate-pulse rounded-2xl", escuro ? "bg-white/10" : "bg-gray-200")} />)}</div>
      ) : (
        <ol className="space-y-2.5">
          {plano.dias.map((d) => (
            <li key={d.livro.id} className={cn("flex items-center gap-3 rounded-2xl border p-2.5 shadow-sm", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white")}>
              <img src={d.livro.capa} alt="" loading="lazy" draggable={false} className="h-[84px] w-[58px] shrink-0 rounded-lg object-cover shadow-md" />
              <div className="min-w-0 flex-1 space-y-1">
                <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: cor }}>{rotuloDoDia(d.dia)}</span>
                <p className="line-clamp-2 text-[15px] font-bold leading-tight">{tituloBonito(d.livro.titulo)}</p>
                <p className={cn("truncate text-xs", suave)}>{d.livro.autor}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 font-semibold"><Headphones className="h-3 w-3" />{d.livro.audio} min</span>
                  {d.tema && <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: `${cor}1f`, color: escuro ? undefined : cor }}>{ROTULO_TEMA[d.tema as Tema] ?? d.tema}</span>}
                </div>
              </div>
            </li>
          ))}
          {plano.ocultos > 0 && (
            <li className={cn("relative overflow-hidden rounded-2xl border p-3", escuro ? "border-white/15 bg-white/5" : "border-gray-200 bg-white")}>
              <div className="pointer-events-none select-none space-y-2 blur-[5px]" aria-hidden>
                {[6, 7, 8].map((n) => (
                  <div key={n} className="flex items-center gap-3 opacity-70">
                    <span className="h-[60px] w-[42px] shrink-0 rounded-lg bg-gray-300" />
                    <div className="flex-1 space-y-1.5"><span className="block h-3 w-16 rounded-full" style={{ background: cor }} /><span className="block h-3.5 w-4/5 rounded bg-gray-400" /><span className="block h-3 w-1/2 rounded bg-gray-300" /></div>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/55 px-4 text-center backdrop-blur-[1px]">
                <span className="flex h-10 w-10 items-center justify-center rounded-full text-white shadow-md" style={{ background: cor }}><Lock className="h-5 w-5" /></span>
                <p className="text-sm font-extrabold text-gray-900">Mais {plano.ocultos} livros no seu plano de {plano.total} dias</p>
                <p className="text-xs text-gray-600">Você libera tudo ao ativar o seu plano</p>
              </div>
            </li>
          )}
        </ol>
      )}
      {plano && plano.dias.length > 0 && <p className={cn("flex items-center justify-center gap-1.5 text-center text-xs", suave)}><Sparkles className="h-3.5 w-3.5" />Plano montado com as suas respostas</p>}
      <div className="sticky bottom-3 z-10 pt-1">{botao}</div>
    </div>
  );
}
