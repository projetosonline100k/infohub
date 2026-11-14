// Conversa de cada pessoa no Many Hub (migração 20261114020000_manyhub_mensagens): guarda as DMs que chegam e as que saem,
// e o @ de quem escreve. O app só lê; quem escreve aqui é o robô.
// deno-lint-ignore no-explicit-any
type Admin = any;
const GRAPH = "https://graph.instagram.com/v23.0";

export type MensagemLog = {
  ig_user_id: string; contato_id: string; mid?: string | null; de_mim: boolean; origem: "contato" | "fluxo" | "automacao" | "davi" | "instagram";
  tipo?: "texto" | "comentario" | "midia" | "botao"; texto?: string | null; fluxo_id?: string | null;
};

/** Guarda a mensagem; a mesma mensagem (mesmo mid) que a Meta reenvia não entra duas vezes. Nunca derruba o robô. */
export async function registrarMensagem(admin: Admin, m: MensagemLog) {
  try {
    const { error } = await admin.from("instagram_mensagens").insert({
      ig_user_id: m.ig_user_id, contato_id: m.contato_id, mid: m.mid ?? null, de_mim: m.de_mim, origem: m.origem, tipo: m.tipo ?? "texto",
      texto: (m.texto ?? "").slice(0, 4000) || null, fluxo_id: m.fluxo_id ?? null,
    });
    if (error && error.code !== "23505") console.error("many hub: mensagem não guardada:", error.message);
  } catch (e) { console.error("many hub:", (e as Error).message); }
}

/** Guarda o @ e o nome de quem escreve (uma vez; a Meta só entrega o id no webhook). */
export async function garantirContato(admin: Admin, token: string, igUserId: string, contatoId: string, username?: string | null) {
  try {
    const { data: ja } = await admin.from("instagram_contatos").select("username").eq("ig_user_id", igUserId).eq("contato_id", contatoId).maybeSingle();
    if (ja?.username && !username) return;
    let nome: string | null = null, user = username ?? null;
    if (!user) {
      const res = await fetch(`${GRAPH}/${contatoId}?fields=name,username`, { headers: { Authorization: `Bearer ${token}` } });
      const p = await res.json().catch(() => null);
      if (res.ok && p) { user = p.username ?? null; nome = p.name ?? null; }
    }
    await admin.from("instagram_contatos").upsert({ ig_user_id: igUserId, contato_id: contatoId, username: user ?? ja?.username ?? null, nome, atualizado_em: new Date().toISOString() }, { onConflict: "ig_user_id,contato_id" });
  } catch (e) { console.error("many hub: contato:", (e as Error).message); }
}

/** Texto que aparece no chat para uma mensagem com botões (o que a pessoa viu). */
export function textoComBotoes(texto: string, botoes: { titulo: string }[]) {
  return botoes.length ? `${texto}\n${botoes.map((b) => `▫ ${b.titulo}`).join("   ")}` : texto;
}

export const JANELA_RESPOSTA_MS = 24 * 60 * 60 * 1000;
