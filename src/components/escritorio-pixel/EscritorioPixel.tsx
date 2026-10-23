import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Hammer, Loader2, LocateFixed, MessageCircle, Play, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Funcionario3D, Resultado3D } from "@/components/escritorio3d/EscritorioVirtual";
import { criarMundo, type EstadoPixel, type ModoCamera, type MundoPixel, type PessoaPixel } from "./motor";
import { PAREDES, PISOS, type Parede, type Piso } from "./mapa";
import {
  SALAS_COMUNS, arrumacaoPadrao, arrumacaoValida, estiloDoEspaco, gerarPlanta, nomeDoConteudo,
  type Arrumacao, type Conteudo, type SalaComum, type SetorPixel,
} from "./planta";

// Protótipo do escritório em pixel art (PixiJS desenha o mapa; o React cuida do painel à direita).
// Só roda no `npm run dev`: os sprites gratuitos da LimeZu têm licença não comercial e ficam fora do git.

const ROTULO: Record<EstadoPixel, string> = {
  trabalhando: "Trabalhando", esperando: "Esperando você", problema: "Com problema", parado: "Sem tarefa", reuniao: "Em reunião",
};
const COR: Record<EstadoPixel, string> = {
  trabalhando: "bg-emerald-500", esperando: "bg-amber-500", problema: "bg-rose-500", parado: "bg-slate-400", reuniao: "bg-violet-400",
};

const chaveArrumacao = (clienteId: string) => `escritorio-pixel:arrumacao:${clienteId}`;
const mesmoConteudo = (a: Conteudo, b: Conteudo) =>
  a.tipo === b.tipo && (a.tipo !== "setor" || (b.tipo === "setor" && a.setorId === b.setorId));

