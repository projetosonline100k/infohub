// Aparência do Infopro (24/10, Davi: "temas visuais — Papel Vintage e Papel Preto, com textura de papel — e a
// cor de destaque que eu escolher"). Três camadas no <html>, todas só com variáveis de cor (src/index.css):
//   1. modo: a classe `dark` (o tema diz se é claro ou escuro; no "Atual" é o botão de sol/lua);
//   2. tema: `tema-papel-vintage` / `tema-papel-preto` redefinem fundo, superfícies, bordas, texto e textura;
//   3. destaque: `data-destaque` (+ --destaque-h/s/l) troca só a cor de destaque (botão principal, seleção,
//      foco, links), sem mexer no fundo do tema.
// Fica salvo no navegador (vale para todas as janelas do app) e é aplicado antes de desenhar (src/main.tsx).

export type TemaVisual = "atual" | "papel-vintage" | "papel-preto";
export type Modo = "light" | "dark";
export type Destaque = "padrao" | "azul" | "ciano" | "dourado" | "verde" | "roxo" | "vermelho" | "personalizada";

export interface Aparencia { tema: TemaVisual; modo: Modo; destaque: Destaque; personalizada: string }

/** Cores para a miniatura do card de cada tema (fundo, lateral, card, texto, destaque). */
export interface Previa { fundo: string; lateral: string; card: string; texto: string; texto2: string; destaque: string; borda: string }

export const TEMAS: { id: TemaVisual; nome: string; base: Modo | null; previa: Record<Modo, Previa> | Previa; textura: boolean }[] = [
  {
    id: "atual", nome: "Atual", base: null, textura: false,
    previa: {
      light: { fundo: "#FAFAFA", lateral: "#F5F5F5", card: "#FFFFFF", texto: "#1A1A1A", texto2: "#737373", destaque: "#DBA20B", borda: "#E0E0E0" },
      dark: { fundo: "#071015", lateral: "#08131A", card: "#0D171D", texto: "#F5F7F8", texto2: "#8B98A1", destaque: "#22D3EE", borda: "#212D33" },
    },
  },
  {
    id: "papel-vintage", nome: "Papel Vintage", base: "light", textura: true,
    previa: { fundo: "#E7D3AD", lateral: "#D1AD72", card: "#F1DFC0", texto: "#2B2118", texto2: "#75624C", destaque: "#B5792C", borda: "#B88A4C" },
  },
  {
    id: "papel-preto", nome: "Papel Preto", base: "dark", textura: true,
    previa: { fundo: "#11110F", lateral: "#151512", card: "#1D1C18", texto: "#F3EBDD", texto2: "#A9A296", destaque: "#C99A4A", borda: "#3B382F" },
  },
];

/** H S L de cada cor de destaque pronta (a personalizada vem do seletor). */
export const DESTAQUES: { id: Exclude<Destaque, "padrao" | "personalizada">; nome: string; hex: string; hsl: [number, number, number] }[] = [
  { id: "azul", nome: "Azul", hex: "#3B82F6", hsl: [217, 91, 60] },
  { id: "ciano", nome: "Ciano", hex: "#22D3EE", hsl: [188, 86, 53] },
  { id: "dourado", nome: "Dourado", hex: "#C99A4A", hsl: [38, 54, 54] },
  { id: "verde", nome: "Verde", hex: "#22C55E", hsl: [142, 71, 45] },
  { id: "roxo", nome: "Roxo", hex: "#8B5CF6", hsl: [258, 90, 66] },
  { id: "vermelho", nome: "Vermelho", hex: "#EF4444", hsl: [0, 84, 60] },
];

const CHAVES = { modo: "theme", tema: "tema-visual", destaque: "cor-destaque", personalizada: "cor-destaque-personalizada" } as const;
export const CHAVES_APARENCIA: readonly string[] = Object.values(CHAVES);
export const EVENTO_APARENCIA = "infopro-aparencia";

export function hexParaHsl(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}

/** Texto em cima do botão de destaque: escuro em cor clara (ciano, dourado), branco nas outras. */
export function textoSobre([h, s, l]: [number, number, number]): "escuro" | "claro" {
  // Luminância aproximada pelo HSL → RGB.
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  const lum = 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
  return lum > 0.45 ? "escuro" : "claro";
}

export const modoDoTema = (a: Pick<Aparencia, "tema" | "modo">): Modo => TEMAS.find((t) => t.id === a.tema)?.base ?? a.modo;

export function lerAparencia(): Aparencia {
  const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
  const tema = ler(CHAVES.tema);
  const destaque = ler(CHAVES.destaque);
  const modo = ler(CHAVES.modo);
  return {
    tema: TEMAS.some((t) => t.id === tema) ? (tema as TemaVisual) : "atual",
    // O escuro é a identidade padrão do Infopro (redesign): sem nada salvo, abre escuro.
    modo: modo === "light" ? "light" : "dark",
    destaque: destaque === "personalizada" || DESTAQUES.some((d) => d.id === destaque) ? (destaque as Destaque) : "padrao",
    personalizada: ler(CHAVES.personalizada) ?? "#22D3EE",
  };
}

export function guardarAparencia(a: Aparencia) {
  try {
    localStorage.setItem(CHAVES.tema, a.tema);
    // "theme" segue sendo o modo de fato (claro/escuro): o Excalidraw, os avisos e as outras janelas leem ele.
    localStorage.setItem(CHAVES.modo, modoDoTema(a));
    localStorage.setItem(CHAVES.destaque, a.destaque);
    localStorage.setItem(CHAVES.personalizada, a.personalizada);
  } catch { /* sem storage: vale só nesta janela */ }
}

/** Põe as classes e variáveis no <html>. Barato: pode rodar a cada mudança. */
export function aplicarAparencia(a: Aparencia, raiz: HTMLElement = document.documentElement) {
  raiz.classList.toggle("dark", modoDoTema(a) === "dark");
  for (const t of TEMAS) raiz.classList.toggle(`tema-${t.id}`, t.id === a.tema && t.id !== "atual");
  raiz.classList.toggle("tema-papel", !!TEMAS.find((t) => t.id === a.tema)?.textura);
  const hsl = a.destaque === "personalizada" ? hexParaHsl(a.personalizada) : DESTAQUES.find((d) => d.id === a.destaque)?.hsl ?? null;
  if (a.destaque === "padrao" || !hsl) {
    raiz.removeAttribute("data-destaque");
    for (const v of ["--destaque-h", "--destaque-s", "--destaque-l"]) raiz.style.removeProperty(v);
    return;
  }
  raiz.setAttribute("data-destaque", textoSobre(hsl));
  raiz.style.setProperty("--destaque-h", String(hsl[0]));
  raiz.style.setProperty("--destaque-s", `${hsl[1]}%`);
  raiz.style.setProperty("--destaque-l", `${hsl[2]}%`);
}
