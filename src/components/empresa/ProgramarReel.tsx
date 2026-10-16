import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Clapperboard, Loader2, Youtube } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { HORA_REEL, diaLocal, horaDoReel, instante, problemaNoHorario, sugerirData } from "@/lib/empresa/programacao";
import { LIMITE_DURACAO_SHORT, LIMITE_TITULO_SHORT, problemaNoTitulo, tituloDoShort } from "@/lib/empresa/youtube";
import { CalendarioPosts, SemInstagram, carregarAgenda, instagramDoProjeto, ocupaDia, type ItemAgenda } from "./ProgramarCarrossel";
import { conectarYoutube, estadoYoutube } from "./CanalYoutube";

// "Escolher data do reel" (tarefa do Davi, tipo 'agendar_reel'): o Danilo
// editou, o Davi aprovou, a Dalila preparou o vídeo e sugeriu a legenda. Aqui
// ele assiste, ajusta a legenda e escolhe dia/hora — isso é o ok dele; a
// Dalila publica sozinha na nuvem (edge dalila-publicar), no Instagram do projeto.
// Com o canal do YouTube do projeto conectado, ele marca "Também no YouTube" e
// o mesmo vídeo sai como Short na mesma hora (edge youtube).
const db = supabase as unknown as SupabaseClient;
const LIMITE_LEGENDA = 2200;

interface ReelParaProgramar {
  id: string;
  cliente_id: string;
  titulo: string;
  status: string;
  mensagem: string | null;
  legenda: string | null;
  video_url: string | null;
  duracao: number | null;
  programado_para: string | null;
  yt_publicar: boolean;
  yt_titulo: string | null;
  yt_status: string | null;
  yt_url: string | null;
}

