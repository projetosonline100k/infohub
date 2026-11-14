// Motor dos fluxos de mensagem do Instagram (migração 20261113170000_instagram_fluxos).
// Chamado pela edge `instagram-automacoes`: (1) quando chega comentário/DM/story/resposta de botão,
// (2) a cada minuto pelo pg_cron (/tick) para retomar as esperas. A lógica de decisão é pura e testada
// em ../_shared/fluxo.ts; aqui ficam só o banco e a Meta.
import { registrarMensagem, textoComBotoes } from "./conversa.ts";
import {
  aguardaResposta, destinoDe, fluxoBate, linksDoNo, primeiroNo, proximoPasso, respostasDoNo, saidaDaResposta,
  type GrafoFluxo, type NoFluxo,
} from "../_shared/fluxo.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;
export type Deps = {
  graph: (caminho: string, token: string, corpo: Record<string, unknown>) => Promise<unknown>;
  tokenAtual: (admin: Admin, conexao: ConexaoFluxo) => Promise<string>;
};
export type ConexaoFluxo = { ig_user_id: string; user_id: string; access_token: string; token_expira_em: string | null };
export type EventoFluxo = {
  origem: "comentario" | "dm" | "story"; eventoId: string; texto: string; autorId: string;
  autorUsername: string | null; mediaId: string | null; payload?: string | null;
};
type Fluxo = {
  id: string; user_id: string; ig_user_id: string; nome: string; ativo: boolean; gatilhos: string[]; palavras_chave: string[];
  correspondencia: "contem" | "exata" | "trecho"; media_ids: string[] | null; respostas_comentario: string[]; grafo: GrafoFluxo; disparos: number;
};
type Execucao = {
  id: string; fluxo_id: string; user_id: string; ig_user_id: string; contato_id: string; contato_username: string | null;
  no_atual: string | null; estado: string; janela_ate: string | null; comment_id: string | null; respondeu: boolean; ultimo_texto: string;
  historico: { no: string; tipo: string; em: string }[]; evento_id?: string | null;
};

const JANELA_MS = 24 * 60 * 60 * 1000;
const agora = () => new Date().toISOString();

async function gravar(admin: Admin, id: string, campos: Record<string, unknown>) {
  await admin.from("instagram_fluxo_execucoes").update({ ...campos, trava_ate: null, atualizado_em: agora() }).eq("id", id);
}

function corpoDaMensagem(no: NoFluxo) {
  const texto = (no.dados.texto ?? "").trim();
  const respostas = respostasDoNo(no), links = linksDoNo(no);
  if (respostas.length) {
    return { text: texto, quick_replies: respostas.map((b) => ({ content_type: "text", title: b.titulo.slice(0, 20), payload: b.id })) };
  }
  if (links.length) {
    return { attachment: { type: "template", payload: { template_type: "button", text: texto, buttons: links.map((b) => ({ type: "web_url", url: b.url, title: b.titulo.slice(0, 20) })) } } };
  }
  return { text: texto };
}

