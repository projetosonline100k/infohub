import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { useNucleoInfluencia } from "@/hooks/useNucleoInfluencia";
import { useTermosVirais } from "@/hooks/useTermosVirais";
import { cn } from "@/lib/utils";

interface SlashCommandInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  clienteId: string;
  value: string;
  onValueChange: (value: string) => void;
}

type CommandType = "mapa" | "termos" | null;
type HistoryEntry = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

export function SlashCommandInput({
  clienteId,
  value,
  onValueChange,
  className,
  ...props
}: SlashCommandInputProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [slashPosition, setSlashPosition] = useState<number | null>(null);
  const [commandType, setCommandType] = useState<CommandType>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
    const input = inputRef.current;
    if (!input) return;

    selectionRef.current = {
      start: input.selectionStart || 0,
      end: input.selectionEnd || 0,
    };
  };

  const restoreSelection = (entry: HistoryEntry) => {
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;

      input.focus();
      input.setSelectionRange(entry.selectionStart, entry.selectionEnd);
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      start: e.target.selectionStart || 0,
      end: e.target.selectionEnd || 0,
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
      
      if (!textAfterDoubleSlash.includes(" ") || textAfterDoubleSlash === "") {
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
      if (!textAfterSlash.startsWith("/") && (!textAfterSlash.includes(" ") || textAfterSlash === "")) {
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

  const handleSelect = (texto: string) => {
    if (slashPosition !== null) {
      const before = value.substring(0, slashPosition);
      const cursorPos = inputRef.current?.selectionStart || value.length;
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
    inputRef.current?.focus();
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

  const handleWheelOnPopover = (e: React.WheelEvent) => {
    const el = listRef.current;
    if (!el) return;

    const canScroll = el.scrollHeight > el.clientHeight;
    if (!canScroll) return;

    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

    // Se estiver no limite, deixa o scroll natural (ex: diálogo/página)
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
        <Input
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          onSelect={rememberSelection}
          className={cn(className)}
          {...props}
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
