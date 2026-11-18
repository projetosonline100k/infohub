// CRM por projeto (18/11/2026): rótulos e limpeza de telefone usados pela tela.
export const ROTULO_ORIGEM: Record<string, string> = {
  manual: "Manual", quiz: "Quiz", instagram: "Instagram", venda: "Compra", whatsapp: "WhatsApp",
};
export const ROTULO_EVENTO: Record<string, string> = {
  entrou: "Entrou", etapa: "Mudou de etapa", quiz: "Quiz", abordagem: "Abordagem", compra: "Compra", reembolso: "Reembolso", instagram: "Instagram", nota: "Anotação", funil: "Funil",
};
/** Só dígitos (com DDI se vier); menos de 10 dígitos não é telefone. */
export function limparTelefone(v: string): string | null {
  const d = v.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 ? d : null;
}
