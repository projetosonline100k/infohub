import { Component, type ReactNode } from "react";
import { isDesktop } from "@/lib/platform";

// 19/10/2026 (Davi: "por que está tudo branco?"): um erro ao desenhar uma tela deixava a janela
// inteira em branco, sem pista nenhuma. Agora aparece o erro com um botão para recarregar, e no app
// do Mac ele fica gravado em ~/.infopro-hub/ditado.log (atlas:erro-tela) para o Claude ler.
export function registrarErroTela(tipo: string, erro: unknown) {
  const e = erro instanceof Error ? erro : new Error(String(erro));
  const detalhe = `${location.pathname}${location.search} · ${e.message}\n${(e.stack ?? "").split("\n").slice(0, 8).join("\n")}`;
  console.error(`[${tipo}]`, e);
  if (!isDesktop()) return;
  void import("@tauri-apps/api/core").then(({ invoke }) => invoke("ditado_registrar", { evento: tipo, detalhe })).catch(() => undefined);
}

export class ErroNaTela extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null };
  static getDerivedStateFromError(erro: Error) { return { erro }; }
  componentDidCatch(erro: Error, info: { componentStack?: string | null }) {
    registrarErroTela("erro-tela", Object.assign(erro, { stack: `${erro.stack ?? ""}\n${info.componentStack ?? ""}` }));
  }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div style={{ padding: 32, fontFamily: "system-ui", maxWidth: 720 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Algo quebrou nesta tela</h2>
        <p style={{ marginTop: 8, color: "#666" }}>O erro ficou registrado para o Claude ver. Tente recarregar; se voltar, avise no chat.</p>
        <pre style={{ marginTop: 12, whiteSpace: "pre-wrap", fontSize: 12, background: "#f4f4f5", padding: 12, borderRadius: 8 }}>{this.state.erro.message}</pre>
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button type="button" onClick={() => location.reload()} style={{ padding: "6px 14px", borderRadius: 8, background: "#111", color: "#fff" }}>Recarregar</button>
          <button type="button" onClick={() => { location.href = "/"; }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #ccc" }}>Ir para o Painel</button>
        </div>
      </div>
    );
  }
}
