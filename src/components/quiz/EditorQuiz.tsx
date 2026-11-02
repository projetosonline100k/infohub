import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Contact, Home, ListChecks, Monitor, Plus, Smartphone, Sparkles, Trash2, Trophy, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstruturaQuiz, Lamina, OpcaoQuiz } from "@/lib/quiz/quiz";
import type { FaltaQuiz } from "@/lib/quiz/faltas";
import { MolduraCelular } from "./MolduraCelular";
import { QuizPlayer } from "./QuizPlayer";
import { PedidoDaLamina } from "./FileiraQuiz";

// Editor do quiz (02/11, Davi: "preciso deixar o quiz mais fácil de usar, ver como está ficando e em qual etapa é
// cada coisa"): à esquerda o mapa das telas, no centro a tela selecionada grande e à direita os ajustes dela.

const ICONE: Record<Lamina["tipo"], LucideIcon> = { intro: Home, pergunta: ListChecks, tela: Clock, captura: Contact, fim: Trophy };
const TIPO: Record<Lamina["tipo"], string> = { intro: "Abertura", pergunta: "Múltipla escolha", tela: "Tela de respiro", captura: "Contato", fim: "Resultado e oferta" };

/** Pendências (imagem/áudio esperando) de uma tela. */
export function faltasDaLamina(l: Lamina, e: EstruturaQuiz, faltas: FaltaQuiz[]) {
  const comeca = (p: string) => faltas.filter((f) => f.caminho === p || f.caminho.startsWith(`${p}.`));
  if (l.tipo === "intro") return comeca("intro");
  if (l.tipo === "pergunta") return comeca(`perguntas.${l.indice}`);
  if (l.tipo === "tela") return comeca(`telas.${l.indice}`);
  if (l.tipo === "captura") return comeca("captura");
  const perfil = l.perfil ? e.perfis.findIndex((p) => p.id === l.perfil) : 0;
  return [...comeca(`perfis.${perfil}`), ...comeca("oferta"), ...comeca("resultado")];
}

