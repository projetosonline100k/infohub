import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const comp = (f) => ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText;
const dataUrl = (js) => 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
const atrib = dataUrl(comp('src/lib/trafego/atribuicao.ts'));
const p = await import(dataUrl(comp('src/lib/trafego/painel.ts').replace('"./atribuicao"', JSON.stringify(atrib))));
const a = await import(atrib);

const AGORA = Date.parse('2026-11-20T20:00:00Z');
let n = 0;
const ev = (o) => ({ transacao_id: `t${++n}`, plataforma: 'eduzz', tipo: 'venda', valor: 100, data: '2026-11-20', recebido_em: '2026-11-20T15:00:00Z', produto_plataforma: 'Plano A', metodo_pagamento: 'pix', comprador_nome: 'Ana', ...o });
const zero = p.custosZero();

test('lucro líquido: taxa, imposto, outros custos por dia e reembolso', () => {
  const dados = [ev({ valor: 100 }), ev({ valor: 300 }), ev({ tipo: 'reembolso', valor: 100, transacao_id: 't1' })];
  const r = p.calcularResumo(p.preparar(dados, AGORA), { taxaPct: 10, impostoPct: 5, outrosDia: 20 }, 50, '2026-11-19', '2026-11-20');
  assert.equal(r.bruto, 400); assert.equal(r.faturamento, 300);
  assert.equal(r.taxas, 40);          // 10% do bruto aprovado
  assert.equal(r.impostos, 15);       // 5% do faturamento depois do reembolso
  assert.equal(r.outros, 40);         // R$ 20 × 2 dias
  assert.equal(r.receitaLiquida, 245);
  assert.equal(r.lucro, 245 - 50 - 40);
  assert.ok(Math.abs(r.margem - 155 / 300) < 1e-9);
  assert.ok(Math.abs(r.roi - 155 / (50 + 40 + 15 + 40)) < 1e-9);
  assert.equal(r.roas, 6); assert.equal(r.cpa, 25); assert.equal(r.ticketMedio, 200);
  assert.equal(r.reembolsosN, 1); assert.equal(r.reembolsosValor, 100); assert.equal(r.pctReembolso, 0.25);
});

test('custos zerados e sem gasto da Meta: nada de NaN, lucro/ROAS viram null', () => {
  const pr = p.preparar([ev({ valor: 200 })], AGORA);
  const sem = p.calcularResumo(pr, zero, null, '2026-11-20', '2026-11-20');
  assert.equal(sem.lucro, null); assert.equal(sem.roas, null); assert.equal(sem.cpa, null); assert.equal(sem.roi, null); assert.equal(sem.margem, null);
  assert.equal(sem.receitaLiquida, 200); assert.equal(sem.taxas, 0);
  const com = p.calcularResumo(pr, zero, 0, '2026-11-20', '2026-11-20');   // Meta ligada, sem gasto
  assert.equal(com.lucro, 200); assert.equal(com.roas, null); assert.equal(com.roi, null);
  const vazio = p.calcularResumo(p.preparar([], AGORA), zero, 10, '2026-11-20', '2026-11-20');
  assert.equal(vazio.ticketMedio, null); assert.equal(vazio.taxaAprovacao, null); assert.equal(vazio.lucro, -10); assert.equal(vazio.margem, null);
  const c = p.custosValidos({ taxaPct: -5, impostoPct: 500, outrosDia: NaN });
  assert.deepEqual(c, { taxaPct: 0, impostoPct: 100, outrosDia: 0 });
});

