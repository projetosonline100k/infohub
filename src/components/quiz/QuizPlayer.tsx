import { createContext, useContext, useEffect, useMemo, useRef, useState, type ElementType } from "react";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, Mic, Quote, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  barrasDoResultado, calcularPerfil, comValor, corDoQuiz, montarPassos, preencher,
  type CampoCaptura, type Depoimento, type EstruturaQuiz, type PerfilQuiz, type TelaQuiz,
} from "@/lib/quiz/quiz";
import { cn } from "@/lib/utils";

// O quiz rodando: abertura → perguntas (com telas de respiro, especialista e
// carregando no meio) → captura → resultado e oferta. Na página pública envia
// a resposta; no Infopro (teste) não grava nada. Com `editar`, o Davi clica num
// texto pra mudar a palavra e numa imagem pra enviar (onMudar/onImagem).
export interface FimDoQuiz { escolhas: Record<string, number>; perfil: PerfilQuiz | null; contato: Partial<Record<CampoCaptura, string>> }

const ROTULO_CAMPO: Record<CampoCaptura, { rotulo: string; tipo: string; exemplo: string }> = {
  nome: { rotulo: "Seu nome", tipo: "text", exemplo: "Como você se chama?" },
  email: { rotulo: "Seu e-mail", tipo: "email", exemplo: "voce@email.com" },
  whatsapp: { rotulo: "Seu WhatsApp", tipo: "tel", exemplo: "(11) 99999-9999" },
};
const LETRAS = "ABCDEFGH";
const ENTRA = "animate-in fade-in slide-in-from-bottom-3 duration-500";

interface Ctx {
  editar: boolean; mostrarFaltas: boolean; cor: string; escuro: boolean;
  mudarTexto: (caminho: string, valor: string) => void;
  mudarImagem: (caminho: string, arquivo: File | null) => void;
  aoClicarOferta?: () => void;   // métrica: clique no link da oferta
}
const QuizCtx = createContext<Ctx>({ editar: false, mostrarFaltas: false, cor: "#0ea5e9", escuro: false, mudarTexto: () => {}, mudarImagem: () => {} });

// Texto do quiz: normal mostra já preenchido ({perfil}, {resposta:q1}); editando, o original.
function Txt({ caminho, valor, mostrar, as: Tag = "span", className }: {
  caminho: string; valor?: string; mostrar?: string; as?: ElementType; className?: string;
}) {
  const { editar, mudarTexto } = useContext(QuizCtx);
  if (editar) {
    return (
      <Tag contentEditable suppressContentEditableWarning title="Clique para editar"
        className={cn("cursor-text whitespace-pre-line rounded outline-dashed outline-1 outline-offset-2 outline-current focus:outline-2", !valor && "min-w-[4rem] opacity-50", className)}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        onBlur={(e: React.FocusEvent<HTMLElement>) => { const t = e.currentTarget.innerText.trim(); if (t !== (valor ?? "").trim()) mudarTexto(caminho, t); }}>
        {valor || "…"}
      </Tag>
    );
  }
  const t = mostrar ?? valor;
  return t ? <Tag className={cn("whitespace-pre-line", className)}>{t}</Tag> : null;
}

// Imagem do quiz. Sem URL: no teste aparece o espaço reservado (com o que vai ali); no link público some.
function Img({ caminho, url, nota, className, redonda }: { caminho: string; url?: string; nota?: string; className?: string; redonda?: boolean }) {
  const { editar, mostrarFaltas, mudarImagem } = useContext(QuizCtx);
  const input = useRef<HTMLInputElement>(null);
  const escolher = editar ? (e: React.MouseEvent) => { e.stopPropagation(); input.current?.click(); } : undefined;
  const campo = editar && (
    <input ref={input} type="file" accept="image/*" className="hidden"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) mudarImagem(caminho, f); e.target.value = ""; }} />
  );
  if (url) {
    return (
      <div className={cn("group relative overflow-hidden", redonda ? "rounded-full" : "rounded-xl", className)}>
        <img src={url} alt={nota ?? ""} className="h-full w-full object-cover" />
        {editar && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <button type="button" onClick={escolher} className="rounded-md bg-white/90 px-2 py-1 text-xs text-black">Trocar</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); mudarImagem(caminho, null); }} className="rounded-md bg-white/90 p-1 text-black"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {campo}
      </div>
    );
  }
  if (!mostrarFaltas && !editar) return null;
  return (
    <div onClick={escolher} role={editar ? "button" : undefined}
      className={cn("flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-500/40 p-3 text-center text-xs opacity-70",
        redonda ? "rounded-full" : "rounded-xl", editar && "cursor-pointer hover:opacity-100", className)}>
      <ImagePlus className="h-5 w-5" />
      <span className="font-medium">{nota ? `Falta: ${nota}` : "Falta imagem"}</span>
      {editar && <span className="opacity-70">clique para enviar</span>}
      {campo}
    </div>
  );
}

