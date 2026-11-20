// Formatadores e estilos do Hub de Tráfego (mesmo visual escuro do dash do Kdu).
export const brl = (v: number | null, moeda = "BRL") => (v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: moeda }));
export const nf = (v: number | null, c = 0) => (v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: c }));
export const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
export const painel = "rounded-2xl border border-white/10 bg-[#0c1320]";
export const campo = "w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-sky-400/60";
