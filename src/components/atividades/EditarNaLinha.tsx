import { useEffect, useState, type ReactNode } from "react";
import { Check, Loader2, UserX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseResponsaveis } from "@/lib/responsaveis";

// Trocar responsável e projeto direto na linha da lista (24/10, Davi): clicar no nome/avatar ou na etiqueta do
// projeto abre um seletor que já salva no banco e devolve o que mudou para a tela atualizar a linha na hora.
// O gatilho atividade_liga_membro mantém responsavel_id e responsavel_nome juntos; as permissões são as do RLS.

export type MudancaAtividade = {
  responsavel_id?: string | null;
  responsavel_nome?: string | null;
  cliente_id?: string | null;
  status?: string;
  pasta_id?: string | null;
  setor_id?: string | null;
  proximo_responsavel_id?: string | null;
};

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Clique dentro do seletor não pode abrir a tarefa (o React passa o clique do portal para a linha).
const parar = (e: React.SyntheticEvent) => e.stopPropagation();

const Opcao = ({ ativo, onClick, children }: { ativo?: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick}
    className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted", ativo && "font-medium text-primary")}>
    <span className="min-w-0 flex-1 truncate">{children}</span>
    {ativo && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
  </button>
);

export function SeletorResponsavel({ atividadeId, clienteId, responsavelNome, onMudou, children }: {
  atividadeId: string;
  clienteId: string | null;
  responsavelNome: string | null;
  onMudou: (mudanca: MudancaAtividade) => void;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [pessoas, setPessoas] = useState<{ id: string | null; nome: string }[] | null>(null);
  const [outro, setOutro] = useState("");
  const atuais = parseResponsaveis(responsavelNome).map(normalizar);

  // Mesma lista do painel da tarefa: pessoas da empresa do projeto (membros) e a equipe do cliente.
  useEffect(() => {
    if (!aberto) return;
    if (!clienteId) { setPessoas([]); return; }
    setPessoas(null);
    void Promise.all([
      supabase.from("membros").select("id, nome").eq("cliente_id", clienteId).eq("ativo", true).order("ordem"),
      supabase.from("equipe_cliente").select("nome_pessoa").eq("cliente_id", clienteId),
    ]).then(([{ data: membros }, { data: equipe }]) => {
      const lista = (membros ?? []).map((m) => ({ id: m.id as string | null, nome: m.nome as string }));
      for (const e of equipe ?? []) {
        if (e.nome_pessoa && !lista.some((p) => normalizar(p.nome) === normalizar(e.nome_pessoa))) lista.push({ id: null, nome: e.nome_pessoa });
      }
      setPessoas(lista);
    });
  }, [aberto, clienteId]);

  const salvar = async (pessoa: { id: string | null; nome: string } | null) => {
    const mudanca: MudancaAtividade = pessoa
      ? { responsavel_nome: pessoa.nome, ...(pessoa.id ? { responsavel_id: pessoa.id } : {}) }
      : { responsavel_nome: null, responsavel_id: null };
    setAberto(false);
    setOutro("");
    const { data, error } = await supabase.from("atividades").update(mudanca).eq("id", atividadeId)
      .select("responsavel_id, responsavel_nome").maybeSingle();
    if (error || !data) { toast.error("Não consegui trocar o responsável"); return; }
    onMudou({ responsavel_id: data.responsavel_id, responsavel_nome: data.responsavel_nome });
    toast.success(pessoa ? `Responsável: ${pessoa.nome}` : "Tarefa sem responsável");
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild onClick={parar}>
        <button type="button" title="Trocar responsável" className="flex min-w-0 items-center gap-1.5 rounded-md hover:bg-muted">
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="end" onClick={parar}>
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Responsável</p>
        <div className="max-h-56 overflow-y-auto">
          {pessoas === null ? (
            <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {pessoas.map((p) => (
                <Opcao key={`${p.id ?? ""}-${p.nome}`} ativo={atuais.includes(normalizar(p.nome))} onClick={() => void salvar(p)}>{p.nome}</Opcao>
              ))}
              {pessoas.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Ninguém cadastrado neste projeto.</p>}
            </>
          )}
        </div>
        <form className="border-t p-1 pt-1.5" onSubmit={(e) => { e.preventDefault(); if (outro.trim()) void salvar({ id: null, nome: outro.trim() }); }}>
          <Input value={outro} onChange={(e) => setOutro(e.target.value)} placeholder="Outro nome (Enter)" className="h-7 text-xs" />
        </form>
        {atuais.length > 0 && (
          <button type="button" onClick={() => void salvar(null)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted">
            <UserX className="h-3.5 w-3.5" />Remover responsável
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function SeletorProjeto({ atividade, projetos, onMudou, children }: {
  atividade: { id: string; cliente_id: string | null; concluida: boolean; responsavel_nome: string | null };
  projetos: { id: string; nome: string }[];
  onMudou: (mudanca: MudancaAtividade) => void;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);

  const salvar = async (clienteId: string | null) => {
    setAberto(false);
    if (clienteId === atividade.cliente_id) return;
    // Cada projeto tem suas colunas, pastas e pessoas: a tarefa cai na coluna equivalente do projeto novo
    // (a de conclusão se já estava feita), sai da pasta e procura o mesmo responsável lá pelo primeiro nome.
    const colunasQ = supabase.from("colunas_atividade").select("status_key, eh_conclusao, ordem").order("ordem");
    const primeiro = normalizar(parseResponsaveis(atividade.responsavel_nome)[0] ?? "");
    const [{ data: cols }, { data: membros }] = await Promise.all([
      clienteId ? colunasQ.eq("cliente_id", clienteId) : colunasQ.is("cliente_id", null),
      clienteId && primeiro
        ? supabase.from("membros").select("id, nome").eq("cliente_id", clienteId).eq("ativo", true).order("ordem")
        : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    ]);
    const colunas = cols ?? [];
    const status = atividade.concluida
      ? colunas.find((c) => c.eh_conclusao)?.status_key ?? "finalizado"
      : colunas.find((c) => !c.eh_conclusao)?.status_key ?? "backlog";
    const membro = (membros ?? []).find((m) => normalizar(m.nome) === primeiro)
      ?? (membros ?? []).find((m) => normalizar(m.nome).split(" ")[0] === primeiro.split(" ")[0]);
    const mudanca: MudancaAtividade = {
      cliente_id: clienteId, status, pasta_id: null, setor_id: null, proximo_responsavel_id: null, responsavel_id: membro?.id ?? null,
    };
    const { error } = await supabase.from("atividades").update(mudanca).eq("id", atividade.id);
    if (error) { toast.error("Não consegui mudar o projeto"); return; }
    onMudou(mudanca);
    toast.success(`Movida para ${clienteId ? projetos.find((p) => p.id === clienteId)?.nome ?? "o projeto" : "Pessoal"}`);
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild onClick={parar}>
        <button type="button" title="Mudar de projeto" className="flex min-w-0 items-center gap-1 rounded hover:bg-muted">
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="end" onClick={parar}>
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Projeto</p>
        <div className="max-h-64 overflow-y-auto">
          {projetos.map((p) => (
            <Opcao key={p.id} ativo={p.id === atividade.cliente_id} onClick={() => void salvar(p.id)}>{p.nome}</Opcao>
          ))}
          <Opcao ativo={!atividade.cliente_id} onClick={() => void salvar(null)}>Pessoal (sem projeto)</Opcao>
        </div>
      </PopoverContent>
    </Popover>
  );
}
