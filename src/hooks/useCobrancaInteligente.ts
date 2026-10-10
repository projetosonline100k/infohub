import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface CobrancaInteligente {
  id: string;
  titulo: string;
  texto: string;
  motivo: string | null;
  urgencia: number;
  atividade_id: string | null;
  status: "ativa" | "feita" | "adiada" | "descartada" | "substituida";
  adiada_ate: string | null;
  vezes_adiada: number;
  resposta: string | null;
  // Formato fácil de ler (cobranças novas): etiqueta, até 3 fatos curtos,
  // o primeiro passo com tempo e as próximas coisas da fila.
  etiqueta: string | null;
  fatos: string[];
  primeiro_passo: string | null;
  minutos: number | null;
  proximos: string[];
}

const ADIAR_MINUTOS = 30;
// "Bora, vou fazer": a cobrança some pelo tempo do primeiro passo (ou este
// padrão) e volta perguntando se fez. Não conta como adiamento.
export const RESPOSTA_VOU_FAZER = "vou fazer agora";
const MINUTOS_COMPROMISSO_PADRAO = 25;
// "Outra coisa agora": troca legítima de prioridade — sai por 1h, não conta
// como adiamento, e o Claude lê o que ele foi fazer (resposta "outra coisa: …").
export const PREFIXO_OUTRA_COISA = "outra coisa: ";
const MINUTOS_OUTRA_COISA = 60;

// Cobrança inteligente do Jarvis: a tarefa agendada do Claude publica a
// coisa mais importante do momento em `jarvis_cobrancas`
// (scripts/cobranca-jarvis.py) e ela fica no Jarvis até o Davi responder.
// Adiada volta sozinha quando o prazo passa.
export function useCobrancaInteligente(userId: string | null | undefined) {
  const [cobranca, setCobranca] = useState<CobrancaInteligente | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  const carregar = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("jarvis_cobrancas")
      .select("id, titulo, texto, motivo, urgencia, atividade_id, status, adiada_ate, vezes_adiada, resposta, etiqueta, fatos, primeiro_passo, minutos, proximos")
      .eq("user_id", userId)
      .in("status", ["ativa", "adiada"])
      .order("criada_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    setCobranca((data as CobrancaInteligente | null) ?? null);
  }, [userId]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Tempo real + reconexão (rede instável derruba o canal) + relógio pra
  // a cobrança adiada voltar na hora certa.
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let religar: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase
      .channel(`jarvis-cobrancas-${userId}-${tentativa}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jarvis_cobrancas", filter: `user_id=eq.${userId}` }, () => { void carregar(); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && tentativa > 0) void carregar();
        if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && !religar) {
          religar = setTimeout(() => setTentativa((n) => n + 1), 5000);
        }
      });
    const relogio = setInterval(() => { setAgora(Date.now()); void carregar(); }, 60_000);
    return () => { if (religar) clearTimeout(religar); void supabase.removeChannel(canal); clearInterval(relogio); };
  }, [userId, carregar, tentativa]);

  const visivel = !!cobranca && (cobranca.status === "ativa" || (!!cobranca.adiada_ate && new Date(cobranca.adiada_ate).getTime() <= agora));

  const responder = useCallback(async (mudancas: Partial<Pick<CobrancaInteligente, "status" | "adiada_ate" | "vezes_adiada">> & { resposta?: string | null }) => {
    if (!cobranca) return;
    const anterior = cobranca;
    setCobranca({ ...cobranca, ...mudancas } as CobrancaInteligente);
    const { error } = await supabase
      .from("jarvis_cobrancas")
      .update({ ...mudancas, respondida_em: new Date().toISOString() })
      .eq("id", anterior.id);
    if (error) {
      setCobranca(anterior);
      toast.error("Não consegui salvar a resposta");
    }
  }, [cobranca]);

  return {
    cobranca: visivel ? cobranca : null,
    feita: () => responder({ status: "feita" }),
    adiar: () => responder({
      status: "adiada",
      adiada_ate: new Date(Date.now() + ADIAR_MINUTOS * 60_000).toISOString(),
      vezes_adiada: (cobranca?.vezes_adiada ?? 0) + 1,
    }),
    descartar: (motivo: string | null) => responder({ status: "descartada", resposta: motivo }),
    outraCoisa: (oQue: string) => responder({
      status: "adiada",
      adiada_ate: new Date(Date.now() + MINUTOS_OUTRA_COISA * 60_000).toISOString(),
      resposta: `${PREFIXO_OUTRA_COISA}${oQue}`,
    }),
    // "Bora, vou fazer": compromisso — volta depois perguntando "fez?".
    comprometer: () => responder({
      status: "adiada",
      adiada_ate: new Date(Date.now() + (cobranca?.minutos || MINUTOS_COMPROMISSO_PADRAO) * 60_000).toISOString(),
      resposta: RESPOSTA_VOU_FAZER,
    }),
  };
}