export default function EscritorioPixel({ clienteId, setores, funcionarios, resultado, onSair, onConversar, onAbrirTarefa }: {
  clienteId: string;
  setores: SetorPixel[];
  funcionarios: (Funcionario3D & { setorId?: string | null })[];
  resultado: Resultado3D | null;
  onSair: () => void;
  onConversar: (id: string) => void;
  onAbrirTarefa: (f: Funcionario3D) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mundo = useRef<MundoPixel | null>(null);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  // Simulação local de estado (para ver o comportamento sem mexer nas tarefas de verdade).
  const [simulado, setSimulado] = useState<Record<string, EstadoPixel>>({});
  const [camera, setCamera] = useState<ModoCamera>("geral");
  const [editando, setEditando] = useState(false);
  const [espaco, setEspaco] = useState<number | null>(null);
  // Arrumação das salas: fica salva neste computador enquanto é protótipo.
  const [arrumacao, setArrumacao] = useState<Arrumacao>(() => {
    try {
      const salva = arrumacaoValida(JSON.parse(localStorage.getItem(chaveArrumacao(clienteId)) ?? "null"), setores);
      if (salva) return salva;
    } catch { /* sem armazenamento: usa o padrão */ }
    return arrumacaoPadrao(setores);
  });
  useEffect(() => { try { localStorage.setItem(chaveArrumacao(clienteId), JSON.stringify(arrumacao)); } catch { /* ignora */ } }, [arrumacao, clienteId]);
  const planta = useMemo(() => gerarPlanta(arrumacao, setores), [arrumacao, setores]);
  const plantaInicial = useRef(planta);

  const pessoas = useMemo<PessoaPixel[]>(() => funcionarios.map((f) => ({
    id: f.id, nome: f.nome, estado: simulado[f.id] ?? f.sinal, agora: f.agora ?? null,
    setorId: f.setorId ?? null,
  })), [funcionarios, simulado]);

  useEffect(() => {
    let cancelado = false;
    let criado: MundoPixel | null = null;
    criarMundo(caixa.current!, { aoClicar: setSelecionado, aoClicarEspaco: setEspaco, aoMudarCamera: setCamera }, plantaInicial.current).then((m) => {
      if (cancelado) { m.destruir(); return; }
      criado = m;
      mundo.current = m;
      setPronto(true);
    }).catch((e) => {
      console.error(e);
      if (!cancelado) setErro("Não consegui carregar os sprites. Eles ficam em public/escritorio-pixel (só no computador do Davi, fora do git).");
    });
    return () => { cancelado = true; criado?.destruir(); mundo.current = null; };
  }, []);

  useEffect(() => { if (pronto) mundo.current?.atualizar(pessoas, resultado); }, [pronto, pessoas, resultado]);
  useEffect(() => { mundo.current?.selecionar(selecionado); }, [pronto, selecionado]);
  useEffect(() => { if (pronto) mundo.current?.definirPlanta(planta); }, [pronto, planta]);
  useEffect(() => { mundo.current?.editar(editando, espaco); }, [pronto, editando, espaco]);
  useEffect(() => { mundo.current?.camera(camera); }, [pronto, camera]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editando) { if (espaco != null) setEspaco(null); else setEditando(false); } else if (selecionado) setSelecionado(null); else onSair();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [selecionado, onSair, editando, espaco]);

  const escolher = (c: Conteudo) => {
    if (espaco == null) return;
    setArrumacao((a) => {
      const nova = [...a];
      const outro = c.tipo === "vazio" ? -1 : nova.findIndex((e, k) => k !== espaco && mesmoConteudo(e.conteudo, c));
      // Já está em outro lugar: troca os dois de lugar (com piso e parede).
      if (outro >= 0) [nova[espaco], nova[outro]] = [nova[outro], nova[espaco]];
      else nova[espaco] = { conteudo: c };
      return nova;
    });
  };
  const estilo = (campo: "piso" | "parede", valor: Piso | Parede) => {
    if (espaco == null) return;
    setArrumacao((a) => a.map((e, k) => (k === espaco ? { ...e, [campo]: valor } : e)));
  };
  const foraDoMapa = setores.filter((s) => !arrumacao.some((e) => e.conteudo.tipo === "setor" && e.conteudo.setorId === s.id));

  const f = funcionarios.find((x) => x.id === selecionado) ?? null;
  const p = pessoas.find((x) => x.id === selecionado) ?? null;
  const ordem: EstadoPixel[] = ["problema", "esperando", "trabalhando", "reuniao", "parado"];

  return (
    <div className="fixed inset-0 z-[60] flex bg-[#17151f] text-white">
      <div className="relative min-w-0 flex-1">
        <div ref={caixa} className="absolute inset-0" />
        {!pronto && !erro && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Montando o escritório…</div>
        )}
        {erro && <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-rose-300">{erro}</div>}
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/50 px-2.5 py-1 text-[11px] text-white/70">
          {editando ? "Clique num espaço para escolher o setor ou a sala" : "Setas ou WASD andam · E conversa com quem está perto · Z alterna a câmera"}
        </div>
        <div className="absolute right-3 top-3 flex gap-2">
          {!editando && (
            <button type="button" onClick={() => setCamera((c) => (c === "geral" ? "seguir" : "geral"))}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-2.5 py-1.5 text-xs font-semibold hover:bg-black/80">
              {camera === "geral" ? <><LocateFixed className="h-3.5 w-3.5" />Seguir meu boneco</> : <><Eye className="h-3.5 w-3.5" />Visão geral</>}
            </button>
          )}
          <button type="button" onClick={() => { setEditando((v) => !v); setEspaco(null); setSelecionado(null); }}
            className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold", editando ? "border-sky-400 bg-sky-600 hover:bg-sky-500" : "border-white/15 bg-black/60 hover:bg-black/80")}>
            <Hammer className="h-3.5 w-3.5" />{editando ? "Pronto" : "Montar setores"}
          </button>
        </div>
        <p className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-white/35">Protótipo · sprites gratuitos da LimeZu (uso não comercial, só neste computador)</p>
      </div>

      <aside className="flex w-80 shrink-0 flex-col border-l border-white/10 bg-[#1f1c29]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">Escritório</h2>
          <button type="button" onClick={onSair} className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white" title="Sair (Esc)"><X className="h-4 w-4" /></button>
        </div>

        {editando ? (
          <div className="space-y-4 overflow-y-auto p-4">
            <div>
              <p className="text-base font-bold">Montar setores</p>
              <p className="mt-1 text-xs text-white/60">O escritório tem 9 espaços (3 em cima, 3 no meio, 3 embaixo) e a entrada embaixo, no centro. Clique num espaço no mapa e escolha o que fica nele. Cada setor ganha uma mesa por pessoa (até 6).</p>
            </div>
            {espaco == null ? (
              <div className="rounded-lg border border-dashed border-white/20 p-3 text-sm text-white/60">Nenhum espaço escolhido. Clique numa sala do mapa.</div>
            ) : (
              <>
                <div className="rounded-lg bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-white/50">Espaço {["de cima", "do meio", "de baixo"][Math.floor(espaco / 3)]} · {["esquerda", "centro", "direita"][espaco % 3]}</p>
                  <p className="text-sm font-semibold">{nomeDoConteudo(arrumacao[espaco].conteudo, setores)}</p>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] uppercase tracking-wide text-white/50">Setores</p>
                  <div className="flex flex-wrap gap-1.5">
                    {setores.map((s) => {
                      const c: Conteudo = { tipo: "setor", setorId: s.id };
                      const aqui = mesmoConteudo(arrumacao[espaco].conteudo, c);
                      const outro = !aqui && arrumacao.some((e) => mesmoConteudo(e.conteudo, c));
                      return (
                        <button key={s.id} type="button" onClick={() => escolher(c)} title={outro ? `${s.nome} já está em outro espaço: troca os dois de lugar` : s.nome}
                          className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", aqui ? "border-white/70 bg-white/15" : "border-white/15 text-white/80 hover:bg-white/10")}>
                          <span className="h-2 w-2 rounded-full" style={{ background: s.cor }} />{s.nome}{outro && <span className="text-white/40">↔</span>}
                        </button>
                      );
                    })}
                    {!setores.length && <p className="text-xs text-white/50">Este projeto ainda não tem setores.</p>}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] uppercase tracking-wide text-white/50">Salas comuns</p>
                  <div className="flex flex-wrap gap-1.5">
                    {([...Object.keys(SALAS_COMUNS), "vazio"] as (SalaComum | "vazio")[]).map((t) => {
                      const c = { tipo: t } as Conteudo;
                      const aqui = mesmoConteudo(arrumacao[espaco].conteudo, c);
                      return (
                        <button key={t} type="button" onClick={() => escolher(c)}
                          className={cn("rounded-full border px-2.5 py-1 text-xs", aqui ? "border-white/70 bg-white/15" : "border-white/15 text-white/80 hover:bg-white/10")}>
                          {t === "vazio" ? "Vazio (passagem)" : SALAS_COMUNS[t]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {arrumacao[espaco].conteudo.tipo !== "vazio" && (
                  <>
                    <div>
                      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-white/50">Piso</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(PISOS) as Piso[]).map((k) => (
                          <button key={k} type="button" onClick={() => estilo("piso", k)} title={PISOS[k].nome}
                            className={cn("h-7 w-7 rounded-md border-2", estiloDoEspaco(arrumacao[espaco], setores).piso === k ? "border-white" : "border-transparent")}
                            style={{ background: PISOS[k].amostra }} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-white/50">Parede</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(PAREDES) as Parede[]).map((k) => (
                          <button key={k} type="button" onClick={() => estilo("parede", k)} title={PAREDES[k].nome}
                            className={cn("h-7 w-7 rounded-md border-2", estiloDoEspaco(arrumacao[espaco], setores).parede === k ? "border-white" : "border-transparent")}
                            style={{ background: PAREDES[k].amostra }} />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            {foraDoMapa.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                Fora do mapa: {foraDoMapa.map((s) => s.nome).join(", ")}. Quem é desses setores trabalha na mesa de reunião da Área Colaborativa.
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setArrumacao(arrumacaoPadrao(setores)); setEspaco(null); }}
                className="flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-2 text-xs hover:bg-white/10"><RotateCcw className="h-3.5 w-3.5" />Arrumação padrão</button>
              <button type="button" onClick={() => { setEditando(false); setEspaco(null); }}
                className="flex-1 rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold hover:bg-sky-500">Pronto</button>
            </div>
          </div>
        ) : f && p ? (
          <div className="space-y-4 overflow-y-auto p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold">{f.nome}</p>
                {f.ehIa && <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">IA</span>}
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-white/70"><span className={cn("h-2 w-2 rounded-full", COR[p.estado])} />{ROTULO[p.estado]}</p>
            </div>
            {f.agora && <p className="rounded-lg bg-white/5 p-2.5 text-sm text-white/80">{f.agora}</p>}
            <div className="rounded-lg border border-white/10 p-3">
              <p className="text-[11px] uppercase tracking-wide text-white/50">Tarefa atual</p>
              {f.tarefa ? (
                <>
                  <p className="mt-1 text-sm font-medium">{f.tarefa.titulo}</p>
                  {f.tarefa.progresso != null && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(f.tarefa.progresso)}%` }} /></div>
                  )}
                  <p className="mt-1.5 text-xs text-white/60">
                    {f.tarefa.progresso != null ? `${Math.round(f.tarefa.progresso)}%` : "Sem progresso medido"}
                    {f.tarefa.minutosRestantes != null && ` · faltam ~${f.tarefa.minutosRestantes} min`}
                  </p>
                </>
              ) : <p className="mt-1 text-sm text-white/60">Nenhuma tarefa agora.</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={!f.tarefa} onClick={() => onAbrirTarefa(f)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-40"><Play className="h-3.5 w-3.5" />Abrir tarefa</button>
              <button type="button" disabled={f.clicavel === false} onClick={() => onConversar(f.id)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-40"><MessageCircle className="h-3.5 w-3.5" />Conversar</button>
            </div>
            <div className="border-t border-white/10 pt-3">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-white/50">Simular estado (só no protótipo)</p>
              <div className="flex flex-wrap gap-1.5">
                {ordem.map((e) => (
                  <button key={e} type="button" onClick={() => setSimulado((s) => ({ ...s, [f.id]: e }))}
                    className={cn("rounded-full border px-2 py-0.5 text-[11px]", p.estado === e ? "border-white/60 bg-white/15" : "border-white/15 text-white/70 hover:bg-white/10")}>{ROTULO[e]}</button>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => setSelecionado(null)} className="text-xs text-white/50 hover:text-white">← Ver toda a equipe</button>
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto p-4">
            {ordem.map((estado) => {
              const grupo = pessoas.filter((x) => x.estado === estado);
              if (!grupo.length) return null;
              return (
                <div key={estado}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/50"><span className={cn("h-2 w-2 rounded-full", COR[estado])} />{ROTULO[estado]} · {grupo.length}</p>
                  <div className="space-y-1">
                    {grupo.map((x) => (
                      <button key={x.id} type="button" onClick={() => setSelecionado(x.id)}
                        className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/10">
                        <span className="font-medium">{x.nome}</span>
                        {x.agora && <span className="text-white/50"> · {x.agora}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!pessoas.length && <p className="text-sm text-white/60">Ninguém na equipe ainda.</p>}
            <p className="text-[11px] leading-relaxed text-white/40">Clique num funcionário no mapa para ver a tarefa. Ande com o seu boneco (setas ou WASD) e aperte E perto de alguém para conversar. Quem trabalha fica na mesa do setor; quem espera você vai para a área comum com “!”; sem tarefa vai para o sofá ou a copa.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
