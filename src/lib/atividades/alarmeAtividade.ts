import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isDesktop } from "@/lib/platform";
import { criarAtividade } from "@/lib/atividades/criarAtividade";

// Alarme de uma atividade + espelho no app Lembretes do macOS.
// No desktop, cada projeto vira uma lista ("Infopro – Projeto"; Pessoal =
// "Infopro") e cada atividade em aberto, um lembrete nela, vinculado pela
// coluna alarme_lembrete_id. Título e data andam nos dois sentidos; notas
// (descrição + vencimento) e prioridade vão do Infopro pros Lembretes. A data
// do lembrete é a do ALARME — vencimento fica só nas notas, sem notificação.
// Apagar algo nos Lembretes nunca apaga nada do Infopro.

export const EVENTO_ALARMES_ATIVIDADE = "atividades:alarmes-alterados";
const avisar = () => {
  window.dispatchEvent(new Event(EVENTO_ALARMES_ATIVIDADE));
  // Telas de Atividades recarregam com esta mensagem (ver AtividadesView).
  try { new BroadcastChannel("assistant-sync").postMessage({ origem: "lembretes" }); } catch { /* sem suporte */ }
};

async function invocar<T>(comando: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(comando, args);
}

// Último estado de cada lembrete já combinado entre os dois lados (data e
// título) — é o que permite saber QUEM mudou numa sincronização.
const CHAVE_ULTIMAS = "lembretes:ultima-data";
interface Combinado { d?: number | null; t?: string }
const lerUltimas = (): Record<string, Combinado> => {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_ULTIMAS) || "{}") as Record<string, Combinado | number | null>;
    // Formato antigo guardava só a data.
    return Object.fromEntries(Object.entries(bruto).map(([id, v]): [string, Combinado] => [id, v && typeof v === "object" ? v : { d: v as number | null }]));
  } catch { return {}; }
};
const salvarUltima = (id: string, valor: Combinado | undefined) => {
  const atuais = lerUltimas();
  if (valor === undefined) delete atuais[id]; else atuais[id] = { ...atuais[id], ...valor };
  try { localStorage.setItem(CHAVE_ULTIMAS, JSON.stringify(atuais)); } catch { /* sem storage */ }
};

export const LISTA_PESSOAL = "Infopro";
export const nomeDaLista = (projeto: string | null | undefined) => (projeto ? `Infopro – ${projeto}` : LISTA_PESSOAL);

// Prioridade dos Lembretes: 1 alta, 5 média, 9 baixa, 0 nenhuma.
export const prioridadeDoLembrete = (prioridade: string | null | undefined) =>
  prioridade === "urgente" || prioridade === "alta" ? 1 : prioridade === "media" ? 5 : prioridade === "baixa" ? 9 : 0;

export function notasDoLembrete(descricao: string | null | undefined, vencimento: string | null | undefined): string {
  const partes = [descricao?.trim(), vencimento ? `Vence: ${format(new Date(`${vencimento.slice(0, 10)}T12:00:00`), "dd/MM/yyyy")}` : null];
  return partes.filter(Boolean).join("\n\n");
}

interface AtividadeEspelho {
  id: string;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  data_vencimento: string | null;
  alarme_em: string | null;
  alarme_lembrete_id: string | null;
  cliente_id: string | null;
  concluida: boolean;
  deleted_at: string | null;
}
const CAMPOS_ESPELHO = "id, titulo, descricao, prioridade, data_vencimento, alarme_em, alarme_lembrete_id, cliente_id, concluida, deleted_at";

const itemDoLembrete = (a: AtividadeEspelho, projeto: string | null) => ({
  titulo: a.titulo,
  notas: notasDoLembrete(a.descricao, a.data_vencimento),
  lista: nomeDaLista(projeto),
  prioridade: prioridadeDoLembrete(a.prioridade),
  quando: a.alarme_em ? new Date(a.alarme_em).getTime() : null,
});

async function criarLembretes(itens: ReturnType<typeof itemDoLembrete>[]): Promise<string[]> {
  if (!itens.length) return [];
  return JSON.parse(await invocar<string>("lembretes_criar_lote", { itensJson: JSON.stringify(itens) }));
}

