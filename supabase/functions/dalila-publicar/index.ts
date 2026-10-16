// Dalila na nuvem: publica no Instagram os carrosséis que o Davi programou
// (docs/agentes/dalila-programacao.md). O pg_cron chama a cada minuto com a
// chave do Vault (migração 20261014100000_dalila_publicacao). Cada chamada
// trabalha um carrossel, com trava de 3 min, em passos curtos:
//   1. converte as páginas PNG → JPEG (a Meta só aceita JPEG) e guarda no
//      bucket `carrosseis`, em <cliente>/<carrossel>/publicar/v<versao>/NN.jpg;
//   2. na hora marcada, segue o processo do manual: valida o perfil, confere
//      duplicata, cria cada imagem com is_carousel_item, cria o CAROUSEL na
//      ordem, espera FINISHED, confere duplicata de novo, media_publish e
//      recupera o post real (permalink, horário, páginas).
// Resposta ambígua ou falha: a próxima chamada consulta a Meta antes de
// tentar de novo. Nunca publica em dobro. Escolher a data = ok do Davi.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode as decodePng } from "npm:fast-png@6.2.0";
import jpeg from "npm:jpeg-js@0.4.4";

const GRAPH = "https://graph.instagram.com/v25.0";
const RENOVAR_ANTES_MS = 20 * 24 * 60 * 60 * 1000;
const MAX_TENTATIVAS = 3;
const CONTAINER_VALIDO_MS = 23 * 60 * 60 * 1000; // a Meta expira em 24h
const ORCAMENTO_CONVERSAO_MS = 1500;

type Carrossel = {
  id: string; cliente_id: string; user_id: string | null; numero: number | null; tema: string;
  status: string; legenda: string | null; paginas: string[]; paginas_jpg: string[]; versao: number;
  programado_para: string | null; atividade_id: string | null; tarefa_data_id: string | null;
  ig_container_id: string | null; ig_container_em: string | null; publicacao_tentativas: number;
  criado_em: string;
};
type Conexao = { ig_user_id: string; username: string | null; access_token: string; token_expira_em: string | null };

// deno-lint-ignore no-explicit-any
type Admin = any;

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

class ErroMeta extends Error {
  constructor(msg: string, readonly definitivo = false) { super(msg); }
}

