// Briefing de tarefa: o Davi conversa com o funcionário antes da tarefa
// existir; ela só nasce quando ele confirma o que o funcionário entendeu.
// Quem responde é o ouvinte do Jarvis (scripts/empresa/briefing.py).

export type Consigo = "sim" | "em_parte" | "nao";

export type Proposta = {
  titulo: string;
  entendimento: string;
  entregas?: string[];
  consigo: Consigo;
  limites?: string;
  precisa_de?: string[];
  prazo_sugerido?: string;
  tipo?: string;
};

export type MensagemBriefing = {
  id: string;
  papel: "davi" | "funcionario";
  texto: string;
  status: "enviada" | "lida" | "respondida" | null;
  criada_em: string;
};

export const ROTULO_CONSIGO: Record<Consigo, string> = {
  sim: "Consigo fazer",
  em_parte: "Consigo em parte",
  nao: "Não consigo sozinho",
};

// Esperando o funcionário: a última mensagem é do Davi e ainda não foi respondida.
export function esperandoResposta(mensagens: MensagemBriefing[]): boolean {
  const ultima = mensagens[mensagens.length - 1];
  return !!ultima && ultima.papel === "davi" && ultima.status !== "respondida";
}

// Há quanto tempo o Davi espera (para avisar se o ouvinte estiver desligado).
export function segundosEsperando(mensagens: MensagemBriefing[], agora = Date.now()): number {
  if (!esperandoResposta(mensagens)) return 0;
  return Math.max(0, Math.round((agora - new Date(mensagens[mensagens.length - 1].criada_em).getTime()) / 1000));
}

// A descrição da tarefa leva o combinado e a conversa inteira, para quem for
// fazer (IA ou pessoa) não depender de memória.
export function descricaoDaTarefa(p: Proposta, mensagens: MensagemBriefing[], nomeFuncionario: string): string {
  const linhas = [`Combinado com ${nomeFuncionario} (briefing confirmado pelo Davi):`, "", p.entendimento.trim()];
  if (p.entregas?.length) linhas.push("", "Entregas:", ...p.entregas.map((e) => `- ${e}`));
  linhas.push("", `${ROTULO_CONSIGO[p.consigo] ?? p.consigo}${p.limites?.trim() ? ` — ${p.limites.trim()}` : ""}`);
  if (p.precisa_de?.length) linhas.push("", "Precisa do Davi:", ...p.precisa_de.map((e) => `- ${e}`));
  linhas.push("", "Conversa:", ...mensagens.map((m) => `${m.papel === "davi" ? "Davi" : nomeFuncionario}: ${m.texto.trim()}`));
  return linhas.join("\n");
}

export const prazoValido = (prazo?: string) => !!prazo && /^\d{4}-\d{2}-\d{2}$/.test(prazo);
