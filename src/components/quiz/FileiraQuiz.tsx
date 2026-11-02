import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Send } from "lucide-react";
import { useRascunho } from "@/hooks/useRascunho";
import { laminasDoQuiz, type EstruturaQuiz } from "@/lib/quiz/quiz";
import { cn } from "@/lib/utils";
import { MolduraCelular } from "./MolduraCelular";
import { QuizPlayer } from "./QuizPlayer";

// Quiz em fileira (25/10, Davi: "em vez do quiz ser uma coisa só quero ver ele em fileira, e em cada lâmina
// conseguir alterar tanto manualmente quanto falando com o agente"). Cada tela num celular, lado a lado;
// o resultado vira uma tela por perfil. Embaixo de cada uma: o lápis edita só ela (texto e imagem no lugar)
// e o campo manda o pedido daquela tela para o chat com o agente.
// Cabeçalho (28) + celular (820: 800 de tela + moldura) + campo do pedido (56) + espaços.
const ALTURA_LAMINA = 28 + 8 + 820 + 8 + 56;

export function PedidoDaLamina({ chave, rotulo, numero, agente, onPedir }: {
  chave: string; rotulo: string; numero: number; agente: string; onPedir: (texto: string) => void;
}) {
  const [texto, setTexto] = useRascunho(chave);
  const mandar = () => {
    const t = texto.trim();
    if (!t) return;
    onPedir(`Na tela ${numero} (${rotulo}): ${t}`);
    setTexto("");
  };
  return (
    <form className="flex items-end gap-1" onSubmit={(e) => { e.preventDefault(); mandar(); }}>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder={`Pedir ajuste desta tela a ${agente}…`}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mandar(); } }}
        className="min-h-0 flex-1 resize-none rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
      <button type="submit" disabled={!texto.trim()} title="Mandar para o chat"
        className="rounded-md bg-primary p-2 text-primary-foreground disabled:opacity-40"><Send className="h-3.5 w-3.5" /></button>
    </form>
  );
}

export function FileiraQuiz({ quizId, titulo, estrutura, editarTudo, agente, onMudar, onImagem, onPedir }: {
  quizId: string; titulo: string; estrutura: EstruturaQuiz; editarTudo: boolean; agente: string;
  onMudar: (e: EstruturaQuiz) => void; onImagem: (arquivo: File) => Promise<string>; onPedir: (texto: string) => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  // Celular inteiro (25/10, Davi: "consiga ver o tamanho do celular de forma completa"): cada lâmina tem o
  // tamanho real (375 × 800 de tela) e encolhe por igual (zoom) até caber na altura do painel.
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(Math.min(1, Math.max(0.45, (el.clientHeight - 16) / ALTURA_LAMINA)));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const laminas = useMemo(() => laminasDoQuiz(estrutura), [estrutura]);

  return (
    <div ref={caixa} className="-mx-4 flex min-h-0 flex-1 items-start gap-5 overflow-x-auto overflow-y-hidden px-4 pb-3">
      {laminas.map((l, n) => {
        const editar = editarTudo || editando === l.chave;
        return (
          // transform em vez de zoom: no app do Mac (motor do Safari) o zoom encolhia o iframe duas vezes.
          <div key={l.chave} className="shrink-0" style={{ width: 395 * escala, height: ALTURA_LAMINA * escala }}>
          <div className="flex w-[395px] origin-top-left flex-col gap-2" style={{ height: ALTURA_LAMINA, transform: `scale(${escala})` }}>
            <div className="flex items-center gap-2 px-1 text-xs">
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 font-semibold tabular-nums">{n + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium" title={l.rotulo}>{l.rotulo}</span>
              <button type="button" onClick={() => setEditando(editando === l.chave ? null : l.chave)} disabled={editarTudo}
                title="Editar esta tela à mão: clique no texto ou na imagem"
                className={cn("flex items-center gap-1 rounded-md px-2 py-0.5", editar ? "bg-amber-500/20 font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                <Pencil className="h-3 w-3" />{editar ? "Editando" : "Editar"}
              </button>
            </div>
            <div className="flex h-[820px] flex-col">
              <MolduraCelular escuro={estrutura.tema === "escuro"}>
                <QuizPlayer titulo={titulo} estrutura={estrutura} teste telaCheia passoFixo={l.passo} perfilFixo={l.perfil}
                  editar={editar} onMudar={onMudar} onImagem={onImagem} />
              </MolduraCelular>
            </div>
            <PedidoDaLamina chave={`quiz-tela:${quizId}:${l.chave}`} rotulo={l.rotulo} numero={n + 1} agente={agente} onPedir={onPedir} />
          </div>
          </div>
        );
      })}
    </div>
  );
}
