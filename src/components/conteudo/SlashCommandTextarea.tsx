import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { useNucleoInfluencia } from "@/hooks/useNucleoInfluencia";
import { useTermosVirais } from "@/hooks/useTermosVirais";
import { cn } from "@/lib/utils";

interface SlashCommandTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  clienteId: string;
  value: string;
  onValueChange: (value: string) => void;
}

type CommandType = "mapa" | "termos" | null;

export function SlashCommandTextarea({
  clienteId,
  value,
  onValueChange,
  className,
  ...props
}: SlashCommandTextareaProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [slashPosition, setSlashPosition] = useState<number | null>(null);
  const [commandType, setCommandType] = useState<CommandType>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { categorias: categoriasNucleo, loading: loadingNucleo } = useNucleoInfluencia(clienteId);
  const { categorias: categoriasTermos, loading: loadingTermos } = useTermosVirais(clienteId);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
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

  const handleSelect = (texto: string) => {
    if (slashPosition !== null) {
      const before = value.substring(0, slashPosition);
      const cursorPos = textareaRef.current?.selectionStart || value.length;
      const after = value.substring(cursorPos);
      const newValue = before + texto + after;
      onValueChange(newValue);
    }
    setOpen(false);
    setSlashPosition(null);
    setSearch("");
    setCommandType(null);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (open && e.key === "Escape") {
      setOpen(false);
      setSlashPosition(null);
      setCommandType(null);
    }
  };

  // Fecha ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => {
      if (open) {
        setOpen(false);
        setSlashPosition(null);
        setCommandType(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

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
          ref={textareaRef}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className={cn(className)}
          {...props}
        />
      </PopoverAnchor>
      <PopoverContent 
        className="w-[320px] p-0 z-50 bg-popover border" 
        align="start" 
        side="bottom"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[300px] overflow-y-auto">
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
