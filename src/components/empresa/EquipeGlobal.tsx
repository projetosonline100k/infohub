import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { estadoDosMembros, sinalDoMembro, type MembroResumo, type TarefaResumo } from "@/lib/empresa/visaoGeral";
import { aoMudarEquipeLocal, equipeLocalNaTela } from "@/lib/empresa/equipeLocal";
import { EquipeMessenger, type PessoaChat } from "./EquipeMessenger";
import { FilaPessoa } from "./FilaPessoa";

// Chat da equipe em todo o app (28/10, Davi: "o chat da equipe sempre aparece para mim, e eu só escolho o
// projeto num filtro"). A mesma gaveta do Escritório, com o projeto escolhido no topo (lembrado; abre no projeto
// da tela quando ela é de um projeto com equipe). No Escritório de um projeto fica a gaveta dele.
const CHAVE = "equipe:projeto";
const db = supabase as unknown as SupabaseClient;

export function EquipeGlobal({ clienteDaTela }: { clienteDaTela?: string }) {
  const [projetos, setProjetos] = useState<{ id: string; nome: string }[]>([]);
  const [escolhido, setEscolhido] = useState<string | null>(() => { try { return localStorage.getItem(CHAVE); } catch { return null; } });
  const [membros, setMembros] = useState<MembroResumo[]>([]);
  const [tarefas, setTarefas] = useState<TarefaResumo[]>([]);
  const [fila, setFila] = useState<MembroResumo | null>(null);
  const [escondida, setEscondida] = useState(equipeLocalNaTela);
  useEffect(() => aoMudarEquipeLocal(() => setEscondida(equipeLocalNaTela())), []);

  // Projetos com equipe (membros ativos), em ordem de nome.
  useEffect(() => {
    void (async () => {
      const [{ data: ms }, { data: cs }] = await Promise.all([
        db.from("membros").select("cliente_id").eq("ativo", true),
        supabase.from("clientes").select("id, nome_especialista, arquivado").eq("arquivado", false).order("nome_especialista"),
      ]);
      const comEquipe = new Set(((ms || []) as { cliente_id: string }[]).map((m) => m.cliente_id));
      setProjetos((cs || []).filter((c) => comEquipe.has(c.id)).map((c) => ({ id: c.id, nome: c.nome_especialista })));
    })();
  }, []);

  // Tela de um projeto com equipe: a gaveta acompanha.
  useEffect(() => {
    if (clienteDaTela && projetos.some((p) => p.id === clienteDaTela)) setEscolhido(clienteDaTela);
  }, [clienteDaTela, projetos]);
  const clienteId = escolhido && projetos.some((p) => p.id === escolhido) ? escolhido : projetos[0]?.id ?? null;
  const escolher = (id: string) => { setEscolhido(id); try { localStorage.setItem(CHAVE, id); } catch { /* */ } };

  const carregar = useCallback(async () => {
    if (!clienteId) return;
    const [m, t] = await Promise.all([
      db.from("membros").select("id, nome, funcao, setor_id, conta_id, eh_ia, link_ia, visual").eq("cliente_id", clienteId).eq("ativo", true).order("ordem"),
      db.from("atividades").select("id, titulo, responsavel_id, setor_id, situacao, tipo, data_vencimento, concluida, progresso, andamento_desde, previsao_fim")
        .eq("cliente_id", clienteId).is("deleted_at", null).eq("concluida", false),
    ]);
    setMembros((m.data || []) as MembroResumo[]);
    setTarefas((t.data || []) as TarefaResumo[]);
  }, [clienteId]);
  useEffect(() => {
    void carregar();
    const t = window.setInterval(() => void carregar(), 60_000);
    return () => window.clearInterval(t);
  }, [carregar]);

  const pessoas: PessoaChat[] = useMemo(() => estadoDosMembros(membros, tarefas, format(new Date(), "yyyy-MM-dd")).map((estado) => ({
    membro: estado.membro, sinal: sinalDoMembro(estado, tarefas), atual: estado.atual?.titulo ?? null,
  })), [membros, tarefas]);

  if (escondida || !clienteId) return null;
  const seletor = (
    <select value={clienteId} onChange={(e) => escolher(e.target.value)} title="Projeto"
      className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50">
      {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
    </select>
  );
  return (
    <>
      <EquipeMessenger key={clienteId} clienteId={clienteId} pessoas={pessoas} onAbrirFila={setFila} onMudou={() => void carregar()} seletor={seletor} />
      <FilaPessoa clienteId={clienteId} membro={fila} onFechar={() => setFila(null)} onMudou={() => void carregar()} />
    </>
  );
}