async function meta(metodo: "GET" | "POST", caminho: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${GRAPH}/${caminho}`);
  const init: RequestInit = { method: metodo, headers: { Authorization: `Bearer ${token}` } };
  if (metodo === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  else init.body = new URLSearchParams(params);
  const res = await fetch(url, init);
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.error) {
    const e = payload?.error ?? {};
    // 10/200/190 = sem permissão ou token inválido: tentar de novo não resolve.
    const definitivo = [10, 190, 200].includes(Number(e.code)) || /permission/i.test(String(e.message ?? ""));
    throw new ErroMeta(String(e.error_user_msg ?? e.message ?? `HTTP ${res.status}`), definitivo);
  }
  return payload;
}

const nome = (c: Carrossel) => `${c.numero ? `${String(c.numero).padStart(3, "0")} · ` : ""}${c.tema}`;
const normalizar = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

async function soltar(admin: Admin, id: string, campos: Record<string, unknown> = {}) {
  await admin.from("carrosseis").update({ ...campos, publicacao_trava_ate: null, atualizado_em: new Date().toISOString() }).eq("id", id);
}

// ---------- 1. PNG → JPEG ----------
async function converterPaginas(admin: Admin, c: Carrossel) {
  const inicio = Date.now();
  const jpgs = [...c.paginas_jpg];
  while (jpgs.length < c.paginas.length && (jpgs.length === c.paginas_jpg.length || Date.now() - inicio < ORCAMENTO_CONVERSAO_MS)) {
    const i = jpgs.length;
    const res = await fetch(c.paginas[i]);
    if (!res.ok) throw new Error(`página ${i + 1} não abriu (HTTP ${res.status})`);
    const png = decodePng(new Uint8Array(await res.arrayBuffer()));
    if (png.depth !== 8) throw new Error(`página ${i + 1}: PNG de ${png.depth} bits`);
    const canais = png.channels;
    const rgba = new Uint8Array(png.width * png.height * 4);
    for (let p = 0, q = 0; p < rgba.length; p += 4, q += canais) {
      // Transparência vira fundo branco.
      const a = canais === 4 || canais === 2 ? png.data[q + canais - 1] / 255 : 1;
      const r = png.data[q], g = canais >= 3 ? png.data[q + 1] : r, b = canais >= 3 ? png.data[q + 2] : r;
      rgba[p] = Math.round(r * a + 255 * (1 - a));
      rgba[p + 1] = Math.round(g * a + 255 * (1 - a));
      rgba[p + 2] = Math.round(b * a + 255 * (1 - a));
      rgba[p + 3] = 255;
    }
    const saida = jpeg.encode({ data: rgba, width: png.width, height: png.height }, 92).data;
    const caminho = `${c.cliente_id}/${c.id}/publicar/v${c.versao}/${String(i + 1).padStart(2, "0")}.jpg`;
    const { error } = await admin.storage.from("carrosseis").upload(caminho, saida, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`página ${i + 1} não subiu: ${error.message}`);
    jpgs.push(admin.storage.from("carrosseis").getPublicUrl(caminho).data.publicUrl);
  }
  await soltar(admin, c.id, { paginas_jpg: jpgs });
  return { convertidas: jpgs.length - c.paginas_jpg.length, total: c.paginas.length };
}

// ---------- 2. Publicação ----------
// Regra única do banco (dalila_conexao_do_projeto, a mesma do gatilho
// carrossel_confere_instagram): o Instagram do próprio projeto; a conta geral
// só para o projeto Davi Queiroz. Projeto sem Instagram nunca cai em outro perfil.
async function conexaoDo(admin: Admin, c: Carrossel): Promise<Conexao | null> {
  const { data: igUserId, error } = await admin.rpc("dalila_conexao_do_projeto", { p_cliente: c.cliente_id });
  if (error) throw new Error(`não deu para conferir o Instagram do projeto: ${error.message}`);
  if (!igUserId) return null;
  const { data } = await admin.from("instagram_conexoes")
    .select("ig_user_id, username, access_token, token_expira_em").eq("ig_user_id", igUserId).maybeSingle();
  return data ?? null;
}

async function tokenAtual(admin: Admin, conexao: Conexao) {
  const expira = conexao.token_expira_em ? Date.parse(conexao.token_expira_em) : 0;
  if (expira && expira - Date.now() > RENOVAR_ANTES_MS) return conexao.access_token;
  try {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", conexao.access_token);
    const payload = await fetch(url).then((r) => r.json());
    if (!payload.access_token) throw new Error(payload?.error?.message ?? "sem token");
    await admin.from("instagram_conexoes").update({
      access_token: payload.access_token,
      token_expira_em: new Date(Date.now() + Number(payload.expires_in ?? 0) * 1000).toISOString(),
      token_atualizado_em: new Date().toISOString(),
    }).eq("ig_user_id", conexao.ig_user_id);
    return payload.access_token as string;
  } catch (e) {
    console.error("falha ao renovar token do Instagram:", (e as Error).message);
    return conexao.access_token;
  }
}

// Já existe um carrossel com esta legenda, depois que o carrossel nasceu?
async function procurarPublicado(conexao: Conexao, token: string, c: Carrossel): Promise<string | null> {
  const lista = await meta("GET", `${conexao.ig_user_id}/media`, token, { fields: "id,caption,media_type,timestamp", limit: "25" });
  const legenda = normalizar(c.legenda);
  const achado = (lista.data ?? []).find((m: { caption?: string; media_type?: string; timestamp?: string }) =>
    m.media_type === "CAROUSEL_ALBUM" && normalizar(m.caption) === legenda && Date.parse(m.timestamp ?? "") >= Date.parse(c.criado_em));
  return achado?.id ?? null;
}

async function finalizar(admin: Admin, c: Carrossel, token: string, mediaId: string) {
  const post = await meta("GET", mediaId, token, { fields: "id,permalink,timestamp,children{id}" });
  const paginas = post.children?.data?.length ?? 0;
  const aviso = paginas === c.paginas.length ? "" : ` · ATENÇÃO: o post tem ${paginas} páginas, o carrossel tinha ${c.paginas.length}`;
  await soltar(admin, c.id, {
    status: "publicado", ig_media_id: mediaId, permalink: post.permalink ?? null,
    publicado_em: post.timestamp ? new Date(post.timestamp).toISOString() : new Date().toISOString(),
    mensagem: `Publicado com ${paginas} páginas${aviso}`,
  });
  if (c.atividade_id) {
    await admin.from("atividades").update({ concluida: true, situacao: "concluida", observacao: post.permalink ?? null }).eq("id", c.atividade_id);
  }
  return { publicado: post.permalink, paginas };
}

// Não deu: volta pro Davi escolher outra data, com o motivo na tarefa.
async function devolverAoDavi(admin: Admin, c: Carrossel, motivo: string) {
  await soltar(admin, c.id, {
    status: "aprovado", programado_para: null, ig_container_id: null, ig_container_em: null,
    mensagem: `Não publicou: ${motivo}`,
  });
  if (c.tarefa_data_id) {
    await admin.from("atividades").update({
      concluida: false, situacao: "fila", titulo: `Escolher nova data do carrossel: ${nome(c)}`,
      observacao: `A Dalila não conseguiu publicar: ${motivo}`,
    }).eq("id", c.tarefa_data_id);
  }
  if (c.atividade_id) await admin.from("atividades").update({ situacao: "fila", data_vencimento: null }).eq("id", c.atividade_id);
  return { devolvido: motivo };
}

function conferir(c: Carrossel): string | null {
  if (!normalizar(c.legenda)) return "o carrossel está sem legenda";
  if (c.paginas.length < 2 || c.paginas.length > 10) return `${c.paginas.length} páginas (a Meta aceita de 2 a 10)`;
  if (c.paginas_jpg.length !== c.paginas.length) return "as páginas em JPEG não batem com as revisadas";
  if (new Set(c.paginas).size !== c.paginas.length || new Set(c.paginas_jpg).size !== c.paginas_jpg.length) return "há página repetida";
  if (c.paginas_jpg.some((u) => !u.includes(`/publicar/v${c.versao}/`))) return "JPEG de outra versão do carrossel";
  return null;
}

async function esperarContainer(token: string, id: string) {
  for (let i = 0; i < 10; i++) {
    const { status_code } = await meta("GET", id, token, { fields: "status_code" });
    if (status_code !== "IN_PROGRESS") return status_code as string;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return "IN_PROGRESS";
}

async function publicar(admin: Admin, c: Carrossel) {
  const problema = conferir(c);
  if (problema) return devolverAoDavi(admin, c, problema);
  if (c.status === "programado") await admin.from("carrosseis").update({ status: "publicando", mensagem: "Dalila publicando agora" }).eq("id", c.id);

  const conexao = await conexaoDo(admin, c);
  if (!conexao) return devolverAoDavi(admin, c, "nenhum Instagram conectado para este projeto");
  const token = await tokenAtual(admin, conexao);

  try {
    const eu = await meta("GET", "me", token, { fields: "user_id,username" });
    if (String(eu.user_id ?? eu.id) !== conexao.ig_user_id) return devolverAoDavi(admin, c, "o token não é do perfil conectado");

    const ja = await procurarPublicado(conexao, token, c);
    if (ja) return finalizar(admin, c, token, ja);
    if (c.publicacao_tentativas >= MAX_TENTATIVAS) return devolverAoDavi(admin, c, `${MAX_TENTATIVAS} tentativas sem sucesso`);

    let container = c.ig_container_id && c.ig_container_em && Date.now() - Date.parse(c.ig_container_em) < CONTAINER_VALIDO_MS
      ? c.ig_container_id : null;
    if (!container) {
      const filhos: string[] = [];
      for (const url of c.paginas_jpg) {
        const { id } = await meta("POST", `${conexao.ig_user_id}/media`, token, { image_url: url, is_carousel_item: "true" });
        filhos.push(id);
      }
      const criado = await meta("POST", `${conexao.ig_user_id}/media`, token, {
        media_type: "CAROUSEL", children: filhos.join(","), caption: c.legenda ?? "",
      });
      container = criado.id as string;
      await admin.from("carrosseis").update({ ig_container_id: container, ig_container_em: new Date().toISOString() }).eq("id", c.id);
    }

    const estado = await esperarContainer(token, container);
    if (estado === "IN_PROGRESS") { await soltar(admin, c.id); return { esperando: "Meta ainda processando" }; }
    if (estado !== "FINISHED") {
      await soltar(admin, c.id, { ig_container_id: null, ig_container_em: null, publicacao_tentativas: c.publicacao_tentativas + 1,
        mensagem: `Meta recusou o carrossel (${estado}); tento de novo` });
      return { recusado: estado };
    }

    const jaDeNovo = await procurarPublicado(conexao, token, c);
    if (jaDeNovo) return finalizar(admin, c, token, jaDeNovo);

    // A partir daqui a resposta pode ser ambígua: conta a tentativa antes.
    await admin.from("carrosseis").update({ publicacao_tentativas: c.publicacao_tentativas + 1 }).eq("id", c.id);
    const { id: mediaId } = await meta("POST", `${conexao.ig_user_id}/media_publish`, token, { creation_id: container });
    return finalizar(admin, c, token, mediaId);
  } catch (e) {
    const erro = e as ErroMeta;
    if (erro.definitivo) {
      const motivo = /permission/i.test(erro.message)
        ? "falta a permissão de publicar no Instagram (reconecte o Instagram em Automações)"
        : erro.message;
      return devolverAoDavi(admin, c, motivo);
    }
    // Ambíguo: a próxima chamada consulta a Meta antes de tentar de novo.
    await soltar(admin, c.id, { mensagem: `Meta respondeu: ${erro.message}. Confiro antes de tentar de novo.` });
    return { erro: erro.message };
  }
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: ok } = await admin.rpc("dalila_chave_ok", { p_chave: req.headers.get("x-dalila-chave") ?? "" });
  if (!ok) return json({ erro: "não autorizado" }, 401);

  const { data: fila, error } = await admin.rpc("dalila_proximo_carrossel");
  if (error) return json({ erro: error.message }, 500);
  const c = (fila ?? [])[0] as Carrossel | undefined;
  if (!c) return json({ nada: true });

  try {
    if (c.paginas_jpg.length < c.paginas.length) return json({ carrossel: c.id, ...(await converterPaginas(admin, c)) });
    if (!c.programado_para || Date.parse(c.programado_para) > Date.now()) { await soltar(admin, c.id); return json({ cedo: true }); }
    return json({ carrossel: c.id, ...(await publicar(admin, c)) });
  } catch (e) {
    console.error("dalila-publicar:", (e as Error).message);
    await soltar(admin, c.id, { mensagem: `Dalila: ${(e as Error).message}` });
    return json({ erro: (e as Error).message }, 500);
  }
});
