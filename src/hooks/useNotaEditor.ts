import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { toast } from "sonner";
import { ItalicSemAsterisco } from "@/lib/tiptapItalicSemAsterisco";
import { supabase } from "@/integrations/supabase/client";
import { NOTA_PREFIX, conteudoDaNota, type AssistantDocumento } from "@/hooks/useAssistantDocumentos";

const DEBOUNCE_MS = 800;

// Editor rico de nota (item 2) — mesma configuração Tiptap já usada em
// DocumentEditor.tsx/NotasPessoais.tsx (StarterKit, ItalicSemAsterisco,
// Underline, TextAlign, Placeholder, Link, Highlight) + TaskList/TaskItem
// (checklist, já usadas em NotasPessoais.tsx, nada novo pra instalar).
// Compartilhado entre o Jarvis compacto e a página /notas — autosave
// debounced 800ms salva título + `editor.getHTML()`.
//
// `onSalvo` é opcional e existe só pra corrigir um bug: este hook grava
// direto no Supabase por fora de useAssistantDocumentos, então o array
// `notas` que a lista usa nunca sabia que o conteúdo tinha mudado — reabrir
// a nota carregava a versão antiga desse cache e parecia que a edição
// tinha se perdido (não tinha: só o cache local é que ficava desatualizado).
export function useNotaEditor(nota: AssistantDocumento | null, onSalvo?: (id: string, patch: Partial<AssistantDocumento>) => void) {
  const [titulo, setTitulo] = useState(nota?.titulo ?? "");
  const [salvando, setSalvando] = useState(false);
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  const notaIdRef = useRef<string | null>(nota?.id ?? null);
  const tituloRef = useRef(titulo);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const onSalvoRef = useRef(onSalvo);
  onSalvoRef.current = onSalvo;

  const agendarSalvamento = useCallback((novoTitulo: string, novoConteudoHtml: string) => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      const id = notaIdRef.current;
      if (!id) return;
      setSalvando(true);
      const tituloFinal = novoTitulo.trim() || "Nota sem título";
      const conteudoFinal = NOTA_PREFIX + novoConteudoHtml;
      const updatedAt = new Date().toISOString();
      const { error } = await supabase
        .from("documentos")
        .update({ titulo: tituloFinal, conteudo: conteudoFinal, updated_at: updatedAt })
        .eq("id", id);
      setSalvando(false);
      if (!error) {
        setSalvoEm(new Date());
        onSalvoRef.current?.(id, { titulo: tituloFinal, conteudo: conteudoFinal, updated_at: updatedAt });
      } else {
        // Antes falhava em silêncio: "Salvo há..." simplesmente parava de
        // avançar, sem nenhum aviso de que a última edição não foi pro
        // banco — indistinguível de "está tudo bem, só não editei mais nada".
        toast.error("Não foi possível salvar a nota. Verifique a conexão.");
      }
    }, DEBOUNCE_MS);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, italic: false }),
      ItalicSemAsterisco,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Escreva alguma coisa..." }),
      Link.configure({ openOnClick: true }),
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: nota ? conteudoDaNota(nota) : "",
    // Fica sempre com o título mais recente via ref (o closure aqui é fixado
    // na primeira criação do editor — sem o ref, salvaria sempre o título de
    // quando o editor foi montado).
    onUpdate: ({ editor: ed }) => {
      agendarSalvamento(tituloRef.current, ed.getHTML());
    },
  });

  // Troca de nota selecionada — recarrega o conteúdo no MESMO editor (sem
  // desmontar/remontar) e reseta o título/estado de salvamento local.
  useEffect(() => {
    if (!editor) return;
    const novoTitulo = nota?.titulo ?? "";
    setTitulo(novoTitulo);
    tituloRef.current = novoTitulo;
    setSalvoEm(null);
    notaIdRef.current = nota?.id ?? null;
    editor.commands.setContent(nota ? conteudoDaNota(nota) : "", { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, nota?.id]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const onTituloChange = useCallback((valor: string) => {
    setTitulo(valor);
    tituloRef.current = valor;
    agendarSalvamento(valor, editor?.getHTML() ?? "");
  }, [agendarSalvamento, editor]);

  return { editor, titulo, onTituloChange, salvando, salvoEm };
}
