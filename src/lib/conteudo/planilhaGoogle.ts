import { lerCsv, linhasDaPlanilha } from "./planilhaReferencias";
import { salvarLinhas } from "./importarPlanilha";

// Link copiado do Google Sheets (…/spreadsheets/d/ID/edit?gid=GID#gid=GID) →
// endereço de exportação em CSV da aba. A planilha precisa estar com
// "qualquer pessoa com o link pode ver".
export function urlCsvDaPlanilha(link: string): string | null {
  const id = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!id) return null;
  const gid = link.match(/[#?&]gid=(\d+)/)?.[1];
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

// Puxa a planilha e importa só os vídeos novos (mesma regra do upload).
export async function sincronizarPlanilhaGoogle(clienteId: string, link: string) {
  const url = urlCsvDaPlanilha(link);
  if (!url) throw new Error("Link de planilha do Google inválido");
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error("Não consegui abrir a planilha — confira se ela está compartilhada como \"qualquer pessoa com o link\"");
  const texto = await resposta.text();
  if (/^\s*<!doctype html|<html/i.test(texto)) throw new Error("A planilha não está pública — compartilhe como \"qualquer pessoa com o link pode ver\"");
  const { linhas, faltando } = linhasDaPlanilha(lerCsv(texto));
  if (faltando.length) throw new Error(`A planilha precisa das colunas: ${faltando.join(" e ")}`);
  return salvarLinhas(clienteId, linhas);
}
