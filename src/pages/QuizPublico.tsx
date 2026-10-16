import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { QuizPlayer } from "@/components/quiz/QuizPlayer";
import type { EstruturaQuiz } from "@/lib/quiz/quiz";

// /quiz/:slug — o quiz publicado, aberto pra qualquer pessoa (sem login).
// Lê pelo RPC quiz_publico e grava a resposta pelo responder_quiz.
// No celular (pedido do Davi, 15/10) ele é um app de tela cheia: a página não
// rola nem "estica" (o fundo branco aparecia ao puxar), a barra do navegador
// fica da cor do quiz, o conteúdo fica centralizado e cada tela nova começa do topo.
const FUNDO_ESCURO = "#0a0a0a";   // bg-neutral-950
const FUNDO_CLARO = "#ffffff";

export default function QuizPublico() {
  const { slug = "" } = useParams();
  const [quiz, setQuiz] = useState<{ titulo: string; estrutura: EstruturaQuiz } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const rolagem = useRef<HTMLDivElement>(null);
  const escuro = !quiz || quiz.estrutura.tema === "escuro";
  const fundo = escuro ? FUNDO_ESCURO : FUNDO_CLARO;

  useEffect(() => {
    void supabase.rpc("quiz_publico" as never, { p_slug: slug } as never).then(({ data }) => {
      const q = data as { titulo: string; estrutura: EstruturaQuiz } | null;
      setQuiz(q && q.estrutura ? q : null);
      setCarregando(false);
      if (q?.titulo) document.title = q.titulo;
    });
  }, [slug]);

  // Fundo da página e da barra do Safari na cor do quiz, sem efeito elástico.
  useEffect(() => {
    const html = document.documentElement, body = document.body;
    const antes = [html.style.background, body.style.background, html.style.overscrollBehavior, body.style.overscrollBehavior, body.style.overflow];
    // "important": o index.css deixa html/body transparentes (janela do Atlas no desktop).
    for (const el of [html, body]) { el.style.setProperty("background", fundo, "important"); el.style.overscrollBehavior = "none"; }
    body.style.overflow = "hidden";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const criada = !meta;
    if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
    const corAntes = meta.content;
    meta.content = fundo;
    return () => {
      html.style.removeProperty("background"); body.style.removeProperty("background");
      [html.style.background, body.style.background, html.style.overscrollBehavior, body.style.overscrollBehavior, body.style.overflow] = antes;
      if (criada) meta?.remove(); else if (meta) meta.content = corAntes;
    };
  }, [fundo]);

  const voltarAoTopo = useCallback(() => { rolagem.current?.scrollTo({ top: 0 }); }, []);

  // Métricas (sem dado pessoal): uma sessão por aba; a visita, cada tela, o fim e o clique na oferta.
  const sessao = useRef<string>("");
  if (!sessao.current) {
    const chave = `quiz-sessao:${slug}`;
    try { sessao.current = sessionStorage.getItem(chave) || crypto.randomUUID(); sessionStorage.setItem(chave, sessao.current); }
    catch { sessao.current = crypto.randomUUID(); }
  }
  const registrar = useCallback((tipo: "visita" | "passo" | "fim" | "cta", passo?: number) => {
    void supabase.rpc("registrar_evento_quiz" as never, { p_slug: slug, p_sessao: sessao.current, p_tipo: tipo, p_passo: passo ?? -1 } as never);
  }, [slug]);
  useEffect(() => { if (quiz) registrar("visita"); }, [quiz, registrar]);

  return (
    <div ref={rolagem}
      className={escuro ? "fixed inset-0 overflow-y-auto overflow-x-hidden overscroll-none bg-neutral-950 text-neutral-100" : "fixed inset-0 overflow-y-auto overflow-x-hidden overscroll-none bg-white text-neutral-900"}
      style={{ touchAction: "pan-y" }}>
      <div className="flex min-h-full flex-col px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),1.25rem)] sm:py-12">
        {carregando ? (
          <div className="my-auto flex justify-center"><Loader2 className="h-6 w-6 animate-spin opacity-60" /></div>
        ) : !quiz ? (
          <p className="my-auto text-center opacity-70">Este quiz não está disponível.</p>
        ) : (
          <QuizPlayer telaCheia onTrocarTela={voltarAoTopo} onEvento={registrar} titulo={quiz.titulo} estrutura={quiz.estrutura} onFim={async ({ escolhas, perfil, contato }) => {
            const respostas = quiz.estrutura.perguntas.map((q) => ({ pergunta: q.texto, resposta: q.opcoes[escolhas[q.id]]?.texto ?? null }));
            await supabase.rpc("responder_quiz" as never, {
              p_slug: slug, p_respostas: respostas, p_perfil: perfil?.nome ?? null,
              p_nome: contato.nome ?? null, p_email: contato.email ?? null, p_whatsapp: contato.whatsapp ?? null,
            } as never);
            registrar("fim");
          }} />
        )}
      </div>
    </div>
  );
}