async function nomeDoProjeto(clienteId: string | null): Promise<string | null> {
  if (!clienteId) return null;
  const { data } = await supabase.from("clientes").select("nome_especialista").eq("id", clienteId).maybeSingle();
  return data?.nome_especialista ?? null;
}

export interface AlarmeDaAtividade { id: string; titulo: string; alarme_lembrete_id?: string | null }

// quando = null desliga. Grava o alarme no banco na hora (é o que toca no
// app) e atualiza o lembrete do Mac em segundo plano — o osascript leva
// alguns segundos e não deve travar a tela. Se faltar permissão pros
// Lembretes, avisa uma vez.
export async function definirAlarmeAtividade(atividade: AlarmeDaAtividade, quando: Date | null): Promise<void> {
  const { error } = await supabase
    .from("atividades")
    .update({ alarme_em: quando ? quando.toISOString() : null })
    .eq("id", atividade.id);
  if (error) throw error;
  avisar();
  if (isDesktop()) void atualizarLembreteDoAlarme(atividade, quando);
}

async function atualizarLembreteDoAlarme(atividade: AlarmeDaAtividade, quando: Date | null) {
  const anterior = atividade.alarme_lembrete_id ?? null;
  let lembreteId = anterior;
  try {
    if (lembreteId && quando) {
      await invocar("lembrete_atualizar", { id: lembreteId, quandoMs: quando.getTime() });
      salvarUltima(lembreteId, { d: quando.getTime() });
    } else if (lembreteId) {
      const resultado = await invocar<string>("lembrete_desligar", { id: lembreteId });
      if (resultado === "apagado") { salvarUltima(lembreteId, undefined); lembreteId = null; } else salvarUltima(lembreteId, { d: null });
    } else if (quando) {
      // Ainda não espelhada: cria já o lembrete na lista do projeto.
      const { data } = await supabase.from("atividades").select(CAMPOS_ESPELHO).eq("id", atividade.id).maybeSingle();
      if (data) {
        const item = itemDoLembrete({ ...(data as AtividadeEspelho), alarme_em: quando.toISOString() }, await nomeDoProjeto(data.cliente_id));
        [lembreteId] = await criarLembretes([item]);
        salvarUltima(lembreteId, { d: quando.getTime(), t: item.titulo });
      }
    }
  } catch (erro) {
    // Lembrete sumiu ou sem permissão: o alarme do app continua valendo; a
    // próxima sincronização recria o espelho.
    console.error("Erro ao atualizar o lembrete do Mac:", erro);
    if (quando) {
      lembreteId = null;
      toast.warning("Alarme salvo no app, mas não deu pra atualizar o app Lembretes do Mac", {
        id: "alarme-sem-lembretes",
        description: "Se for permissão: Ajustes do Sistema → Privacidade e Segurança → Automação → Infopro Hub.",
      });
    }
  }
  if (lembreteId !== anterior) {
    await supabase.from("atividades").update({ alarme_lembrete_id: lembreteId }).eq("id", atividade.id);
    avisar();
  }
}

// Conclui a atividade (vai pra coluna de conclusão do quadro dela),
// respeitando a regra do checklist. O lembrete é marcado como feito na
// próxima sincronização.
export async function concluirAtividade(id: string, clienteId: string | null): Promise<"ok" | "checklist" | "erro"> {
  const { data: itens } = await supabase.from("subtarefas_atividade").select("concluida").eq("atividade_id", id);
  if ((itens || []).some((item) => !item.concluida)) return "checklist";
  let colunas = supabase.from("colunas_atividade").select("status_key, eh_conclusao");
  colunas = clienteId ? colunas.eq("cliente_id", clienteId) : colunas.is("cliente_id", null);
  const { data } = await colunas;
  const conclusao = (data || []).find((c) => c.eh_conclusao)?.status_key;
  const { error } = await supabase
    .from("atividades")
    .update({ concluida: true, alarme_em: null, ...(conclusao ? { status: conclusao } : {}) })
    .eq("id", id);
  return error ? "erro" : "ok";
}

// ---------------------------------------------------------------------------
// Sincronização Lembretes ↔ Infopro (roda no desktop, a cada minuto).

interface EstadoLembrete {
  id: string; existe: boolean; concluido: boolean; data: number | null;
  nome?: string; lista?: string; notas?: string; prioridade?: number;
}
interface LembreteNovo { id: string; nome: string; lista: string; data: number | null; notas: string }

