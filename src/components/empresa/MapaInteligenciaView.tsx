import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, FileText, Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CORES_PILAR, MODELO_ROTEIRO, lerMapa, type MapaInteligencia, type PilarMapa } from "@/lib/conteudo/mapaInteligencia";

// Mapa da inteligência de um funcionário (24/10, Davi: "quero a inteligência de cada carinha: cadastrar as
// informações e visualizar em mapa mental"). Centro com o nome; pilares numerados em volta, com os itens
// nas pontas e um exemplo opcional. "Editar" deixa mudar tudo no próprio mapa; salva em membros.mapa_inteligencia.
const db = supabase as unknown as SupabaseClient;

// Tela de 1600 × 900 (encolhe para caber). Onde fica o centro de cada pilar, na ordem (como na referência).
const W = 1600, H = 900;
const CENTRO = { x: 800, y: 440, w: 250, h: 230 };
const LUGARES = [
  { x: 520, y: 130, lado: -1 }, { x: 1080, y: 130, lado: 1 },
  { x: 470, y: 420, lado: -1 }, { x: 1130, y: 420, lado: 1 },
  { x: 800, y: 760, lado: 1 }, { x: 470, y: 720, lado: -1 }, { x: 1130, y: 720, lado: 1 },
];
const PILAR = { w: 300, h: 130 };
const FOLHA = { w: 200, h: 40, passo: 52, distancia: 300 };

function Texto({ valor, editar, onMudar, className, placeholder, multilinha }: {
  valor: string; editar: boolean; onMudar: (v: string) => void; className?: string; placeholder?: string; multilinha?: boolean;
}) {
  if (!editar) return <span className={cn("whitespace-pre-line", className)}>{valor || <span className="opacity-40">{placeholder}</span>}</span>;
  return multilinha ? (
    <textarea value={valor} onChange={(e) => onMudar(e.target.value)} placeholder={placeholder} rows={2}
      className={cn("w-full resize-none rounded bg-white/5 px-1 outline-none ring-1 ring-white/10 focus:ring-white/40", className)} />
  ) : (
    <input value={valor} onChange={(e) => onMudar(e.target.value)} placeholder={placeholder}
      className={cn("w-full rounded bg-white/5 px-1 outline-none ring-1 ring-white/10 focus:ring-white/40", className)} />
  );
}