/** Anda pelos blocos a partir de `inicio` até uma pausa (resposta ou tempo) ou o fim. */
async function andar(admin: Admin, d: Deps, conexao: ConexaoFluxo, fluxo: Fluxo, exec: Execucao, inicio: NoFluxo | null) {
  const grafo = fluxo.grafo;
  const historico = [...(exec.historico ?? [])];
  const marcar = (no: string, tipo: string) => historico.push({ no, tipo, em: agora() });
  let atual = inicio;
  let primeira = exec.historico.length === 0 && !!exec.comment_id;
  let janelaAte = exec.janela_ate;
  let token: string | null = null;
  for (let i = 0; i < 30; i++) {
    if (!atual) { await gravar(admin, exec.id, { estado: "fim", no_atual: null, historico }); return; }
    const passo = proximoPasso(grafo, atual, { respondeu: exec.respondeu, ultimoTexto: exec.ultimo_texto });
    if (passo.tipo === "fim") {
      if (passo.no) marcar(passo.no.id, "fim");
      await gravar(admin, exec.id, { estado: "fim", no_atual: null, historico, erro: passo.no ? null : passo.motivo });
      return;
    }
    if (passo.tipo === "esperar_tempo") {
      marcar(passo.no.id, "esperar");
      await gravar(admin, exec.id, { estado: "aguardando_tempo", no_atual: passo.no.id, proximo_em: new Date(Date.now() + passo.minutos * 60_000).toISOString(), historico, janela_ate: janelaAte });
      return;
    }
    if (passo.tipo === "enviar") {
      const no = passo.no;
      // Depois de 24 h sem a pessoa falar a Meta não deixa mais mandar: melhor parar limpo do que errar.
      if (!primeira && janelaAte && Date.now() > Date.parse(janelaAte)) {
        await gravar(admin, exec.id, { estado: "fim", no_atual: null, historico, erro: "A janela de 24 h da Meta fechou: a pessoa não respondeu a tempo." });
        return;
      }
      try {
        token ??= await d.tokenAtual(admin, conexao);
        const resp = await d.graph(`${exec.ig_user_id}/messages`, token, {
          recipient: primeira ? { comment_id: exec.comment_id } : { id: exec.contato_id },
          message: corpoDaMensagem(no),
        }) as { message_id?: string } | null;
        await registrarMensagem(admin, { ig_user_id: exec.ig_user_id, contato_id: exec.contato_id, mid: resp?.message_id ?? null, de_mim: true, origem: "fluxo", fluxo_id: fluxo.id,
          texto: textoComBotoes((no.dados.texto ?? "").trim(), [...respostasDoNo(no), ...linksDoNo(no)]) });
      } catch (e) {
        const msg = (e as Error).message;
        marcar(no.id, "erro");
        await gravar(admin, exec.id, { estado: "erro", no_atual: no.id, historico, erro: primeira ? msg : `${msg} (a Meta só deixa a próxima mensagem automática depois que a pessoa responde: ponha botões de resposta na anterior)` });
        return;
      }
      marcar(no.id, "mensagem");
      if (primeira) { janelaAte = new Date(Date.now() + JANELA_MS).toISOString(); primeira = false; }
      if (aguardaResposta(no)) {
        await gravar(admin, exec.id, { estado: "aguardando_resposta", no_atual: no.id, historico, janela_ate: janelaAte });
        return;
      }
      atual = destinoDe(grafo, no.id, "proximo");
      if (!atual) { await gravar(admin, exec.id, { estado: "fim", no_atual: null, historico, janela_ate: janelaAte }); return; }
      continue;
    }
  }
  await gravar(admin, exec.id, { estado: "erro", historico, erro: "Passos demais seguidos (laço no fluxo)." });
}

async function carregarFluxo(admin: Admin, id: string): Promise<Fluxo | null> {
  const { data } = await admin.from("instagram_fluxos").select("*").eq("id", id).maybeSingle();
  return (data as Fluxo | null) ?? null;
}

/** A pessoa respondeu (botão, texto ou postback) a um fluxo em andamento? Devolve true se o fluxo consumiu a mensagem. */
export async function continuarFluxo(admin: Admin, d: Deps, conexao: ConexaoFluxo, evento: EventoFluxo): Promise<boolean> {
  if (evento.origem === "comentario") return false;
  const { data } = await admin.from("instagram_fluxo_execucoes").select("*")
    .eq("ig_user_id", conexao.ig_user_id).eq("contato_id", evento.autorId).in("estado", ["aguardando_resposta", "aguardando_tempo"])
    .order("criado_em", { ascending: false }).limit(1).maybeSingle();
  const exec = data as Execucao | null;
  if (!exec) return false;
  const fluxo = await carregarFluxo(admin, exec.fluxo_id);
  if (!fluxo?.ativo) return false;
  const campos = { respondeu: true, ultimo_texto: evento.texto || evento.payload || "", janela_ate: new Date(Date.now() + JANELA_MS).toISOString() };
  if (exec.estado === "aguardando_tempo") { await gravar(admin, exec.id, campos); return false; }   // só anota: a resposta serve à condição
  const no = fluxo.grafo.nos.find((n) => n.id === exec.no_atual);
  if (!no) return false;
  const saida = saidaDaResposta(no, evento.payload ?? null, evento.texto);
  const destino = saida ? destinoDe(fluxo.grafo, no.id, saida) : null;
  Object.assign(exec, campos);
  if (!destino) {
    await gravar(admin, exec.id, campos);
    return saida !== "outro";   // botão sem caminho: o fluxo acaba aqui; texto livre sem caminho: segue esperando e deixa passar para as automações
  }
  exec.historico = [...(exec.historico ?? []), { no: no.id, tipo: `resposta:${saida}`, em: agora() }];
  await andar(admin, d, conexao, fluxo, exec, destino);
  return true;
}

