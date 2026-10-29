// O Escritório de um projeto tem a própria gaveta da equipe (com mais detalhe); enquanto ele está na tela, a
// gaveta que aparece em todo o app (EquipeGlobal) some, para não ficarem duas (28/10).
let abertos = 0;
const EVENTO = "equipe-local-mudou";
export const equipeLocalNaTela = () => abertos > 0;
export function marcarEquipeLocal(delta: 1 | -1) {
  abertos = Math.max(0, abertos + delta);
  window.dispatchEvent(new Event(EVENTO));
}
export function aoMudarEquipeLocal(fn: () => void) {
  window.addEventListener(EVENTO, fn);
  return () => window.removeEventListener(EVENTO, fn);
}
