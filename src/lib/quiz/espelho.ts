/** Uma versão da tela "espelho": a transformação ligada à opção que a pessoa marcou. `hoje` → `chegar` é opcional; `imagem` substitui o `icone`. */
export interface VersaoEspelho { icone?: string; imagem?: string; titulo: string; texto?: string; hoje?: string; chegar?: string; como?: string }
/** `opcoes` segue a ordem das opções da pergunta `pergunta`. */
export interface ConfigEspelho { pergunta: string; opcoes: VersaoEspelho[]; fecho?: string; botao?: string }

/** A versão que combina com a resposta; null quando não há resposta ou versão (a tela comum aparece no lugar). */
export function versaoDoEspelho(c: ConfigEspelho | undefined, escolhas: Record<string, number>): { i: number; v: VersaoEspelho } | null {
  if (!c) return null;
  const i = escolhas[c.pergunta];
  const v = typeof i === "number" ? c.opcoes?.[i] : undefined;
  return v?.titulo?.trim() ? { i: i!, v } : null;
}
