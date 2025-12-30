import { useEffect, useState } from "react";
import { Editor } from "@tiptap/react";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface HeadingItem {
  level: number;
  text: string;
  pos: number;
}

interface DocumentSidebarProps {
  editor: Editor | null;
}

export function DocumentSidebar({ editor }: DocumentSidebarProps) {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);

  useEffect(() => {
    if (!editor) return;

    const updateHeadings = () => {
      const items: HeadingItem[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          items.push({
            level: node.attrs.level,
            text: node.textContent,
            pos,
          });
        }
      });
      setHeadings(items);
    };

    updateHeadings();
    editor.on("update", updateHeadings);
    return () => {
      editor.off("update", updateHeadings);
    };
  }, [editor]);

  const scrollToHeading = (pos: number) => {
    if (!editor) return;
    editor.chain().focus().setTextSelection(pos).run();
    
    // Scroll the editor view to the heading
    const { view } = editor;
    const coords = view.coordsAtPos(pos);
    const editorContainer = document.querySelector(".ProseMirror")?.parentElement;
    if (editorContainer) {
      const containerRect = editorContainer.getBoundingClientRect();
      const scrollTop = coords.top - containerRect.top - 100;
      editorContainer.scrollTo({ top: editorContainer.scrollTop + scrollTop, behavior: "smooth" });
    }
  };

  const addHeading = () => {
    if (!editor) return;
    editor.chain().focus().insertContent("\n").toggleHeading({ level: 2 }).insertContent("Novo título").run();
  };

  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <span className="text-sm font-medium">Guias no documento</span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={addHeading}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {headings.map((heading, i) => (
            <button
              key={i}
              onClick={() => scrollToHeading(heading.pos)}
              className={cn(
                "w-full text-left p-2 rounded hover:bg-muted text-sm flex items-center gap-2 transition-colors",
                heading.level === 1 && "font-semibold",
                heading.level === 2 && "pl-4",
                heading.level === 3 && "pl-6 text-muted-foreground"
              )}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">{heading.text || "Sem título"}</span>
            </button>
          ))}

          {headings.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">
              Os títulos que forem adicionados ao documento aparecerão aqui.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
