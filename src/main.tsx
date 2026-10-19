import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ligarDesfazerDoMenu } from "./lib/desktop/desfazer";
import { restaurarRotaInicial } from "./lib/workspace/sessao";
import { ErroNaTela, registrarErroTela } from "./components/ErroNaTela";

void ligarDesfazerDoMenu();

// Reabre na guia em que o Davi estava (só a janela principal do app do Mac).
restaurarRotaInicial();

window.addEventListener("error", (e) => registrarErroTela("erro-js", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => registrarErroTela("erro-promessa", e.reason));

createRoot(document.getElementById("root")!).render(<ErroNaTela><App /></ErroNaTela>);
