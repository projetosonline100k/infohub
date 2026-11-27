import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { destravarSom, playEntrouNoQuizSound } from "@/lib/assistant/sound";

// Som de gente nova no quiz (27/11/2026, Davi: "quando chegasse uma pessoa nova em começaram o quiz, desse um som, assim eu
// saberia que alguém entrou, até para eu ficar esperto"). Em qualquer tela do Hub, com a mesma regra do número "Começaram":
// passo 1 (ou 2 quando a abertura é pulada). Só avisa quem começar depois que o Hub foi aberto.
const db = supabase as unknown as SupabaseClient;
const QUIZZES_COM_SOM = ["instalingo"];   // por enquanto só o do Instalingo (as versões dele entram junto)
const DE_QUANTO_EM_QUANTO = 5_000;
interface Quiz { id: string; titulo: string; estrutura: { intro?: { pular?: boolean } } | null; estrutura_publicada: { intro?: { pular?: boolean } } | null }
const CAMPOS = "id, titulo, estrutura, estrutura_publicada";

async function quizzesVigiados(): Promise<Quiz[]> {
  const { data: raizes } = await db.from("quizzes").select(CAMPOS).in("slug", QUIZZES_COM_SOM);
  const lista = (raizes ?? []) as Quiz[];
  if (!lista.length) return [];
  const { data: versoes } = await db.from("quizzes").select(CAMPOS).in("variante_de", lista.map((q) => q.id));
  return [...lista, ...((versoes ?? []) as Quiz[])];
}

export function SomDeQuiz() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    // O navegador só deixa tocar som depois de um clique na página: o primeiro clique ou tecla libera.
    const destravar = () => destravarSom();
    window.addEventListener("pointerdown", destravar, { once: true });
    window.addEventListener("keydown", destravar, { once: true });

    let vivo = true, buscando = false, quizzes: Quiz[] = [];
    const aberto = Date.now();
    let ultimo = aberto;
    const avisadas = new Set<string>();
    const buscar = async () => {
      if (buscando) return;
      buscando = true;
      try {
        if (!quizzes.length) quizzes = await quizzesVigiados();
        const desde = new Date(Math.max(aberto, ultimo - 15_000)).toISOString();   // volta 15 s: evento que gravou atrasado não se perde
        const respostas = await Promise.all(quizzes.map(async (q) => {
          const comecou = (q.estrutura_publicada ?? q.estrutura)?.intro?.pular ? 2 : 1;
          const { data } = await db.from("quiz_eventos").select("sessao, criado_em").eq("quiz_id", q.id).eq("tipo", "passo").eq("passo", comecou).gte("criado_em", desde).limit(200);
          return (data ?? []) as { sessao: string; criado_em: string }[];
        }));
        if (!vivo) return;
        let novas = 0;
        for (const e of respostas.flat()) {
          ultimo = Math.max(ultimo, Date.parse(e.criado_em));
          if (!avisadas.has(e.sessao)) { avisadas.add(e.sessao); novas++; }
        }
        if (novas) {
          playEntrouNoQuizSound();
          toast.info(novas === 1 ? "Alguém começou o quiz!" : `${novas} pessoas começaram o quiz!`, { description: quizzes[0]?.titulo, duration: 8_000 });
        }
      } catch { /* sem internet: tenta de novo na próxima volta */ } finally { buscando = false; }
    };
    void buscar();
    const t = window.setInterval(() => void buscar(), DE_QUANTO_EM_QUANTO);
    return () => { vivo = false; window.clearInterval(t); window.removeEventListener("pointerdown", destravar); window.removeEventListener("keydown", destravar); };
  }, [user]);
  return null;
}
