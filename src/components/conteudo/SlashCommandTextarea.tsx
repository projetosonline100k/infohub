import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { useNucleoInfluencia } from "@/hooks/useNucleoInfluencia";
import { cn } from "@/lib/utils";

interface SlashCommandTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  clienteId: string;
  value: string;
  onValueChange: (value: string) => void;
}

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { categorias, loading } = useNucleoInfluencia(clienteId);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
    onValueChange(newValue);

    // Detecta "/" digitado - procura a última barra antes do cursor
    const textBeforeCursor = newValue.substring(0, cursorPos);
    const lastSlashIndex = textBeforeCursor.lastIndexOf("/");
    
    if (lastSlashIndex !== -1) {
      const textAfterSlash = newValue.substring(lastSlashIndex + 1, cursorPos);
      // Só abre se não houver quebra de linha ou muitos espaços após a barra
      if (!textAfterSlash.includes("\n") && textAfterSlash.length < 30) {
        setSlashPosition(lastSlashIndex);
        setSearch(textAfterSlash);
        setOpen(true);
        return;
      }
    }
    
    setOpen(false);
    setSlashPosition(null);
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
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (open && e.key === "Escape") {
      setOpen(false);
      setSlashPosition(null);
    }
  };

  // Fecha ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => {
      if (open) {
        setOpen(false);
        setSlashPosition(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

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
        className="w-[320px] p-0 z-50" 
        align="start" 
        side="bottom"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Buscar item..." 
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[300px]">
            {loading ? (
              <CommandEmpty>Carregando...</CommandEmpty>
            ) : categorias.length === 0 ? (
              <CommandEmpty>Nenhum item no núcleo de influência</CommandEmpty>
            ) : (
              categorias.map((categoria) => {
                const filteredItems = categoria.items.filter((item) =>
                  item.texto.toLowerCase().includes(search.toLowerCase())
                );
                if (filteredItems.length === 0) return null;
                return (
                  <CommandGroup key={categoria.id} heading={categoria.titulo}>
                    {filteredItems.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={item.texto}
                        onSelect={() => handleSelect(item.texto)}
                        className="cursor-pointer"
                      >
                        {item.texto}
                      </CommandItem>
                    ))}
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
