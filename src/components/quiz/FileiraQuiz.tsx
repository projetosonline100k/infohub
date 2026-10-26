import { useMemo, useState } from "react";
import { Pencil, Send } from "lucide-react";
import { useRascunho } from "@/hooks/useRascunho";
import { montarPassos, rotuloDoPasso, type EstruturaQuiz } from "@/lib/quiz/quiz";
import { cn } from "@/lib/utils";
import { MolduraCelular } from "./MolduraCelular";
import { QuizPlayer } from "./QuizPlayer";

// Quiz em fileira (25/10, Davi: "em vez do quiz ser uma coisa só quero ver ele em fileira, e em cada lâmina
// conseguir alterar tanto manualmente quanto falando com o agente"). Cada tela num celular, lado a lado;
// o resultado vira uma tela por perfil. Embaixo de cada uma: o lápis edita só ela (texto e imagem no lugar)
// e o campo manda o pedido daquela tela para o chat com o agente.
interface Lamina { chave: string; passo: number; perfil?: string; rotulo: string }

function PedidoDaLamina({ chave, rotulo, numero, agente, onPedir }: {
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
  const laminas = useMemo<Lamina[]>(() => {
    const pedir = estrutura.captura?.ativa === false ? [] : (estrutura.captura?.pedir ?? []);
    const passos = montarPassos(estrutura, pedir.length > 0);
    return passos.flatMap((p, i): Lamina[] => {
      if (p.tipo === "fim" && estrutura.perfis.length > 1) {
        return estrutura.perfis.map((pf) => ({ chave: `${i}:${pf.id}`, passo: i, perfil: pf.id, rotulo: `Resultado: ${pf.nome}` }));
      }
      return [{ chave: String(i), passo: i, rotulo: rotuloDoPasso(estrutura, p) }];
    });
  }, [estrutura]);

  return (
    <div className="-mx-4 flex gap-5 overflow-x-auto px-4 pb-3">
      {laminas.map((l, n) => {
        const editar = editarTudo || editando === l.chave;
        return (
          <div key={l.chave} className="flex w-[395px] shrink-0 flex-col gap-2">
            <div className="flex items-center gap-2 px-1 text-xs">
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 font-semibold tabular-nums">{n + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium" title={l.rotulo}>{l.rotulo}</span>
              <button type="button" onClick={() => setEditando(editando === l.chave ? null : l.chave)} disabled={editarTudo}
                title="Editar esta tela à mão: clique no texto ou na imagem"
                className={cn("flex items-center gap-1 rounded-md px-2 py-0.5", editar ? "bg-amber-500/20 font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                <Pencil className="h-3 w-3" />{editar ? "Editando" : "Editar"}
              </button>
            </div>
            <div className="flex h-[640px] flex-col">
              <MolduraCelular escuro={estrutura.tema === "escuro"}>
                <QuizPlayer titulo={titulo} estrutura={estrutura} teste telaCheia passoFixo={l.passo} perfilFixo={l.perfil}
                  editar={editar} onMudar={onMudar} onImagem={onImagem} />
              </MolduraCelular>
            </div>
            <PedidoDaLamina chave={`quiz-tela:${quizId}:${l.chave}`} rotulo={l.rotulo} numero={n + 1} agente={agente} onPedir={onPedir} />
          </div>
        );
      })}
    </div>
  );
}
