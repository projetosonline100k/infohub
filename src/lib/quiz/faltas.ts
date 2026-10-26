// O que ainda falta no quiz (25/10, aba "Em andamento" da revisão): todo campo `<x>_nota` cujo `<x>`
// (imagem, áudio, depoimentos) continua vazio é um lugar reservado esperando alguém mandar o arquivo.
export interface FaltaQuiz { caminho: string; onde: string; tipo: "imagem" | "audio" | "depoimentos" | "outro"; nota: string }

type Obj = Record<string, unknown>;
const vazio = (v: unknown) => v == null || v === "" || (Array.isArray(v) && !v.some((x) => x && (typeof x !== "object" || Object.values(x as Obj).some(Boolean))));

function ondeDe(caminho: string[], raiz: Obj): string {
  const [a, b] = caminho;
  const n = Number(b);
  const lista = raiz[a] as Obj[] | undefined;
  const item = Number.isInteger(n) ? lista?.[n] : undefined;
  if (a === "intro") return "Abertura";
  if (a === "perguntas") return `Pergunta ${n + 1}`;
  if (a === "telas") return `Tela${item?.titulo ? `: ${String(item.titulo)}` : ` ${n + 1}`}`;
  if (a === "perfis") return `Perfil${item?.nome ? `: ${String(item.nome)}` : ` ${n + 1}`}`;
  if (a === "oferta") return "Oferta";
  if (a === "captura") return "Contato";
  if (a === "resultado") return "Resultado";
  return a;
}

export function faltasDoQuiz(estrutura: unknown): FaltaQuiz[] {
  const faltas: FaltaQuiz[] = [];
  if (!estrutura || typeof estrutura !== "object") return faltas;
  const raiz = estrutura as Obj;
  const andar = (no: unknown, caminho: string[]) => {
    if (Array.isArray(no)) { no.forEach((x, i) => andar(x, [...caminho, String(i)])); return; }
    if (!no || typeof no !== "object") return;
    const o = no as Obj;
    for (const [k, v] of Object.entries(o)) {
      if (k.endsWith("_nota") && typeof v === "string" && v.trim()) {
        const base = k.slice(0, -5);
        if (vazio(o[base])) {
          const tipo = base === "imagem" || base === "audio" || base === "depoimentos" ? base : "outro";
          faltas.push({ caminho: [...caminho, base].join("."), onde: ondeDe(caminho, raiz), tipo, nota: v.trim() });
        }
      } else if (typeof v === "object") andar(v, [...caminho, k]);
    }
  };
  andar(raiz, []);
  return faltas;
}