test('taxa de aprovação: pendente+cancelada da mesma compra vira uma; pendente recente não entra', () => {
  const dados = [
    ev({ transacao_id: 'a' }), ev({ transacao_id: 'b', tipo: 'venda' }),
    ev({ transacao_id: 'c', tipo: 'pendente' }), ev({ transacao_id: 'c', tipo: 'cancelada' }),            // uma cancelada só
    ev({ transacao_id: 'd', tipo: 'pendente', recebido_em: '2026-11-19T10:00:00Z' }),                        // vencida (>24h)
    ev({ transacao_id: 'e', tipo: 'pendente', recebido_em: '2026-11-20T19:00:00Z' }),                        // aguardando
    ev({ transacao_id: 'f', tipo: 'pendente' }), ev({ transacao_id: 'f', tipo: 'venda' }),                   // virou venda
    ev({ transacao_id: 'g', tipo: 'abandono', valor: 0 }),
  ];
  const r = p.calcularResumo(p.preparar(dados, AGORA), zero, null, '2026-11-19', '2026-11-20');
  assert.equal(r.aprovadas, 3); assert.equal(r.canceladas, 1); assert.equal(r.pendentesVencidas, 1); assert.equal(r.pendentes, 1); assert.equal(r.abandonos, 1);
  assert.equal(r.taxaAprovacao, 3 / 5);
});

test('aprovação por método de pagamento', () => {
  const dados = [
    ev({ metodo_pagamento: 'pix' }), ev({ metodo_pagamento: 'pix' }), ev({ metodo_pagamento: 'creditCard', tipo: 'cancelada' }),
    ev({ metodo_pagamento: 'creditCard' }), ev({ metodo_pagamento: 'creditCard', tipo: 'cancelada' }), ev({ metodo_pagamento: null }),
  ];
  const l = p.quebrarPorMetodo(p.preparar(dados, AGORA), '2026-11-20', '2026-11-20');
  const por = Object.fromEntries(l.map((x) => [x.rotulo, x]));
  assert.equal(por['Pix'].taxaAprovacao, 1); assert.equal(por['Pix'].faturamento, 200);
  assert.equal(por['Cartão de crédito'].aprovadas, 1); assert.equal(por['Cartão de crédito'].canceladas, 2); assert.ok(Math.abs(por['Cartão de crédito'].taxaAprovacao - 1 / 3) < 1e-9);
  assert.equal(por['Não informado'].aprovadas, 1);
  assert.equal(l[0].rotulo, 'Pix');   // maior faturamento primeiro (Pix e "não informado" empatam em 200/100: Pix tem mais)
});

test('fuso: 01:30 UTC ainda é 22h do dia anterior em Brasília; dia da semana e hora', () => {
  assert.equal(p.horaBrasilia('2026-11-21T01:30:00Z'), 22);
  assert.equal(p.diaBrasiliaDe('2026-11-21T01:30:00Z'), '2026-11-20');
  assert.equal(p.horaBrasilia('2026-11-20T03:00:00Z'), 0);
  assert.equal(p.diaDaSemana('2026-11-20'), 5);   // sexta
  const dados = [ev({ recebido_em: '2026-11-21T01:30:00Z', data: '2026-11-20' }), ev({ recebido_em: '2026-11-20T15:10:00Z' })];
  const pr = p.preparar(dados, AGORA);
  const h = p.quebrarPorHora(pr, '2026-11-20', '2026-11-20');
  assert.equal(h.length, 24); assert.equal(h[22].aprovadas, 1); assert.equal(h[12].aprovadas, 1); assert.equal(h[1].aprovadas, 0);
  const s = p.quebrarPorDiaSemana(pr, '2026-11-20', '2026-11-20');
  assert.equal(s.length, 7); assert.equal(s[5].rotulo, 'Sexta'); assert.equal(s[5].aprovadas, 2);
});

