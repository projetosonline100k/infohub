import { supabase } from "@/integrations/supabase/client";
import { NOTA_PREFIX } from "@/hooks/useAssistantDocumentos";

// Link de um desenho/documento/nota para OUTRO documento/nota/desenho do sistema (09/11/2026, Davi: "linkar um
// desenho ou docs com outra nota/doc; botão direito → linkar; clicar abre numa guia nova").
// O link guarda só o id (`infopro://doc/<id>`): a rota é descoberta ao abrir, então continua valendo se o
// item mudar de pasta ou de projeto.

export const LINK_INTERNO = "infopro://doc/";
export const linkDoDocumento = (id: string) => `${LINK_INTERNO}${id}`;
export const idDoLink = (href: string | null | undefined): string | null => {
  const m = (href ?? "").trim().match(/^infopro:\/\/doc\/([0-9a-f-]{36})\/?$/i);
  return m ? m[1] : null;
};

export interface Destino { rota: string; titulo: string }

/** Rota de um documento, nota ou desenho pelo id (sem baixar o conteúdo, que pode ter vários MB). */
export async function destinoDoDocumento(id: string): Promise<Destino | null> {
  const { data } = await supabase.from("documentos").select("id, titulo, tipo, cliente_id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) return null;
  const titulo = data.titulo || "Sem título";
  const { data: nota } = await supabase.from("documentos").select("id").eq("id", id).like("conteudo", `${NOTA_PREFIX}%`).maybeSingle();
  if (nota) return { rota: `/notas?projeto=${data.cliente_id}&nota=${id}`, titulo };
  if (data.tipo === "mapa" && !data.cliente_id) return { rota: `/desenho/${id}`, titulo };
  if (data.cliente_id) return { rota: `/clientes/${data.cliente_id}?documento=${id}`, titulo };
  return null;
}

/** Abre o documento/nota/desenho linkado numa guia nova (ou, fora das guias, na mesma janela). */
export async function abrirDocumentoLinkado(id: string, abrirNovaGuia?: (rota: string, titulo?: string) => unknown) {
  const { toast } = await import("sonner");
  const d = await destinoDoDocumento(id);
  if (!d) { toast.error("Esse documento não existe mais (ou você não tem acesso)."); return; }
  if (abrirNovaGuia) abrirNovaGuia(d.rota, d.titulo); else window.location.assign(d.rota);
}