export function ProgramarReel({ tarefaId, onFechar }: { tarefaId: string | null; onFechar: () => void }) {
  const [reel, setReel] = useState<ReelParaProgramar | null>(null);
  const [agenda, setAgenda] = useState<ItemAgenda[]>([]);
  const [instagram, setInstagram] = useState<string | null>(null);
  const [canal, setCanal] = useState<string | null>(null);
  const [youtubeLigado, setYoutubeLigado] = useState(false);
  const [noYoutube, setNoYoutube] = useState(false);
  const [tituloYt, setTituloYt] = useState("");
  const [legenda, setLegenda] = useState("");
  const [data, setData] = useState("");
  const [hora, setHora] = useState(HORA_REEL);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!tarefaId) return;
    setCarregando(true);
    void (async () => {
      // Os campos do YouTube só existem depois da migração dalila_youtube_shorts: sem ela,
      // busca só o reel (antes a busca inteira falhava e aparecia "Não achei o reel").
      const BASE = "id, cliente_id, titulo, status, mensagem, legenda, video_url, duracao, programado_para";
      // eslint-disable-next-line prefer-const
      let { data: r, error } = await db.from("reels").select(`${BASE}, yt_publicar, yt_titulo, yt_status, yt_url`)
        .eq("tarefa_data_id", tarefaId).maybeSingle();
      if (error) ({ data: r } = await db.from("reels").select(BASE).eq("tarefa_data_id", tarefaId).maybeSingle());
      const lista = r ? await carregarAgenda(r.cliente_id, r.id) : [];
      setAgenda(lista);
      setInstagram(r ? await instagramDoProjeto(r.cliente_id) : null);
      const yt = r ? await estadoYoutube(r.cliente_id) : { ligado: false, canal: null };
      const c = yt.canal;
      setCanal(c);
      setYoutubeLigado(yt.ligado);
      // Com canal ligado, o padrão é ir junto para o YouTube (o Davi desmarca se não quiser).
      setNoYoutube(!!c && !r?.yt_url && (r?.yt_status ? r.yt_publicar : true));
      setTituloYt(r?.yt_titulo ?? tituloDoShort(r?.titulo ?? ""));
      setReel((r as ReelParaProgramar) ?? null);
      setLegenda(r?.legenda ?? "");
      if (r?.programado_para) {
        const d = new Date(r.programado_para);
        setData(diaLocal(d));
        setHora(format(d, "HH:mm"));
      } else {
        setData(sugerirData(new Date(), lista.filter(ocupaDia("reel")).map((a) => a.dia), HORA_REEL));
        setHora(HORA_REEL);
      }
      setCarregando(false);
    })();
  }, [tarefaId]);

  // Só reel ocupa o dia do reel: carrossel às 10h e reel às 18h convivem.
  const ocupados = useMemo(() => agenda.filter(ocupaDia("reel")).map((a) => a.dia), [agenda]);
  // Escolheu o dia: 18h, ou 12h se o dia já tem reel.
  const escolherDia = (dia: string) => { setData(dia); if (dia) setHora(horaDoReel(dia, ocupados)); };
  const quando = useMemo(() => instante(data, hora), [data, hora]);
  const problema = problemaNoHorario(quando, new Date())
    ?? (!legenda.trim() ? "Escreva a legenda." : legenda.length > LIMITE_LEGENDA ? `A legenda passa de ${LIMITE_LEGENDA} caracteres.` : null);
  const naoPublicou = reel?.mensagem?.startsWith("Não publicou") ? reel.mensagem : null;
  const pronto = !!reel?.video_url;
  const shortJaSaiu = !!reel?.yt_url;
  const problemaYt = noYoutube && canal && !shortJaSaiu ? problemaNoTitulo(tituloYt) : null;

  const programar = async () => {
    if (!reel || !quando || problema || problemaYt || !instagram || !pronto) return;
    setSalvando(true);
    const youtube = noYoutube && !!canal && !shortJaSaiu;
    const { error } = await db.rpc("programar_reel", {
      p_reel: reel.id, p_quando: quando.toISOString(), p_legenda: legenda,
      // Só manda os campos do YouTube com o canal ligado: antes da migração do YouTube a função não os aceita.
      ...(youtube ? { p_youtube: true, p_yt_titulo: tituloYt.trim() } : {}),
    });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Programado: a Dalila publica o reel${youtube ? " (e o Short no YouTube)" : ""} ${format(quando, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}.`);
    onFechar();
  };

  return (
    <Dialog open={!!tarefaId} onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Clapperboard className="h-5 w-5" /> Quando publicar o reel?</DialogTitle>
          <DialogDescription>{reel?.titulo ?? "Reel"}</DialogDescription>
        </DialogHeader>
        {carregando ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !reel ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Não achei o reel desta tarefa.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
              {pronto ? (
                <video src={reel.video_url!} controls playsInline preload="metadata" className="aspect-[9/16] w-full rounded-lg border bg-black" />
              ) : (
                <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border bg-muted p-3 text-center text-xs text-muted-foreground">
                  {reel.mensagem ?? "A Dalila está preparando o vídeo."}
                </div>
              )}
              <label className="flex flex-col gap-1 text-sm">
                <span className="flex items-center justify-between text-muted-foreground">
                  Legenda (sugerida pela Dalila, pode editar)
                  <span className={legenda.length > LIMITE_LEGENDA ? "text-rose-600" : ""}>{legenda.length}/{LIMITE_LEGENDA}</span>
                </span>
                <Textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} className="min-h-[220px] flex-1 text-sm" />
              </label>
            </div>
            {naoPublicou && <p className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-sm text-rose-600 dark:text-rose-400">{naoPublicou}</p>}
            <CalendarioPosts agenda={agenda} tipo="reel" selecionado={data} onEscolher={escolherDia} />
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="flex items-center justify-between text-muted-foreground">Dia
                  <button type="button" onClick={() => { setData(sugerirData(new Date(), ocupados, HORA_REEL)); setHora(HORA_REEL); }}
                    className="text-xs font-medium text-primary hover:underline">A Dalila escolhe</button>
                </span>
                <Input type="date" value={data} min={diaLocal(new Date())} onChange={(e) => escolherDia(e.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Hora (Brasília)</span>
                <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              </label>
            </div>
            {data && ocupados.includes(data) && <p className="text-xs text-amber-600 dark:text-amber-400">Já tem reel neste dia: sugeri 12h para este (o ritmo por enquanto é 1 reel por dia).</p>}
            {problema && data && <p className="text-xs text-rose-600 dark:text-rose-400">{problema}</p>}
            {youtubeLigado && <div className="space-y-2 rounded-md border p-3 text-sm">
              {shortJaSaiu ? (
                <p className="flex items-center gap-2 text-muted-foreground"><Youtube className="h-4 w-4 text-red-600" />
                  O Short já está no YouTube: <a href={reel.yt_url!} target="_blank" rel="noreferrer" className="text-primary hover:underline">{reel.yt_url}</a></p>
              ) : canal ? (
                <>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={noYoutube} onChange={(e) => setNoYoutube(e.target.checked)} className="h-4 w-4" />
                    <Youtube className="h-4 w-4 text-red-600" /> Também como Short no YouTube ({canal}), na mesma hora
                  </label>
                  {noYoutube && (
                    <label className="block space-y-1">
                      <span className="flex items-center justify-between text-xs text-muted-foreground">
                        Título do Short (a descrição é a legenda acima)
                        <span className={tituloYt.trim().length > LIMITE_TITULO_SHORT ? "text-rose-600" : ""}>{tituloYt.trim().length}/{LIMITE_TITULO_SHORT}</span>
                      </span>
                      <Input value={tituloYt} onChange={(e) => setTituloYt(e.target.value)} />
                      {problemaYt && <span className="block text-xs text-rose-600 dark:text-rose-400">{problemaYt}</span>}
                      {(reel.duracao ?? 0) > LIMITE_DURACAO_SHORT && (
                        <span className="block text-xs text-amber-600 dark:text-amber-400">O vídeo passa de 3 min: o YouTube vai tratar como vídeo comum, não como Short.</span>
                      )}
                    </label>
                  )}
                </>
              ) : (
                <p className="flex flex-wrap items-center gap-2 text-muted-foreground"><Youtube className="h-4 w-4 text-red-600" />
                  Quer este vídeo também no YouTube?
                  <button type="button" onClick={() => void conectarYoutube(reel.cliente_id).catch((e) => toast.error((e as Error).message))}
                    className="font-medium text-primary hover:underline">Conectar o canal do projeto</button>
                </p>
              )}
            </div>}
            {instagram ? (
              <p className="text-xs text-muted-foreground">
                A Dalila publica o reel sozinha no @{instagram} neste dia e hora, mesmo com o Mac desligado. Escolher a data é o seu ok.
              </p>
            ) : <SemInstagram />}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onFechar}>Agora não</Button>
              <Button onClick={() => void programar()} disabled={!!problema || !!problemaYt || salvando || !instagram || !pronto}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {quando && !problema ? `Programar para ${format(quando, "EEE, d MMM 'às' HH:mm", { locale: ptBR })}` : "Programar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