function Depoimentos({ caminho, lista, nota }: { caminho: string; lista?: Depoimento[]; nota?: string }) {
  const { mostrarFaltas, editar, escuro } = useContext(QuizCtx);
  const validos = (lista ?? []).filter((d) => d.texto);
  if (!validos.length) {
    return (mostrarFaltas || editar) && nota
      ? <p className="rounded-xl border-2 border-dashed border-gray-500/40 p-3 text-center text-xs opacity-70">Falta: {nota}</p>
      : null;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(lista ?? []).map((d, k) => d.texto && (
        <figure key={k} className={cn("rounded-xl p-3 text-left text-sm", escuro ? "bg-white/5" : "bg-black/5")}>
          <Txt caminho={`${caminho}.${k}.texto`} valor={d.texto} as="blockquote" className="italic" />
          <Txt caminho={`${caminho}.${k}.nome`} valor={d.nome} as="figcaption" className="mt-1 text-xs opacity-70" />
        </figure>
      ))}
    </div>
  );
}

function Botao({ children, onClick, href }: { children: React.ReactNode; onClick?: () => void; href?: string }) {
  const { cor, editar, aoClicarOferta } = useContext(QuizCtx);
  const cls = "h-auto min-h-12 w-full whitespace-normal rounded-xl text-base font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]";
  const estilo = { background: cor, boxShadow: `0 8px 24px -8px ${cor}` };
  if (editar) return <div className={cn(cls, "flex items-center justify-center px-4 py-3")} style={estilo}>{children}</div>;
  if (href) return <Button asChild size="lg" className={cls} style={estilo}><a href={href} target="_blank" rel="noreferrer" onClick={() => aoClicarOferta?.()}>{children}</a></Button>;
  return <Button size="lg" className={cls} style={estilo} onClick={onClick}>{children}<ArrowRight className="ml-2 h-4 w-4 shrink-0" /></Button>;
}

