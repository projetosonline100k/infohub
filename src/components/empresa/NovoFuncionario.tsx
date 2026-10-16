import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bot, Loader2, Mic, Square, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { isDesktop } from "@/lib/platform";
import { useGravarAudio } from "@/hooks/useGravarAudio";
import type { SetorResumo } from "@/lib/empresa/visaoGeral";
import { BonecoMesa, CABELOS, CAMISAS, CORES_CABELO, PELES, registrarVisuais, visualDe, type Cabelo, type Visual } from "./BonecoMesa";

// Criar (ou editar) um funcionário pelo app (pedido do Davi, 15/10/2026: "criar o
// personagem, dizer qual vai ser a função, escolher o escritório… independente e
// funcional"). IA marcada como "trabalha sozinha" já entra no fluxo do ouvinte
// (conversa → confirma → ela faz e entrega), com o manual escrito aqui.
const db = supabase as unknown as SupabaseClient;   // autonomo/manual/visual ainda fora dos tipos gerados

const ROTULO_CABELO: Record<Cabelo, string> = { curto: "Curto", cacheado: "Cacheado", longo: "Longo", raspado: "Raspado" };

export interface MembroParaEditar {
  id: string; nome: string; funcao: string | null; eh_ia: boolean; setor_id: string | null;
  autonomo?: boolean; manual?: string | null; visual?: Visual | null;
}

