// Único administrador por enquanto — mesma constante usada no lado do
// servidor (supabase/functions/admin-users). Se precisar de mais de um
// admin um dia, isso vira uma coluna/tabela em vez de uma constante fixa.
export const ADMIN_EMAIL = "eu.daviqueiroz22@gmail.com";

export function ehAdmin(email: string | null | undefined): boolean {
  return (email || "").trim().toLowerCase() === ADMIN_EMAIL;
}
