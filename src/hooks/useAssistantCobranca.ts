import { useCallback, useEffect, useRef, useState } from "react";
import { mensagensAtivasPorTipo, type JarvisMensagem, type JarvisMensagemTipo } from "@/hooks/useJarvisMensagens";

export type AssistantEstadoPainel = "lista" | "recomendacao" | "selecionada" | "foco" | "pausado";

interface CobrancaSnapshot {
  panelAberto: boolean;
  estado: AssistantEstadoPainel;
  selecionadaEm: number | null;
  pausadoEm: number | null;
  // epoch (ms) de quando o run de foco atual começou (equivalente a
  // timer_iniciado_em convertido pra número).
  focoIniciadoEm: number | null;
  // segundos já acumulados antes desse run (timer_decorrido_segundos).
  focoAcumuladoAntesDoRunSegundos: number;
  // tempo_estimado da tarefa atual, em segundos (null = sem referência,
  // não dá pra saber quando "estourou").
  estimativaSegundos: number | null;
  atrasadasCount: number;
  // atividades de hoje + atrasadas ainda não concluídas (a lista de origem
  // já só tem não concluídas) — usado pelo lembrete periódico.
  pendentesHojeCount: number;
  // Mensagens cadastradas em Administração → Jarvis (item 2) — ativas de
  // cada tipo entram no sorteio abaixo; sem nenhuma configurada, os textos
  // fixos de sempre continuam valendo (sem regressão pra quem não configurou nada).
  mensagens: JarvisMensagem[];
  // "Começar o dia": id da tarefa em foco agora + id/status da prioridade
  // #1 do plano de hoje (null quando não existe plano) — usados só pela
  // regra "sugestão moderada" abaixo, sem UI nova nenhuma.
  tarefaAtualId: string | null;
  prioridadeUmId: string | null;
  prioridadeUmConcluida: boolean;
}

type Regra = "foco45" | "selecionadaParada" | "pausadoLongo" | "sugestaoModerada" | "atrasada";

const COOLDOWN_MS = 15 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
const DURACAO_BOLHA_MS = 6000;
const LIMIAR_SELECIONADA_MS = 10 * 60 * 1000;
const LIMIAR_PAUSADO_MS = 15 * 60 * 1000;
const LIMIAR_SESSAO_LONGA_SEGUNDOS = 45 * 60;

// Nudges periódicos (itens 5-6 do pedido) — independentes do cooldown de
// 15min acima (senão iam competir com as cobranças antigas e sumir por até
// 15min de folga). Disparam sempre que o painel está fechado, com foco
// ativo ou não — não dependem de nenhum estado específico.
const INTERVALO_MOTIVACIONAL_MS = 2 * 60 * 1000;
const INTERVALO_PENDENCIAS_MS = 5 * 60 * 1000;
const MENSAGENS_MOTIVACIONAIS = [
  "Continua, você é disciplinado",
  "Vai pra cima, seu sono depende disso",
  "Vai campeão",
  "Para agora não",
];

