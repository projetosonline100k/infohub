// Telas que vêm depois do contato no quiz V3 (22/11/2026, Davi: "igualzinho a referência"): depoimento em cartão e a pilha de livros para curtir.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, Check, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import type { EstruturaQuiz, TelaQuiz } from "@/lib/quiz/quiz";
import { ROTULO_TEMA, temaDaOpcao, titulo as tituloLivro, type LivroPlano, type Tema } from "@/lib/quiz/plano";

const Estrelas = () => (
  <div className="flex gap-1" aria-label="5 estrelas">
    {[0, 1, 2, 3, 4].map((i) => <svg key={i} viewBox="0 0 24 24" width="26" height="26" fill="#f5b50a" aria-hidden><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" /></svg>)}
  </div>
);

/** "Grandes resultados à vista!": título grande, uma frase e um cartão claro com foto, estrelas, nome e o depoimento (o 1º de `t.depoimentos`). */
export function DepoimentoCartao({ t, f, rodape }: { t: TelaQuiz; f: (s?: string) => string; rodape: ReactNode }) {
  const d = t.depoimentos?.[0];
  const inicial = (d?.nome ?? "?").trim().charAt(0).toUpperCase();
  return (
    <div className="qs-dep">
      <h2 className="qs-dep-t">{f(t.titulo)}</h2>
      {t.texto && <p className="qs-dep-s">{f(t.texto)}</p>}
      {d && (
        <figure className="qs-dep-c">
          <div className="qs-dep-h">
            {d.imagem ? <img src={d.imagem} alt="" draggable={false} /> : <span className="qs-dep-av">{inicial}</span>}
            <div><Estrelas /><figcaption>{d.nome}</figcaption></div>
          </div>
          <blockquote>“{d.texto}”</blockquote>
        </figure>
      )}
      <div className="qs-dep-b">{rodape}</div>
    </div>
  );
}


/** Livros do catálogo para os temas marcados: os de maior nota, um autor por vez, revezando os temas; `primeiros` (ids que a pessoa curtiu) entram antes. */
export function escolherLivros(catalogo: LivroPlano[], areas: string[], n: number, primeiros: number[] = []): LivroPlano[] {
  const bons = catalogo.filter((l) => l.capa && l.audio > 0 && l.audio <= 40 && l.nota >= 4.3).sort((a, b) => b.nota - a.nota || a.id - b.id);
  const filas = (areas.length ? areas : (Object.keys(ROTULO_TEMA) as Tema[])).map((a) => bons.filter((l) => l.temas.includes(a)));
  const out: LivroPlano[] = [], usados = new Set<number>(), autores = new Set<string>();
  for (const id of primeiros) { const l = catalogo.find((x) => x.id === id); if (l && out.length < n && !usados.has(l.id)) { out.push(l); usados.add(l.id); autores.add(l.autor); } }
  for (let r = 0; out.length < n && r < 60; r++) {
    let andou = false;
    for (const fila of filas) {
      const l = fila.find((x) => !usados.has(x.id) && !autores.has(x.autor));
      if (l && out.length < n) { out.push(l); usados.add(l.id); autores.add(l.autor); andou = true; }
    }
    if (!andou) break;
  }
  return out;
}

/** O que cada tema entrega: o "benefício" do livro no plano de 7 dias. */
export const BENEFICIO_TEMA: Record<string, string[]> = {
  foco: ["Mais foco e menos distração no seu dia", "Termina o que começa, sem se perder no celular", "Cabeça mais clara para o que realmente importa"],
  habitos: ["Hábitos que se sustentam sem depender de motivação", "Uma rotina de leitura que cabe no seu dia", "Constância sem esforço, dia após dia"],
  autoconfianca: ["Mais segurança para decidir e se posicionar", "Menos dúvida de si mesmo nas conversas importantes", "Confiança para ir atrás do que você quer"],
  comunicacao: ["Fala com clareza e conversa com mais presença", "Chega em qualquer conversa com algo novo a dizer", "Convence e se expressa com mais naturalidade"],
  financas: ["Mais controle e clareza com o seu dinheiro", "Decisões financeiras mais inteligentes", "Uma visão de longo prazo sobre o seu dinheiro"],
  carreira: ["Estratégia para crescer mais rápido na carreira", "Ideias práticas para se destacar no trabalho", "Mais repertório para as próximas conversas de carreira"],
  mentalidade: ["Um jeito de pensar que muda suas decisões", "Mais resiliência para os dias difíceis", "Uma mente mais aberta e preparada"],
  lideranca: ["Habilidade para liderar e influenciar pessoas", "Mais clareza para decidir pela equipe", "Presença e autoridade sem precisar impor"],
};

export function areasMarcadas(e: EstruturaQuiz, marcadas: Record<string, number[]>, perguntaId?: string): Tema[] {
  const pa = e.perguntas.find((q) => q.id === perguntaId);
  return (pa ? (marcadas[pa.id] ?? []).map((k) => temaDaOpcao(pa.opcoes[k]?.texto ?? "")) : []).filter((x): x is Tema => !!x);
}

/** Lâmina "7 dias": um livro por dia com o benefício, a partir do que a pessoa marcou e curtiu. */
export function SeteDias({ e, o, marcadas, curtidos, f, rodape, onBotao }: {
  e: EstruturaQuiz; o: NonNullable<EstruturaQuiz["oferta"]>; marcadas: Record<string, number[]>; curtidos: number[]; f: (s?: string) => string; rodape?: ReactNode; onBotao?: () => void;
}) {
  const cfg = o.sete_dias ?? {};
  const [catalogo, setCatalogo] = useState<LivroPlano[] | null>(null);
  useEffect(() => { let vivo = true; void import("@/data/livros-instalivros.json").then((m) => { if (vivo) setCatalogo(m.default as LivroPlano[]); }); return () => { vivo = false; }; }, []);
  const areas = useMemo(() => areasMarcadas(e, marcadas, cfg.pergunta), [e, marcadas, cfg.pergunta]);
  const livros = useMemo(() => (catalogo ? escolherLivros(catalogo, areas, 7, curtidos.slice(0, 3)) : []), [catalogo, areas, curtidos]);
  const usos: Record<string, number> = {};
  return (
    <div className="qs-sd">
      <h2 className="qs-sd-t">{f(cfg.titulo)}</h2>
      {cfg.texto && <p className="qs-sd-s">{f(cfg.texto)}</p>}
      <ol className="qs-sd-l">
        {livros.map((l, k) => {
          const tema = l.temas.find((x) => areas.includes(x as Tema)) ?? l.temas[0];
          const frases = BENEFICIO_TEMA[tema] ?? [""];
          const frase = frases[(usos[tema] = (usos[tema] ?? -1) + 1) % frases.length];
          return (
            <li key={l.id}>
              <img src={l.capa} alt="" draggable={false} />
              <div><em>Dia {k + 1}</em><b>{tituloLivro(l.titulo)}</b><span>{frase}</span></div>
            </li>
          );
        })}
      </ol>
      {rodape}
    </div>
  );
}

const FUNDOS = ["#4b0021", "#10234f", "#3a1b05", "#0d3b2e", "#2c1450"];
const CAPAS = ["#e4005a", "#2f6fed", "#e8861a", "#17a673", "#7a45e0"];

/** Pilha de livros do catálogo do Instalivros para curtir ou não (como no Blinkist). Mostra os livros dos temas que a pessoa marcou. */
export function CurtirLivros({ t, e, marcadas, f, onSeguir, parado, corBotao, onCurtir }: {
  t: TelaQuiz; e: EstruturaQuiz; marcadas: Record<string, number[]>; f: (s?: string) => string; onSeguir: () => void; parado: boolean; corBotao: string; onCurtir?: (id: number, curtiu: boolean) => void;
}) {
  const [catalogo, setCatalogo] = useState<LivroPlano[] | null>(null);
  const [i, setI] = useState(0);
  const [saindo, setSaindo] = useState<"sim" | "nao" | null>(null);
  useEffect(() => { let vivo = true; void import("@/data/livros-instalivros.json").then((m) => { if (vivo) setCatalogo(m.default as LivroPlano[]); }); return () => { vivo = false; }; }, []);
  const cfg = t.curtir ?? {};
  const areas = useMemo(() => areasMarcadas(e, marcadas, cfg.pergunta), [e, marcadas, cfg.pergunta]);
  const livros = useMemo(() => (catalogo ? escolherLivros(catalogo, areas, cfg.quantidade ?? 5) : []), [catalogo, areas, cfg.quantidade]);
  const l = livros[i];
  const decidir = (r: "sim" | "nao") => {
    if (saindo) return;
    setSaindo(r);
    if (l) onCurtir?.(l.id, r === "sim");
    window.setTimeout(() => { setSaindo(null); if (i + 1 >= livros.length) onSeguir(); else setI(i + 1); }, 260);
  };
  const tema = l?.temas.find((x) => areas.includes(x as Tema)) ?? l?.temas[0];
  return (
    <div className="qs-cl">
      <div className="qs-cl-top"><span className="qs-kicker">{cfg.etapa ?? "Etapa 3 de 3"}</span>{!parado && <button type="button" onClick={onSeguir} className="qs-cl-pular">Pular</button>}</div>
      <h2 className="qs-q">{f(t.titulo)}</h2>
      {t.texto && <p className="qs-sub">{f(t.texto)}</p>}
      {!l ? <div className="qs-cl-vazio"><Loader2 className="animate-spin" /></div> : (
        <>
          <div className="qs-cl-pilha">
            <i style={{ background: FUNDOS[(i + 2) % FUNDOS.length] }} /><i style={{ background: FUNDOS[(i + 1) % FUNDOS.length] }} />
            <div key={l.id} className={`qs-cl-card ${saindo ? `qs-cl-${saindo}` : ""}`} style={{ background: FUNDOS[i % FUNDOS.length] }}>
              <div className="qs-cl-capa" style={{ ["--arco" as string]: CAPAS[i % CAPAS.length] }}><img src={l.capa} alt="" draggable={false} /></div>
              <div className="qs-cl-info">
                <b>{tituloLivro(l.titulo)}</b>
                <span>{l.autor}</span>
                {l.sub && <p>{tituloLivro(l.sub)}</p>}
                <em><BookOpen size={16} /> Resumo · {l.audio} min</em>
              </div>
              {tema && <div className="qs-cl-tema"><Check size={16} /> {ROTULO_TEMA[tema as Tema] ?? tema}</div>}
            </div>
          </div>
          <div className="qs-cl-bt">
            <button type="button" aria-label="Não curti" onClick={() => !parado && decidir("nao")} className="qs-cl-nao"><ThumbsDown size={30} fill="currentColor" /></button>
            <button type="button" aria-label="Curti" onClick={() => !parado && decidir("sim")} className="qs-cl-sim" style={{ background: corBotao }}><ThumbsUp size={30} fill="currentColor" /></button>
          </div>
        </>
      )}
    </div>
  );
}
