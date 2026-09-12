import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { cn } from "@/lib/utils";

export interface SlashMenuItem {
  title: string;
  icon?: React.ReactNode;
}

interface SlashCommandMenuProps {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
}

export interface SlashCommandMenuHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm text-muted-foreground w-64">
          Nenhum resultado
        </div>
      );
    }

    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg py-1 w-64 max-h-80 overflow-y-auto scrollbar-thin">
        {items.map((item, index) => (
          <button
            key={item.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectItem(index)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
              index === selectedIndex ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/50"
            )}
          >
            {item.icon}
            {item.title}
          </button>
        ))}
      </div>
    );
  }
);
SlashCommandMenu.displayName = "SlashCommandMenu";
