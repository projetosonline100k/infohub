// Roda SÓ na origem do próprio app (ver manifest.json). Escuta o
// window.postMessage que src/lib/extensionBridge.ts manda (sempre pra
// window.location.origin, nunca "*") e repassa pro background via
// chrome.runtime — é o único ponto de contato entre a página e a extensão.
// Genérico de propósito (não hardcoda os tipos de mensagem): qualquer
// {source:"infopro-assistant", type, ...} que a página mandar é repassado
// como está pro background.js decidir o que fazer.
window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.source !== "infopro-assistant" || !data.type) return;

  const { source, ...mensagem } = data;
  void source;
  chrome.runtime.sendMessage(mensagem);
});
