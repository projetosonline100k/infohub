import { useEffect, useState } from "react";
import { ChevronDown, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { falar, listarVozes, nomeDaVoz, pararFala, useConfigVoz } from "@/lib/desktop/voz";

const FRASE_TESTE = "Davi, a prioridade de hoje ainda não começou. Bora fazer acontecer.";

// Alto-falante no topo do Jarvis: um clique liga/desliga a voz (e confirma
// falando); a setinha ao lado abre as configurações (voz, velocidade, teste).
export function JarvisVozBotao() {
  const [config, salvar] = useConfigVoz();
  const [vozes, setVozes] = useState<string[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => { if (aberto) void listarVozes().then(setVozes); }, [aberto]);

  const opcoes = vozes.includes(config.voz) || !config.voz ? vozes : [config.voz, ...vozes];

  const alternar = () => {
    const ligada = !config.ligada;
    salvar({ ...config, ligada });
    if (ligada) void falar("Voz ligada.", true, { ...config, ligada });
    else void pararFala();
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <div className="flex items-center">
        <button
          type="button"
          onClick={alternar}
          aria-pressed={config.ligada}
          aria-label={config.ligada ? "Desligar a voz do Jarvis" : "Ligar a voz do Jarvis"}
          title={config.ligada ? "Voz ligada (clique para desligar)" : "Voz desligada (clique para ligar)"}
          className={cn(
            "rounded-md p-1 transition-colors hover:bg-accent hover:text-accent-foreground",
            config.ligada ? "bg-accent text-foreground" : "text-muted-foreground",
          )}
        >
          {config.ligada ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Configurar a voz" title="Escolher voz e velocidade" className="rounded-md px-0.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <ChevronDown className="h-3 w-3" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="end" className="w-64 space-y-3 p-3 text-sm">
        <label className="flex items-center justify-between gap-2 font-medium">
          Voz do Jarvis
          <Switch
            checked={config.ligada}
            onCheckedChange={(ligada) => { salvar({ ...config, ligada }); if (!ligada) void pararFala(); }}
          />
        </label>
        <p className="text-[11px] text-muted-foreground">Fala as cobranças e as respostas da Conversa.</p>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Voz</div>
          <select
            value={config.voz}
            onChange={(e) => salvar({ ...config, voz: e.target.value })}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
          >
            {opcoes.length === 0 && <option value={config.voz}>{config.voz ? nomeDaVoz(config.voz) : "Padrão"}</option>}
            {opcoes.map((v) => <option key={v} value={v}>{nomeDaVoz(v)}</option>)}
          </select>
          <p className="text-[10px] text-muted-foreground">Mais vozes (melhores): Ajustes do Sistema → Acessibilidade → Conteúdo Falado → Voz do Sistema → Gerenciar Vozes.</p>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground"><span>Velocidade</span><span>{config.velocidade}</span></div>
          <Slider min={120} max={260} step={5} value={[config.velocidade]} onValueChange={([v]) => salvar({ ...config, velocidade: v })} />
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => void falar(FRASE_TESTE, true, config)}>Testar</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void pararFala()}>Parar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
