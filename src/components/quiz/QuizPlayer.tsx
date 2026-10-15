import { useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calcularPerfil, corDoQuiz, type CampoCaptura, type EstruturaQuiz, type PerfilQuiz } from "@/lib/quiz/quiz";
import { cn } from "@/lib/utils";

// O quiz rodando: abertura → uma pergunta por tela → captura → resultado.
// Na página pública envia a resposta; no Infopro (teste) não grava nada.
export interface FimDoQuiz { escolhas: Record<string, number>; perfil: PerfilQuiz | null; contato: Partial<Record<CampoCaptura, string>> }

const ROTULO_CAMPO: Record<CampoCaptura, { rotulo: string; tipo: string; exemplo: string }> = {
  nome: { rotulo: "Seu nome", tipo: "text", exemplo: "Como você se chama?" },
  email: { rotulo: "Seu e-mail", tipo: "email", exemplo: "voce@email.com" },
  whatsapp: { rotulo: "Seu WhatsApp", tipo: "tel", exemplo: "(11) 99999-9999" },
};

export function QuizPlayer({ titulo, estrutura, onFim, teste }: {
  titulo: string; estrutura: EstruturaQuiz; onFim?: (r: FimDoQuiz) => Promise<void> | void; teste?: boolean;
}) {
  const cor = corDoQuiz(estrutura);
  const perguntas = estrutura.perguntas ?? [];
  const pedir = estrutura.captura?.ativa === false ? [] : (estrutura.captura?.pedir ?? []);
  const [etapa, setEtapa] = useState<number>(-1);   // -1 abertura · 0..n-1 perguntas · n captura · n+1 resultado
  const [escolhas, setEscolhas] = useState<Record<string, number>>({});
  const [contato, setContato] = useState<Partial<Record<CampoCaptura, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [perfil, setPerfil] = useState<PerfilQuiz | null>(null);
  const n = perguntas.length;

  const terminar = async (dados: Partial<Record<CampoCaptura, string>>) => {
    const p = calcularPerfil(estrutura, escolhas);
    setPerfil(p);
    setEnviando(true);
    try { await onFim?.({ escolhas, perfil: p, contato: dados }); } finally { setEnviando(false); }
    setEtapa(n + 1);
  };

  const escolher = (qid: string, k: number) => {
    setEscolhas((e) => ({ ...e, [qid]: k }));
    window.setTimeout(() => {
      if (etapa < n - 1) setEtapa(etapa + 1);
      else if (pedir.length) setEtapa(n);
      else void terminar({});
    }, 220);
  };

  const progresso = etapa < 0 ? 0 : Math.min(100, Math.round(((etapa + 1) / (n + (pedir.length ? 1 : 0))) * 100));
  const contatoOk = pedir.every((c) => (contato[c] ?? "").trim().length >= (c === "whatsapp" ? 8 : 2));

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {teste && <p className="rounded-md bg-amber-500/10 px-3 py-1.5 text-center text-xs text-amber-700 dark:text-amber-300">Modo teste: suas respostas não são gravadas.</p>}
      {etapa >= 0 && etapa <= n && (
        <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div className="h-full rounded-full transition-all" style={{ width: `${progresso}%`, background: cor }} />
        </div>
      )}

      {etapa === -1 && (
        <div className="space-y-4 py-6 text-center">
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{estrutura.intro?.titulo || titulo}</h1>
          {estrutura.intro?.subtitulo && <p className="text-base text-muted-foreground">{estrutura.intro.subtitulo}</p>}
          <Button size="lg" className="mt-2 text-white" style={{ background: cor }} onClick={() => setEtapa(0)}>
            {estrutura.intro?.botao || "Começar"}<ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-xs text-muted-foreground">{n} perguntas rápidas</p>
        </div>
      )}

      {etapa >= 0 && etapa < n && (() => {
        const q = perguntas[etapa];
        return (
          <div key={q.id} className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Pergunta {etapa + 1} de {n}</p>
            <h2 className="text-xl font-semibold leading-snug">{q.texto}</h2>
            <div className="space-y-2">
              {q.opcoes.map((o, k) => (
                <button key={k} type="button" onClick={() => escolher(q.id, k)}
                  className={cn("w-full rounded-xl border-2 px-4 py-3 text-left text-sm transition-colors hover:bg-muted", escolhas[q.id] === k && "text-white")}
                  style={escolhas[q.id] === k ? { background: cor, borderColor: cor } : undefined}>
                  {o.texto}
                </button>
              ))}
            </div>
            {etapa > 0 && (
              <button type="button" onClick={() => setEtapa(etapa - 1)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" />Voltar
              </button>
            )}
          </div>
        );
      })()}

      {etapa === n && pedir.length > 0 && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (contatoOk) void terminar(contato); }}>
          <h2 className="text-xl font-semibold leading-snug">{estrutura.captura?.titulo || "Para onde enviamos o seu resultado?"}</h2>
          {pedir.map((c) => (
            <label key={c} className="block space-y-1 text-sm">
              <span className="text-muted-foreground">{ROTULO_CAMPO[c].rotulo}</span>
              <Input type={ROTULO_CAMPO[c].tipo} value={contato[c] ?? ""} placeholder={ROTULO_CAMPO[c].exemplo}
                onChange={(e) => setContato({ ...contato, [c]: e.target.value })} />
            </label>
          ))}
          <Button type="submit" size="lg" className="w-full text-white" style={{ background: cor }} disabled={!contatoOk || enviando}>
            {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ver meu resultado
          </Button>
        </form>
      )}

      {etapa === n + 1 && (
        <div className="space-y-4 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seu resultado</p>
          <h2 className="text-2xl font-bold" style={{ color: cor }}>{perfil?.nome ?? "Obrigado!"}</h2>
          {perfil?.descricao && <p className="whitespace-pre-line text-left text-base leading-relaxed">{perfil.descricao}</p>}
          {perfil?.cta_texto && (
            perfil.cta_url
              ? <Button asChild size="lg" className="text-white" style={{ background: cor }}><a href={perfil.cta_url} target="_blank" rel="noreferrer">{perfil.cta_texto}</a></Button>
              : <Button size="lg" disabled>{perfil.cta_texto} (link ainda não definido)</Button>
          )}
          {teste && <Button variant="outline" size="sm" onClick={() => { setEtapa(-1); setEscolhas({}); setContato({}); setPerfil(null); }}>Testar de novo</Button>}
        </div>
      )}
    </div>
  );
}