const minuto = (ms: number | null | undefined) => (ms == null ? null : Math.round(ms / 60_000));
const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// "Infopro" → Pessoal; "Infopro – Core" / "Infopro - Core" / "Infopro: Core" → projeto Core.
export function projetoDaLista(nomeLista: string, projetos: { id: string; nome: string }[]): string | null {
  const resto = normalizar(nomeLista).replace(/^infopro/, "").replace(/^[\s\-–—:·|/]+/, "").trim();
  if (!resto) return null;
  return projetos.find((p) => normalizar(p.nome) === resto)?.id ?? null;
}

type Decisao<T> = { destino: "atividade" | "lembrete" | "nada"; valor: T };

// Os dois lados podem ter mudado: compara com o último valor combinado
// (`ultimo`). Quem mudou desde então vence; nunca combinado, vale o Infopro
// (a não ser que só o lembrete tenha valor).
function mesclar<T>(ultimo: T | undefined, naAtividade: T, noLembrete: T, igual: (a: T, b: T) => boolean, vazio: (v: T) => boolean): Decisao<T> {
  if (igual(naAtividade, noLembrete)) return { destino: "nada", valor: noLembrete };
  if (ultimo === undefined) {
    return !vazio(naAtividade) ? { destino: "lembrete", valor: naAtividade } : { destino: "atividade", valor: noLembrete };
  }
  if (!igual(noLembrete, ultimo)) return { destino: "atividade", valor: noLembrete };
  return { destino: "lembrete", valor: naAtividade };
}

export function mesclarData(ultima: number | null | undefined, naAtividade: number | null, noLembrete: number | null) {
  const decisao = mesclar(ultima, naAtividade, noLembrete, (a, b) => minuto(a) === minuto(b), (v) => v === null);
  return { destino: decisao.destino, data: decisao.valor };
}

export function mesclarTitulo(ultimo: string | undefined, naAtividade: string, noLembrete: string) {
  return mesclar(ultimo, naAtividade, noLembrete, (a, b) => a.trim() === b.trim(), (v) => !v.trim());
}

const LOTE_MAXIMO = 60;

