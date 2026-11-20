import type { SupabaseClient } from "@supabase/supabase-js";

// Bolinha flutuante dos agentes no Mac (17/11 Lauro; 20/11 Danilo, Davi: "quando o Danilo esteja editando, fique igual do Lauro").
// Cada agente diz como saber se está trabalhando agora e o que mostrar embaixo da bolinha.
export type AgenteOrbe = "lauro" | "danilo";
export interface TrabalhoAgente { id: string; resumo: string }

export const ORBES: Record<AgenteOrbe, { nome: string; rotulo: string; rota: string; controle: boolean; acima: number }> = {
  lauro: { nome: "Lauro", rotulo: "lauro-orbe", rota: "/lauro-orbe", controle: true, acima: 0 },
  // Danilo edita no servidor (não mexe no Mac): sem "Parar controle". Fica logo acima da do Lauro para as duas caberem juntas.
  danilo: { nome: "Danilo", rotulo: "danilo-orbe", rota: "/danilo-orbe", controle: false, acima: 200 },
};

const minutosAtras = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const curto = (t: string) => { const s = t.replace(/\s+/g, " ").trim(); return s.length > 70 ? `${s.slice(0, 70)}…` : s; };

function resumoLauro(mensagem: string): string {
  return /^(NOVO ROTEIRO|AJUSTE no roteiro)/.test(mensagem) ? "Produzindo um roteiro" : curto(mensagem);
}

const ETAPA_DANILO: Record<string, string> = { editando: "Editando", renderizando: "Gerando a versão", aprovando: "Gerando o vídeo final" };

/** O trabalho em andamento do agente; `null` = parado; `undefined` = não deu para saber (sem sessão/rede: não fecha a bolinha por isso). */
export async function trabalhoAtual(agente: AgenteOrbe, db: SupabaseClient): Promise<TrabalhoAgente | null | undefined> {
  if (agente === "lauro") {
    const { data, error } = await db.from("esteira_dark_pedidos").select("id, mensagem").in("status", ["pendente", "processando"]).gte("criado_em", minutosAtras(30)).order("criado_em", { ascending: false }).limit(1);
    if (error) return undefined;
    const p = (data ?? [])[0] as { id: string; mensagem: string } | undefined;
    return p ? { id: p.id, resumo: resumoLauro(p.mensagem) } : null;
  }
  // Danilo: edição em andamento (status do vídeo)…
  const ed = await db.from("edicoes_video").select("id, titulo, status").in("status", Object.keys(ETAPA_DANILO)).gte("atualizado_em", minutosAtras(90)).order("atualizado_em", { ascending: false }).limit(1);
  if (ed.error) return undefined;
  const e = (ed.data ?? [])[0] as { id: string; titulo: string | null; status: string } | undefined;
  if (e) return { id: e.id, resumo: curto(`${ETAPA_DANILO[e.status]}: ${(e.titulo ?? "vídeo").replace(/^Bruto\s+/i, "")}`) };
  // …ou um ajuste pedido no chat dele que ainda não foi respondido.
  const ms = await db.from("briefing_mensagens").select("briefing_id").eq("papel", "davi").in("status", ["enviada", "lida"]).gte("criada_em", minutosAtras(30)).limit(20);
  if (ms.error) return undefined;
  const conversas = [...new Set(((ms.data ?? []) as { briefing_id: string }[]).map((m) => m.briefing_id))];
  if (!conversas.length) return null;
  const br = await db.from("briefings").select("id, membros!inner(nome)").in("id", conversas).ilike("membros.nome", "danilo%").limit(1);
  if (br.error) return undefined;
  const b = (br.data ?? [])[0] as { id: string } | undefined;
  return b ? { id: b.id, resumo: "Ajustando a edição a pedido seu" } : null;
}
