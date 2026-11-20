import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const src = fs.readFileSync('src/lib/trafego/atribuicao.ts', 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText;
const t = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const est = {
  campanhas: [{ ref: '111111', nome: 'Vendas - Quiz Instalivros V2 - Vídeos animados' }, { ref: '222222', nome: 'Outra' }],
  conjuntos: [{ ref: '311111', nome: 'Aberto BR 1', campanha_ref: '111111' }, { ref: '322222', nome: 'Aberto BR 1', campanha_ref: '222222' }, { ref: '333333', nome: 'Frio', campanha_ref: '111111' }],
  anuncios: [
    { ref: '411111', nome: 'ad-2', conjunto_ref: '311111', campanha_ref: '111111' },
    { ref: '422222', nome: 'ad-3', conjunto_ref: '311111', campanha_ref: '111111' },
    { ref: '433333', nome: 'ad-dup', conjunto_ref: '311111', campanha_ref: '111111' },
    { ref: '444444', nome: 'ad-dup', conjunto_ref: '322222', campanha_ref: '222222' },
    { ref: '455555', nome: 'ad-unico-dup', conjunto_ref: '311111', campanha_ref: '111111' },
    { ref: '466666', nome: 'ad-unico-dup', conjunto_ref: '333333', campanha_ref: '111111' },
  ],
};

test('casa por ID (formato UTMify)', () => {
  const o = t.resolverOrigem({ utm_campaign: 'Camp|111111', utm_medium: 'Conj|311111', utm_content: 'ad-2|411111' }, est);
  assert.deepEqual(o, { estado: 'anuncio', anuncio_ref: '411111', conjunto_ref: '311111', campanha_ref: '111111' });
  assert.equal(t.resolverOrigem({ utm_medium: 'x|333333' }, est).estado, 'conjunto');
  assert.equal(t.resolverOrigem({ utm_campaign: 'x|222222' }, est).campanha_ref, '222222');
});
test('casa por NOME (campanha do Instalivros)', () => {
  const o = t.resolverOrigem({ utm_source: 'instagram', utm_medium: 'anuncio', utm_campaign: 'instalivros', utm_content: 'ad-2', utm_term: 'Aberto BR 1' }, est);
  assert.equal(o.estado, 'anuncio'); assert.equal(o.anuncio_ref, '411111'); assert.equal(o.campanha_ref, '111111');
  assert.equal(t.resolverOrigem({ utm_content: 'AD-3' }, est).anuncio_ref, '422222');
  assert.equal(t.resolverOrigem({ utm_content: 'ad%2D3' }, est).anuncio_ref, '422222');
});
test('nome repetido: conjunto desempata, senão ambíguo', () => {
  assert.equal(t.resolverOrigem({ utm_content: 'ad-dup' }, est).estado, 'ambiguo');
  const d = t.resolverOrigem({ utm_content: 'ad-dup', utm_term: 'Aberto BR 1' }, est);   // conjunto "Aberto BR 1" também repete → continua ambíguo
  assert.equal(d.estado, 'ambiguo');
  const u = t.resolverOrigem({ utm_content: 'ad-unico-dup', utm_term: 'Frio' }, est);
  assert.equal(u.estado, 'anuncio'); assert.equal(u.anuncio_ref, '466666');
});
test('só conjunto por nome; sem origem; não identificada', () => {
  assert.equal(t.resolverOrigem({ utm_term: 'Frio' }, est).conjunto_ref, '333333');
  assert.equal(t.resolverOrigem({ utm_term: 'Aberto BR 1' }, est).estado, 'ambiguo');
  assert.equal(t.resolverOrigem({}, est).estado, 'sem_origem');
  assert.equal(t.resolverOrigem(null, est).estado, 'sem_origem');
  assert.equal(t.resolverOrigem({ utm_content: '{{ad.name}}' }, est).estado, 'sem_origem');   // macro sem trocar
  assert.equal(t.resolverOrigem({ utm_content: 'nao-existe' }, est).estado, 'nao_identificada');
});

const v = (o) => ({ tipo: 'venda', valor: 39.9, data: '2026-11-20', ...o });
test('vendas: soma nos três níveis, ambíguo e sem origem separados, reembolso desconta e herda UTM', () => {
  const vendas = [
    v({ utm_content: 'ad-2', utm_term: 'Aberto BR 1', transacao_id: 'a' }),
    v({ utm_content: 'ad-2|411111', transacao_id: 'b' }),
    v({ tipo: 'reembolso', transacao_id: 'b' }),                // sem UTM: herda a da venda b
    v({ utm_content: 'ad-dup' }),
    v({}),
    v({ utm_content: 'xyz' }),
    v({ utm_content: 'ad-3', data: '2026-11-10' }),             // fora do período
  ];
  const r = t.atribuirVendas(vendas, est, '2026-11-14', '2026-11-20');
  assert.equal(r.porNivel.anuncio.get('411111').vendas, 1);
  assert.ok(Math.abs(r.porNivel.anuncio.get('411111').faturamento - 39.9) < 1e-9);
  assert.equal(r.porNivel.conjunto.get('311111').vendas, 1);
  assert.equal(r.porNivel.campanha.get('111111').vendas, 1);
  assert.equal(r.ambiguo.vendas, 1); assert.equal(r.semOrigem.vendas, 1); assert.equal(r.naoIdentificada.vendas, 1);
  assert.equal(r.porNivel.anuncio.has('422222'), false);
  assert.equal(r.total.vendas, 4);   // a + b - reembolso + ambíguo + sem origem + xyz = 1+1-1+1+1+1
});

test('período', () => {
  assert.deepEqual(t.intervalo('hoje', '2026-11-20'), { de: '2026-11-20', ate: '2026-11-20' });
  assert.deepEqual(t.intervalo('ontem', '2026-11-20'), { de: '2026-11-19', ate: '2026-11-19' });
  assert.deepEqual(t.intervalo('7d', '2026-11-20'), { de: '2026-11-14', ate: '2026-11-20' });
  assert.deepEqual(t.intervalo('30d', '2026-11-20'), { de: '2026-10-22', ate: '2026-11-20' });
  assert.deepEqual(t.intervalo('custom', '2026-11-20', { de: '2026-11-05', ate: '2026-11-01' }), { de: '2026-11-01', ate: '2026-11-05' });
  assert.equal(t.hojeBrasilia(Date.parse('2026-11-20T01:00:00Z')), '2026-11-19');
});

const ev = (sessao, tipo, criado_em, extra = {}) => ({ sessao, tipo, passo: 0, criado_em, ...extra });
test('tabela e funil por anúncio, com custo por etapa e pior queda', () => {
  const u2 = { utm_content: 'ad-2', utm_term: 'Aberto BR 1' }, u3 = { utm_content: 'ad-3', utm_term: 'Aberto BR 1' };
  const eventos = [];
  for (let i = 0; i < 20; i++) {   // ad-2: 20 visitas, 10 começam, 5 terminam, 1 cta
    eventos.push(ev('a' + i, 'visita', '2026-11-20T15:00:00Z', { utm: u2 }));
    if (i < 10) eventos.push(ev('a' + i, 'passo', '2026-11-20T15:01:00Z', { passo: 1 }));
    if (i < 5) eventos.push(ev('a' + i, 'fim', '2026-11-20T15:02:00Z'));
    if (i < 1) eventos.push(ev('a' + i, 'cta', '2026-11-20T15:03:00Z'));
  }
  for (let i = 0; i < 12; i++) { eventos.push(ev('b' + i, 'visita', '2026-11-20T15:00:00Z', { utm: u3 })); eventos.push(ev('b' + i, 'passo', '2026-11-20T15:01:00Z', { passo: 1 })); eventos.push(ev('b' + i, 'fim', '2026-11-20T15:02:00Z')); }
  eventos.push(ev('velha', 'visita', '2026-11-01T15:00:00Z', { utm: u2 }));   // fora do período
  eventos.push(ev('direta', 'visita', '2026-11-20T15:00:00Z', { utm: null }));
  const leads = [{ criada_em: '2026-11-20T16:00:00Z', utm: u2 }, { criada_em: '2026-11-20T16:00:00Z', utm: u2 }, { criada_em: '2026-11-02T16:00:00Z', utm: u2 }];
  const insights = { campanha: [{ ref: '111111', dia: '2026-11-20', gasto: 100, impressoes: 1000, cliques: 50 }], conjunto: [], anuncio: [{ ref: '411111', dia: '2026-11-20', gasto: 60, impressoes: 500, cliques: 20 }, { ref: '422222', dia: '2026-11-20', gasto: 40, impressoes: 400, cliques: 10 }, { ref: '411111', dia: '2026-11-01', gasto: 999, impressoes: 1, cliques: 1 }] };
  const tab = t.montarTabela({ est, insights, vendas: [v({ ...u2 })], eventos, leads, de: '2026-11-14', ate: '2026-11-20' });
  const ad2 = tab.linhas.find((l) => l.chave === 'anuncio:411111');
  assert.equal(ad2.gasto, 60); assert.equal(ad2.funil.visitas, 20); assert.equal(ad2.funil.comecaram, 10); assert.equal(ad2.funil.terminaram, 5);
  assert.equal(ad2.leads, 2); assert.equal(ad2.custoPorLead, 30); assert.equal(ad2.cliquesOferta, 1); assert.equal(ad2.custoPorCliqueOferta, 60);
  assert.equal(ad2.vendas, 1); assert.ok(Math.abs(ad2.lucro - (39.9 - 60)) < 1e-9); assert.ok(Math.abs(ad2.roas - 39.9 / 60) < 1e-9); assert.equal(ad2.custoPorVenda, 60);
  assert.equal(tab.total.gasto, 100);
  assert.equal(tab.extras.find((x) => x.chave === 'sem_origem').funil.visitas, 1);
  const camp = tab.linhas.find((l) => l.chave === 'campanha:111111');
  assert.equal(camp.funil.visitas, 32);
  const et = t.etapasDoFunil(ad2.funil, ad2.gasto);
  assert.equal(et[1].taxa, 0.5); assert.equal(et[0].custo, 3);
  const q = t.anuncioComPiorQueda(tab.linhas, 10);
  assert.equal(q.linha.ref, '422222');   // ad-3: 12 terminaram e nenhum lead = perda de 100%
  assert.equal(q.queda.de, 'Terminaram'); assert.equal(q.queda.para, 'Leads');
  assert.equal(t.piorQueda({ visitas: 5, comecaram: 0, terminaram: 0, leads: 0, cliquesOferta: 0, compraram: 0 }, 10), null);
});

test('ordenação deixa nulos no fim', () => {
  const l = (n, r) => ({ nome: n, roas: r });
  assert.deepEqual(t.ordenar([l('a', null), l('b', 2), l('c', 5)], 'roas', true).map((x) => x.nome), ['c', 'b', 'a']);
  assert.deepEqual(t.ordenar([l('a', null), l('b', 2), l('c', 5)], 'roas', false).map((x) => x.nome), ['b', 'c', 'a']);
});
test('gerador de UTM', () => {
  assert.equal(t.urlComParametros('https://x.com/quiz/a', t.UTM_COM_IDS), 'https://x.com/quiz/a?' + t.UTM_COM_IDS);
  assert.equal(t.urlComParametros('https://x.com/q?ab=0', 'utm_source=FB'), 'https://x.com/q?ab=0&utm_source=FB');
});
