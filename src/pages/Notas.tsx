import { useState } from "react";
import { useAssistantProjeto } from "@/hooks/useAssistantProjeto";
import { useAssistantDocumentos } from "@/hooks/useAssistantDocumentos";
import { useNotasPastas } from "@/hooks/useNotasPastas";
import { NotasFoldersPane, filtroNotasIguais, type FiltroNotas } from "@/components/notas/NotasFoldersPane";
import { NotasListPane } from "@/components/notas/NotasListPane";
import { NotaEditorPane } from "@/components/notas/NotaEditorPane";
import { cn } from "@/lib/utils";

// Página nova (item 2, "modo expandido"): 3 colunas — pastas / notas do
// projeto / editor. Mesmos dados e componentes do Jarvis compacto
// (useAssistantProjeto, useAssistantDocumentos, useNotasPastas,
// NotasListPane, NotaEditorPane) — nenhuma lógica duplicada, só um layout
// maior, inspirado na organização do Apple Notes (sem copiar a identidade
// visual).
export default function Notas() {
  const { projetos, loadingProjetos, projetoId, setProjetoId } = useAssistantProjeto();
  const { notas, notasLixeira, loading, criarNota, fixarNota, moverNotaParaPasta, duplicarNota, excluirNota, restaurarNota, excluirNotaPermanente } =
    useAssistantDocumentos(projetoId);
  const { pastas, criarPasta, renomearPasta, excluirPasta } = useNotasPastas(projetoId);

  const [filtro, setFiltro] = useState<FiltroNotas>({ tipo: "todas" });
  const [notaSelecionadaId, setNotaSelecionadaId] = useState<string | null>(null);

  const notaSelecionada =
    notas.find((n) => n.id === notaSelecionadaId) ?? notasLixeira.find((n) => n.id === notaSelecionadaId) ?? null;

  const selecionarProjeto = (id: string) => {
    setProjetoId(id);
    setFiltro({ tipo: "todas" });
    setNotaSelecionadaId(null);
  };

  const selecionarFiltro = (novoFiltro: FiltroNotas) => {
    if (!filtroNotasIguais(novoFiltro, filtro)) setNotaSelecionadaId(null);
    setFiltro(novoFiltro);
  };

  const criar = async () => {
    const pastaId = filtro.tipo === "pasta" ? filtro.pastaId : null;
    const nova = await criarNota("Nota sem título", "", pastaId);
    setNotaSelecionadaId(nova.id);
  };

  return (
    // Layout leve (item 5, rodada 4): um único contorno externo com
    // divisórias verticais finas entre colunas, em vez de 4 cartões
    // separados — mais perto de um app de notas de verdade, menos "3 caixas
    // de documento lado a lado".
    <div className="flex h-[calc(100vh-180px)] divide-x divide-border overflow-hidden rounded-lg border border-border bg-card">
      {/* Coluna esquerda (nível 0): projetos */}
      <div className="w-48 shrink-0 overflow-y-auto p-2">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Projetos</p>
        {loadingProjetos ? (
          <p className="px-2 text-sm text-muted-foreground">Carregando...</p>
        ) : projetos.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">Nenhum projeto ainda.</p>
        ) : (
          <ul className="space-y-0.5">
            {projetos.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => selecionarProjeto(p.id)}
                  className={cn(
                    "w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    p.id === projetoId ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  {p.nome}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!projetoId ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Selecione um projeto à esquerda.</p>
        </div>
      ) : (
        <>
          {/* Coluna 1: pastas/filtros */}
          <div className="w-52 shrink-0 overflow-y-auto p-2">
            <NotasFoldersPane
              pastas={pastas}
              filtro={filtro}
              onSelecionarFiltro={selecionarFiltro}
              onCriarPasta={criarPasta}
              onRenomearPasta={renomearPasta}
              onExcluirPasta={excluirPasta}
              contagemLixeira={notasLixeira.length}
            />
          </div>

          {/* Coluna 2: notas do filtro/pasta selecionado */}
          <div className="w-80 shrink-0 overflow-y-auto p-3">
            <NotasListPane
              notas={notas}
              notasLixeira={notasLixeira}
              pastas={pastas}
              filtro={filtro}
              loading={loading}
              notaSelecionadaId={notaSelecionadaId}
              onSelecionar={setNotaSelecionadaId}
              onCriar={criar}
              onRestaurar={restaurarNota}
              onExcluirPermanente={excluirNotaPermanente}
            />
          </div>

          {/* Coluna 3: editor da nota selecionada */}
          <div className="flex-1 overflow-hidden p-4">
            {notaSelecionada ? (
              <NotaEditorPane
                nota={notaSelecionada}
                onFixar={fixarNota}
                onExcluir={excluirNota}
                onDuplicar={duplicarNota}
                onMoverParaPasta={moverNotaParaPasta}
                pastas={pastas}
                onRestaurar={restaurarNota}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                Selecione uma nota, ou crie uma nova.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