test('variação contra o período anterior', () => {
  assert.deepEqual(p.periodoAnterior('2026-11-14', '2026-11-20'), { de: '2026-11-07', ate: '2026-11-13' });
  assert.deepEqual(p.periodoAnterior('2026-11-20', '2026-11-20'), { de: '2026-11-19', ate: '2026-11-19' });
  assert.equal(p.variacao(150, 100), 0.5); assert.equal(p.variacao(50, 100), -0.5);
  assert.equal(p.variacao(10, 0), null); assert.equal(p.variacao(null, 5), null); assert.equal(p.variacao(5, null), null);
  const pr = p.preparar([ev({ valor: 100, data: '2026-11-13' }), ev({ valor: 300, data: '2026-11-20' })], AGORA);
  const atual = p.calcularResumo(pr, zero, null, '2026-11-14', '2026-11-20'), ant = p.calcularResumo(pr, zero, null, '2026-11-07', '2026-11-13');
  assert.equal(p.variacao(atual.faturamento, ant.faturamento), 2);
});

test('UTM: nome|id aparece só pelo nome, junta iguais e acha o gasto', () => {
  const est = { campanhas: [{ ref: '111111', nome: 'Camp' }], conjuntos: [], anuncios: [{ ref: '411111', nome: 'ad-2', conjunto_ref: '311111', campanha_ref: '111111' }] };
  const dados = [ev({ utm_content: 'ad-2|411111', utm_campaign: 'Camp|111111', utm_source: 'FB' }), ev({ utm_content: 'AD-2|411111', utm_campaign: 'Camp|111111', utm_source: 'FB' }), ev({ utm_source: '' }), ev({ utm_content: '{{ad.name}}|{{ad.id}}' })];
  const pr = p.preparar(dados, AGORA);
  const gastos = { campanha: new Map([['111111', 60]]), conjunto: new Map(), anuncio: new Map([['411111', 40]]) };
  const c = p.quebrarPorUtm(pr, '2026-11-20', '2026-11-20', 'utm_content', est, gastos);
  const ad = c.find((x) => x.rotulo.toLowerCase() === 'ad-2');
  assert.equal(ad.aprovadas, 2); assert.equal(ad.gasto, 40); assert.equal(ad.roas, 5);
  assert.ok(c.some((x) => x.rotulo === '(sem UTM)')); assert.ok(c.some((x) => x.rotulo.includes('não substituído')));
  const src = p.quebrarPorUtm(pr, '2026-11-20', '2026-11-20', 'utm_source');
  assert.equal(src.find((x) => x.rotulo === 'FB').gasto, null);   // source não tem gasto
});

test('série por dia: gasto × faturamento × lucro, dias sem venda aparecem', () => {
  const pr = p.preparar([ev({ valor: 100, data: '2026-11-19' })], AGORA);
  const s = p.serieDiaria(pr, { taxaPct: 10, impostoPct: 0, outrosDia: 5 }, new Map([['2026-11-19', 30]]), '2026-11-19', '2026-11-20');
  assert.equal(s.length, 2); assert.equal(s[0].lucro, 100 - 10 - 30 - 5); assert.equal(s[1].faturamento, 0); assert.equal(s[1].lucro, -5);
  assert.equal(p.serieDiaria(pr, zero, null, '2026-11-19', '2026-11-19')[0].lucro, null);
});

test('vendas ao vivo: mais novas primeiro, sem telefone/e-mail, origem pelo anúncio ou pelo texto da UTM', () => {
  const est = { campanhas: [], conjuntos: [], anuncios: [{ ref: '411111', nome: 'ad-2', conjunto_ref: '3', campanha_ref: '1' }] };
  const dados = [
    ev({ recebido_em: '2026-11-20T10:00:00Z', utm_content: 'ad-2|411111', comprador_email: 'x@y.com', comprador_telefone: '1199' }),
    ev({ recebido_em: '2026-11-20T18:00:00Z', utm_content: 'criativo-novo' }),
    ev({ recebido_em: '2026-11-20T12:00:00Z', tipo: 'reembolso', valor: 50 }),
    ev({ recebido_em: '2026-11-20T11:00:00Z', tipo: 'abandono', valor: 0, comprador_nome: null }),
  ];
  const l = p.vendasAoVivo(p.preparar(dados, AGORA), est, 3);
  assert.equal(l.length, 3); assert.equal(l[0].origem, 'UTM: criativo-novo'); assert.equal(l[1].status, 'reembolso'); assert.equal(l[1].valor, -50);
  const todas = p.vendasAoVivo(p.preparar(dados, AGORA), est);
  assert.equal(todas.find((x) => x.origem === 'ad-2').comprador, 'Ana');
  assert.ok(!JSON.stringify(todas).includes('x@y.com') && !JSON.stringify(todas).includes('1199'));
  assert.equal(todas.find((x) => x.status === 'abandono').comprador, '—');
});

