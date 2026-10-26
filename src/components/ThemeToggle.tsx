import { useState } from "react";
import { Check, Keyboard, Moon, Palette, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ligarSom, somLigado, tocarTecla } from "@/lib/somDigitacao";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTheme } from "@/hooks/useTheme";
import { DESTAQUES, TEMAS, type Previa } from "@/lib/aparencia/aparencia";
import { cn } from "@/lib/utils";

// Aparência (24/10, Davi): no mesmo botão de sol/lua do topo, agora com Tema (Atual, Papel Vintage, Papel Preto,
// com miniatura) e Cor de destaque. Clicou, aplica na hora e fica salvo (src/lib/aparencia/aparencia.ts).

function Miniatura({ p, textura }: { p: Previa; textura: boolean }) {
  return (
    <div className="relative flex h-16 overflow-hidden rounded-md border" style={{ background: p.fundo, borderColor: p.borda }}>
      <div className="w-4 shrink-0" style={{ background: p.lateral }}>
        <div className="mx-auto mt-2 h-1 w-2 rounded-full" style={{ background: p.destaque }} />
      </div>
      <div className="flex-1 space-y-1 p-1.5">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold leading-none" style={{ color: p.texto }}>Aa</span>
          <span className="h-0.5 w-6 rounded-full" style={{ background: p.texto2 }} />
        </div>
        <div className="h-6 rounded-sm border px-1 pt-1" style={{ background: p.card, borderColor: p.borda }}>
          <span className="block h-0.5 w-8 rounded-full" style={{ background: p.texto2 }} />
          <span className="mt-1 block h-1.5 w-5 rounded-sm" style={{ background: p.destaque }} />
        </div>
      </div>
      {textura && (
        <div className="pointer-events-none absolute inset-0 opacity-30 mix-blend-multiply"
          style={{ backgroundImage: "radial-gradient(rgba(0,0,0,.25) 0.5px, transparent 0.6px)", backgroundSize: "3px 3px" }} />
      )}
    </div>
  );
}

export function ThemeToggle() {
  const { theme, aparencia, setTema, setModo, setDestaque } = useTheme();
  const [som, setSom] = useState(somLigado);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" title="Aparência (tema e cor)">
          {aparencia.tema !== "atual" ? <Palette className="h-5 w-5" /> : theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] space-y-4">
        <div>
          <p className="text-sm font-semibold">Aparência</p>
          <p className="text-xs text-muted-foreground">Aplica na hora e fica salvo neste Mac / navegador.</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Tema</p>
          <div className="grid grid-cols-2 gap-2">
            {TEMAS.map((t) => {
              const p = "fundo" in t.previa ? t.previa : t.previa[aparencia.modo];
              const sel = aparencia.tema === t.id;
              return (
                <button key={t.id} type="button" onClick={() => setTema(t.id)}
                  className={cn("space-y-1 rounded-lg border-2 p-1 text-left transition-colors", sel ? "border-primary" : "border-transparent hover:border-border")}>
                  <Miniatura p={p} textura={t.textura} />
                  <span className="flex items-center gap-1 px-0.5 text-[11.5px] font-medium">{sel && <Check className="h-3 w-3 text-primary" />}{t.nome}</span>
                </button>
              );
            })}
          </div>
          {aparencia.tema === "atual" && (
            <div className="flex rounded-md bg-muted p-0.5 text-xs">
              {(["light", "dark"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setModo(m)}
                  className={cn("flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1", aparencia.modo === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
                  {m === "light" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}{m === "light" ? "Claro" : "Escuro"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Cor de destaque</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setDestaque("padrao")} title="A do tema"
              className={cn("rounded-full border px-2.5 py-1 text-[11px]", aparencia.destaque === "padrao" ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground")}>
              Do tema
            </button>
            {DESTAQUES.map((d) => (
              <button key={d.id} type="button" onClick={() => setDestaque(d.id)} title={d.nome} aria-label={d.nome}
                className={cn("flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-popover", aparencia.destaque === d.id && "ring-2 ring-foreground")}
                style={{ background: d.hex }}>
                {aparencia.destaque === d.id && <Check className="h-3.5 w-3.5 text-white mix-blend-difference" />}
              </button>
            ))}
            <label title="Personalizada"
              className={cn("relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-offset-2 ring-offset-popover",
                aparencia.destaque === "personalizada" && "ring-2 ring-foreground")}
              style={{ background: aparencia.destaque === "personalizada" ? aparencia.personalizada : "conic-gradient(#ef4444, #eab308, #22c55e, #22d3ee, #3b82f6, #8b5cf6, #ef4444)" }}>
              <input type="color" value={aparencia.personalizada} onChange={(e) => setDestaque("personalizada", e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Cor personalizada" />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">Muda o botão principal, o selecionado, links e o foco. O fundo do tema continua.</p>
        </div>

        {/* Som de máquina de escrever ao digitar nos documentos (25/10). */}
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5">
          <Keyboard className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">
            <span className="block text-sm font-medium">Som de máquina de escrever</span>
            <span className="block text-[11px] text-muted-foreground">Ao digitar nos documentos e roteiros</span>
          </span>
          <Switch checked={som} onCheckedChange={(v) => { setSom(v); ligarSom(v); if (v) { tocarTecla("letra"); window.setTimeout(() => tocarTecla("letra"), 110); window.setTimeout(() => tocarTecla("enter"), 260); } }} />
        </label>
      </PopoverContent>
    </Popover>
  );
}