export function NovoFuncionario({ clienteId, setores, aberto, editando, onFechar, onCriado }: {
  clienteId: string; setores: SetorResumo[]; aberto: boolean; editando?: MembroParaEditar | null;
  onFechar: () => void; onCriado: () => void;
}) {
  const [nome, setNome] = useState("");
  const [ia, setIa] = useState(true);
  const [autonomo, setAutonomo] = useState(true);
  const [funcao, setFuncao] = useState("");
  const [manual, setManual] = useState("");
  const [setorId, setSetorId] = useState<string>("");
  const [visual, setVisual] = useState<Visual>(visualDe("novo"));
  const [salvando, setSalvando] = useState(false);

  // Preenche só ao ABRIR (ou ao trocar quem está sendo editado). Antes, a Visão geral
  // recarregava a cada minuto, a lista de escritórios mudava e apagava o que o Davi digitava (15/10).
  const preenchidoPara = useRef<string | null>(null);
  useEffect(() => {
    if (!aberto) { preenchidoPara.current = null; return; }
    const chave = editando?.id ?? "novo";
    if (preenchidoPara.current === chave) return;
    preenchidoPara.current = chave;
    const e = editando;
    setNome(e?.nome ?? ""); setIa(e?.eh_ia ?? true); setAutonomo(e?.autonomo ?? true);
    setFuncao(e?.funcao ?? ""); setManual(e?.manual ?? "");
    setSetorId(e?.setor_id ?? setores[0]?.id ?? "");
    setVisual(e?.visual ?? (e ? visualDe(e.nome) : { pele: PELES[1], cabelo: "curto", corCabelo: CORES_CABELO[0], camisa: CAMISAS[0] }));
  }, [aberto, editando, setores]);

  const audio = useGravarAudio((texto) => setManual((m) => [m.trim(), texto].filter(Boolean).join("\n\n")));
  const mudarVisual = (p: Partial<Visual>) => setVisual((v) => ({ ...v, ...p }));

  const salvar = async () => {
    if (!nome.trim() || !setorId) return;
    setSalvando(true);
    try {
      const setor = setorId;
      const dados = {
        nome: nome.trim(), funcao: funcao.trim() ? `${funcao.trim()}${ia && !/\(IA\)/.test(funcao) ? " (IA)" : ""}` : (ia ? "Funcionário (IA)" : null),
        eh_ia: ia, autonomo: ia && autonomo, manual: manual.trim() || null, visual, setor_id: setor,
      };
      if (editando) {
        const { error } = await db.from("membros").update(dados).eq("id", editando.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("membros").insert({ ...dados, id: crypto.randomUUID(), cliente_id: clienteId, responsabilidades: [], ativo: true, ordem: 50 });
        if (error) throw error;
      }
      registrarVisuais([{ nome: dados.nome, visual }]);
      toast.success(editando ? `${dados.nome} atualizado` : ia && autonomo
        ? `${dados.nome} entrou na equipe e já trabalha sozinho: converse com ele na gaveta Equipe`
        : `${dados.nome} entrou na equipe`);
      onCriado();
      onFechar();
    } catch (e) {
      toast.error(`Não consegui salvar: ${e instanceof Error ? e.message : "erro"}`);
    } finally {
      setSalvando(false);
    }
  };

  const Escolha = ({ ativo, onClick, children, titulo }: { ativo: boolean; onClick: () => void; children: React.ReactNode; titulo?: string }) => (
    <button type="button" title={titulo} onClick={onClick}
      className={cn("rounded-md border px-2 py-1 text-xs transition-colors", ativo ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}>{children}</button>
  );
  const Cor = ({ cor, ativo, onClick }: { cor: string; ativo: boolean; onClick: () => void }) => (
    <button type="button" onClick={onClick} aria-label={cor} className={cn("h-6 w-6 rounded-full border-2", ativo ? "border-primary ring-2 ring-primary/30" : "border-transparent")} style={{ background: cor }} />
  );

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl grid-cols-[minmax(0,1fr)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? `Editar ${editando.nome}` : "Novo funcionário"}</DialogTitle>
          <DialogDescription>Crie o personagem, diga o que ele faz e escolha o escritório dele. Sendo IA que trabalha sozinha, ele já começa a pegar tarefas.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
          {/* Prévia do boneco */}
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border bg-[#e7cfa6]">
              <BonecoMesa nome={nome || "Novo"} ehIa={false} sinal="trabalhando" visual={visual} className="h-40 w-full" />
            </div>
            <div className="space-y-2 text-xs">
              <p className="font-medium">Pele</p>
              <div className="flex flex-wrap gap-1.5">{PELES.map((c) => <Cor key={c} cor={c} ativo={visual.pele === c} onClick={() => mudarVisual({ pele: c })} />)}</div>
              <p className="font-medium">Cabelo</p>
              <div className="flex flex-wrap gap-1">{CABELOS.map((c) => <Escolha key={c} ativo={visual.cabelo === c} onClick={() => mudarVisual({ cabelo: c })}>{ROTULO_CABELO[c]}</Escolha>)}</div>
              <div className="flex flex-wrap gap-1.5">{CORES_CABELO.map((c) => <Cor key={c} cor={c} ativo={visual.corCabelo === c} onClick={() => mudarVisual({ corCabelo: c })} />)}</div>
              <div className="flex gap-1">
                <Escolha ativo={!!visual.barba} onClick={() => mudarVisual({ barba: !visual.barba })}>Barba</Escolha>
                <Escolha ativo={!!visual.oculos} onClick={() => mudarVisual({ oculos: !visual.oculos })}>Óculos</Escolha>
              </div>
              <p className="font-medium">Camisa</p>
              <div className="flex flex-wrap gap-1.5">{CAMISAS.map((c) => <Cor key={c} cor={c} ativo={visual.camisa === c} onClick={() => mudarVisual({ camisa: c })} />)}</div>
            </div>
          </div>

          {/* Quem é e o que faz */}
          <div className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Nome</span>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Lia" />
            </label>
            <div className="flex flex-wrap gap-1.5">
              <Escolha ativo={ia} onClick={() => setIa(true)}><span className="flex items-center gap-1"><Bot className="h-3.5 w-3.5" />IA</span></Escolha>
              <Escolha ativo={!ia} onClick={() => setIa(false)}><span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />Pessoa</span></Escolha>
              {ia && (
                <Escolha ativo={autonomo} onClick={() => setAutonomo(!autonomo)} titulo="Pega sozinha as tarefas que você confirmar na conversa e entrega pra você aprovar">
                  {autonomo ? "✓ Trabalha sozinha" : "Só conversa (não executa)"}
                </Escolha>
              )}
            </div>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Função</span>
              <Input value={funcao} onChange={(e) => setFuncao(e.target.value)} placeholder="Ex.: SDR, Copywriter, Gestor de tráfego" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="flex items-center justify-between font-medium">
                O que faz e como (o manual dele)
                {isDesktop() && (
                  <Button type="button" size="sm" variant={audio.gravando ? "destructive" : "outline"} className="h-7 gap-1 px-2 text-[11px]"
                    disabled={audio.transcrevendo} onClick={() => void audio.alternar()}>
                    {audio.transcrevendo ? <Loader2 className="h-3 w-3 animate-spin" /> : audio.gravando ? <><Square className="h-3 w-3 fill-current" />{audio.segundos}s</> : <><Mic className="h-3 w-3" />Falar</>}
                  </Button>
                )}
              </span>
              <Textarea value={manual} onChange={(e) => setManual(e.target.value)} rows={7} className="text-sm"
                placeholder={"Responsabilidades, como entrega, tom de voz, o que nunca fazer, exemplos do que é bom…\nEle lê isso antes de cada conversa e de cada tarefa."} />
            </label>
            <div className="space-y-1.5 text-sm">
              <span className="font-medium">Escritório (setor)</span>
              <div className="flex flex-wrap gap-1.5">
                {setores.map((s) => <Escolha key={s.id} ativo={setorId === s.id} onClick={() => setSetorId(s.id)}>{s.nome}</Escolha>)}
              </div>
              {setores.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Crie um escritório primeiro (botão "+ Escritório" no Mapa da operação).</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onFechar}>Cancelar</Button>
              <Button onClick={() => void salvar()} disabled={salvando || !nome.trim() || !setorId}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editando ? "Salvar" : "Criar funcionário"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