export async function sincronizarLembretes(): Promise<void> {
  if (!isDesktop()) return;
  let mudou = false;

  const { data: clientes } = await supabase.from("clientes").select("id, nome_especialista").eq("arquivado", false);
  const projetos = (clientes || []).map((c) => ({ id: c.id, nome: c.nome_especialista }));
  const nomePorId = new Map(projetos.map((p) => [p.id, p.nome]));
  // Atividade de projeto arquivado/sem acesso fica fora do espelho.
  const noEspelho = (a: AtividadeEspelho) => !a.cliente_id || nomePorId.has(a.cliente_id);
  const listaEsperada = (a: AtividadeEspelho) => nomeDaLista(a.cliente_id ? nomePorId.get(a.cliente_id) : null);

  const { data: linhas } = await supabase
    .from("atividades")
    .select(CAMPOS_ESPELHO)
    .or("alarme_lembrete_id.not.is.null,and(concluida.eq.false,deleted_at.is.null)");
  const atividades = (linhas || []) as AtividadeEspelho[];

  // Infopro → Lembretes: atividade concluída marca o lembrete como feito;
  // excluída apaga o lembrete. Em ambos, o vínculo acaba.
  const vinculadas: AtividadeEspelho[] = [];
  for (const atividade of atividades.filter((a) => a.alarme_lembrete_id)) {
    const lembreteId = atividade.alarme_lembrete_id as string;
    if (!atividade.concluida && !atividade.deleted_at) { vinculadas.push(atividade); continue; }
    try {
      if (atividade.deleted_at) await invocar("lembrete_remover", { id: lembreteId });
      else await invocar("lembrete_marcar", { id: lembreteId, concluido: true });
    } catch { continue; }
    await supabase.from("atividades").update({ alarme_em: null, alarme_lembrete_id: null }).eq("id", atividade.id);
    salvarUltima(lembreteId, undefined);
    mudou = true;
  }

  const listas = [LISTA_PESSOAL, ...projetos.map((p) => nomeDaLista(p.nome))];
  const resposta = JSON.parse(await invocar<string>("lembretes_sincronizar", {
    idsJson: JSON.stringify(vinculadas.map((a) => a.alarme_lembrete_id)),
    listasJson: JSON.stringify(listas),
  })) as { estados: EstadoLembrete[]; novos: LembreteNovo[] };

  const porLembrete = new Map(vinculadas.map((a) => [a.alarme_lembrete_id as string, a]));
  const desvinculadas = new Set<string>();
  for (const estado of resposta.estados) {
    const atividade = porLembrete.get(estado.id);
    if (!atividade) continue;
    // Apagado lá: só desfaz o vínculo (a atividade volta pro espelho na hora).
    if (!estado.existe) {
      await supabase.from("atividades").update({ alarme_lembrete_id: null }).eq("id", atividade.id);
      atividade.alarme_lembrete_id = null;
      desvinculadas.add(atividade.id);
      salvarUltima(estado.id, undefined);
      mudou = true;
      continue;
    }
    // Concluído lá conclui aqui (se o checklist deixar).
    if (estado.concluido) {
      const resultado = await concluirAtividade(atividade.id, atividade.cliente_id);
      if (resultado === "ok") {
        await supabase.from("atividades").update({ alarme_lembrete_id: null }).eq("id", atividade.id);
        salvarUltima(estado.id, undefined);
        toast.success(`"${atividade.titulo}" concluída pelo app Lembretes`);
        mudou = true;
      } else if (resultado === "checklist") {
        await invocar("lembrete_marcar", { id: estado.id, concluido: false }).catch(() => undefined);
        toast.warning(`"${atividade.titulo}" foi concluída nos Lembretes, mas tem checklist pendente no Infopro`);
      }
      continue;
    }
    const ultimo = lerUltimas()[estado.id] || {};
    const patchAtividade: { alarme_em?: string | null; titulo?: string } = {};
    const patchLembrete: { titulo?: string; notas?: string; prioridade?: number } = {};

    // Data (alarme) e título: quem mudou desde a última combinação vence.
    const naAtividade = atividade.alarme_em ? new Date(atividade.alarme_em).getTime() : null;
    const data = mesclarData(ultimo.d, naAtividade, estado.data);
    if (data.destino === "atividade") patchAtividade.alarme_em = data.data ? new Date(data.data).toISOString() : null;
    if (data.destino === "lembrete") {
      try {
        if (data.data !== null) await invocar("lembrete_atualizar", { id: estado.id, quandoMs: data.data });
        else await invocar("lembrete_desligar", { id: estado.id });
      } catch { continue; }
    }
    const titulo = mesclarTitulo(ultimo.t, atividade.titulo, estado.nome ?? "");
    if (titulo.destino === "atividade") patchAtividade.titulo = titulo.valor;
    if (titulo.destino === "lembrete") patchLembrete.titulo = titulo.valor;

    // Notas e prioridade: o Infopro manda.
    const notas = notasDoLembrete(atividade.descricao, atividade.data_vencimento);
    if ((estado.notas ?? "") !== notas) patchLembrete.notas = notas;
    const prioridade = prioridadeDoLembrete(atividade.prioridade);
    if ((estado.prioridade ?? 0) !== prioridade) patchLembrete.prioridade = prioridade;

    if (Object.keys(patchAtividade).length) {
      await supabase.from("atividades").update(patchAtividade).eq("id", atividade.id);
      mudou = true;
    }
    if (Object.keys(patchLembrete).length) {
      await invocar("lembrete_atualizar_dados", { id: estado.id, dadosJson: JSON.stringify(patchLembrete) }).catch(() => undefined);
    }
    salvarUltima(estado.id, { d: data.data, t: titulo.valor });

    // Mudou de projeto no Infopro: recria o lembrete na lista nova.
    if (estado.lista && estado.lista !== listaEsperada(atividade) && noEspelho(atividade)) {
      try {
        const [novoId] = await criarLembretes([{ ...itemDoLembrete({ ...atividade, titulo: titulo.valor }, atividade.cliente_id ? nomePorId.get(atividade.cliente_id) ?? null : null), quando: data.data }]);
        await supabase.from("atividades").update({ alarme_lembrete_id: novoId }).eq("id", atividade.id);
        await invocar("lembrete_remover", { id: estado.id });
        salvarUltima(estado.id, undefined);
        salvarUltima(novoId, { d: data.data, t: titulo.valor });
      } catch (erro) { console.error("Erro ao mover lembrete de lista:", erro); }
    }
  }

  // Lembretes → Infopro: novos nas listas "Infopro…" viram atividades.
  const candidatos = resposta.novos.filter((novo) => !porLembrete.has(novo.id));
  if (candidatos.length) {
    const { data: jaVinculados } = await supabase.from("atividades").select("alarme_lembrete_id").in("alarme_lembrete_id", candidatos.map((c) => c.id));
    const ignorar = new Set((jaVinculados || []).map((v) => v.alarme_lembrete_id));
    const novos = candidatos.filter((c) => !ignorar.has(c.id));
    for (const novo of novos) {
      const clienteId = projetoDaLista(novo.lista, projetos);
      let colunas = supabase.from("colunas_atividade").select("status_key, eh_conclusao").order("ordem", { ascending: true });
      colunas = clienteId ? colunas.eq("cliente_id", clienteId) : colunas.is("cliente_id", null);
      const { data: cols } = await colunas;
      try {
        const criada = await criarAtividade({
          titulo: novo.nome || "Lembrete sem título",
          clienteId,
          pastaId: null,
          dataAtividade: format(novo.data ? new Date(novo.data) : new Date(), "yyyy-MM-dd"),
          statusKey: (cols || []).find((c) => !c.eh_conclusao)?.status_key || "backlog",
          concluida: false,
          ordem: 0,
        });
        const alarme = novo.data && novo.data > Date.now() ? novo.data : null;
        await supabase.from("atividades").update({
          descricao: novo.notas || null,
          alarme_lembrete_id: novo.id,
          alarme_em: alarme ? new Date(alarme).toISOString() : null,
        }).eq("id", criada.id);
        salvarUltima(novo.id, { d: alarme, t: criada.titulo });
        mudou = true;
      } catch (erro) {
        console.error("Erro ao importar lembrete:", erro);
      }
    }
    if (novos.length) toast.success(novos.length === 1 ? `Lembrete "${novos[0].nome}" virou atividade` : `${novos.length} lembretes viraram atividades`);
  }

  // Infopro → Lembretes: atividades em aberto ainda sem lembrete ganham um
  // (em lotes, pra primeira vez não travar o Mac).
  const semEspelho = atividades
    .filter((a) => !a.concluida && !a.deleted_at && (!a.alarme_lembrete_id || desvinculadas.has(a.id)) && noEspelho(a))
    .slice(0, LOTE_MAXIMO);
  if (semEspelho.length) {
    const itens = semEspelho.map((a) => itemDoLembrete(a, a.cliente_id ? nomePorId.get(a.cliente_id) ?? null : null));
    const ids = await criarLembretes(itens);
    for (let i = 0; i < semEspelho.length; i++) {
      const { error } = await supabase.from("atividades").update({ alarme_lembrete_id: ids[i] }).eq("id", semEspelho[i].id);
      if (error) { await invocar("lembrete_remover", { id: ids[i] }).catch(() => undefined); continue; }
      salvarUltima(ids[i], { d: itens[i].quando, t: itens[i].titulo });
    }
    mudou = true;
  }

  if (mudou) avisar();
}

// ---------------------------------------------------------------------------

// Sugestão de horário ao ligar: vencimento às 9h se ainda for futuro; senão
// daqui a 1 hora, arredondado pros próximos 15 min.
export function horarioSugerido(vencimento: string | null | undefined, agora = new Date()): Date {
  if (vencimento) {
    const noDia = new Date(`${vencimento.slice(0, 10)}T09:00:00`);
    if (noDia.getTime() > agora.getTime()) return noDia;
  }
  const daquiUmaHora = new Date(agora.getTime() + 60 * 60_000);
  daquiUmaHora.setMinutes(Math.ceil(daquiUmaHora.getMinutes() / 15) * 15, 0, 0);
  return daquiUmaHora;
}

// Repetição: depois do horário, enquanto ninguém desligar/adiar/concluir,
// toca de novo a cada 5 minutos.
export const INTERVALO_REPETICAO_MS = 5 * 60_000;

export function deveTocarAtividade(alarmeEm: number, agora: number, ultimoToque: number | undefined): boolean {
  if (agora < alarmeEm) return false;
  return ultimoToque === undefined || ultimoToque < alarmeEm || agora - ultimoToque >= INTERVALO_REPETICAO_MS;
}
