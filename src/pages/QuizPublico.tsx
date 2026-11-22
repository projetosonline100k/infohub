import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { QuizPlayer } from "@/components/quiz/QuizPlayer";
import type { EstruturaQuiz } from "@/lib/quiz/quiz";
import { textoDoNumero } from "@/lib/quiz/numeros";
import { propagarUtm, utmDaUrl, type Utm } from "@/lib/quiz/utm";
import { configurarServidor, eventoPixel, iniciarPixels, type EventoPixel } from "@/lib/quiz/pixels";

// /quiz/:slug — o quiz publicado, aberto pra qualquer pessoa (sem login).
// Lê pelo RPC quiz_publico e grava a resposta pelo responder_quiz.
// No celular (pedido do Davi, 15/10) ele é um app de tela cheia: a página não
// rola nem "estica" (o fundo branco aparecia ao puxar), a barra do navegador
// fica da cor do quiz, o conteúdo fica centralizado e cada tela nova começa do topo.
const FUNDO_ESCURO = "#0a0a0a";   // bg-neutral-950
const FUNDO_CLARO = "#ffffff";

// previa (13/11): /quiz-previa/:token mostra o rascunho do quiz, mesmo publicado, sem gravar visita, passo nem lead.
// Teste A/B (15/11): o link do quiz original sorteia entre ele e as versões publicadas marcadas no teste (quiz_ab_slugs). O sorteio fica fixo para o
// visitante (localStorage) e tudo (visita, telas, lead) é gravado na versão sorteada, então cada versão tem as próprias métricas.
// (21/11, quiz lento) O sorteio A/B e a busca do quiz iam um depois do outro (2 idas ao servidor). Agora a busca do link já começa junto
// com o sorteio e é reaproveitada quando o sorteado é o próprio link (o caso comum).
type DadosQuiz = { titulo: string; estrutura: EstruturaQuiz; pixels?: unknown } | null;
const buscas = new Map<string, Promise<DadosQuiz>>();
function buscarQuiz(slug: string, previa: boolean): Promise<DadosQuiz> {
  const k = `${previa ? "p" : "q"}:${slug}`;
  let p = buscas.get(k);
  if (!p) {
    p = Promise.resolve(previa ? supabase.rpc("quiz_rascunho" as never, { p_token: slug } as never) : supabase.rpc("quiz_publico" as never, { p_slug: slug } as never))
      .then(({ data }) => data as DadosQuiz).catch(() => { buscas.delete(k); return null; });
    buscas.set(k, p);
  }
  return p;
}

export default function QuizPublico({ previa = false }: { previa?: boolean }) {
  const { slug: slugDaUrl = "", token = "" } = useParams();
  const [sorteado, setSorteado] = useState<string | null>(previa ? token : null);
  useEffect(() => {
    if (previa) { setSorteado(token); return; }
    void buscarQuiz(slugDaUrl, false);   // adianta a busca do link enquanto o sorteio responde
    if (new URLSearchParams(window.location.search).get("ab") === "0") { setSorteado(slugDaUrl); return; }   // link só do original (V1): pula o sorteio
    let vivo = true;
    void (async () => {
      let escolhido = slugDaUrl;
      try {
        const { data } = await supabase.rpc("quiz_ab_slugs" as never, { p_slug: slugDaUrl } as never);
        const lista = Array.isArray(data) ? (data as string[]) : [];
        if (lista.length > 1) {
          const k = `quiz-ab:${slugDaUrl}`;
          let guardado: string | null = null;
          try { guardado = localStorage.getItem(k); } catch { /* sem armazenamento */ }
          escolhido = guardado && lista.includes(guardado) ? guardado : lista[Math.floor(Math.random() * lista.length)];
          try { localStorage.setItem(k, escolhido); } catch { /* sem armazenamento */ }
        }
      } catch { /* sem teste A/B: vale o link como está */ }
      if (vivo) setSorteado(escolhido);
    })();
    return () => { vivo = false; };
  }, [slugDaUrl, token, previa]);
  if (sorteado === null) return <div className="fixed inset-0 flex items-center justify-center bg-neutral-950"><Loader2 className="h-5 w-5 animate-spin text-neutral-500" /></div>;
  return <QuizPublicoConteudo key={sorteado} slug={sorteado} previa={previa} />;
}

