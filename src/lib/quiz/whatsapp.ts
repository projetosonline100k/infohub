/** Link de conversa no WhatsApp com a mensagem já escrita. Aceita número com DDD (ganha o 55) ou já com 55; fora disso devolve vazio. */
export function linkWhatsapp(numero: string | undefined, mensagem?: string): string {
  let d = (numero ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^55\d{10,11}$/.test(d)) return "";
  const texto = (mensagem ?? "").trim();
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}
