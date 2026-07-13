import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { useNucleoInfluencia } from "@/hooks/useNucleoInfluencia";
import { useTermosVirais } from "@/hooks/useTermosVirais";
import { cn } from "@/lib/utils";

interface SelectionRange {
  start: number;
  end: number;
}

interface SlashCommandTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  clienteId: string;
  value: string;
  onValueChange: (value: string) => void;
  onSelectionChange?: (text: string | null, range: SelectionRange | null) => void;
}

export type { SelectionRange };

type CommandType = "mapa" | "termos" | null;
type HistoryEntry = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "P",
  "SECTION",
]);

const normalizePastedText = (text: string) => {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const getNodeText = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }

  if (!(node instanceof HTMLElement)) {
    return Array.from(node.childNodes).map(getNodeText).join("");
  }

  if (node.tagName === "BR") {
    return "\n";
  }

  const childText = Array.from(node.childNodes).map(getNodeText).join("");

  if (node.tagName === "LI") {
    return `- ${childText}`;
  }

  return childText;
};

const htmlToPlainText = (html: string) => {
  if (!html || typeof DOMParser === "undefined") return "";

  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script, style").forEach((node) => node.remove());

  const blockNodes = Array.from(document.body.querySelectorAll(Array.from(BLOCK_TAGS).join(",")))
    .filter((node) => !Array.from(node.children).some((child) => BLOCK_TAGS.has(child.tagName)));

  const textBlocks = (blockNodes.length > 0 ? blockNodes : Array.from(document.body.childNodes))
    .map((node) => normalizePastedText(getNodeText(node)))
    .filter(Boolean);

  return textBlocks.join("\n\n");
};

