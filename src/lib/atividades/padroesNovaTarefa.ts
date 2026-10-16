// Tarefa sem dono e sem prazo não é cobrada pelo Atlas e some do
// "atrasadas". Por isso toda tarefa criada pelo quadro já nasce com um
// prazo e (em projeto) com o responsável mais comum do projeto — dá pra
// trocar no cartão depois. Sem imports para o teste em tests/ rodar direto.

export const DIAS_PRAZO_PADRAO = 3;

// Tarefa marcada para um dia específico (calendário ou coluna de dia da
// semana) vence nesse dia; o resto ganha +3 dias a partir de hoje.
export function prazoPadrao(dataAtividade: string, diaEscolhido: boolean, hoje: Date = new Date()): string {
  if (diaEscolhido) return dataAtividade;
  const prazo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + DIAS_PRAZO_PADRAO);
  const mes = String(prazo.getMonth() + 1).padStart(2, "0");
  const dia = String(prazo.getDate()).padStart(2, "0");
  return `${prazo.getFullYear()}-${mes}-${dia}`;
}

// "responsavel_nome" pode ter várias pessoas separadas por vírgula (ver
// src/lib/responsaveis.ts); cada nome conta um voto. Empate fica com quem
// apareceu primeiro na lista (a consulta vem das mais recentes).
export function responsavelMaisComum(atividades: { responsavel_nome: string | null }[]): string | null {
  const contagem = new Map<string, number>();
  for (const atividade of atividades) {
    for (const nome of (atividade.responsavel_nome || "").split(",")) {
      const limpo = nome.trim();
      if (limpo) contagem.set(limpo, (contagem.get(limpo) || 0) + 1);
    }
  }
  let melhor: string | null = null;
  let maior = 0;
  contagem.forEach((total, nome) => {
    if (total > maior) {
      melhor = nome;
      maior = total;
    }
  });
  return melhor;
}

// Rótulo do aviso no cartão de tarefa aberta, ou null se está tudo certo.
export function rotuloFaltando(responsavelNome: string | null | undefined, dataVencimento: string | null | undefined): string | null {
  const semDono = !(responsavelNome || "").trim();
  const semPrazo = !dataVencimento;
  if (semDono && semPrazo) return "Sem dono e sem prazo";
  if (semDono) return "Sem dono";
  if (semPrazo) return "Sem prazo";
  return null;
}
