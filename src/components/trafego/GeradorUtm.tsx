import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { UTM_COM_IDS, parametrosSemId, urlComParametros } from "@/lib/trafego/atribuicao";
import { campo, painel } from "./formato";

function Copiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => { void navigator.clipboard.writeText(valor).then(() => { setCopiado(true); toast.success("Copiado"); window.setTimeout(() => setCopiado(false), 1500); }); };
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">{rotulo}</p>
      <div className="flex gap-2">
        <input readOnly value={valor} onFocus={(e) => e.currentTarget.select()} className={campo} />
        <button type="button" onClick={copiar} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold hover:bg-sky-400">{copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copiar</button>
      </div>
    </div>
  );
}

/** Gerador de UTM (formato UTMify, com IDs) e da URL final do quiz do projeto. */
export function GeradorUtm({ urlQuiz, nomeCampanha }: { urlQuiz: string | null; nomeCampanha: string }) {
  const [base, setBase] = useState(urlQuiz ?? "");
  const final = useMemo(() => urlComParametros(base, UTM_COM_IDS), [base]);
  return (
    <div className="space-y-4">
      <section className={`${painel} space-y-4 p-4`}>
        <h3 className="text-base font-bold">Anúncio novo: use o formato com IDs</h3>
        <p className="text-sm text-white/65">Com os IDs, cada venda cai exatamente no anúncio, no conjunto e na campanha certos, mesmo que você renomeie algo depois. A Meta troca as chaves <code>{"{{…}}"}</code> pelos valores reais na hora do clique.</p>
        <Copiavel rotulo="Parâmetros de URL (cole no anúncio)" valor={UTM_COM_IDS} />
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Endereço do quiz</p>
          <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://infopro-hub.vercel.app/quiz/…" className={campo} />
          {!urlQuiz && <p className="text-xs text-amber-200/80">Este projeto ainda não tem quiz publicado: cole o endereço da página de destino.</p>}
        </div>
        <Copiavel rotulo="URL final com UTMs" valor={final} />
      </section>
      <section className={`${painel} space-y-2 p-4`}>
        <h3 className="text-base font-bold">Como colar no anúncio da Meta</h3>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-white/75">
          <li>No Gerenciador de Anúncios, abra o anúncio e vá em <b>Configurar anúncio → Destino → URL do site</b>.</li>
          <li>Cole o endereço do quiz (sem UTM) em <b>URL do site</b>.</li>
          <li>Cole a linha de <b>Parâmetros de URL</b> acima no campo <b>Parâmetros de URL</b> (logo abaixo, em “Rastreamento”). Não troque as chaves <code>{"{{…}}"}</code>.</li>
          <li>Use <b>Pré-visualizar</b> do anúncio e confira que o link abre o quiz. Depois de publicar, rode <b>Atualizar</b> aqui e veja a venda cair na linha do anúncio.</li>
        </ol>
      </section>
      <section className={`${painel} space-y-2 p-4`}>
        <h3 className="text-base font-bold">Campanha que já está no ar</h3>
        <p className="text-sm text-white/65">A campanha atual usa o formato por nome e <b>continua funcionando</b>: o Hub lê <code>utm_content</code> como o nome do anúncio e <code>utm_term</code> como o nome do conjunto. Não precisa mexer nela. Só vale lembrar: se dois anúncios tiverem o mesmo nome em campanhas diferentes, a venda aparece como “ambígua” em vez de ser chutada.</p>
        <Copiavel rotulo="Formato por nome (só para consulta)" valor={parametrosSemId(nomeCampanha || "instalivros")} />
      </section>
    </div>
  );
}
