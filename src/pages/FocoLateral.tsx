import ModoFoco from "@/pages/ModoFoco";

// Coluna do foco total (27/10, Davi: "eu só quero que ele fique aberto na lateral e o Infopro na lateral"):
// janela própria no canto direito da tela, por cima de tudo, com o próprio Modo Foco (no foco total ele mostra
// só o cronômetro e a atividade); a janela do Infopro fica ao lado, ocupando o resto (src-tauri/src/foco.rs).
export default function FocoLateral() {
  return (
    <div className="h-screen overflow-y-auto bg-background">
      <div data-tauri-drag-region className="sticky top-0 z-10 h-7 bg-background" />
      <div className="px-3 pb-4"><ModoFoco naColuna /></div>
    </div>
  );
}