// Cobranças proativas simples — só tarefa/sessão/tempo/atraso, sem IA.
// No máximo 1 aviso a cada ~15min (cooldown único pra tudo nesta v1) e só
// com o painel FECHADO (aberto = já está engajado, não precisa cutucar).
export function useAssistantCobranca(snapshot: CobrancaSnapshot) {
  const [mensagem, setMensagem] = useState<string | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const ultimoAvisoRef = useRef(0);
  const avisou45MinRef = useRef(false);
  const esconderRef = useRef<ReturnType<typeof setTimeout>>();
  const ultimaMotivacionalRef = useRef(-1);
  // Cooldown por mensagem (item 2: "intervalo mínimo") — em memória, não
  // precisa sobreviver a um reload (mesmo critério dos outros refs aqui).
  const cooldownPorMensagemRef = useRef<Map<string, number>>(new Map());

  const mostrarBolha = (texto: string) => {
    clearTimeout(esconderRef.current);
    setMensagem(texto);
    esconderRef.current = setTimeout(() => setMensagem(null), DURACAO_BOLHA_MS);
  };

  // Sorteia entre as mensagens ATIVAS de um tipo (Administração → Jarvis),
  // preferindo as que já passaram do próprio intervalo mínimo — se todas
  // estiverem em cooldown, mostra uma mesmo assim (o cooldown é uma
  // preferência de rotação, não um bloqueio duro; quem bloqueia de verdade
  // é o cooldown global de 15min dos gatilhos reativos, mais acima).
  //
  // Bug corrigido: sem NENHUMA mensagem cadastrada pro tipo, cai no texto
  // fixo de sempre (sem regressão pra quem nunca configurou nada) — mas se
  // o usuário JÁ cadastrou mensagens desse tipo e desativou todas elas
  // (Switch em Administração → Jarvis → Mensagens), isso é um "desligar" de
  // verdade: retorna null e quem chamar não deve mostrar bolha nenhuma, em
  // vez de cair no mesmo texto fixo como se nada tivesse sido configurado.
  const escolherTexto = useCallback((tipo: JarvisMensagemTipo, fallback: string): string | null => {
    const todasDoTipo = snapshotRef.current.mensagens.filter((m) => m.tipo === tipo);
    if (todasDoTipo.length === 0) return fallback;
    const candidatas = mensagensAtivasPorTipo(snapshotRef.current.mensagens, tipo);
    if (candidatas.length === 0) return null;
    const agora = Date.now();
    const disponiveis = candidatas.filter(
      (m) => agora - (cooldownPorMensagemRef.current.get(m.id) ?? 0) >= m.intervalo_minimo_minutos * 60_000,
    );
    const pool = disponiveis.length > 0 ? disponiveis : candidatas;
    const escolhida = pool[Math.floor(Math.random() * pool.length)];
    cooldownPorMensagemRef.current.set(escolhida.id, agora);
    return escolhida.mensagem;
  }, []);

  // Disparo pontual (fora do loop periódico) — usado por ações imediatas do
  // usuário: pausar (tipo "pausa") e concluir (tipo "conclusao", chamado de
  // dispararCelebracao em Assistant.tsx). Pausar/concluir não são ações
  // frequentes o bastante pra precisar do cooldown global de 15min.
  const dispararMensagemPontual = useCallback((tipo: JarvisMensagemTipo, fallback: string) => {
    const texto = escolherTexto(tipo, fallback);
    if (texto) mostrarBolha(texto);
  }, [escolherTexto]);

  // Sessão de foco nova (ou parada/pausada) — libera o aviso de "45 min" de
  // novo (um novo timer_iniciado_em é um novo run). O aviso de "tempo
  // estimado esgotado" virou um diálogo modal de verdade (item 7, rodada 4
  // — ver dialogoExcedido em Assistant.tsx), não mais um balão passivo
  // daqui.
  useEffect(() => {
    if (!snapshot.focoIniciadoEm) avisou45MinRef.current = false;
  }, [snapshot.focoIniciadoEm]);

  useEffect(() => {
    const id = setInterval(() => {
      const s = snapshotRef.current;
      if (s.panelAberto) return;
      const agora = Date.now();

      let candidata: { texto: string; regra: Regra } | null = null;

      if (s.estado === "foco" && s.focoIniciadoEm && !avisou45MinRef.current) {
        const totalSeg = s.focoAcumuladoAntesDoRunSegundos + (agora - s.focoIniciadoEm) / 1000;
        if (totalSeg >= LIMIAR_SESSAO_LONGA_SEGUNDOS) {
          const texto = escolherTexto("alerta", "🔥 45 min de foco. Continua ou faz uma pausa?");
          if (texto) candidata = { texto, regra: "foco45" };
        }
      }

      if (!candidata && s.estado === "selecionada" && s.selecionadaEm && agora - s.selecionadaEm >= LIMIAR_SELECIONADA_MS) {
        candidata = { texto: "👀 Vamos começar ou quer trocar?", regra: "selecionadaParada" };
      }

      if (!candidata && s.estado === "pausado" && s.pausadoEm && agora - s.pausadoEm >= LIMIAR_PAUSADO_MS) {
        const minutos = Math.round((agora - s.pausadoEm) / 60000);
        const texto = escolherTexto("retorno_foco", `Seu foco está pausado há ${minutos} min. Bora voltar?`);
        if (texto) candidata = { texto, regra: "pausadoLongo" };
      }

      // "Começar o dia": trabalhando em foco em algo que NÃO é a prioridade
      // #1 do plano, com ela ainda pendente — sugestão simples e moderada,
      // herda o mesmo cooldown global de 15min de tudo aqui (não é um alerta
      // urgente, só um lembrete gentil).
      if (!candidata && s.estado === "foco" && s.prioridadeUmId && !s.prioridadeUmConcluida && s.tarefaAtualId !== s.prioridadeUmId) {
        candidata = { texto: "Lembrete: sua prioridade #1 de hoje ainda está pendente.", regra: "sugestaoModerada" };
      }

      if (!candidata && s.atrasadasCount > 0) {
        const texto = escolherTexto("alerta", "Você ainda tem uma tarefa atrasada esperando.");
        if (texto) candidata = { texto, regra: "atrasada" };
      }

      if (!candidata) return;
      if (agora - ultimoAvisoRef.current < COOLDOWN_MS) return;

      ultimoAvisoRef.current = agora;
      if (candidata.regra === "foco45") avisou45MinRef.current = true;

      mostrarBolha(candidata.texto);
    }, CHECK_INTERVAL_MS);
    return () => {
      clearInterval(id);
      clearTimeout(esconderRef.current);
    };
    // escolherTexto é estável ([] de deps) — não precisa recriar o interval por causa dela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mensagem motivacional (item 5) — sorteada entre as 4 opções, evitando
  // repetir a mesma duas vezes seguidas, a cada 2min, sempre que o painel
  // está fechado (com foco ativo ou não — não depende de nenhum estado).
  useEffect(() => {
    const id = setInterval(() => {
      // Log temporário (item 2, rodada 4) — se isso não aparecer a cada
      // 2min com o painel fechado, o problema é o timer nunca rodar (ex.:
      // componente desmontado); se aparecer mas a bolha não for vista, o
      // problema é geométrico (janela pequena demais), não de dados.
      console.log("[jarvis][cobranca] tick motivacional", { panelAberto: snapshotRef.current.panelAberto });
      if (snapshotRef.current.panelAberto) return;
      let indice = Math.floor(Math.random() * MENSAGENS_MOTIVACIONAIS.length);
      if (MENSAGENS_MOTIVACIONAIS.length > 1 && indice === ultimaMotivacionalRef.current) {
        indice = (indice + 1) % MENSAGENS_MOTIVACIONAIS.length;
      }
      ultimaMotivacionalRef.current = indice;
      const texto = escolherTexto("motivacao", MENSAGENS_MOTIVACIONAIS[indice]);
      if (texto) mostrarBolha(texto);
    }, INTERVALO_MOTIVACIONAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lembrete de pendências (item 6) — a cada 5min, sempre que o painel está
  // fechado; não avisa se não sobrou nada pendente hoje.
  useEffect(() => {
    const id = setInterval(() => {
      const s = snapshotRef.current;
      if (s.panelAberto || s.pendentesHojeCount <= 0) return;
      const n = s.pendentesHojeCount;
      mostrarBolha(`📋 Você ainda tem ${n} atividade${n > 1 ? "s" : ""} pendente${n > 1 ? "s" : ""} hoje.`);
    }, INTERVALO_PENDENCIAS_MS);
    return () => clearInterval(id);
  }, []);

  return { mensagem, dispararMensagemPontual, escolherTexto };
}
