import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle, Bot, CalendarClock, CalendarDays, Camera, CheckCircle2, ChevronRight, Crown,
  FileText, GalleryHorizontal, Instagram, Lightbulb, Loader2, Scissors, Users, Video, Youtube,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { FilaPessoa } from "./FilaPessoa";
import { EscritorioEmpresa } from "./EscritorioEmpresa";
import { EditorVideo, type EdicaoResumo } from "./EditorVideo";
import { RevisaoCarrossel } from "./RevisaoCarrossel";
import { AprovarTodosCarrosseis } from "./AprovarTodosCarrosseis";
import { emProducao, linhaPrecisa, precisaRevisar, type CarrosselResumo } from "@/lib/empresa/carrossel";
import { ProgramarCarrossel } from "./ProgramarCarrossel";
import {
  contarIndicadores, estadoDosMembros, jarvisCuidando, postProgramado, precisaDeVoce, sinalDoMembro, trabalhoDasIas, videosProgramados,
  type Sinal,
  type MembroResumo, type SetorResumo, type TarefaResumo, type VideoResumo,
} from "@/lib/empresa/visaoGeral";

// Conteúdo → Visão geral: a "sala de comando" da empresa do projeto.
// Hierarquia (briefing de 12/10): 1) o que precisa de mim, 2) o que está
// andando sem mim, 3) como está a empresa (mapa), 4) o que vai ser publicado.

const COR_PLACA: Record<string, string> = { amber: "#f59e0b", violet: "#8b5cf6", blue: "#0ea5e9" };

// Bolinha de cada pessoa no mapa (pedido do Davi, 14/10).
const SINAIS: Record<Sinal, { cor: string; rotulo: string }> = {
  trabalhando: { cor: "bg-emerald-500", rotulo: "Trabalhando" },
  esperando: { cor: "bg-amber-400", rotulo: "Esperando resposta ou revisão" },
  problema: { cor: "bg-rose-500", rotulo: "Algum problema" },
  parado: { cor: "bg-zinc-400", rotulo: "Parado" },
};

