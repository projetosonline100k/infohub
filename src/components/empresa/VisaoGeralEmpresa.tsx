import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle, Bot, CalendarClock, CalendarDays, Camera, CheckCircle2, ChevronRight, Clapperboard, Crown,
  FileText, Instagram, Lightbulb, Loader2, Megaphone, Scissors, Users, Video, Youtube,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { FilaPessoa } from "./FilaPessoa";
import { EditorVideo, type EdicaoResumo } from "./EditorVideo";
import {
  contarIndicadores, estadoDosMembros, jarvisCuidando, precisaDeVoce, videosProgramados,
  type MembroResumo, type SetorResumo, type TarefaResumo, type VideoResumo,
} from "@/lib/empresa/visaoGeral";

// Conteúdo → Visão geral: a "sala de comando" da empresa do projeto.
// Hierarquia (briefing de 12/10): 1) o que precisa de mim, 2) o que está
// andando sem mim, 3) como está a empresa (mapa), 4) o que vai ser publicado.

const CORES: Record<string, { fundo: string; borda: string; texto: string; avatar: string }> = {
  amber: { fundo: "bg-amber-500/5", borda: "border-amber-500/30", texto: "text-amber-600 dark:text-amber-400", avatar: "bg-amber-500" },
  violet: { fundo: "bg-violet-500/5", borda: "border-violet-500/30", texto: "text-violet-600 dark:text-violet-400", avatar: "bg-violet-500" },
  blue: { fundo: "bg-sky-500/5", borda: "border-sky-500/30", texto: "text-sky-600 dark:text-sky-400", avatar: "bg-sky-500" },
};
const corDo = (cor: string | null) => CORES[cor ?? ""] ?? CORES.blue;
const ICONES: Record<string, typeof Crown> = { crown: Crown, megaphone: Megaphone, clapperboard: Clapperboard };

const iniciais = (nome: string) => nome.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const hojeIso = () => format(new Date(), "yyyy-MM-dd");
const dataCurta = (iso: string) => format(new Date(`${iso.slice(0, 10)}T12:00:00`), "EEE, d MMM", { locale: ptBR });