const linha = (nome, o) => a.completar({ chave: `anuncio:${nome}`, nivel: 'anuncio', ref: nome, nome, gasto: 0, impressoes: 0, cliques: 0, vendas: 0, faturamento: 0, funil: a.funilZero(), ...o });
test('ranking de criativos: ordena, destaca os melhores e quem gasta sem vender', () => {
  const ls = [
    linha('A', { gasto: 100, vendas: 5, faturamento: 500 }), linha('B', { gasto: 100, vendas: 2, faturamento: 150 }), linha('C', { gasto: 300, vendas: 0 }),
    linha('D', { gasto: 50, vendas: 0 }), linha('E', { gasto: 100, vendas: 1, faturamento: 60 }), linha('F', { gasto: 0, vendas: 0 }),
  ];
  const r = p.rankingCriativos(ls, zero, 100, 'roas');
  assert.deepEqual(r.map((x) => x.linha.nome), ['A', 'B', 'E', 'C', 'D']);   // F (sem gasto nem venda) fora; sem ROAS no fim
  assert.equal(r[0].selo, 'melhor'); assert.equal(r[1].selo, 'melhor'); assert.equal(r[2].selo, null);   // E dá prejuízo
  assert.equal(r.find((x) => x.linha.nome === 'C').selo, 'queimando');
  assert.equal(r.find((x) => x.linha.nome === 'D').selo, null);               // 50 < 2 × 100
  assert.equal(p.rankingCriativos(ls, zero, 100, 'custoPorVenda')[0].linha.nome, 'A');
  assert.equal(p.rankingCriativos(ls, zero, 100, 'lucro')[0].linha.nome, 'A');
  assert.equal(p.rankingCriativos(ls, zero, null, 'roas').find((x) => x.linha.nome === 'C').selo, null);   // sem ticket não há regra
  const comTaxa = p.rankingCriativos([linha('G', { gasto: 100, vendas: 1, faturamento: 110 })], { taxaPct: 10, impostoPct: 0, outrosDia: 0 }, 100, 'roas');
  assert.equal(comTaxa[0].lucroLiquido, -1); assert.equal(comTaxa[0].selo, null);
});

test('gasto da Meta: sem dados = null; com dados soma só o período', () => {
  assert.equal(p.somaGasto([], '2026-11-01', '2026-11-30'), null); assert.equal(p.gastoPorDia([], '2026-11-01', '2026-11-30'), null);
  const ins = [{ ref: 'c', dia: '2026-11-19', gasto: 10, impressoes: 0, cliques: 0 }, { ref: 'c', dia: '2026-11-20', gasto: '5', impressoes: 0, cliques: 0 }, { ref: 'c', dia: '2026-10-01', gasto: 99, impressoes: 0, cliques: 0 }];
  assert.equal(p.somaGasto(ins, '2026-11-19', '2026-11-20'), 15); assert.equal(p.gastoPorDia(ins, '2026-11-19', '2026-11-20').get('2026-11-20'), 5);
  assert.equal(p.gastosPorNivel({ campanha: ins, conjunto: [], anuncio: [] }, '2026-11-19', '2026-11-20').campanha.get('c'), 15);
  assert.equal(p.gastosPorNivel({ campanha: [], conjunto: [], anuncio: [] }, '2026-11-19', '2026-11-20'), null);
});
