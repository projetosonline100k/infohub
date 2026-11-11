import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type QuizResumo } from "@/lib/quiz/quiz";
import { PainelQuiz } from "./PainelQuiz";

// Métricas do quiz (pedido do Davi, 15/10; painel novo em 11/11): quantos abriram, começaram, terminaram (viraram lead)
// e clicaram na oferta; o funil tela a tela, as visitas por dia, os leads e as respostas. Vem de quiz_eventos (registrado
// pelo link público, sem dado pessoal) + quiz_respostas. Os números ficam em PainelQuiz.

export function QuizMetricas({ quiz, respostas, onFechar }: {
  quiz: QuizResumo | null; respostas?: { perfil: string | null }[]; onFechar: () => void;
}) {
  return (
    <Dialog open={!!quiz} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="max-h-[94vh] w-[96vw] max-w-[1200px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Métricas · {quiz?.titulo}</DialogTitle>
          <DialogDescription>Contadas desde que o link passou a registrar (15/10). Cada aba aberta conta como uma visita.</DialogDescription>
        </DialogHeader>
        {quiz && <MetricasDoQuiz quiz={quiz} />}
      </DialogContent>
    </Dialog>
  );
}

/** O painel do quiz (11/11/2026): métricas, leads, respostas, funil e configurações. Funciona antes de publicar (zerado). */
export function MetricasDoQuiz({ quiz }: { quiz: Pick<QuizResumo, "id" | "titulo" | "slug" | "status" | "estrutura"> }) {
  return <PainelQuiz quiz={quiz} />;
}
