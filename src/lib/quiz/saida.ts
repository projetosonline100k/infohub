/** Põe o cupom no link do checkout da Kiwify (`?coupon=CODIGO`, central de ajuda "Cupons de desconto"). Outros endereços e cupom vazio ficam como estão. */
export function comCupom(url: string, cupom: string | undefined): string {
  const codigo = (cupom ?? "").trim();
  if (!codigo || !/^https:\/\//i.test(url)) return url;
  try {
    const u = new URL(url);
    if (!/(^|\.)kiwify\.com\.br$/i.test(u.hostname)) return url;
    u.searchParams.set("coupon", codigo);
    return u.toString();
  } catch { return url; }
}