const hojeIso = () => format(new Date(), "yyyy-MM-dd");
interface CarrosselProgramado { id: string; numero: number | null; tema: string; status: string; programado_para: string | null; paginas: string[] | null }
// "hoje às 12:00", "amanhã às 10:00", "sex, 17 out às 10:00".
const quandoPublica = (iso: string) => {
  const d = new Date(iso), hoje = new Date(), amanha = new Date();
  amanha.setDate(hoje.getDate() + 1);
  const hora = format(d, "HH:mm");
  if (d.toDateString() === hoje.toDateString()) return `hoje às ${hora}`;
  if (d.toDateString() === amanha.toDateString()) return `amanhã às ${hora}`;
  return `${format(d, "EEE, d MMM", { locale: ptBR })} às ${hora}`;
};
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
  // Tarefa "Escolher data do carrossel" (tipo agendar) aberta: o Davi programa a Dalila.
  const [agendarAberto, setAgendarAberto] = useState<string | null>(null);
  // Edições do Danilo (editor IA): prontas pra revisar entram em "Precisa de você".
  const [edicoes, setEdicoes] = useState<EdicaoResumo[]>([]);
  const [edicaoAberta, setEdicaoAberta] = useState<EdicaoResumo | null>(null);
  // Carrosséis do Roy: prontos pra revisar também entram em "Precisa de você".
  const [carrosseis, setCarrosseis] = useState<CarrosselResumo[]>([]);
  const [carrosseisProgramados, setCarrosseisProgramados] = useState<CarrosselProgramado[]>([]);
  const [carrosselAberto, setCarrosselAberto] = useState<CarrosselResumo | null>(null);

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
    const { data: cars } = await supabase.from("carrosseis")
      .select("id, numero, tema, status, mensagem, feedback, slides, legenda, paginas, modelos, versao, fonte_permalink, pasta_drive, atividade_id, atividade_roy_id, atualizado_em")
      .eq("cliente_id", clienteId).in("status", ["produzindo", "revisar", "ajuste", "erro"]).order("numero");
    setCarrosseis((cars || []) as unknown as CarrosselResumo[]);
    // Carrosséis com data marcada: a Dalila publica sozinha na nuvem.
    const { data: prog } = await supabase.from("carrosseis")
      .select("id, numero, tema, status, programado_para, paginas")
      .eq("cliente_id", clienteId).in("status", ["programado", "publicando"]).order("programado_para");
    setCarrosseisProgramados((prog || []) as unknown as CarrosselProgramado[]);
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
  // Tarefa do Roy que já virou carrossel aparece só pelo card do carrossel (revisão com as páginas),
  // não como "Aprovar entrega" (esse caminho é o do Ítalo, que entrega documento).
  const tarefasComCarrossel = useMemo(() => new Set(carrosseis.map((c) => (c as CarrosselResumo & { atividade_roy_id?: string | null }).atividade_roy_id).filter(Boolean)), [carrosseis]);
  const precisa = useMemo(() => precisaDeVoce(contaId, videos, membros, tarefas.filter((t) => !tarefasComCarrossel.has(t.id)), hoje),
    [contaId, videos, membros, tarefas, hoje, tarefasComCarrossel]);
  const cuidando = useMemo(() => jarvisCuidando(contaId, videos, membros, setores, tarefas), [contaId, videos, membros, setores, tarefas]);
  const estados = useMemo(() => estadoDosMembros(membros, tarefas, hoje), [membros, tarefas, hoje]);
  const programados = useMemo(() => videosProgramados(videos, hoje), [videos, hoje]);
  const trabalhoIa = useMemo(() => trabalhoDasIas(membros, carrosseis, edicoes), [membros, carrosseis, edicoes]);

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
              {precisa.length + edicoes.filter((e) => e.status === "revisar" || e.status === "erro").length + carrosseis.filter(precisaRevisar).length} itens
            </span>
          </div>
          {edicoes.filter((e) => e.status === "revisar" || e.status === "erro").map((e) => (
            <div key={e.id} className="mb-2">
              <LinhaAcao icone={Video} titulo={`${e.status === "erro" ? "Edição com problema" : "Revisar edição"}: ${e.titulo}`}
                detalhe={e.status === "erro" ? e.mensagem ?? "erro" : `Danilo terminou · versão ${e.versao}${e.duracao ? ` · ${Math.round(e.duracao)}s` : ""}`}
                atrasada={e.status === "erro"} onClick={() => setEdicaoAberta(e)} />
            </div>
          ))}
          <AprovarTodosCarrosseis clienteId={clienteId} prontos={carrosseis.filter((c) => c.status === "revisar")} onAprovou={() => { void carregar(); }} />
          {carrosseis.filter(precisaRevisar).map((c) => {
            const l = linhaPrecisa(c);
            return (
              <div key={c.id} className="mb-2">
                <LinhaAcao icone={GalleryHorizontal} titulo={l.titulo} detalhe={l.detalhe} atrasada={l.problema} onClick={() => setCarrosselAberto(c)} />
              </div>
            );
          })}
          {precisa.length === 0 && !edicoes.some((e) => e.status === "revisar" || e.status === "erro") && !carrosseis.some(precisaRevisar) ? (
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
                if (item.tarefa.tipo === "agendar") {
                  return <LinhaAcao key={item.tarefa.id} icone={CalendarClock} titulo={item.tarefa.titulo}
                    detalhe="Escolha o dia e a hora · a Dalila publica" onClick={() => setAgendarAberto(item.tarefa.id)} />;
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
              {cuidando.reduce((s, l) => s + l.quantidade, 0) + carrosseis.filter(emProducao).length} em andamento
            </span>
          </div>
          {carrosseis.some(emProducao) && (
            <div className="mb-2">
              <LinhaAcao icone={GalleryHorizontal} onClick={() => {}}
                titulo={`Roy criando ${carrosseis.filter(emProducao).length} ${carrosseis.filter(emProducao).length === 1 ? "carrossel" : "carrosséis"}`}
                detalhe={carrosseis.filter(emProducao).map((c) => c.mensagem ?? c.tema).slice(0, 2).join(" · ")} />
            </div>
          )}
          {cuidando.length === 0 && !carrosseis.some(emProducao) ? (
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
          <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {(["trabalhando", "esperando", "problema", "parado"] as Sinal[]).map((k) => (
              <span key={k} className="flex items-center gap-1"><span className={cn("h-2 w-2 rounded-full", SINAIS[k].cor)} />{SINAIS[k].rotulo}</span>
            ))}
          </span>
        </div>
        {setores.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">A empresa deste projeto ainda não tem setores cadastrados.</p>
        ) : (
          // O escritório inteiro: setores lado a lado, cada um com a placa na parede.
          <EscritorioEmpresa onAbrir={(id) => { const m = membros.find((x) => x.id === id); if (m) setMembroAberto(m); }}
            setores={setores.map((setor) => {
              const pessoas = estados.filter((e) => e.membro.setor_id === setor.id);
              return {
                id: setor.id, nome: setor.nome, corPlaca: COR_PLACA[setor.cor ?? ""] ?? COR_PLACA.blue,
                tarefas: pessoas.reduce((s, p) => s + p.abertas, 0), atrasadas: pessoas.reduce((s, p) => s + p.atrasadas, 0),
                pessoas: pessoas.map((estado) => {
                  const { membro, abertas: n, atrasadas: atr, atual } = estado;
                  const ia = trabalhoIa.get(membro.id);
                  // O Jarvis coordena (sem fila própria); as outras IAs têm tarefas como qualquer pessoa.
                  const coordenador = membro.eh_ia && membro.nome === "Jarvis";
                  const sinal: Sinal = coordenador ? "trabalhando" : sinalDoMembro(estado, tarefas, ia);
                  const balao = coordenador ? "Coordenando a operação"
                    : ia?.problema ? "Parou com problema"
                    : ia?.esperando ? `${ia.esperando} esperando sua revisão`
                    : atual && postProgramado(atual) ? `Post programado: ${atual.titulo.replace(/^Programar carrossel:\s*/i, "")}`
                    : atual?.titulo ?? ia?.atual ?? null;
                  return {
                    id: membro.id, nome: membro.nome, ehIa: membro.eh_ia, sinal, corSinal: SINAIS[sinal].cor, rotuloSinal: SINAIS[sinal].rotulo,
                    balao, tarefas: n, atrasadas: atr, clicavel: !coordenador,
                  };
                }),
              };
            })} />
        )}
      </section>
      <EditorVideo edicao={edicaoAberta} onFechar={() => { setEdicaoAberta(null); void carregar(); }} />
      <RevisaoCarrossel clienteId={clienteId} carrossel={carrosselAberto} onFechar={() => { setCarrosselAberto(null); void carregar(); }} />
      <FilaPessoa clienteId={clienteId} membro={membroAberto} setorNome={setores.find((s) => s.id === membroAberto?.setor_id)?.nome}
        onFechar={() => setMembroAberto(null)} onMudou={() => { void carregar(); }} />
      <ProgramarCarrossel tarefaId={agendarAberto} onFechar={() => { setAgendarAberto(null); void carregar(); }} />

      {/* 4. O que vai ser publicado. */}
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Programados</h2>
          <button type="button" onClick={() => onIrPara("cronograma")} className="ml-auto flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted">
            Ver cronograma completo <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {programados.length === 0 && carrosseisProgramados.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nada com data de postagem daqui pra frente. Marque a data no Cronograma.</p>
        ) : (
          <div className="flex w-0 min-w-full snap-x gap-3 overflow-x-auto overscroll-x-contain pb-2">
            {carrosseisProgramados.map((c) => (
              <div key={c.id} className="flex w-[260px] shrink-0 snap-start gap-3 rounded-lg border border-emerald-600/40 bg-emerald-600/5 p-2">
                <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                  {c.paginas?.[0] && <img src={c.paginas[0]} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  <span className="absolute left-1 top-1 rounded bg-black/60 p-0.5 text-white"><Instagram className="h-3 w-3" /></span>
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">Carrossel {String(c.numero ?? "").padStart(3, "0")} · {c.tema}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <CalendarDays className="h-3 w-3" />
                    {c.status === "publicando" ? "Publicando agora…" : c.programado_para ? `Programado · ${quandoPublica(c.programado_para)}` : "Programado"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">A Dalila publica sozinha</p>
                </div>
              </div>
            ))}
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
