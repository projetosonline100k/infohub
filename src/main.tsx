import { createRoot } from "react-dom/client";
import "./index.css";
import { ErroNaTela, registrarErroTela } from "./components/ErroNaTela";

const raiz = createRoot(document.getElementById("root")!);

// Aviso do Atlas (janelinha que abre e fecha a cada aviso): só a página dele, sem o app, o login
// nem o cliente do Supabase — várias abrindo juntas disputavam a renovação do login com as outras
// janelas e o Escritório ficava carregando para sempre (20/10).
if (window.location.pathname === "/aviso") {
  void import("./pages/AvisoWindow").then(({ default: AvisoWindow }) => raiz.render(<AvisoWindow />));
} else {
  void Promise.all([import("./App.tsx"), import("./lib/desktop/desfazer"), import("./lib/workspace/sessao")])
    .then(([{ default: App }, { ligarDesfazerDoMenu }, { restaurarRotaInicial }]) => {
      void ligarDesfazerDoMenu();
      // Reabre na guia em que o Davi estava (só a janela principal do app do Mac).
      restaurarRotaInicial();
      window.addEventListener("error", (e) => registrarErroTela("erro-js", e.error ?? e.message));
      window.addEventListener("unhandledrejection", (e) => registrarErroTela("erro-promessa", e.reason));
      raiz.render(<ErroNaTela><App /></ErroNaTela>);
    });
}
