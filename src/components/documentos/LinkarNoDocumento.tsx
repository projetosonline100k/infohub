import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { ClipboardPaste, Copy, ExternalLink, Link2, Link2Off, Scissors } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceTabsOpcional } from "@/components/workspace/WorkspaceTabs";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { abrirDocumentoLinkado, idDoLink, linkDoDocumento } from "@/lib/linksInternos";
import { EscolherDocumento } from "./EscolherDocumento";

// Links do documento (09/11/2026, Davi: "botão direito → linkar a outro doc/nota/desenho; clicar abre uma guia
// nova"). Botão direito no texto abre um menu com "Linkar…" (o texto selecionado vira o link; sem seleção entra o
// título do destino). Clicar num link interno abre o destino numa guia nova; os links de sites abrem no navegador
// (no app do Mac o window.open não fazia nada). Clicar com texto selecionado não abre (é seleção, não clique).
export function LinkarNoDocumento({ editor, documentoId }: { editor: Editor; documentoId: string | null }) {
  const guias = useWorkspaceTabsOpcional();
  const [menu, setMenu] = useState<{ x: number; y: number; href: string | null } | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);
  const abrirGuiaRef = useRef(guias?.abrirNovaGuia);
  abrirGuiaRef.current = guias?.abrirNovaGuia;

  useEffect(() => {
    const dom = editor.view.dom as HTMLElement;
    const link = (alvo: EventTarget | null) => (alvo instanceof Element ? alvo.closest("a[href]") : null);
    const aoClicar = (e: MouseEvent) => {
      if (e.button !== 0 || e.defaultPrevented || e.shiftKey || e.altKey) return;
      const a = link(e.target);
      if (!a || window.getSelection()?.toString()) return;
      const href = a.getAttribute("href") ?? "";
      e.preventDefault();
      const id = idDoLink(href);
      if (id) void abrirDocumentoLinkado(id, abrirGuiaRef.current);
      else if (/^(https?:|mailto:)/i.test(href)) void abrirLinkExterno(href);
    };
    const aoMenu = (e: MouseEvent) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, href: link(e.target)?.getAttribute("href") ?? null });
    };
    dom.addEventListener("click", aoClicar);
    dom.addEventListener("contextmenu", aoMenu);
    return () => { dom.removeEventListener("click", aoClicar); dom.removeEventListener("contextmenu", aoMenu); };
  }, [editor]);

  useEffect(() => {
    if (!menu) return;
    const fechar = () => setMenu(null);
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("pointerdown", fechar);
    window.addEventListener("keydown", tecla);
    window.addEventListener("blur", fechar);
    document.addEventListener("scroll", fechar, true);
    return () => { window.removeEventListener("pointerdown", fechar); window.removeEventListener("keydown", tecla); window.removeEventListener("blur", fechar); document.removeEventListener("scroll", fechar, true); };
  }, [menu]);

  const linkar = (d: { id: string; titulo: string }) => {
    const href = linkDoDocumento(d.id);
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent({ type: "text", text: d.titulo, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    toast.success(`Linkado a "${d.titulo}"`);
  };

  const idLinkado = idDoLink(menu?.href);
  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent";
  return (
    <>
      {menu && createPortal(
        <div className="fixed z-[100] min-w-[240px] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
          style={{ left: Math.min(menu.x, window.innerWidth - 260), top: Math.min(menu.y, window.innerHeight - 260) }}
          onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
          <button type="button" className={item} onClick={() => { setMenu(null); setEscolhendo(true); }}>
            <Link2 className="h-4 w-4" />Linkar a documento, nota ou desenho…
          </button>
          {idLinkado && (
            <>
              <button type="button" className={item} onClick={() => { setMenu(null); void abrirDocumentoLinkado(idLinkado, abrirGuiaRef.current); }}>
                <ExternalLink className="h-4 w-4" />Abrir numa guia nova
              </button>
              <button type="button" className={item} onClick={() => { setMenu(null); editor.chain().focus().extendMarkRange("link").unsetLink().run(); }}>
                <Link2Off className="h-4 w-4" />Remover link
              </button>
            </>
          )}
          <div className="my-1 h-px bg-border" />
          <button type="button" className={item} onClick={() => { setMenu(null); editor.view.focus(); document.execCommand("cut"); }}><Scissors className="h-4 w-4" />Recortar</button>
          <button type="button" className={item} onClick={() => { setMenu(null); editor.view.focus(); document.execCommand("copy"); }}><Copy className="h-4 w-4" />Copiar</button>
          <button type="button" className={item} onClick={() => {
            setMenu(null);
            void navigator.clipboard.readText().then((t) => editor.chain().focus().insertContent(t).run()).catch(() => toast("Use ⌘V para colar."));
          }}><ClipboardPaste className="h-4 w-4" />Colar</button>
        </div>,
        document.body,
      )}
      <EscolherDocumento aberto={escolhendo} aoFechar={() => setEscolhendo(false)} aoEscolher={linkar} excluirId={documentoId} />
    </>
  );
}
