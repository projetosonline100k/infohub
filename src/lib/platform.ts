// Única fonte de verdade pra saber se o código está rodando dentro do app
// desktop (Tauri) ou no navegador normal. Nunca importe `@tauri-apps/api`
// (ou qualquer plugin) direto num componente — sempre por trás de
// `isDesktop()` (aqui ou em src/lib/desktop/*), pra web continuar
// funcionando sem o runtime do Tauri disponível.
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
