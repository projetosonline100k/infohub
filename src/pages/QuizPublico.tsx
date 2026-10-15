import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { QuizPlayer } from "@/components/quiz/QuizPlayer";
import type { EstruturaQuiz } from "@/lib/quiz/quiz";

// /quiz/:slug — o quiz publicado, aberto pra qualquer pessoa (sem login).
// Lê pelo RPC quiz_publico e grava a resposta pelo responder_quiz.
export default function QuizPublico() {
  const { slug = "" } = useParams();
  const [quiz, setQuiz] = useState<{ titulo: string; estrutura: EstruturaQuiz } | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    void supabase.rpc("quiz_publico" as never, { p_slug: slug } as never).then(({ data }) => {
      const q = data as { titulo: string; estrutura: EstruturaQuiz } | null;
      setQuiz(q && q.estrutura ? q : null);
      setCarregando(false);
      if (q?.titulo) document.title = q.titulo;
    });
  }, [slug]);

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-14">
      {carregando ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !quiz ? (
        <p className="py-20 text-center text-muted-foreground">Este quiz não está disponível.</p>
      ) : (
        <QuizPlayer titulo={quiz.titulo} estrutura={quiz.estrutura} onFim={async ({ escolhas, perfil, contato }) => {
          const respostas = quiz.estrutura.perguntas.map((q) => ({ pergunta: q.texto, resposta: q.opcoes[escolhas[q.id]]?.texto ?? null }));
          await supabase.rpc("responder_quiz" as never, {
            p_slug: slug, p_respostas: respostas, p_perfil: perfil?.nome ?? null,
            p_nome: contato.nome ?? null, p_email: contato.email ?? null, p_whatsapp: contato.whatsapp ?? null,
          } as never);
        }} />
      )}
    </div>
  );
}
