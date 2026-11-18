import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const db = supabase as unknown as SupabaseClient;
interface Seguidor { usuario: string; quando: number }   // quando = segundos (Unix)

/** Lê o followers_*.json da exportação do Instagram ("Central de Contas → Exportar suas informações"), com ou sem a chave de cima. */
export function lerSeguidores(json: unknown): Seguidor[] {
  const lista = Array.isArray(json) ? json : (json as { relationships_followers?: unknown[] })?.relationships_followers ?? [];
  const saida: Seguidor[] = [];
  for (const item of lista as { string_list_data?: { value?: string; href?: string; timestamp?: number }[] }[]) {
    const d = item?.string_list_data?.[0];
    const usuario = (d?.value || d?.href?.split("instagram.com/").pop()?.replace(/\/.*$/, "") || "").trim().toLowerCase().replace(/^@/, "");
    if (usuario && /^[a-z0-9._]{1,30}$/.test(usuario)) saida.push({ usuario, quando: Number(d?.timestamp) || 0 });
  }
  return saida;
}

export function ImportarSeguidores({ aberto, clienteId, etapaId, jaTem, onFechar, onImportou }: {
  aberto: boolean; clienteId: string; etapaId: string | null; jaTem: Set<string>; onFechar: () => void; onImportou: () => void;
}) {
  const [seguidores, setSeguidores] = useState<Seguidor[] | null>(null);
  const [desde, setDesde] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [importando, setImportando] = useState(false);

  const escolher = async (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    try {
      const todos: Seguidor[] = [];
      for (const f of Array.from(arquivos)) todos.push(...lerSeguidores(JSON.parse(await f.text())));
      if (!todos.length) { toast.error("Não achei seguidores nesse arquivo. Use o followers_1.json da exportação (formato JSON)."); return; }
      setSeguidores(todos);
    } catch { toast.error("Não consegui ler o arquivo. Ele precisa ser o .json da exportação."); }
  };

  const { novos, noPeriodo } = useMemo(() => {
    const corte = new Date(`${desde}T00:00:00`).getTime() / 1000;
    const vistos = new Set<string>();
    const periodo = (seguidores ?? []).filter((s) => s.quando >= corte && !vistos.has(s.usuario) && (vistos.add(s.usuario), true));
    return { noPeriodo: periodo.length, novos: periodo.filter((s) => !jaTem.has(s.usuario)).sort((a, b) => a.quando - b.quando) };
  }, [seguidores, desde, jaTem]);

  const importar = async () => {
    if (!novos.length) return;
    setImportando(true);
    try {
      for (let i = 0; i < novos.length; i += 200) {
        const lote = novos.slice(i, i + 200);
        const { data, error } = await db.from("crm_pessoas").insert(lote.map((s) => {
          const em = s.quando ? new Date(s.quando * 1000).toISOString() : new Date().toISOString();
          return { cliente_id: clienteId, instagram: s.usuario, origem: "seguidor", etapa_id: etapaId, criado_em: em, ultima_interacao_em: em };
        })).select("id, instagram, criado_em");
        if (error) throw error;
        await db.from("crm_eventos").insert((data ?? []).map((p: { id: string; criado_em: string }) => ({ pessoa_id: p.id, cliente_id: clienteId, tipo: "entrou", texto: "Começou a te seguir", em: p.criado_em })));
      }
      toast.success(`${novos.length} seguidores novos no CRM`);
      setSeguidores(null);
      onImportou();
    } catch (e) { toast.error(`Não consegui importar: ${(e as { message?: string })?.message ?? "erro"}`); } finally { setImportando(false); }
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) { setSeguidores(null); onFechar(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar seguidores</DialogTitle>
          <DialogDescription>Suba o followers_1.json (e followers_2.json, se houver) da exportação do Instagram. Só entram os que ainda não estão no CRM, em "Novo seguidor".</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input type="file" accept=".json,application/json" multiple onChange={(e) => void escolher(e.target.files)} className="block w-full text-sm" />
          {seguidores && (
            <>
              <div>
                <label className="text-xs text-muted-foreground">Importar só quem começou a seguir a partir de</label>
                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-1" />
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                {seguidores.length.toLocaleString("pt-BR")} no arquivo · {noPeriodo.toLocaleString("pt-BR")} nesse período · <b>{novos.length.toLocaleString("pt-BR")} novos no CRM</b>
              </div>
              <Button className="w-full" onClick={importar} disabled={importando || !novos.length}>
                {importando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}Importar {novos.length}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
