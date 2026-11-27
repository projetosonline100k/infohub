import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Pop-up de intenção de saída na oferta. Aparece UMA vez: no "voltar" do celular/navegador ou quando o mouse
 * sai pelo topo da janela. Não segura ninguém: o segundo "voltar" sai normalmente. Fechar a aba não dispara nada.
 * `lembrar`: chave da sessão para não repetir depois de recarregar (sem chave, no modo teste, vale só enquanto a tela vive).
 */
export function PopupSaida({ lembrar, children }: { lembrar?: string; children: (fechar: () => void) => ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const jaMostrou = useRef<boolean | null>(null);
  if (jaMostrou.current === null) {
    try { jaMostrou.current = !!lembrar && sessionStorage.getItem(lembrar) === "1"; } catch { jaMostrou.current = false; }
  }
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (jaMostrou.current) return;
    const mostrar = () => {
      jaMostrou.current = true;
      try { if (lembrar) sessionStorage.setItem(lembrar, "1"); } catch { /* sem armazenamento: vale só nesta tela */ }
      setAberto(true);
    };
    // Entrada extra no histórico: o primeiro "voltar" a consome e continua na mesma página.
    if (!window.history.state?.qsSaida) window.history.pushState({ ...window.history.state, qsSaida: true }, "");
    let armado = true;
    const voltou = () => {
      if (!armado || window.history.state?.qsSaida) return;
      armado = false;
      // Já tinha aparecido pelo mouse: este "voltar" é de verdade, segue para a página anterior.
      if (jaMostrou.current) window.history.back(); else mostrar();
    };
    const mouseSaiu = (ev: MouseEvent) => { if (!jaMostrou.current && !ev.relatedTarget && ev.clientY <= 0) mostrar(); };
    window.addEventListener("popstate", voltou);
    document.addEventListener("mouseout", mouseSaiu);
    return () => { window.removeEventListener("popstate", voltou); document.removeEventListener("mouseout", mouseSaiu); };
  }, [lembrar]);

  useEffect(() => {
    if (!aberto) return;
    caixa.current?.focus();
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto]);

  if (!aberto) return null;
  return (
    <div className="qs-saida">
      <div ref={caixa} role="dialog" aria-modal="true" aria-labelledby="qs-saida-titulo" tabIndex={-1} className="qs-saida-caixa motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95">
        {children(() => setAberto(false))}
      </div>
    </div>
  );
}