export function EstruturaDoQuiz({ laminas, estrutura, faltas, selecionada, onEscolher }: {
  laminas: Lamina[]; estrutura: EstruturaQuiz; faltas: FaltaQuiz[]; selecionada: string; onEscolher: (chave: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <h3 className="px-1 font-semibold">Estrutura do quiz</h3>
      <p className="mb-2 px-1 text-xs text-muted-foreground">{laminas.length} telas · clique para abrir</p>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {laminas.map((l, n) => {
          const Icone = ICONE[l.tipo];
          const pend = faltasDaLamina(l, estrutura, faltas);
          return (
            <button key={l.chave} type="button" onClick={() => onEscolher(l.chave)} title={l.rotulo}
              className={cn("flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-sm transition-colors",
                l.chave === selecionada ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted")}>
              <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-muted px-1 text-xs font-semibold tabular-nums">{n + 1}</span>
              <Icone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{l.rotulo}</span>
              {pend.length
                ? <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400" title={pend.map((f) => f.nota).join(" · ")}><AlertTriangle className="h-3.5 w-3.5" />{pend.length}</span>
                : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A tela selecionada, grande: texto e imagem editáveis no lugar. */
export function PreviaDaTela({ titulo, estrutura, lamina, numero, total, onAnterior, onProxima, onMudar, onImagem }: {
  titulo: string; estrutura: EstruturaQuiz; lamina: Lamina; numero: number; total: number; onAnterior: () => void; onProxima: () => void;
  onMudar: (e: EstruturaQuiz) => void; onImagem: (arquivo: File) => Promise<string>;
}) {
  const [modo, setModo] = useState<"celular" | "computador">("celular");
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.8);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(Math.min(1, Math.max(0.4, (el.clientHeight - 8) / 820)));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const botao = "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-40";
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={botao} onClick={onAnterior} disabled={numero <= 1}><ChevronLeft className="h-3.5 w-3.5" />Anterior</button>
        <span className="text-sm font-medium tabular-nums">Tela {numero} de {total}</span>
        <button type="button" className={botao} onClick={onProxima} disabled={numero >= total}>Próxima<ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
      <div ref={caixa} className="flex min-h-0 flex-1 justify-center overflow-hidden">
        {modo === "celular" ? (
          // transform em vez de zoom: no app do Mac o zoom encolhia o iframe duas vezes.
          <div className="shrink-0" style={{ width: 395 * escala, height: 820 * escala }}>
            <div className="flex h-[820px] w-[395px] origin-top-left flex-col" style={{ transform: `scale(${escala})` }}>
              <MolduraCelular escuro={estrutura.tema === "escuro"}>
                <QuizPlayer key={lamina.chave} titulo={titulo} estrutura={estrutura} teste telaCheia passoFixo={lamina.passo} perfilFixo={lamina.perfil} editar onMudar={onMudar} onImagem={onImagem} />
              </MolduraCelular>
            </div>
          </div>
        ) : (
          <div className="min-h-0 w-full overflow-y-auto rounded-lg border">
            <QuizPlayer key={lamina.chave} titulo={titulo} estrutura={estrutura} teste passoFixo={lamina.passo} perfilFixo={lamina.perfil} editar onMudar={onMudar} onImagem={onImagem} />
          </div>
        )}
      </div>
      <div className="flex justify-center gap-1">
        {([["celular", Smartphone, "Prévia mobile"], ["computador", Monitor, "Prévia desktop"]] as const).map(([m, Icone, rotulo]) => (
          <button key={m} type="button" onClick={() => setModo(m)}
            className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs", modo === m ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}><Icone className="h-3.5 w-3.5" />{rotulo}</button>
        ))}
      </div>
    </div>
  );
}

// Campo que só salva ao sair dele: digitar não grava no banco a cada letra.
function Campo({ rotulo, valor, onSalvar, linhas = 1 }: { rotulo: string; valor: string | undefined; onSalvar: (v: string) => void; linhas?: number }) {
  const [texto, setTexto] = useState(valor ?? "");
  useEffect(() => setTexto(valor ?? ""), [valor]);
  const salvar = () => { if (texto !== (valor ?? "")) onSalvar(texto); };
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {rotulo}
      <textarea value={texto} rows={linhas} onChange={(e) => setTexto(e.target.value)} onBlur={salvar}
        className="mt-1 w-full resize-y rounded-lg border bg-background px-2.5 py-1.5 text-sm font-normal text-foreground outline-none focus:border-primary/50" />
    </label>
  );
}

export function AjustesDaTela({ estrutura, lamina, numero, chavePedido, agente, faltas, onMudar, onPedir }: {
  estrutura: EstruturaQuiz; lamina: Lamina; numero: number; chavePedido: string; agente: string; faltas: FaltaQuiz[];
  onMudar: (e: EstruturaQuiz) => void; onPedir: (texto: string) => void;
}) {
  const mudar = (f: (e: EstruturaQuiz) => void) => { const n = structuredClone(estrutura); f(n); onMudar(n); };
  const p = lamina.tipo === "pergunta" ? estrutura.perguntas[lamina.indice!] : null;
  const t = lamina.tipo === "tela" ? estrutura.telas?.[lamina.indice!] : null;
  const iPerfil = lamina.tipo === "fim" ? Math.max(0, estrutura.perfis.findIndex((x) => x.id === lamina.perfil)) : -1;
  const perfil = iPerfil >= 0 ? estrutura.perfis[iPerfil] : null;
  const opcao = (i: number, f: (o: OpcaoQuiz) => void) => mudar((e) => f(e.perguntas[lamina.indice!].opcoes[i]));
  const pend = faltasDaLamina(lamina, estrutura, faltas);
  return (
    <div className="h-full space-y-3 overflow-y-auto pr-1">
      <div>
        <p className="text-xs font-medium text-muted-foreground">Tipo de tela</p>
        <p className="text-sm font-semibold">{TIPO[lamina.tipo]}</p>
      </div>
      {pend.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <p className="mb-1 flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />Falta nesta tela</p>
          {pend.map((f) => <p key={f.caminho} className="text-muted-foreground">{f.nota}</p>)}
        </div>
      )}
      {lamina.tipo === "intro" && <>
        <Campo rotulo="Título" linhas={2} valor={estrutura.intro?.titulo} onSalvar={(v) => mudar((e) => { e.intro = { ...e.intro, titulo: v }; })} />
        <Campo rotulo="Subtítulo" linhas={3} valor={estrutura.intro?.subtitulo} onSalvar={(v) => mudar((e) => { e.intro = { ...e.intro, subtitulo: v }; })} />
        <Campo rotulo="Botão" valor={estrutura.intro?.botao} onSalvar={(v) => mudar((e) => { e.intro = { ...e.intro, botao: v }; })} />
      </>}
      {p && <>
        <Campo rotulo="Título da pergunta" linhas={2} valor={p.texto} onSalvar={(v) => mudar((e) => { e.perguntas[lamina.indice!].texto = v; })} />
        <Campo rotulo="Subtítulo (opcional)" linhas={2} valor={p.subtitulo} onSalvar={(v) => mudar((e) => { e.perguntas[lamina.indice!].subtitulo = v; })} />
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Opções de resposta</p>
          <div className="space-y-1.5">
            {p.opcoes.map((o, i) => (
              <div key={i} className="rounded-lg border p-1.5">
                <div className="flex items-center gap-1">
                  <input defaultValue={o.emoji ?? ""} key={`e${i}${o.emoji}`} onBlur={(ev) => { if (ev.target.value !== (o.emoji ?? "")) opcao(i, (x) => { x.emoji = ev.target.value; }); }} title="Emoji" className="w-9 rounded border bg-background px-1 py-1 text-center text-sm outline-none" />
                  <input defaultValue={o.texto} key={`t${i}${o.texto}`} onBlur={(ev) => { if (ev.target.value !== o.texto) opcao(i, (x) => { x.texto = ev.target.value; }); }} className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-sm outline-none focus:border-primary/50" />
                  <button type="button" disabled={p.opcoes.length <= 2} title="Tirar esta opção" onClick={() => mudar((e) => { e.perguntas[lamina.indice!].opcoes.splice(i, 1); })} className="rounded p-1 text-muted-foreground hover:text-rose-500 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                {estrutura.perfis.length > 1 && (
                  <select value={o.perfil ?? ""} onChange={(ev) => opcao(i, (x) => { x.perfil = ev.target.value || null; })} title="Esta resposta soma ponto para qual perfil" className="mt-1 w-full rounded border bg-background px-1 py-0.5 text-[11px] text-muted-foreground outline-none">
                    <option value="">Não conta para nenhum perfil</option>
                    {estrutura.perfis.map((pf) => <option key={pf.id} value={pf.id}>Conta para: {pf.nome}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => mudar((e) => { e.perguntas[lamina.indice!].opcoes.push({ texto: "Nova opção", perfil: e.perfis[0]?.id ?? null }); })}
            className="mt-1.5 flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-muted"><Plus className="h-3.5 w-3.5" />Adicionar opção</button>
        </div>
      </>}
      {t && <>
        <Campo rotulo="Título" linhas={2} valor={t.titulo} onSalvar={(v) => mudar((e) => { e.telas![lamina.indice!].titulo = v; })} />
        <Campo rotulo="Texto" linhas={4} valor={t.texto} onSalvar={(v) => mudar((e) => { e.telas![lamina.indice!].texto = v; })} />
        <Campo rotulo="Botão" valor={t.botao} onSalvar={(v) => mudar((e) => { e.telas![lamina.indice!].botao = v; })} />
      </>}
      {lamina.tipo === "captura" && <>
        <Campo rotulo="Título" linhas={2} valor={estrutura.captura?.titulo} onSalvar={(v) => mudar((e) => { e.captura = { ...e.captura, titulo: v }; })} />
        <Campo rotulo="Texto" linhas={3} valor={estrutura.captura?.texto} onSalvar={(v) => mudar((e) => { e.captura = { ...e.captura, texto: v }; })} />
        <Campo rotulo="Botão" valor={estrutura.captura?.botao} onSalvar={(v) => mudar((e) => { e.captura = { ...e.captura, botao: v }; })} />
      </>}
      {perfil && <>
        <Campo rotulo="Nome do perfil" valor={perfil.nome} onSalvar={(v) => mudar((e) => { e.perfis[iPerfil].nome = v; })} />
        <Campo rotulo="Descrição" linhas={4} valor={perfil.descricao} onSalvar={(v) => mudar((e) => { e.perfis[iPerfil].descricao = v; })} />
      </>}
      {lamina.tipo === "fim" && estrutura.oferta && <>
        <Campo rotulo="Oferta: título" linhas={2} valor={estrutura.oferta.titulo} onSalvar={(v) => mudar((e) => { e.oferta!.titulo = v; })} />
        <Campo rotulo="Preço" valor={estrutura.oferta.preco} onSalvar={(v) => mudar((e) => { e.oferta!.preco = v; })} />
        <Campo rotulo="Botão da oferta" valor={estrutura.oferta.cta_texto} onSalvar={(v) => mudar((e) => { e.oferta!.cta_texto = v; })} />
        <Campo rotulo="Link do botão" valor={estrutura.oferta.cta_url} onSalvar={(v) => mudar((e) => { e.oferta!.cta_url = v; })} />
      </>}
      <div className="border-t pt-3">
        <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground"><Sparkles className="h-3.5 w-3.5" />Pedir ajuste desta tela</p>
        <PedidoDaLamina chave={chavePedido} rotulo={lamina.rotulo} numero={numero} agente={agente} onPedir={onPedir} />
      </div>
    </div>
  );
}