export function MapaInteligenciaView({ membro, aberto, onFechar, onSalvo }: {
  membro: { id: string; nome: string; funcao?: string | null } | null;
  aberto: boolean;
  onFechar: () => void;
  onSalvo?: (mapa: MapaInteligencia) => void;
}) {
  const [mapa, setMapa] = useState<MapaInteligencia | null>(null);
  const [editar, setEditar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mudou, setMudou] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.6);

  useEffect(() => {
    if (!aberto || !membro) return;
    setMapa(null); setEditar(false); setMudou(false);
    void db.from("membros").select("mapa_inteligencia").eq("id", membro.id).maybeSingle().then(({ data }) => {
      const m = lerMapa((data as { mapa_inteligencia?: unknown } | null)?.mapa_inteligencia);
      setMapa(m ?? { pilares: [] });
      if (!m?.pilares.length) setEditar(true);
    });
  }, [aberto, membro]);

  useLayoutEffect(() => {
    if (!aberto) return;
    const medir = () => { const el = caixa.current; if (el) setEscala(Math.min(el.clientWidth / W, el.clientHeight / H)); };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [aberto, mapa]);

  if (!aberto || !membro) return null;
  const mudar = (f: (m: MapaInteligencia) => MapaInteligencia) => { setMapa((m) => (m ? f(m) : m)); setMudou(true); };
  const mudarPilar = (i: number, patch: Partial<PilarMapa>) => mudar((m) => ({ ...m, pilares: m.pilares.map((p, k) => (k === i ? { ...p, ...patch } : p)) }));
  const salvar = async () => {
    if (!mapa) return;
    setSalvando(true);
    const limpo: MapaInteligencia = {
      titulo: mapa.titulo?.trim() || undefined, subtitulo: mapa.subtitulo?.trim() || undefined,
      pilares: mapa.pilares.map((p) => ({ ...p, titulo: p.titulo.trim(), descricao: p.descricao.trim(), exemplo: p.exemplo?.trim() || undefined, itens: p.itens.map((i) => i.trim()).filter(Boolean) }))
        .filter((p) => p.titulo || p.descricao || p.itens.length),
    };
    const { error } = await db.from("membros").update({ mapa_inteligencia: limpo }).eq("id", membro.id);
    setSalvando(false);
    if (error) { toast.error("Não consegui salvar o mapa"); return; }
    setMapa(limpo); setMudou(false); setEditar(false);
    onSalvo?.(limpo);
    toast.success(`Mapa do ${membro.nome} salvo. Ele já usa nas próximas respostas.`);
  };
  const fechar = () => { if (mudou && !window.confirm("Sair sem salvar as mudanças do mapa?")) return; onFechar(); };

  const pilares = (mapa?.pilares ?? []).slice(0, LUGARES.length);
  const curva = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
  /** Centro → pilar: sai da lateral do centro (ou de baixo, para o pilar de baixo) e chega na borda do pilar. */
  const ligacao = (l: (typeof LUGARES)[number]) => {
    if (l.x === CENTRO.x) {
      const y1 = CENTRO.y + CENTRO.h / 2, y2 = l.y - PILAR.h / 2;
      return `M ${l.x} ${y1} C ${l.x} ${(y1 + y2) / 2}, ${l.x} ${(y1 + y2) / 2}, ${l.x} ${y2}`;
    }
    const esquerda = l.x < CENTRO.x;
    return curva(CENTRO.x + (esquerda ? -1 : 1) * (CENTRO.w / 2), CENTRO.y, l.x + (esquerda ? 1 : -1) * (PILAR.w / 2), l.y);
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#0a0f1a] text-white" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") fechar(); }}>
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <Sparkles className="h-4 w-4 text-sky-300" />
        <p className="text-sm font-semibold">Inteligência do {membro.nome}</p>
        <p className="text-xs text-white/50">o que está aqui vai junto em cada pedido para ele</p>
        <div className="ml-auto flex items-center gap-2">
          {editar && pilares.length < LUGARES.length && (
            <button type="button" onClick={() => mudar((m) => ({ ...m, pilares: [...m.pilares, { titulo: "", descricao: "", itens: [""] }] }))}
              className="flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10"><Plus className="h-3.5 w-3.5" />Pilar</button>
          )}
          {editar && !pilares.length && (
            <button type="button" onClick={() => mudar((m) => ({ ...m, subtitulo: m.subtitulo || MODELO_ROTEIRO.subtitulo, pilares: MODELO_ROTEIRO.pilares.map((p) => ({ ...p, itens: [...p.itens] })) }))}
              className="flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10"><FileText className="h-3.5 w-3.5" />Começar com o modelo do roteiro</button>
          )}
          {editar ? (
            <button type="button" onClick={() => void salvar()} disabled={salvando}
              className="flex items-center gap-1 rounded-md bg-sky-600 px-3 py-1 text-xs font-semibold hover:bg-sky-500 disabled:opacity-50">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Salvar
            </button>
          ) : (
            <button type="button" onClick={() => setEditar(true)} className="flex items-center gap-1 rounded-md border border-white/15 px-3 py-1 text-xs hover:bg-white/10"><Pencil className="h-3.5 w-3.5" />Editar</button>
          )}
          <button type="button" onClick={fechar} title="Fechar (Esc)" className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div ref={caixa} className="relative min-h-0 flex-1 overflow-hidden"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
        {!mapa ? (
          <div className="flex h-full items-center justify-center text-sm text-white/60"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando…</div>
        ) : (
          <div className="absolute left-1/2 top-1/2" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${escala})` }}>
            {/* Linhas: centro → pilar → itens. */}
            <svg className="pointer-events-none absolute inset-0" width={W} height={H}>
              {pilares.map((p, i) => {
                const l = LUGARES[i], cor = p.cor ?? CORES_PILAR[i % CORES_PILAR.length];
                const xFolha = l.x + l.lado * FOLHA.distancia;
                const y0 = l.y - ((p.itens.length - 1) * FOLHA.passo) / 2;
                return (
                  <g key={i} stroke={cor} strokeWidth={3} fill="none" opacity={0.85}>
                    <path d={ligacao(l)} />
                    {p.itens.map((_, k) => (
                      <path key={k} strokeWidth={2} d={curva(l.x + l.lado * (PILAR.w / 2), l.y, xFolha - l.lado * (FOLHA.w / 2), y0 + k * FOLHA.passo)} />
                    ))}
                  </g>
                );
              })}
            </svg>

            {/* Centro. */}
            <div className="absolute flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/15 bg-[#121a2b] p-4 text-center shadow-2xl"
              style={{ left: CENTRO.x - CENTRO.w / 2, top: CENTRO.y - CENTRO.h / 2, width: CENTRO.w, height: CENTRO.h }}>
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-sky-600/30"><FileText className="h-7 w-7 text-sky-200" /></span>
              <Texto valor={mapa.titulo ?? membro.nome} editar={editar} onMudar={(v) => mudar((m) => ({ ...m, titulo: v }))} className="text-center text-2xl font-extrabold" placeholder={membro.nome} />
              <Texto valor={mapa.subtitulo ?? ""} editar={editar} multilinha onMudar={(v) => mudar((m) => ({ ...m, subtitulo: v }))}
                className="text-center text-sm text-white/65" placeholder={membro.funcao ?? "O que ele faz"} />
            </div>

            {pilares.map((p, i) => {
              const l = LUGARES[i], cor = p.cor ?? CORES_PILAR[i % CORES_PILAR.length];
              const xFolha = l.x + l.lado * FOLHA.distancia;
              const y0 = l.y - ((p.itens.length - 1) * FOLHA.passo) / 2;
              return (
                <div key={i}>
                  {/* Pilar. */}
                  <div className="absolute rounded-2xl border-2 bg-[#0f1625] p-3 shadow-xl"
                    style={{ left: l.x - PILAR.w / 2, top: l.y - PILAR.h / 2, width: PILAR.w, minHeight: PILAR.h, borderColor: cor, boxShadow: `0 0 24px ${cor}33` }}>
                    <span className="absolute -left-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold" style={{ background: cor }}>{i + 1}</span>
                    {editar && (
                      <button type="button" onClick={() => mudar((m) => ({ ...m, pilares: m.pilares.filter((_, k) => k !== i) }))} title="Apagar pilar"
                        className="absolute -right-2 -top-2 rounded-full bg-[#0f1625] p-1 text-white/50 ring-1 ring-white/20 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                    <Texto valor={p.titulo} editar={editar} onMudar={(v) => mudarPilar(i, { titulo: v })} className="block text-lg font-bold" placeholder="Título do pilar" />
                    <Texto valor={p.descricao} editar={editar} multilinha onMudar={(v) => mudarPilar(i, { descricao: v })} className="mt-1 block text-[13px] leading-snug text-white/75" placeholder="O que ele precisa fazer aqui" />
                    {editar && (
                      <div className="mt-2 flex items-center gap-1">
                        {CORES_PILAR.map((c) => (
                          <button key={c} type="button" onClick={() => mudarPilar(i, { cor: c })} className={cn("h-4 w-4 rounded-full ring-offset-1 ring-offset-[#0f1625]", cor === c && "ring-2 ring-white")} style={{ background: c }} />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Itens nas pontas. */}
                  {p.itens.map((it, k) => (
                    <div key={k} className="absolute flex items-center gap-1 rounded-lg border-2 bg-[#0f1625] px-3 text-[13px]"
                      style={{ left: xFolha - FOLHA.w / 2, top: y0 + k * FOLHA.passo - FOLHA.h / 2, width: FOLHA.w, height: FOLHA.h, borderColor: `${cor}aa` }}>
                      <Texto valor={it} editar={editar} onMudar={(v) => mudarPilar(i, { itens: p.itens.map((x, j) => (j === k ? v : x)) })} className="flex-1 truncate" placeholder="item" />
                      {editar && <button type="button" onClick={() => mudarPilar(i, { itens: p.itens.filter((_, j) => j !== k) })} className="text-white/40 hover:text-rose-400"><X className="h-3 w-3" /></button>}
                    </div>
                  ))}
                  {editar && (
                    <div className="absolute flex gap-1.5" style={{ left: xFolha - FOLHA.w / 2, top: y0 + p.itens.length * FOLHA.passo - FOLHA.h / 2, width: FOLHA.w }}>
                      <button type="button" onClick={() => mudarPilar(i, { itens: [...p.itens, ""] })}
                        className="flex h-[30px] flex-1 items-center justify-center gap-1 rounded-lg border border-dashed border-white/25 text-xs text-white/60 hover:text-white">
                        <Plus className="h-3 w-3" />item
                      </button>
                      {p.exemplo === undefined && (
                        <button type="button" onClick={() => mudarPilar(i, { exemplo: "" })}
                          className="flex h-[30px] flex-1 items-center justify-center gap-1 rounded-lg border border-dashed border-white/25 text-xs text-white/60 hover:text-white">
                          <Plus className="h-3 w-3" />exemplo
                        </button>
                      )}
                    </div>
                  )}

                  {/* Exemplo (embaixo dos itens). */}
                  {(p.exemplo || (editar && p.exemplo !== undefined)) && (
                    <div className="absolute rounded-xl border border-dashed border-white/25 bg-[#0f1625]/90 p-3 text-[13px]"
                      style={{ left: xFolha - FOLHA.w / 2 - 20, top: y0 + (p.itens.length + (editar ? 0.8 : 0)) * FOLHA.passo - 4, width: FOLHA.w + 60 }}>
                      <p className="mb-1 font-semibold text-white/80">Exemplo:</p>
                      <Texto valor={p.exemplo ?? ""} editar={editar} multilinha onMudar={(v) => mudarPilar(i, { exemplo: v })} className="block text-white/70" placeholder="(opcional)" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
