import { useState } from "react";
import { useAssistantProjeto } from "@/hooks/useAssistantProjeto";
import { useAssistantDocumentos } from "@/hooks/useAssistantDocumentos";
import { useNotasPastas } from "@/hooks/useNotasPastas";
import { NotasFoldersPane, filtroNotasIguais, type FiltroNotas } from "@/components/notas/NotasFoldersPane";
import { NotasListPane } from "@/components/notas/NotasListPane";
import { NotaEditorPane } from "@/components/notas/NotaEditorPane";

// Página nova (redesenho "imitar o Notes"): sidebar única (projeto + filtros
// + pastas, tudo em NotasFoldersPane) / lista de notas / editor — mesmos
// dados e componentes do Jarvis compacto (useAssistantProjeto,
// useAssistantDocumentos, useNotasPastas, NotasListPane, NotaEditorPane),
// nenhuma lógica duplicada, só um layout maior e mais parecido com o
// Notes nativo do Mac/iPhone. Altura calculada a partir do shell novo:
// topbar (4rem) + padding vertical do <main> (1.5rem + 1.5rem) = 7rem.
export default function Notas() {
  const { projetos, loadingProjetos, projetoId, setProjetoId } = useAssistantProjeto();
  const { notas, notasLixeira, loading, criarNota, atualizarNotaLocal, fixarNota, moverNotaParaPasta, duplicarNota, excluirNota, restaurarNota, excluirNotaPermanente } =
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
    <div className="flex h-[calc(100vh-7rem)] divide-x divide-border overflow-hidden rounded-xl border border-border bg-card">
      {/* Coluna 1: sidebar única — seletor de projeto + filtros + pastas */}
      <div className="w-72 shrink-0 overflow-y-auto">
        {projetos.length === 0 && !loadingProjetos ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum projeto ainda.</p>
        ) : (
          <NotasFoldersPane
            projetos={projetos}
            loadingProjetos={loadingProjetos}
            projetoId={projetoId}
            onSelecionarProjeto={selecionarProjeto}
            notas={notas}
            pastas={pastas}
            filtro={filtro}
            onSelecionarFiltro={selecionarFiltro}
            onCriarPasta={criarPasta}
            onRenomearPasta={renomearPasta}
            onExcluirPasta={excluirPasta}
            contagemLixeira={notasLixeira.length}
          />
        )}
      </div>

      {!projetoId ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Selecione um projeto à esquerda.</p>
        </div>
      ) : (
        <>
          {/* Coluna 2: notas do filtro/pasta selecionado */}
          <div className="w-96 shrink-0 overflow-y-auto p-4">
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
          <div className="flex-1 overflow-hidden bg-background/40 p-8">
            {notaSelecionada ? (
              <NotaEditorPane
                nota={notaSelecionada}
                onFixar={fixarNota}
                onExcluir={excluirNota}
                onDuplicar={duplicarNota}
                onMoverParaPasta={moverNotaParaPasta}
                pastas={pastas}
                onRestaurar={restaurarNota}
                onNotaAtualizada={atualizarNotaLocal}
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