function QuizPublicoConteudo({ slug, previa }: { slug: string; previa: boolean }) {
  const [quiz, setQuiz] = useState<{ titulo: string; estrutura: EstruturaQuiz; pixels?: unknown } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const rolagem = useRef<HTMLDivElement>(null);
  const escuro = !quiz || quiz.estrutura.tema === "escuro";
  const visual = quiz?.estrutura.visual;
  const fundo = visual?.base ?? (escuro ? FUNDO_ESCURO : FUNDO_CLARO);
  const barra = visual?.barra ?? fundo;
  const imagemDeFundo = visual?.fundo_css;

  useEffect(() => {
    void buscarQuiz(slug, previa).then((q) => {
      setQuiz(q && q.estrutura ? q : null);
      setCarregando(false);
      if (q?.titulo) document.title = q.titulo;
    });
  }, [slug, previa]);

  // Fundo da página e da barra do Safari na cor do quiz, sem efeito elástico.
  useEffect(() => {
    const html = document.documentElement, body = document.body;
    const antes = [html.style.background, body.style.background, html.style.overscrollBehavior, body.style.overscrollBehavior, body.style.overflow];
    // "important": o index.css deixa html/body transparentes (janela do Atlas no desktop).
    for (const el of [html, body]) { el.style.setProperty("background", fundo, "important"); el.style.overscrollBehavior = "none"; }
    body.style.overflow = "hidden";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const criada = !meta;
    if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
    const corAntes = meta.content;
    meta.content = barra;
    return () => {
      html.style.removeProperty("background"); body.style.removeProperty("background");
      [html.style.background, body.style.background, html.style.overscrollBehavior, body.style.overscrollBehavior, body.style.overflow] = antes;
      if (criada) meta?.remove(); else if (meta) meta.content = corAntes;
    };
  }, [fundo, barra]);

  const voltarAoTopo = useCallback(() => { rolagem.current?.scrollTo({ top: 0 }); }, []);

  // Métricas (sem dado pessoal): uma sessão por aba; a visita, cada tela, o fim e o clique na oferta.
  const sessao = useRef<string>("");
  if (!sessao.current) {
    const chave = `quiz-sessao:${slug}`;
    try {
      // Entrou por um link com OUTRA marca (outro afiliado/origem) na mesma aba: é uma visita nova, para a marca antiga não se misturar com a nova.
      const daUrl = utmDaUrl(window.location.search);
      const guardada = sessionStorage.getItem(`quiz-utm:${slug}`);
      const trocou = Object.keys(daUrl).length > 0 && guardada !== null && guardada !== JSON.stringify(daUrl);
      sessao.current = (!trocou && sessionStorage.getItem(chave)) || crypto.randomUUID(); sessionStorage.setItem(chave, sessao.current);
    }
    catch { sessao.current = crypto.randomUUID(); }
  }
  // Origem do clique (UTM): vem no link e fica guardada nesta aba; vai junto da visita, do lead e do botão de compra.
  const utm = useRef<Utm>((() => {
    const chave = `quiz-utm:${slug}`;
    const da = utmDaUrl(window.location.search);
    try {
      if (Object.keys(da).length) { sessionStorage.setItem(chave, JSON.stringify(da)); return da; }
      return JSON.parse(sessionStorage.getItem(chave) || "{}") as Utm;
    } catch { return da; }
  })());
  // @ do Instagram de quem veio pelo comentário (a automação põe ?ig=<usuário> no link). Fica guardado nesta aba, como a UTM.
  const instagram = useRef<string | null>((() => {
    const chave = `quiz-ig:${slug}`;
    const valido = (v: string | null) => (v && /^[A-Za-z0-9._]{1,30}$/.test(v) ? v : null);
    try {
      const da = valido(new URLSearchParams(window.location.search).get("ig"));
      if (da) { sessionStorage.setItem(chave, da); return da; }
      return valido(sessionStorage.getItem(chave));
    } catch { return null; }
  })());
  const estrutura = useMemo(() => (quiz ? propagarUtm(quiz.estrutura, utm.current) : null), [quiz]);
  // Pixels (Meta/TikTok/Google): só no quiz publicado de verdade, nunca na prévia nem nos testes.
  const pixels = quiz?.pixels;
  const contatoRef = useRef<{ nome?: string | null; email?: string | null; whatsapp?: string | null } | undefined>(undefined);
  const registrar = useCallback((tipo: "visita" | "passo" | "fim" | "cta" | "amostra", passo?: number, detalhe?: string) => {
    if (!previa && tipo !== "amostra") eventoPixel(pixels, tipo as EventoPixel, passo, tipo === "fim" || tipo === "cta" ? contatoRef.current : undefined);   // contato: o servidor manda à Meta em hash
    // O .then é o que envia: a consulta do Supabase só sai quando alguém espera a resposta. Sem ele (15–25/10)
    // nenhuma visita/tela/fim foi gravada e as métricas ficaram zeradas.
    if (previa) return;
    void supabase.rpc("registrar_evento_quiz" as never, { p_slug: slug, p_sessao: sessao.current, p_tipo: tipo, p_passo: passo ?? -1, p_utm: utm.current, p_detalhe: detalhe ?? null } as never).then(() => undefined);
  }, [slug, previa, pixels]);
  useEffect(() => {
    if (!quiz || previa) return;
    configurarServidor({ slug, sessao: sessao.current });
    iniciarPixels(quiz.pixels);
    return () => configurarServidor(null);
  }, [quiz, previa, slug]);
  useEffect(() => { if (quiz) registrar("visita"); }, [quiz, registrar]);

  return (
    <div ref={rolagem}
      className={visual ? "quiz-escuro quiz-fundo-proprio fixed inset-0 overflow-y-auto overflow-x-hidden overscroll-none text-neutral-100" : escuro ? "quiz-escuro fixed inset-0 overflow-y-auto overflow-x-hidden overscroll-none bg-neutral-950 text-neutral-100" : "quiz-claro fixed inset-0 overflow-y-auto overflow-x-hidden overscroll-none bg-white text-neutral-900"}
      style={{ touchAction: "pan-y", ...(imagemDeFundo ? { background: imagemDeFundo } : {}) }}>
      {previa && <div className="sticky top-0 z-50 -mb-px bg-amber-400 px-3 py-1 text-center text-[11px] font-semibold text-amber-950">Prévia — não publicado</div>}
      <div className={`flex min-h-full flex-col ${visual?.cartao ? "px-4" : "px-5"} pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),1.25rem)] sm:py-12`}>
        {carregando ? (
          <div className="my-auto flex justify-center"><Loader2 className="h-6 w-6 animate-spin opacity-60" /></div>
        ) : !quiz ? (
          <p className="my-auto text-center opacity-70">Este quiz não está disponível.</p>
        ) : (
          <QuizPlayer telaCheia onTrocarTela={voltarAoTopo} onEvento={registrar} titulo={quiz.titulo} estrutura={estrutura ?? quiz.estrutura} onFim={async ({ escolhas, numeros, perfil, contato }) => {
            // Pergunta de número (roleta/régua): vai o número que a pessoa escolheu ("20 min/dia"), não a faixa.
            const respostas = quiz.estrutura.perguntas.map((q) => ({ pergunta: q.texto, resposta: numeros[q.id] !== undefined ? textoDoNumero(q.numero, numeros[q.id]) : q.opcoes[escolhas[q.id]]?.texto ?? null }));
            if (previa) return;
            contatoRef.current = contato;
            if (contato.nome || contato.email || contato.whatsapp) eventoPixel(quiz.pixels, "lead", undefined, contato);
            await supabase.rpc("responder_quiz" as never, {
              p_slug: slug, p_respostas: respostas, p_perfil: perfil?.nome ?? null,
              p_nome: contato.nome ?? null, p_email: contato.email ?? null, p_whatsapp: contato.whatsapp ?? null, p_utm: utm.current, p_sessao: sessao.current, p_instagram: instagram.current,
            } as never);
            registrar("fim");
          }} />
        )}
      </div>
    </div>
  );
}

