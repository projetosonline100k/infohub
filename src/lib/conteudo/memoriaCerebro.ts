import type { CerebroEscrita, SecaoCerebro } from "./escritaAgentes";

// Memória automática do cérebro (15/11/2026, Davi: "eu vou jogando as informações no chat e ele vai guardando, criando o mapa mental conforme eu peço ou registro coisas").
// A cada mensagem, um segundo pedido ao Claude decide se há informação DURÁVEL sobre o perfil (tom, regras, bio, narrativa, preferências) e em qual seção entra.
// Lógica pura (prompt, leitura da resposta, aplicação no cérebro): testes em tests/memoriaCerebro.test.mjs.

export interface ItemMemoria { secao: string; linhas: string[] }
export interface ResumoMemoria { secao: string; novas: string[]; criou: boolean }

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Mensagens que são só um pedido de texto/pergunta curta não valem uma chamada de memória. */
export function vale(mensagem: string): boolean {
  const t = mensagem.trim();
  if (t.length < 25) return /^(guarda|registra|anota|lembra)\b/i.test(t);
  return true;
}

export function pedidoDeMemoria(cerebro: CerebroEscrita, mensagem: string): string {
  const secoes = (cerebro.secoes ?? []).map((s) => `## ${(s.titulo ?? "").trim() || "Sem título"}\n${(s.texto ?? "").trim() || "(vazia)"}`).join("\n\n") || "(o cérebro ainda está vazio)";
  return `Você é o arquivista do CÉREBRO do perfil "${cerebro.nome}": a memória que a IA lê antes de escrever qualquer roteiro desse perfil.
O Davi acabou de escrever esta mensagem no chat:
"""
${mensagem.trim().slice(0, 4000)}
"""

Seções atuais do cérebro:
${secoes.slice(0, 12000)}

Tarefa: se a mensagem traz informação DURÁVEL sobre o perfil (quem é, bio, posicionamento, narrativa, tom de voz, regras do que fazer ou evitar, exemplos de fala, público, preferências, correções do jeito de escrever), diga o que guardar e em qual seção.
Se for só um pedido para escrever algo, uma pergunta, ou conversa do momento, NÃO guarde nada.
Regras:
- Reaproveite uma seção que já existe (use o MESMO título). Só crie seção nova se o assunto não couber em nenhuma.
- Cada linha é uma informação completa e curta, em português, na voz de quem descreve o perfil. Não repita o que já está lá.
- Se o Davi disser "guarda", "registra", "anota" ou "lembra", guarde o que ele pediu.
Responda SOMENTE com JSON, sem texto antes nem depois: {"guardar": [{"secao": "título", "linhas": ["..."]}]}  (lista vazia se não há nada para guardar).`;
}

/** Lê a resposta do Claude: aceita JSON puro ou dentro de cercas; qualquer coisa estranha vira "nada a guardar". */
export function lerMemoria(resposta: string): ItemMemoria[] {
  const bruto = (resposta ?? "").trim();
  const ini = bruto.indexOf("{"), fim = bruto.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return [];
  try {
    const d = JSON.parse(bruto.slice(ini, fim + 1)) as { guardar?: { secao?: unknown; linhas?: unknown }[] };
    return (Array.isArray(d.guardar) ? d.guardar : [])
      .map((x) => ({ secao: String(x.secao ?? "").trim().slice(0, 80), linhas: (Array.isArray(x.linhas) ? x.linhas : []).map((l) => String(l).trim()).filter(Boolean).slice(0, 12) }))
      .filter((x) => x.secao && x.linhas.length);
  } catch { return []; }
}

/** Põe as linhas novas no cérebro: seção com o mesmo título recebe no fim (sem repetir linha já existente); senão nasce uma seção. */
export function aplicarMemoria(cerebro: CerebroEscrita, itens: ItemMemoria[]): { cerebro: CerebroEscrita; resumo: ResumoMemoria[] } {
  const secoes: SecaoCerebro[] = (cerebro.secoes ?? []).map((s) => ({ ...s }));
  const resumo: ResumoMemoria[] = [];
  for (const it of itens) {
    const k = norm(it.secao);
    let sec = secoes.find((s) => norm(s.titulo ?? "") === k);
    const criou = !sec;
    if (!sec) { sec = { titulo: it.secao, texto: "" }; secoes.push(sec); }
    const existentes = new Set((sec.texto ?? "").split("\n").map(norm).filter(Boolean));
    const novas = it.linhas.filter((l) => !existentes.has(norm(l)));
    if (!novas.length && !criou) continue;
    sec.texto = [(sec.texto ?? "").trim(), ...novas].filter(Boolean).join("\n");
    resumo.push({ secao: sec.titulo ?? it.secao, novas, criou });
  }
  return { cerebro: { ...cerebro, secoes }, resumo };
}