export function SlashCommandTextarea({
  clienteId,
  value,
  onValueChange,
  onSelectionChange,
  className,
  ...props
}: SlashCommandTextareaProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [slashPosition, setSlashPosition] = useState<number | null>(null);
  const [commandType, setCommandType] = useState<CommandType>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const valueRef = useRef(value);
  const selectionRef = useRef({ start: value.length, end: value.length });
  
  const { categorias: categoriasNucleo, loading: loadingNucleo } = useNucleoInfluencia(clienteId);
  const { categorias: categoriasTermos, loading: loadingTermos } = useTermosVirais(clienteId);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const rememberSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    selectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  };

  const restoreSelection = (entry: HistoryEntry) => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.focus();
      textarea.setSelectionRange(entry.selectionStart, entry.selectionEnd);
      selectionRef.current = {
        start: entry.selectionStart,
        end: entry.selectionEnd,
      };
    });
  };

  const pushUndoEntry = (entry: HistoryEntry) => {
    const stack = undoStackRef.current;
    const lastEntry = stack[stack.length - 1];

    if (lastEntry?.value === entry.value) return;

    stack.push(entry);
    if (stack.length > 100) {
      stack.shift();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    const previousSelection = selectionRef.current;
    
    pushUndoEntry({
      value: valueRef.current,
      selectionStart: previousSelection.start,
      selectionEnd: previousSelection.end,
    });
    redoStackRef.current = [];
    selectionRef.current = {
      start: e.target.selectionStart,
      end: e.target.selectionEnd,
    };
    onValueChange(newValue);

    const textBeforeCursor = newValue.substring(0, cursorPos);
    
    // Procura o último "/" antes do cursor
    const lastSlashIndex = textBeforeCursor.lastIndexOf("/");
    
    if (lastSlashIndex === -1) {
      setOpen(false);
      setSlashPosition(null);
      setCommandType(null);
      return;
    }
    
    // Verifica se é "//" (termos virais) ou "/" (mapa do avatar)
    const isDoubleSlash = lastSlashIndex > 0 && textBeforeCursor[lastSlashIndex - 1] === "/";
    
    if (isDoubleSlash) {
      // Comando de termos virais (//)
      const doubleSlashIndex = lastSlashIndex - 1;
      const textAfterDoubleSlash = newValue.substring(lastSlashIndex + 1, cursorPos);
      
      if (!textAfterDoubleSlash.includes("\n") && textAfterDoubleSlash.length < 30) {
        setSlashPosition(doubleSlashIndex);
        setSearch(textAfterDoubleSlash);
        setCommandType("termos");
        setOpen(true);
        return;
      }
    } else {
      // Verifica se não é o início de um "//" (próximo caractere não é /)
      const textAfterSlash = newValue.substring(lastSlashIndex + 1, cursorPos);
      
      // Só abre se não começar com outra barra (evita abrir no meio de //)
      if (!textAfterSlash.startsWith("/") && !textAfterSlash.includes("\n") && textAfterSlash.length < 30) {
        setSlashPosition(lastSlashIndex);
        setSearch(textAfterSlash);
        setCommandType("mapa");
        setOpen(true);
        return;
      }
    }
    
    setOpen(false);
    setSlashPosition(null);
    setCommandType(null);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    props.onPaste?.(e);
    if (e.defaultPrevented) return;

    const pastedHtml = e.clipboardData.getData("text/html");
    const pastedText = htmlToPlainText(pastedHtml) || e.clipboardData.getData("text/plain");
    if (!pastedText) return;

    const normalizedText = normalizePastedText(pastedText);
    if (!normalizedText) return;

    e.preventDefault();

    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? selectionRef.current.start;
    const selectionEnd = textarea?.selectionEnd ?? selectionRef.current.end;
    const newValue = value.substring(0, selectionStart) + normalizedText + value.substring(selectionEnd);
    const newCursorPosition = selectionStart + normalizedText.length;

    pushUndoEntry({
      value: valueRef.current,
      selectionStart,
      selectionEnd,
    });
    redoStackRef.current = [];
    onValueChange(newValue);
    setOpen(false);
    setSlashPosition(null);
    setCommandType(null);
    selectionRef.current = {
      start: newCursorPosition,
      end: newCursorPosition,
    };

    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(newCursorPosition, newCursorPosition);
    });
  };

  const handleSelect = (texto: string) => {
    if (slashPosition !== null) {
      const before = value.substring(0, slashPosition);
      const cursorPos = textareaRef.current?.selectionStart || value.length;
      const after = value.substring(cursorPos);
      const newValue = before + texto + after;
      pushUndoEntry({
        value: valueRef.current,
        selectionStart: slashPosition,
        selectionEnd: cursorPos,
      });
      redoStackRef.current = [];
      onValueChange(newValue);
      selectionRef.current = {
        start: before.length + texto.length,
        end: before.length + texto.length,
      };
    }
    setOpen(false);
    setSlashPosition(null);
    setSearch("");
    setCommandType(null);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const modifierPressed = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const isUndo = modifierPressed && key === "z" && !e.shiftKey;
    const isRedo = modifierPressed && ((key === "z" && e.shiftKey) || key === "y");

    if (isUndo || isRedo) {
      e.preventDefault();
      setOpen(false);
      setSlashPosition(null);
      setCommandType(null);

      const currentSelection = selectionRef.current;

      if (isUndo) {
        const previousEntry = undoStackRef.current.pop();
        if (!previousEntry) return;

        redoStackRef.current.push({
          value: valueRef.current,
          selectionStart: currentSelection.start,
          selectionEnd: currentSelection.end,
        });
        onValueChange(previousEntry.value);
        valueRef.current = previousEntry.value;
        restoreSelection(previousEntry);
        return;
      }

      const nextEntry = redoStackRef.current.pop();
      if (!nextEntry) return;

      undoStackRef.current.push({
        value: valueRef.current,
        selectionStart: currentSelection.start,
        selectionEnd: currentSelection.end,
      });
      onValueChange(nextEntry.value);
      valueRef.current = nextEntry.value;
      restoreSelection(nextEntry);
      return;
    }

    if (open && e.key === "Escape") {
      setOpen(false);
      setSlashPosition(null);
      setCommandType(null);
    }
  };

  const handleSelectionChange = () => {
    const textarea = textareaRef.current;
    if (!textarea || !onSelectionChange) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      const selectedText = value.substring(start, end);
      onSelectionChange(selectedText, { start, end });
    }
  };

  const handleWheelOnPopover = (e: React.WheelEvent) => {
    const el = listRef.current;
    if (!el) return;

    const canScroll = el.scrollHeight > el.clientHeight;
    if (!canScroll) return;

    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

    if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) return;

    el.scrollTop += e.deltaY;
    e.preventDefault();
  };

  // (Popover já fecha ao clicar fora automaticamente)

  const categorias = commandType === "termos" ? categoriasTermos : categoriasNucleo;
  const loading = commandType === "termos" ? loadingTermos : loadingNucleo;
  const emptyMessage = commandType === "termos" 
    ? "Nenhum termo viral cadastrado" 
    : "Nenhum item no mapa do avatar";
  const placeholder = commandType === "termos" 
    ? "Buscar termo viral..." 
    : "Buscar item...";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Textarea
          {...props}
          ref={textareaRef}
          value={value}
          onChange={handleInputChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onMouseUp={() => {
            rememberSelection();
            handleSelectionChange();
          }}
          onKeyUp={() => {
            rememberSelection();
            handleSelectionChange();
          }}
          onSelect={rememberSelection}
          className={cn(className)}
        />
      </PopoverAnchor>
      <PopoverContent 
        className="w-[320px] p-0 z-50 bg-popover border" 
        align="start" 
        side="bottom"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheel={handleWheelOnPopover}
      >
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList ref={listRef as any} className="max-h-[300px] overflow-y-auto overscroll-contain">
            {loading ? (
              <CommandEmpty>Carregando...</CommandEmpty>
            ) : categorias.length === 0 ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : (
              categorias.map((categoria) => {
                const filteredItems = categoria.items.filter((item: any) => {
                  const text = item.termo || item.texto || "";
                  return text.toLowerCase().includes(search.toLowerCase());
                });
                if (filteredItems.length === 0) return null;
                return (
                  <CommandGroup key={categoria.id} heading={categoria.titulo}>
                    {filteredItems.map((item: any) => {
                      const text = item.termo || item.texto || "";
                      return (
                        <CommandItem
                          key={item.id}
                          value={text}
                          onSelect={() => handleSelect(text)}
                          className="cursor-pointer"
                        >
                          {text}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              })
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
