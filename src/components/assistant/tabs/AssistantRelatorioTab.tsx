import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, endOfDay, format, isToday, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, ChevronLeft, ChevronRight, Flame, NotebookPen, Send, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import {
  duracaoCurta, montarLinhaDoTempo, resumoDoDia,
  type AtividadeConcluida, type RegistroDiario, type SessaoFoco,
} from "@/lib/relatorio/linhaDoTempo";

interface Fechamento { main_win: string | null; main_blocker: string | null; tomorrow_main_priority: string | null }

// Guia "Relatório" do Jarvis: diário rápido do dia. A pessoa escreve o que
// fez ("fechei a call com o Matheus") e a linha do tempo junta isso com as
// atividades concluídas e as sessões de foco, pra mapear o que foi feito em
// cada dia (setas pra ver os anteriores).
export function AssistantRelatorioTab() {
  const { user } = useAuth();
  const [dia, setDia] = useState(() => new Date());
  const [registros, setRegistros] = useState<RegistroDiario[]>([]);
  const [concluidas, setConcluidas] = useState<AtividadeConcluida[]>([]);
  const [sessoes, setSessoes] = useState<SessaoFoco[]>([]);
  const [fechamento, setFechamento] = useState<Fechamento | null>(null);
  const [projetos, setProjetos] = useState<{ id: string; nome: string }[]>([]);
  const [texto, setTexto] = useState("");
  const [projetoId, setProjetoId] = useState("");
  const [carregando, setCarregando] = useState(true);
  const diaIso = format(dia, "yyyy-MM-dd");

  useEffect(() => {
    void supabase.from("clientes").select("id, nome_especialista").eq("arquivado", false).order("nome_especialista")
      .then(({ data }) => setProjetos((data || []).map((c) => ({ id: c.id, nome: c.nome_especialista }))));
  }, []);
  const nomeProjeto = useCallback((id: string | null) => (id ? projetos.find((p) => p.id === id)?.nome ?? null : null), [projetos]);

  const carregar = useCallback(async () => {
    if (!user?.id) return;
    setCarregando(true);
    const inicio = startOfDay(dia).toISOString();
    const fim = endOfDay(dia).toISOString();
    // Consultas montadas separadas: encadeadas num Promise.all o TypeScript
    // estoura o limite de inferência de tipos do supabase-js.
    const consultaRegistros = supabase.from("relatorio_registros").select("id, texto, registrado_em, cliente_id").eq("data", diaIso).order("registrado_em");
    const consultaConcluidas = supabase.from("atividades").select("id, titulo, concluida_em, cliente_id, deleted_at")
      .match({ user_id: user.id, concluida: true }).gte("concluida_em", inicio).lte("concluida_em", fim);
    const consultaFoco = supabase.from("focus_sessions").select("id, started_at, duration_seconds, atividade_id, cliente_id")
      .eq("user_id", user.id).gte("started_at", inicio).lte("started_at", fim);
    const consultaFechamento = supabase.from("daily_productivity_reports").select("main_win, main_blocker, tomorrow_main_priority")
      .eq("user_id", user.id).eq("date", diaIso).maybeSingle();
    const reg = await consultaRegistros;
    const ativ = await consultaConcluidas;
    const foco = await consultaFoco;
    const fech = await consultaFechamento;
    const idsAtividade = [...new Set((foco.data || []).map((s) => s.atividade_id).filter(Boolean))] as string[];
    const titulos = idsAtividade.length
      ? Object.fromEntries(((await supabase.from("atividades").select("id, titulo").in("id", idsAtividade)).data || []).map((a) => [a.id, a.titulo]))
      : {};
    setRegistros((reg.data || []).map((r) => ({ id: r.id, texto: r.texto, registrado_em: r.registrado_em, projeto: r.cliente_id })));
    // (atividade na lixeira não conta — filtrado aqui pra manter a consulta curta)
    setConcluidas((ativ.data || []).filter((a) => !a.deleted_at).map((a) => ({ id: a.id, titulo: a.titulo, concluida_em: a.concluida_em as string, projeto: a.cliente_id })));
    setSessoes((foco.data || []).map((s) => ({
      id: s.id, started_at: s.started_at, duration_seconds: s.duration_seconds,
      titulo: s.atividade_id ? titulos[s.atividade_id] ?? null : null, projeto: s.cliente_id,
    })));
    setFechamento(fech.data ?? null);
    setCarregando(false);
  }, [dia, diaIso, user?.id]);

  useEffect(() => { void carregar(); }, [carregar]);

  const registrar = async () => {
    const limpo = texto.trim();
    if (!limpo) return;
    // Registro num dia anterior fica nesse dia, no horário de agora.
    const agora = new Date();
    const quando = isToday(dia) ? agora : new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), agora.getHours(), agora.getMinutes());
    setTexto("");
    const { data, error } = await supabase.from("relatorio_registros")
      .insert({ texto: limpo, data: diaIso, registrado_em: quando.toISOString(), cliente_id: projetoId || null })
      .select("id, texto, registrado_em, cliente_id").single();
    if (error || !data) { setTexto(limpo); toast.error("Não foi possível salvar o registro"); return; }
    setRegistros((atuais) => [...atuais, { id: data.id, texto: data.texto, registrado_em: data.registrado_em, projeto: data.cliente_id }]);
  };

  const apagar = async (registro: RegistroDiario) => {
    setRegistros((atuais) => atuais.filter((r) => r.id !== registro.id));
    const { error } = await supabase.from("relatorio_registros").delete().eq("id", registro.id);
    if (error) { toast.error("Não foi possível apagar"); void carregar(); return; }
    toast("Registro apagado", {
      action: {
        label: "Desfazer",
        onClick: async () => {
          await supabase.from("relatorio_registros").insert({ texto: registro.texto, data: diaIso, registrado_em: registro.registrado_em, cliente_id: registro.projeto });
          void carregar();
        },
      },
    });
  };

  const itens = useMemo(() => montarLinhaDoTempo(registros, concluidas, sessoes), [registros, concluidas, sessoes]);
  const resumo = resumoDoDia(registros, concluidas, sessoes);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Dia (‹ hoje ›) */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setDia((d) => addDays(d, -1))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Dia anterior"><ChevronLeft className="h-4 w-4" /></button>
        <div className="text-center">
          <p className="text-sm font-semibold capitalize">{isToday(dia) ? "Hoje" : format(dia, "EEEE", { locale: ptBR })}</p>
          <p className="text-[11px] text-muted-foreground">{format(dia, "d 'de' MMMM", { locale: ptBR })}</p>
        </div>
        <button type="button" onClick={() => setDia((d) => addDays(d, 1))} disabled={isToday(dia)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Próximo dia"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { rotulo: "Foco", valor: resumo.focoMinutos ? duracaoCurta(resumo.focoMinutos) : "—" },
          { rotulo: "Concluídas", valor: resumo.concluidas },
          { rotulo: "Registros", valor: resumo.registros },
        ].map((c) => (
          <div key={c.rotulo} className="rounded-lg border bg-muted/30 py-1.5">
            <p className="text-sm font-semibold">{c.valor}</p>
            <p className="text-[10px] text-muted-foreground">{c.rotulo}</p>
          </div>
        ))}
      </div>

      {/* Escrever o que fez */}
      <div className="space-y-1.5 rounded-lg border bg-card p-2">
        <div className="flex items-center gap-1.5">
          <NotebookPen className="h-4 w-4 shrink-0 text-primary" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void registrar(); } }}
            placeholder={isToday(dia) ? "O que você fez agora?" : "Registrar algo neste dia…"}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button type="button" onClick={() => void registrar()} disabled={!texto.trim()} className="rounded-md p-1 text-primary hover:bg-primary/10 disabled:opacity-30" aria-label="Registrar"><Send className="h-4 w-4" /></button>
        </div>
        <select value={projetoId} onChange={(e) => setProjetoId(e.target.value)} className="h-6 w-full rounded border-none bg-muted/50 px-1.5 text-[11px] text-muted-foreground outline-none" aria-label="Projeto (opcional)">
          <option value="">Sem projeto</option>
          {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>

      {/* Fechamento do dia (respondido no "Encerrar o dia") */}
      {fechamento && (fechamento.main_win || fechamento.main_blocker) && (
        <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
          {fechamento.main_win && <p className="flex gap-1.5"><Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /><span><b>Vitória:</b> {fechamento.main_win}</span></p>}
          {fechamento.main_blocker && <p className="flex gap-1.5 text-muted-foreground"><span className="w-3.5 shrink-0 text-center">⛔</span><span><b>Travou:</b> {fechamento.main_blocker}</span></p>}
        </div>
      )}

      {/* Linha do tempo */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {carregando ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Carregando…</p>
        ) : itens.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {isToday(dia) ? "Nada registrado ainda hoje. Escreva acima o que você fez." : "Nada registrado neste dia."}
          </p>
        ) : (
          <ol className="relative space-y-2 border-l border-border pl-4">
            {itens.map((item) => (
              <li key={`${item.tipo}-${item.id}`} className="group relative">
                <span className={cn("absolute -left-[21px] top-1 flex h-3 w-3 items-center justify-center rounded-full ring-4 ring-background",
                  item.tipo === "registro" ? "bg-primary" : item.tipo === "concluida" ? "bg-emerald-500" : "bg-orange-500")} />
                <div className="flex items-start gap-1.5">
                  <span className="w-10 shrink-0 pt-px text-[11px] tabular-nums text-muted-foreground">{format(new Date(item.quando), "HH:mm")}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      {item.tipo === "concluida" && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-emerald-500" />}
                      {item.tipo === "foco" && <Flame className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-orange-500" />}
                      {item.tipo === "concluida" ? <span className="text-muted-foreground">Concluiu: </span> : null}
                      {item.tipo === "foco" ? <span className="text-muted-foreground">Foco ({duracaoCurta(item.minutos)}): </span> : null}
                      {item.texto}
                    </p>
                    {nomeProjeto(item.projeto) && <p className="text-[10px] text-muted-foreground">{nomeProjeto(item.projeto)}</p>}
                  </div>
                  {item.tipo === "registro" && (
                    <button type="button" onClick={() => void apagar(registros.find((r) => r.id === item.id)!)}
                      className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100" aria-label="Apagar registro">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