/** Palavra certa chegou? Começa o fluxo para essa pessoa. Devolve true se algum fluxo assumiu o evento. */
export async function iniciarFluxo(admin: Admin, d: Deps, conexao: ConexaoFluxo, evento: EventoFluxo): Promise<boolean> {
  if (!evento.texto) return false;
  const { data } = await admin.from("instagram_fluxos").select("*")
    .eq("ig_user_id", conexao.ig_user_id).eq("ativo", true).contains("gatilhos", [evento.origem]).order("criado_em", { ascending: false });
  const porPost = evento.origem === "comentario";
  const candidatos = ((data ?? []) as Fluxo[])
    .filter((f) => !porPost || !f.media_ids?.length || (evento.mediaId && f.media_ids.includes(evento.mediaId)))
    .sort((a, b) => porPost ? Number(!!b.media_ids?.length) - Number(!!a.media_ids?.length) : 0);
  const fluxo = candidatos.find((f) => fluxoBate(f, evento.texto));
  if (!fluxo) return false;
  const primeiro = primeiroNo(fluxo.grafo);
  if (!primeiro) return false;

  const { data: criada, error } = await admin.from("instagram_fluxo_execucoes").insert({
    fluxo_id: fluxo.id, user_id: conexao.user_id, ig_user_id: conexao.ig_user_id, contato_id: evento.autorId,
    contato_username: evento.autorUsername, estado: "rodando", comment_id: evento.origem === "comentario" ? evento.eventoId : null,
    evento_id: evento.eventoId, ultimo_texto: evento.texto, janela_ate: evento.origem === "comentario" ? null : new Date(Date.now() + JANELA_MS).toISOString(),
  }).select("*").maybeSingle();
  if (error || !criada) return true;   // reenvio da Meta ou pessoa já está neste fluxo: não repete, mas o evento é do fluxo
  await admin.from("instagram_fluxos").update({ disparos: fluxo.disparos + 1 }).eq("id", fluxo.id);

  const exec = criada as Execucao;
  await andar(admin, d, conexao, fluxo, exec, primeiro);

  const respostas = (fluxo.respostas_comentario ?? []).filter((r) => r.trim());
  if (evento.origem === "comentario" && respostas.length) {
    try {
      const token = await d.tokenAtual(admin, conexao);
      await d.graph(`${evento.eventoId}/replies`, token, { message: respostas[Math.floor(Math.random() * respostas.length)] });
    } catch (e) { console.error("fluxo: resposta pública:", (e as Error).message); }
  }
  return true;
}

/** pg_cron (1 min): retoma as esperas vencidas. */
export async function retomarEsperas(admin: Admin, d: Deps): Promise<number> {
  const { data } = await admin.rpc("fluxo_proximas_execucoes", { p_limite: 10 });
  let n = 0;
  for (const exec of (data ?? []) as Execucao[]) {
    try {
      const fluxo = await carregarFluxo(admin, exec.fluxo_id);
      const { data: conexao } = await admin.from("instagram_conexoes").select("ig_user_id, user_id, access_token, token_expira_em").eq("ig_user_id", exec.ig_user_id).maybeSingle();
      if (!fluxo?.ativo || !conexao) { await gravar(admin, exec.id, { estado: "fim", erro: !conexao ? "Conta desconectada." : "Fluxo desativado." }); continue; }
      const parada = fluxo.grafo.nos.find((x) => x.id === exec.no_atual);
      const proximo = parada ? destinoDe(fluxo.grafo, parada.id, "proximo") : null;
      // recarrega o que a pessoa respondeu durante a espera
      const { data: fresca } = await admin.from("instagram_fluxo_execucoes").select("*").eq("id", exec.id).maybeSingle();
      await andar(admin, d, conexao as ConexaoFluxo, fluxo, (fresca ?? exec) as Execucao, proximo);
      n++;
    } catch (e) {
      console.error("fluxo (tick):", (e as Error).message);
      await gravar(admin, exec.id, { estado: "erro", erro: (e as Error).message.slice(0, 300) });
    }
  }
  return n;
}
