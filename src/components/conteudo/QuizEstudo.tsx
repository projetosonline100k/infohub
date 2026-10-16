import { useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PerguntaEstudo } from "@/lib/conteudo/quizEstudo";

// Quiz de clicar no fim de cada estudo do Gabriel (16/10: "faltou o quiz"):
// verdadeiro ou falso, a resposta e o porquê aparecem na hora, e no fim a nota.
// As respostas ficam guardadas neste computador para ele refazer depois.
export function QuizEstudo({ estudoId, perguntas }: { estudoId: string; perguntas: PerguntaEstudo[] }) {
  const chave = `quiz-estudo:${estudoId}`;
  const [respostas, setRespostas] = useState<(boolean | null)[]>(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(chave) || "null");
      if (Array.isArray(salvo) && salvo.length === perguntas.length) return salvo;
    } catch { /* sem storage */ }
    return perguntas.map(() => null);
  });
  const gravar = (n: (boolean | null)[]) => {
    setRespostas(n);
    try { localStorage.setItem(chave, JSON.stringify(n)); } catch { /* sem storage */ }
  };
  const responder = (i: number, v: boolean) => { if (respostas[i] === null) gravar(respostas.map((r, j) => (j === i ? v : r))); };
  const feitas = respostas.filter((r) => r !== null).length;
  const acertos = respostas.filter((r, i) => r !== null && r === perguntas[i].resposta).length;
  const terminou = feitas === perguntas.length;

  return (
    <section className="mt-6 space-y-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Teste: verdadeiro ou falso</h2>
        <span className="text-xs text-muted-foreground">{terminou ? `${acertos} de ${perguntas.length} certas` : `${feitas}/${perguntas.length}`}</span>
      </div>
      <p className="text-sm text-muted-foreground">Responda sem voltar no texto: tentar lembrar é o que fixa.</p>
      <ol className="space-y-3">
        {perguntas.map((p, i) => {
          const r = respostas[i];
          const certo = r !== null && r === p.resposta;
          return (
            <li key={i} className={cn("rounded-lg border bg-card p-3 text-sm", r !== null && (certo ? "border-emerald-500/50" : "border-rose-500/50"))}>
              <p className="font-medium leading-snug">{i + 1}. {p.pergunta}</p>
              <div className="mt-2 flex gap-2">
                {[true, false].map((v) => (
                  <Button key={String(v)} type="button" size="sm" disabled={r !== null}
                    variant={r === v ? (certo ? "default" : "destructive") : "outline"}
                    className={cn("h-8 min-w-[110px]", r !== null && p.resposta === v && r !== v && "border-emerald-500 text-emerald-700 dark:text-emerald-300")}
                    onClick={() => responder(i, v)}>
                    {v ? "Verdadeiro" : "Falso"}
                  </Button>
                ))}
              </div>
              {r !== null && (
                <p className={cn("mt-2 flex gap-1.5 text-[13px] leading-relaxed", certo ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>
                  {certo ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span><b>{certo ? "Acertou." : `Errou: é ${p.resposta ? "verdadeiro" : "falso"}.`}</b> {p.porque}</span>
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {terminou && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
          <span>{acertos === perguntas.length ? "Gabaritou! 🎯" : "Volte daqui a 3 dias e responda de novo: espaçar também fixa."}</span>
          <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => gravar(perguntas.map(() => null))}>
            <RotateCcw className="h-3.5 w-3.5" />Refazer
          </Button>
        </div>
      )}
    </section>
  );
}