export function VisaoGeralEmpresa({ clienteId, onIrPara, onAbrirAtividades }: {
  clienteId: string;
  onIrPara: (subAba: string) => void;
  onAbrirAtividades: () => void;
}) {
  const { user } = useAuth();
  const [carregando, setCarregando] = useState(true);
  const [setores, setSetores] = useState<SetorResumo[]>([]);
  const [membros, setMembros] = useState<MembroResumo[]>([]);
  const [tarefas, setTarefas] = useState<TarefaResumo[]>([]);
  const [videos, setVideos] = useState<VideoResumo[]>([]);
  const [membroAberto, setMembroAberto] = useState<MembroResumo | null>(null);
  // Edições do Danilo (editor IA): prontas pra revisar entram em "Precisa de você".
  const [edicoes, setEdicoes] = useState<EdicaoResumo[]>([]);
  const [edicaoAberta, setEdicaoAberta] = useState<EdicaoResumo | null>(null);

  const carregar = useCallback(async () => {
    const [s, m, t, vv, vy] = await Promise.all([
      supabase.from("setores").select("id, nome, descricao, cor, icone").eq("cliente_id", clienteId).order("ordem"),
      supabase.from("membros").select("id, nome, funcao, setor_id, conta_id, eh_ia, link_ia").eq("cliente_id", clienteId).eq("ativo", true).order("ordem"),
      supabase.from("atividades").select("id, titulo, responsavel_id, setor_id, situacao, tipo, data_vencimento, concluida, progresso")
        .eq("cliente_id", clienteId).is("deleted_at", null).eq("concluida", false),
      supabase.from("videos_vertical").select("id, titulo, status, data_postagem, referencia_id").eq("cliente_id", clienteId),
      supabase.from("videos_youtube").select("id, titulo, status, data_postagem").eq("cliente_id", clienteId),
    ]);
    // Capa dos vídeos vindos de referência (Ideias em destaque), só dos programados.
    const refs = (vv.data || []).filter((v) => v.referencia_id && v.data_postagem && v.status !== "postado").map((v) => v.referencia_id!);
    const { data: capas } = refs.length
      ? await supabase.from("videos_referencia").select("id, thumbnail_url").in("id", refs)
      : { data: [] as { id: string; thumbnail_url: string | null }[] };
    const capaDe = new Map((capas || []).map((c) => [c.id, c.thumbnail_url]));
    const { data: eds } = await supabase.from("edicoes_video")
      .select("id, titulo, status, mensagem, versao, final_drive, duracao").eq("cliente_id", clienteId)
      .neq("status", "aprovado").order("criado_em", { ascending: false });
    setEdicoes((eds || []) as EdicaoResumo[]);
    setSetores((s.data || []) as SetorResumo[]);
    setMembros((m.data || []) as MembroResumo[]);
    setTarefas((t.data || []) as TarefaResumo[]);
    setVideos([
      ...(vv.data || []).map((v) => ({ id: v.id, titulo: v.titulo, status: v.status, data_postagem: v.data_postagem, plataforma: "vertical" as const, capa: v.referencia_id ? capaDe.get(v.referencia_id) ?? null : null })),
      ...(vy.data || []).map((v) => ({ id: v.id, titulo: v.titulo, status: v.status, data_postagem: v.data_postagem, plataforma: "youtube" as const })),
    ]);
    setCarregando(false);
  }, [clienteId]);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => { void carregar(); }, 60_000);
    return () => clearInterval(t);
  }, [carregar]);

  const hoje = hojeIso();
  const contaId = user?.id ?? "";
  const indicadores = useMemo(() => contarIndicadores(videos), [videos]);
  const precisa = useMemo(() => precisaDeVoce(contaId, videos, membros, tarefas, hoje), [contaId, videos, membros, tarefas, hoje]);
  const cuidando = useMemo(() => jarvisCuidando(contaId, videos, membros, setores, tarefas), [contaId, videos, membros, setores, tarefas]);
  const estados = useMemo(() => estadoDosMembros(membros, tarefas, hoje), [membros, tarefas, hoje]);
  const programados = useMemo(() => videosProgramados(videos, hoje), [videos, hoje]);

  if (carregando) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  const CARTOES = [
    { rotulo: "Ideias", valor: indicadores.ideias, icone: Lightbulb, cor: "text-amber-500 bg-amber-500/10", ir: "vertical" },
    { rotulo: "Roteiros", valor: indicadores.roteiros, icone: FileText, cor: "text-sky-500 bg-sky-500/10", ir: "vertical" },
    { rotulo: "Para gravar", valor: indicadores.paraGravar, icone: Camera, cor: "text-rose-500 bg-rose-500/10", ir: "vertical" },
    { rotulo: "Editando", valor: indicadores.editando, icone: Scissors, cor: "text-violet-500 bg-violet-500/10", ir: "vertical" },
    { rotulo: "Agendados", valor: indicadores.agendados, icone: CalendarDays, cor: "text-emerald-500 bg-emerald-500/10", ir: "cronograma" },
    { rotulo: "Postados", valor: indicadores.postados, icone: CheckCircle2, cor: "text-teal-500 bg-teal-500/10", ir: "vertical" },
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Visão geral</h1>
        <p className="text-sm text-muted-foreground">Toda a operação de conteúdo do projeto em um só lugar.</p>
      </header>

      {/* 6 indicadores, calculados dos vídeos (Vertical + YouTube). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {CARTOES.map(({ rotulo, valor, icone: Icone, cor, ir }) => (
          <button key={rotulo} type="button" onClick={() => onIrPara(ir)}
            className="group flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/40">
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", cor)}><Icone className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-bold leading-none">{valor}</span>
              <span className="text-xs text-muted-foreground">{rotulo}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1. O que depende de mim. */}
        <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-500" />
            <h2 className="font-semibold text-rose-600 dark:text-rose-400">Precisa de você</h2>
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
              {precisa.length + edicoes.filter((e) => e.status === "revisar" || e.status === "erro").length} itens
            </span>
          </div>
          {edicoes.filter((e) => e.status === "revisar" || e.status === "erro").map((e) => (
            <div key={e.id} className="mb-2">
              <LinhaAcao icone={Video} titulo={`${e.status === "erro" ? "Edição com problema" : "Revisar edição"}: ${e.titulo}`}
                detalhe={e.status === "erro" ? e.mensagem ?? "erro" : `Danilo terminou · versão ${e.versao}${e.duracao ? ` · ${Math.round(e.duracao)}s` : ""}`}
                atrasada={e.status === "erro"} onClick={() => setEdicaoAberta(e)} />
            </div>
          ))}
          {precisa.length === 0 && !edicoes.some((e) => e.status === "revisar" || e.status === "erro") ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nada esperando por você agora. 🎉</p>
          ) : (
            <div className="space-y-2">
              {precisa.slice(0, 6).map((item) => {
                if (item.tipo === "gravar") {
                  return <LinhaAcao key="gravar" icone={Camera} titulo={`Gravar ${item.quantidade} ${item.quantidade === 1 ? "roteiro" : "roteiros"}`} detalhe="Vídeos na etapa Gravação" onClick={() => onIrPara("vertical")} />;
                }
                if (item.tipo === "levar_ia") {
                  const n = item.tarefas.length;
                  return <LinhaAcao key={`ia-${item.membro.id}`} icone={Bot}
                    titulo={`Levar ${n} ${n === 1 ? "tarefa" : "tarefas"} pro ${item.membro.nome} (ChatGPT)`}
                    detalhe={item.tarefas.slice(0, 2).map((t) => t.titulo).join(" · ")} onClick={() => setMembroAberto(item.membro)} />;
                }
                if (item.tipo === "aprovar") {
                  return <LinhaAcao key="aprovar" icone={CheckCircle2} titulo={`Aprovar ${item.tarefas.length} ${item.tarefas.length === 1 ? "entrega" : "entregas"}`} detalhe={item.tarefas.slice(0, 2).map((t) => t.titulo).join(" · ")} onClick={onAbrirAtividades} />;
                }
                return <LinhaAcao key={item.tarefa.id} icone={FileText} titulo={item.tarefa.titulo} atrasada={item.atrasada}
                  detalhe={item.tarefa.data_vencimento ? `${item.atrasada ? "Atrasada desde" : "Prazo"} ${dataCurta(item.tarefa.data_vencimento)}` : "Sem prazo"} onClick={onAbrirAtividades} />;
              })}
              {precisa.length > 6 && <button type="button" onClick={onAbrirAtividades} className="w-full pt-1 text-center text-xs text-muted-foreground hover:text-foreground">+ {precisa.length - 6} em Atividades</button>}
            </div>
          )}
        </section>

        {/* 2. O que a operação está tocando sem mim. */}
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Bot className="h-5 w-5 text-emerald-500" />
            <h2 className="font-semibold text-emerald-700 dark:text-emerald-400">Jarvis está cuidando</h2>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {cuidando.reduce((s, l) => s + l.quantidade, 0)} em andamento
            </span>
          </div>
          {cuidando.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma tarefa da equipe em andamento. Atribua tarefas às pessoas em Atividades.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {cuidando.map((l) => <LinhaAcao key={l.rotulo} icone={Video} titulo={l.rotulo} onClick={onAbrirAtividades} />)}
            </div>
          )}
        </section>
      </div>

      {/* 3. Mapa da operação: cada setor é uma sala; cada pessoa, uma mesa. */}
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Mapa da operação</h2>
          <span className="text-xs text-muted-foreground">quem está fazendo o quê, agora</span>
        </div>
        {setores.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">A empresa deste projeto ainda não tem setores cadastrados.</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-3">
            {setores.map((setor) => {
              const cor = corDo(setor.cor);
              const Icone = ICONES[setor.icone ?? ""] ?? Users;
              const pessoas = estados.filter((e) => e.membro.setor_id === setor.id);
              const abertas = pessoas.reduce((s, p) => s + p.abertas, 0);
              const atrasadas = pessoas.reduce((s, p) => s + p.atrasadas, 0);
              return (
                <div key={setor.id} className={cn("relative overflow-hidden rounded-xl border p-3", cor.fundo, cor.borda)}>
                  {/* "Piso" da sala */}
                  <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:14px_14px]" />
                  <div className="relative mb-3 flex items-center gap-2">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-white", cor.avatar)}><Icone className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className={cn("font-semibold leading-tight", cor.texto)}>{setor.nome}</h3>
                      <p className="truncate text-[11px] text-muted-foreground">{setor.descricao}</p>
                    </div>
                    <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                      {abertas} {abertas === 1 ? "tarefa" : "tarefas"}
                      {atrasadas > 0 && <span className="block font-medium text-rose-500">{atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</span>}
                    </span>
                  </div>
                  <div className="relative grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
                    {pessoas.map(({ membro, abertas: n, atrasadas: atr, atual, ocupado }) => {
                      // O Jarvis coordena (sem fila própria); outras IAs (ex.: Danilo = ChatGPT,
                      // que edita os vídeos) têm tarefas como qualquer pessoa.
                      const coordenador = membro.eh_ia && membro.nome === "Jarvis";
                      const ativo = coordenador || ocupado;
                      return (
                        <button key={membro.id} type="button" disabled={coordenador} onClick={() => setMembroAberto(membro)}
                          title={coordenador ? undefined : `Ver e adicionar tarefas de ${membro.nome}`}
                          className="group/mesa flex flex-col items-center rounded-lg border bg-background/80 p-2 text-center shadow-sm backdrop-blur transition-colors enabled:hover:border-primary/50 enabled:hover:shadow-md">
                          {/* Balão: o que está fazendo agora */}
                          <span className={cn("mb-1.5 line-clamp-2 min-h-[2.4em] w-full rounded-md px-1.5 py-0.5 text-[10.5px] leading-tight",
                            atual ? "bg-primary/10 text-foreground" : "text-muted-foreground")}>
                            {coordenador ? "Coordenando a operação" : atual ? atual.titulo : "Sem tarefa agora"}
                          </span>
                          <span className="relative">
                            <span className={cn("flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white", membro.eh_ia ? "bg-gradient-to-br from-cyan-400 to-sky-600" : cor.avatar)}>
                              {membro.eh_ia ? <Bot className="h-5 w-5" /> : iniciais(membro.nome)}
                            </span>
                            <span className={cn("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background", ativo ? "bg-emerald-500" : "bg-zinc-400")}
                              title={ativo ? "Trabalhando" : "Sem tarefa em andamento"} />
                          </span>
                          <span className="mt-1 text-sm font-semibold leading-tight">{membro.nome}</span>
                          <span className="line-clamp-1 text-[10.5px] text-muted-foreground">{membro.funcao}</span>
                          {!coordenador && (
                            <span className="mt-1 text-[10.5px] text-muted-foreground">
                              <span className="group-hover/mesa:hidden">{n} {n === 1 ? "tarefa" : "tarefas"}{atr > 0 && <span className="font-medium text-rose-500"> · {atr} atrasada{atr > 1 ? "s" : ""}</span>}</span>
                              <span className="hidden font-medium text-primary group-hover/mesa:inline">+ tarefa</span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <EditorVideo edicao={edicaoAberta} onFechar={() => { setEdicaoAberta(null); void carregar(); }} />
      <FilaPessoa clienteId={clienteId} membro={membroAberto} setorNome={setores.find((s) => s.id === membroAberto?.setor_id)?.nome}
        onFechar={() => setMembroAberto(null)} onMudou={() => { void carregar(); }} />

      {/* 4. O que vai ser publicado. */}
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Vídeos programados</h2>
          <button type="button" onClick={() => onIrPara("cronograma")} className="ml-auto flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted">
            Ver cronograma completo <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {programados.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum vídeo com data de postagem daqui pra frente. Marque a data no Cronograma.</p>
        ) : (
          <div className="flex w-0 min-w-full snap-x gap-3 overflow-x-auto overscroll-x-contain pb-2">
            {programados.map((v) => (
              <div key={v.id} className="flex w-[260px] shrink-0 snap-start gap-3 rounded-lg border p-2">
                <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-primary/30 to-fuchsia-600/30">
                  {v.capa && <img src={v.capa} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  <span className="absolute left-1 top-1 rounded bg-black/60 p-0.5 text-white">
                    {v.plataforma === "youtube" ? <Youtube className="h-3 w-3" /> : <Instagram className="h-3 w-3" />}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{v.titulo}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3 w-3" />{dataCurta(v.data_postagem!)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function LinhaAcao({ icone: Icone, titulo, detalhe, atrasada, onClick }: {
  icone: typeof Crown; titulo: string; detalhe?: string; atrasada?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border bg-background p-2.5 text-left transition-colors hover:border-primary/40">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted"><Icone className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{titulo}</span>
        {detalhe && <span className={cn("block truncate text-xs", atrasada ? "text-rose-500" : "text-muted-foreground")}>{detalhe}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
