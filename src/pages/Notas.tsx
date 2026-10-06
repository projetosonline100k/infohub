import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
  // Coluna de projeto/pastas recolhível (como a barra lateral do Notes), pra
  // dar mais espaço à nota. Lembra a escolha entre aberturas.
  const [pastasVisiveis, setPastasVisiveis] = useState(() => {
    try { return localStorage.getItem("notas:pastasVisiveis") !== "0"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem("notas:pastasVisiveis", pastasVisiveis ? "1" : "0"); } catch { /* sem storage */ }
  }, [pastasVisiveis]);
  // ⌘⌥S, mesmo atalho do Notes pra mostrar/ocultar a barra lateral.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey && event.altKey && event.code === "KeyS") {
        event.preventDefault();
        setPastasVisiveis((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const botaoPastas = (
    <button type="button" onClick={() => setPastasVisiveis((v) => !v)}
      title={pastasVisiveis ? "Ocultar pastas (⌥⌘S)" : "Mostrar pastas (⌥⌘S)"} aria-label={pastasVisiveis ? "Ocultar pastas" : "Mostrar pastas"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
      {pastasVisiveis ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
    </button>
  );

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
      {pastasVisiveis && <div className="w-64 shrink-0 overflow-y-auto">
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
      </div>}

      {!projetoId ? (
        <div className="flex flex-1 items-center justify-center">
          {pastasVisiveis ? (
            <p className="text-sm text-muted-foreground">Selecione um projeto à esquerda.</p>
          ) : (
            <button type="button" onClick={() => setPastasVisiveis(true)} className="text-sm text-primary hover:underline">Mostrar projetos e pastas</button>
          )}
        </div>
      ) : (
        // Como no Notes: a grade de notas ocupa a área toda; clicar abre a
        // nota no mesmo lugar (com "voltar"), sem uma terceira coluna.
        <div className="min-w-0 flex-1 overflow-hidden">
          {notaSelecionada ? (
            <div className="h-full overflow-hidden bg-background/40 px-8 py-5">
              <NotaEditorPane
                key={notaSelecionada.id}
                nota={notaSelecionada}
                onVoltar={() => setNotaSelecionadaId(null)}
                onFixar={fixarNota}
                onExcluir={(id) => { excluirNota(id); setNotaSelecionadaId(null); }}
                onDuplicar={duplicarNota}
                onMoverParaPasta={moverNotaParaPasta}
                pastas={pastas}
                onRestaurar={restaurarNota}
                onNotaAtualizada={atualizarNotaLocal}
                acaoEsquerda={botaoPastas}
              />
            </div>
          ) : (
            <div className="h-full overflow-y-auto p-5">
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
                acaoEsquerda={botaoPastas}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