export function QuizPlayer({ titulo, estrutura, onFim, teste, editar = false, onMudar, onImagem, telaCheia = false, onTrocarTela, onEvento }: {
  titulo: string; estrutura: EstruturaQuiz; onFim?: (r: FimDoQuiz) => Promise<void> | void; teste?: boolean;
  editar?: boolean; onMudar?: (e: EstruturaQuiz) => void; onImagem?: (arquivo: File) => Promise<string>;
  // Link público no celular (15/10): ocupa a tela toda, barra de progresso fixa no
  // topo e o conteúdo centralizado; a cada tela nova o pai volta a rolagem pro início.
  telaCheia?: boolean; onTrocarTela?: () => void;
  // Métricas do link público (15/10): cada tela alcançada e o clique na oferta.
  onEvento?: (tipo: "passo" | "cta", passo?: number) => void;
}) {
  const e = estrutura;
  const cor = corDoQuiz(e);
  const escuro = e.tema === "escuro";
  const perguntas = e.perguntas ?? [];
  const telas = e.telas ?? [];
  const pedir = e.captura?.ativa === false ? [] : (e.captura?.pedir ?? []);
  const passos = useMemo(() => montarPassos(e, pedir.length > 0), [e, pedir.length]);
  const [pos, setPos] = useState(0);
  const [escolhas, setEscolhas] = useState<Record<string, number>>({});
  const [contato, setContato] = useState<Partial<Record<CampoCaptura, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const passo = passos[Math.min(pos, passos.length - 1)];
  const perfil = useMemo(() => calcularPerfil(e, escolhas), [e, escolhas]);
  const iPerfil = perfil ? e.perfis.findIndex((p) => p.id === perfil.id) : -1;
  const f = (t?: string) => preencher(t, e, escolhas, perfil);
  const temTelaResultado = telas.some((t) => t.tipo === "resultado");

  // Depois da abertura, baixa as imagens das próximas telas: a troca de tela não fica esperando a imagem.
  useEffect(() => {
    const urls = JSON.stringify(e).match(/https?:\/\/[^"]+\.(?:webp|jpe?g|png|gif)/gi) ?? [];
    const t = setTimeout(() => { for (const u of new Set(urls)) new Image().src = u; }, 1200);
    return () => clearTimeout(t);
  }, [e]);

  const trocou = useRef(onTrocarTela);
  trocou.current = onTrocarTela;
  const evento = useRef(onEvento);
  evento.current = onEvento;
  useEffect(() => { trocou.current?.(); if (pos > 0) evento.current?.("passo", pos); }, [pos]);

  const ctx: Ctx = {
    editar, mostrarFaltas: !!teste, cor, escuro,
    aoClicarOferta: () => evento.current?.("cta"),
    mudarTexto: (c, v) => onMudar?.(comValor(e, c, v)),
    mudarImagem: (c, arq) => {
      if (!arq) { onMudar?.(comValor(e, c, "")); return; }
      void onImagem?.(arq).then((url) => onMudar?.(comValor(e, c, url)));
    },
  };

  const terminar = async (dados: Partial<Record<CampoCaptura, string>>) => {
    setEnviando(true);
    try { await onFim?.({ escolhas, perfil, contato: dados }); } finally { setEnviando(false); }
    setPos(passos.length - 1);
  };
  const avancar = () => {
    const prox = pos + 1;
    if (passos[prox]?.tipo === "fim" && !editar) void terminar({});
    else setPos(Math.min(prox, passos.length - 1));
  };
  const voltar = () => setPos((p) => Math.max(0, p - 1));
  const escolher = (qid: string, k: number) => {
    setEscolhas((x) => ({ ...x, [qid]: k }));
    if (!editar) window.setTimeout(avancar, 280);
  };
  const reiniciar = () => { setPos(0); setEscolhas({}); setContato({}); };

  const meio = passos.filter((p) => p.tipo !== "intro" && p.tipo !== "fim").length;
  const progresso = passo.tipo === "intro" ? 0 : passo.tipo === "fim" ? 100 : Math.round((pos / (meio + 1)) * 100);
  const nPergunta = passo.tipo === "pergunta" ? passo.indice + 1 : 0;
  const contatoOk = pedir.every((c) => (contato[c] ?? "").trim().length >= (c === "whatsapp" ? 8 : 2));
  const suave = escuro ? "text-neutral-400" : "text-muted-foreground";

  return (
    <QuizCtx.Provider value={ctx}>
      <div className={cn("mx-auto flex w-full max-w-xl flex-col gap-5",
        telaCheia ? "flex-1" : escuro && "rounded-2xl bg-neutral-950 p-5 text-neutral-100 sm:p-7")}>
        {teste && !editar && <p className="rounded-md bg-amber-500/15 px-3 py-1.5 text-center text-xs text-amber-600 dark:text-amber-300">Modo teste: suas respostas não são gravadas. O pontilhado mostra imagem que ainda falta.</p>}
        {editar && (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs text-amber-600 backdrop-blur dark:text-amber-300">
            <button type="button" onClick={voltar} disabled={pos === 0} className="flex items-center gap-1 disabled:opacity-40"><ArrowLeft className="h-3 w-3" />Anterior</button>
            <span>Editando · tela {pos + 1} de {passos.length} · clique no texto ou na imagem</span>
            <button type="button" onClick={() => setPos((p) => Math.min(passos.length - 1, p + 1))} disabled={pos >= passos.length - 1} className="flex items-center gap-1 disabled:opacity-40">Próxima<ArrowRight className="h-3 w-3" /></button>
          </div>
        )}
        {passo.tipo !== "intro" && passo.tipo !== "fim" ? (
          <div className={cn("h-2 shrink-0 overflow-hidden rounded-full", escuro ? "bg-white/10" : "bg-black/10")}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progresso}%`, background: cor, boxShadow: `0 0 12px ${cor}` }} />
          </div>
        ) : telaCheia && <div className="h-2 shrink-0" />}

        {/* Tela cheia: a pergunta começa sempre na mesma altura (título fixo, imagem abaixo dele);
            abertura, respiro e "analisando" ficam no centro da tela. */}
        <div key={pos} className={cn(ENTRA, telaCheia && (passo.tipo === "pergunta" ? "mt-[6dvh] w-full" : "my-auto w-full"))}>
          {passo.tipo === "intro" && (
            <div className="space-y-5 py-4 text-center">
              <Img caminho="intro.imagem" url={e.intro?.imagem} nota={e.intro?.imagem_nota} redonda className="mx-auto h-24 w-24" />
              <Txt caminho="intro.titulo" valor={e.intro?.titulo || titulo} as="h1" className="block text-3xl font-extrabold leading-tight sm:text-4xl" />
              <Txt caminho="intro.subtitulo" valor={e.intro?.subtitulo} as="p" className={cn("block text-base leading-relaxed", suave)} />
              {!!e.intro?.credenciais?.length && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {e.intro.credenciais.map((c, k) => (
                    <Txt key={k} caminho={`intro.credenciais.${k}`} valor={c} className="rounded-full border px-2.5 py-0.5 text-xs" />
                  ))}
                </div>
              )}
              <Botao onClick={avancar}><Txt caminho="intro.botao" valor={e.intro?.botao || "Começar"} /></Botao>
              <Txt caminho="intro.rodape" valor={e.intro?.rodape} as="p" className={cn("block text-xs", suave)} />
            </div>
          )}

          {passo.tipo === "pergunta" && (() => {
            const q = perguntas[passo.indice];
            const base = `perguntas.${passo.indice}`;
            const cartoes = q.estilo === "cartoes";
            return (
              <div className="space-y-4">
                <p className={cn("text-xs font-semibold uppercase tracking-wider", suave)}>Pergunta {nPergunta} de {perguntas.length}</p>
                <Txt caminho={`${base}.texto`} valor={q.texto} mostrar={f(q.texto)} as="h2" className="block text-2xl font-bold leading-snug" />
                <Txt caminho={`${base}.subtitulo`} valor={q.subtitulo} as="p" className={cn("block text-sm", suave)} />
                {(q.imagem || q.imagem_nota) && <Img caminho={`${base}.imagem`} url={q.imagem} nota={q.imagem_nota} className="aspect-[16/9] max-h-[30dvh] w-full" />}
                <div className={cn(cartoes ? "grid grid-cols-2 gap-2" : "space-y-2")}>
                  {q.opcoes.map((o, k) => {
                    const marcada = escolhas[q.id] === k;
                    const Opcao = editar ? "div" : "button";
                    return (
                      <Opcao key={k} type={editar ? undefined : "button"} onClick={() => escolher(q.id, k)}
                        className={cn("group flex w-full items-center gap-3 rounded-xl border-2 px-3 py-3 text-left text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-md",
                          escuro ? "border-white/15 bg-white/5 hover:border-white/40" : "hover:border-foreground/30",
                          cartoes && "flex-col justify-center text-center", marcada && "scale-[1.02] text-white")}
                        style={marcada ? { background: cor, borderColor: cor } : undefined}>
                        {cartoes && (o.imagem !== undefined) && <Img caminho={`${base}.opcoes.${k}.imagem`} url={o.imagem} className="aspect-square w-full" />}
                        {o.emoji ? <span className="text-xl">{o.emoji}</span> : !cartoes && (
                          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold", marcada ? "bg-white/25" : escuro ? "bg-white/10" : "bg-black/5")}>
                            {marcada ? <Check className="h-4 w-4" /> : LETRAS[k]}
                          </span>
                        )}
                        <Txt caminho={`${base}.opcoes.${k}.texto`} valor={o.texto} className="flex-1" />
                      </Opcao>
                    );
                  })}
                </div>
                {pos > 1 && !editar && (
                  <button type="button" onClick={voltar} className={cn("flex items-center gap-1 text-xs hover:opacity-100", suave)}><ArrowLeft className="h-3 w-3" />Voltar</button>
                )}
              </div>
            );
          })()}

          {passo.tipo === "tela" && (() => {
            const t = telas[passo.indice];
            const base = `telas.${passo.indice}`;
            if (t.tipo === "carregando") return <Carregando key={t.id} t={t} base={base} f={f} onPronto={editar ? undefined : avancar} suave={suave} />;
            if (t.tipo === "resultado") return <Resultado e={e} t={t} base={base} perfil={perfil} iPerfil={iPerfil} escolhas={escolhas} f={f} onSeguir={avancar} suave={suave} />;
            return <Tela t={t} base={base} f={f} onSeguir={avancar} suave={suave} />;
          })()}

          {passo.tipo === "captura" && (
            <form className="space-y-3" onSubmit={(ev) => { ev.preventDefault(); if (contatoOk) void terminar(contato); }}>
              <Txt caminho="captura.titulo" valor={e.captura?.titulo || "Para onde enviamos o seu resultado?"} as="h2" className="block text-2xl font-bold leading-snug" />
              {pedir.map((c) => (
                <label key={c} className="block space-y-1 text-sm">
                  <span className={suave}>{ROTULO_CAMPO[c].rotulo}</span>
                  <Input type={ROTULO_CAMPO[c].tipo} value={contato[c] ?? ""} placeholder={ROTULO_CAMPO[c].exemplo}
                    className={escuro ? "border-white/20 bg-white/5" : undefined}
                    onChange={(ev) => setContato({ ...contato, [c]: ev.target.value })} />
                </label>
              ))}
              <Button type="submit" size="lg" className="w-full text-white" style={{ background: cor }} disabled={!contatoOk || enviando}>
                {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ver meu resultado
              </Button>
            </form>
          )}

          {passo.tipo === "fim" && (
            <div className="space-y-8">
              {!temTelaResultado && (
                <Resultado e={e} base="" perfil={perfil} iPerfil={iPerfil} escolhas={escolhas} f={f} suave={suave} />
              )}
              {e.oferta ? <Oferta e={e} perfil={perfil} iPerfil={iPerfil} f={f} suave={suave} />
                : perfil?.cta_texto && (
                  perfil.cta_url ? <Botao href={perfil.cta_url}>{perfil.cta_texto}</Botao>
                    : <Button size="lg" className="w-full" disabled>{perfil.cta_texto} (link ainda não definido)</Button>
                )}
              {teste && !editar && <div className="text-center"><Button variant="outline" size="sm" className={escuro ? "border-white/20 bg-transparent" : undefined} onClick={reiniciar}>Testar de novo</Button></div>}
            </div>
          )}
        </div>
      </div>
    </QuizCtx.Provider>
  );
}

// Tela de respiro (dado, frase, prova social) ou de apresentação do especialista.
function Tela({ t, base, f, onSeguir, suave }: { t: TelaQuiz; base: string; f: (s?: string) => string; onSeguir: () => void; suave: string }) {
  const { cor, mostrarFaltas, editar } = useContext(QuizCtx);
  const especialista = t.tipo === "especialista";
  const maior = Math.max(1, ...(t.grafico?.barras ?? []).map((b) => b.valor));
  return (
    <div className={cn("space-y-5 py-2", especialista && "text-center")}>
      {(t.imagem || t.imagem_nota) && (
        <Img caminho={`${base}.imagem`} url={t.imagem} nota={t.imagem_nota} redonda={especialista}
          className={especialista ? "mx-auto h-28 w-28" : "aspect-[16/9] max-h-[30dvh] w-full"} />
      )}
      <Txt caminho={`${base}.titulo`} valor={t.titulo} mostrar={f(t.titulo)} as="h2" className="block text-2xl font-bold leading-snug" />
      {!!t.credenciais?.length && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {t.credenciais.map((c, k) => <Txt key={k} caminho={`${base}.credenciais.${k}`} valor={c} className="rounded-full border px-2.5 py-0.5 text-xs" />)}
        </div>
      )}
      {t.citacao?.texto && (
        <figure className="rounded-xl border-l-4 py-1 pl-4 text-left" style={{ borderColor: cor }}>
          <Quote className="mb-1 h-5 w-5 opacity-50" />
          <Txt caminho={`${base}.citacao.texto`} valor={t.citacao.texto} as="blockquote" className="block text-lg font-medium italic leading-snug" />
          <Txt caminho={`${base}.citacao.autor`} valor={t.citacao.autor} as="figcaption" className={cn("mt-1 block text-sm", suave)} />
        </figure>
      )}
      {t.grafico && (
        <div className="space-y-2 text-left">
          <Txt caminho={`${base}.grafico.titulo`} valor={t.grafico.titulo} as="p" className={cn("block text-xs font-semibold uppercase tracking-wider", suave)} />
          {t.grafico.barras.map((b, k) => (
            <div key={k} className="space-y-1">
              <div className="flex justify-between text-sm"><span>{b.rotulo}</span><span className="font-bold">{b.legenda ?? b.valor}</span></div>
              <div className="h-3 overflow-hidden rounded-full bg-gray-500/20">
                <div className="h-full rounded-full animate-in slide-in-from-left duration-1000"
                  style={{ width: `${(b.valor / maior) * 100}%`, background: b.destaque ? cor : "currentColor", opacity: b.destaque ? 1 : 0.35 }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <Txt caminho={`${base}.texto`} valor={t.texto} mostrar={f(t.texto)} as="p" className={cn("block text-base leading-relaxed", !especialista && "text-left")} />
      {(t.audio || ((mostrarFaltas || editar) && t.audio_nota)) && (
        t.audio ? <audio controls src={t.audio} className="w-full" />
          : <p className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-500/40 p-3 text-xs opacity-70"><Mic className="h-4 w-4" />Falta: {t.audio_nota}</p>
      )}
      <Depoimentos caminho={`${base}.depoimentos`} lista={t.depoimentos} nota={t.depoimentos_nota} />
      <Txt caminho={`${base}.fonte`} valor={t.fonte} as="p" className={cn("block text-left text-[11px]", suave)} />
      <Botao onClick={onSeguir}><Txt caminho={`${base}.botao`} valor={t.botao || "Continuar"} /></Botao>
    </div>
  );
}

// "Analisando…": barra enchendo e as etapas sendo marcadas; passa sozinha.
function Carregando({ t, base, f, onPronto, suave }: { t: TelaQuiz; base: string; f: (s?: string) => string; onPronto?: () => void; suave: string }) {
  const { cor } = useContext(QuizCtx);
  const [pct, setPct] = useState(0);
  const pronto = useRef(onPronto);
  pronto.current = onPronto;
  useEffect(() => {
    const inicio = Date.now(), dur = 4200;
    const id = window.setInterval(() => {
      const p = Math.min(100, Math.round(((Date.now() - inicio) / dur) * 100));
      setPct(p);
      if (p >= 100) { window.clearInterval(id); window.setTimeout(() => pronto.current?.(), 500); }
    }, 60);
    return () => window.clearInterval(id);
  }, []);
  const itens = t.itens ?? [];
  return (
    <div className="space-y-6 py-8 text-center">
      <Txt caminho={`${base}.titulo`} valor={t.titulo} mostrar={f(t.titulo)} as="h2" className="block text-xl font-bold" />
      <div className="relative mx-auto h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeOpacity=".1" strokeWidth="8" />
          <circle cx="50" cy="50" r="44" fill="none" stroke={cor} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 44} strokeDashoffset={2 * Math.PI * 44 * (1 - pct / 100)} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold">{pct}%</span>
      </div>
      <ul className="mx-auto max-w-sm space-y-2 text-left text-sm">
        {itens.map((it, k) => {
          const feito = pct >= ((k + 1) / (itens.length + 0.5)) * 100;
          return (
            <li key={k} className={cn("flex items-center gap-2 transition-opacity duration-500", feito ? "opacity-100" : "opacity-35")}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: feito ? cor : "transparent", border: feito ? "none" : "1px solid currentColor" }}>
                {feito ? <Check className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
              </span>
              <Txt caminho={`${base}.itens.${k}`} valor={it} mostrar={f(it)} />
            </li>
          );
        })}
      </ul>
      {!onPronto && <p className={cn("text-xs", suave)}>(editando: esta tela passa sozinha no quiz de verdade)</p>}
    </div>
  );
}

// Resultado: o perfil em destaque, o gráfico de onde o dia vaza e o texto em blocos.
function Resultado({ e, t, base, perfil, iPerfil, escolhas, f, onSeguir, suave }: {
  e: EstruturaQuiz; t?: TelaQuiz; base: string; perfil: PerfilQuiz | null; iPerfil: number;
  escolhas: Record<string, number>; f: (s?: string) => string; onSeguir?: () => void; suave: string;
}) {
  const { cor, escuro, editar } = useContext(QuizCtx);
  const barras = barrasDoResultado(e, escolhas);
  const maior = Math.max(...barras.map((b) => b.pct));
  const pp = `perfis.${iPerfil}`;
  const blocos = (perfil?.descricao ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-6">
      <div className="space-y-3 text-center animate-in zoom-in-95 duration-700">
        {t?.titulo
          ? <Txt caminho={`${base}.titulo`} valor={t.titulo} mostrar={f(t.titulo)} as="p" className={cn("block text-xs font-semibold uppercase tracking-[0.2em]", suave)} />
          : <p className={cn("text-xs font-semibold uppercase tracking-[0.2em]", suave)}>Seu resultado</p>}
        {perfil && <Img caminho={`${pp}.imagem`} url={perfil.imagem} nota={perfil.imagem_nota} className="mx-auto aspect-square w-40" />}
        <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl" style={{ color: cor }}>
          {perfil ? <Txt caminho={`${pp}.nome`} valor={perfil.nome} /> : "Obrigado!"}
        </h2>
        {perfil && <Txt caminho={`${pp}.resumo`} valor={perfil.resumo} as="p" className="block text-lg font-medium" />}
      </div>
      {barras.length > 1 && (
        <div className={cn("space-y-2.5 rounded-2xl p-4", escuro ? "bg-white/5" : "bg-black/[0.03]")}>
          <p className={cn("text-xs font-semibold uppercase tracking-wider", suave)}>{e.resultado?.grafico?.titulo ?? "Onde o seu dia vaza"}</p>
          {barras.map((b, k) => (
            <div key={k} className="space-y-1">
              <div className="flex justify-between text-sm"><span className={b.pct === maior ? "font-semibold" : undefined}>{b.rotulo}</span><span className="font-bold tabular-nums">{b.pct}%</span></div>
              <div className="h-3 overflow-hidden rounded-full bg-gray-500/20">
                <div className="h-full rounded-full animate-in slide-in-from-left duration-1000"
                  style={{ width: `${Math.max(3, b.pct)}%`, background: b.pct === maior ? cor : "currentColor", opacity: b.pct === maior ? 1 : 0.3 }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-3 text-left">
        {blocos.map((b, k) => {
          const destaque = /^O que está te sabotando/i.test(b);
          return (
            <p key={k} className={cn("whitespace-pre-line text-base leading-relaxed", destaque && "rounded-xl border-l-4 py-2 pl-4 font-medium", destaque && (escuro ? "bg-white/5" : "bg-black/[0.03]"))}
              style={destaque ? { borderColor: cor } : undefined}>{b}</p>
          );
        })}
      </div>
      {perfil && editar && (
        <div className="space-y-1">
          <p className={cn("text-xs", suave)}>Texto do perfil (separe os blocos com uma linha em branco):</p>
          <Txt caminho={`${pp}.descricao`} valor={perfil.descricao} as="div" className="block text-sm" />
        </div>
      )}
      {t && <Txt caminho={`${base}.texto`} valor={t.texto} mostrar={f(t.texto)} as="p" className="block text-base font-medium" />}
      {onSeguir && t && <Botao onClick={onSeguir}><Txt caminho={`${base}.botao`} valor={t.botao || "Continuar"} /></Botao>}
    </div>
  );
}

// A oferta no fim do quiz (a página de vendas dentro do quiz).
function Oferta({ e, perfil, iPerfil, f, suave }: { e: EstruturaQuiz; perfil: PerfilQuiz | null; iPerfil: number; f: (s?: string) => string; suave: string }) {
  const { cor, escuro } = useContext(QuizCtx);
  const o = e.oferta!;
  const url = o.cta_url || perfil?.cta_url;
  const texto = o.cta_texto || perfil?.cta_texto || "Quero começar";
  const caixa = cn("rounded-2xl p-4", escuro ? "bg-white/5" : "bg-black/[0.03]");
  return (
    <div className="space-y-5">
      <div className="space-y-2 text-center">
        <Txt caminho="oferta.titulo" valor={o.titulo} mostrar={f(o.titulo)} as="h2" className="block text-3xl font-extrabold leading-tight" />
        <Txt caminho="oferta.subtitulo" valor={o.subtitulo} mostrar={f(o.subtitulo)} as="p" className={cn("block text-base", suave)} />
      </div>
      <Img caminho="oferta.imagem" url={o.imagem} nota={o.imagem_nota} className="aspect-[16/9] max-h-[30dvh] w-full" />
      <Txt caminho="oferta.texto" valor={o.texto} mostrar={f(o.texto)} as="p" className="block text-base leading-relaxed" />
      <div className="rounded-2xl border-2 p-4 text-center" style={{ borderColor: cor }}>
        <Txt caminho="oferta.produto" valor={o.produto} as="p" className="block text-lg font-bold" />
        {perfil?.virada && <Txt caminho={`perfis.${iPerfil}.virada`} valor={perfil.virada} as="p" className="mt-2 block text-sm" />}
      </div>
      {!!o.dias?.length && (
        <ol className="grid grid-cols-7 gap-1 text-center">
          {o.dias.map((d, k) => (
            <li key={k} className="space-y-1">
              <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: cor, opacity: 0.55 + (k / o.dias!.length) * 0.45 }}>{k + 1}</span>
              <Txt caminho={`oferta.dias.${k}`} valor={d} className="block text-[10px] leading-tight sm:text-xs" />
            </li>
          ))}
        </ol>
      )}
      {!!o.itens?.length && (
        <div className={caixa}>
          <p className={cn("mb-2 text-xs font-semibold uppercase tracking-wider", suave)}>O que você recebe</p>
          <ul className="space-y-1.5 text-sm">
            {o.itens.map((it, k) => (
              <li key={k} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: cor }} /><Txt caminho={`oferta.itens.${k}`} valor={it} /></li>
            ))}
          </ul>
        </div>
      )}
      <Depoimentos caminho="oferta.depoimentos" lista={o.depoimentos} nota={o.depoimentos_nota} />
      {o.garantia && (
        <div className={cn(caixa, "flex gap-3 text-sm")}><ShieldCheck className="h-6 w-6 shrink-0" style={{ color: cor }} /><Txt caminho="oferta.garantia" valor={o.garantia} /></div>
      )}
      <Txt caminho="oferta.preco" valor={o.preco} as="p" className="block text-center text-2xl font-extrabold" />
      <Txt caminho="oferta.preco_detalhe" valor={o.preco_detalhe} as="p" className={cn("-mt-3 block text-center text-sm", suave)} />
      {url ? <Botao href={url}><Txt caminho="oferta.cta_texto" valor={texto} /></Botao>
        : <Button size="lg" className="h-auto min-h-12 w-full whitespace-normal text-white" style={{ background: cor }} disabled>{texto} (link ainda não definido)</Button>}
      <Txt caminho="oferta.fechamento" valor={o.fechamento} mostrar={f(o.fechamento)} as="p" className={cn("block text-center text-sm italic", suave)} />
    </div>
  );
}
