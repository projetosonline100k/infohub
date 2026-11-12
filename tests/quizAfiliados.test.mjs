import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/quiz/afiliados.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const AFS = [{ id: '1', codigo: 'maria1', nome: 'Maria', comissao_pct: 30, ativo: true }, { id: '2', codigo: 'joao22', nome: 'João', comissao_pct: 20, ativo: true }];
const lead = (id, email, aff, dia = '2026-11-10T12:00:00Z') => ({ id, email, criada_em: dia, utm: aff ? { utm_content: `aff_${aff}` } : {} });
const venda = (t, email, aff, valor = 100, tipo = 'venda', data = '2026-11-12') => ({ transacao_id: t, tipo, comprador_email: email, valor, data, utm_content: aff ? `aff_${aff}` : null });

test('marca e código: só aff_<código> vale; código do nome sem acento nem símbolo', () => {
  assert.equal(m.codigoDaMarca('aff_Maria1'), 'maria1');
  assert.equal(m.codigoDaMarca('bio'), null);
  assert.equal(m.codigoDaMarca('aff_a'), null);
  assert.equal(m.codigoAfiliado('João da Silva!'), 'joaodasilva');
  assert.equal(m.codigoAfiliado('Zé'), null);
  assert.equal(m.codigoAfiliado('Maria', 'x7'), 'mariax7');
  assert.equal(m.utmDoAfiliado('maria1', 'instalivros').utm_content, 'aff_maria1');
});

test('venda com marca no checkout vai para o afiliado; sem marca segue o e-mail do lead; sem nada, ninguém', () => {
  const r = m.atribuirVendas(AFS, [lead('l1', 'a@x.co', 'joao22')], [venda('t1', 'z@x.co', 'maria1'), venda('t2', 'A@X.co ', null), venda('t3', 'nao@x.co', null)]);
  assert.deepEqual(r.map((a) => [a.codigo, a.via]), [['maria1', 'checkout'], ['joao22', 'lead'], [null, 'nenhuma']]);
});

test('checkout e lead divergentes: vale o checkout e fica sinalizado como conflito (nunca soma nos dois)', () => {
  const r = m.atribuirVendas(AFS, [lead('l1', 'a@x.co', 'joao22')], [venda('t1', 'a@x.co', 'maria1')]);
  assert.equal(r[0].codigo, 'maria1');
  assert.equal(r[0].via, 'conflito');
  assert.equal(r[0].alternativo, 'joao22');
});

test('código que não existe não é creditado a ninguém; mas cai no lead se ele tiver afiliado conhecido', () => {
  const r = m.atribuirVendas(AFS, [lead('l1', 'a@x.co', 'maria1')], [venda('t1', 'z@x.co', 'mariaa1'), venda('t2', 'a@x.co', 'fantasma')]);
  assert.deepEqual(r.map((a) => [a.codigo, a.via]), [[null, 'codigo_desconhecido'], ['maria1', 'lead']]);
});

test('lead criado depois da venda não conta; vale o último lead até o dia da venda', () => {
  const leads = [lead('l1', 'a@x.co', 'joao22', '2026-11-01T10:00:00Z'), lead('l2', 'a@x.co', 'maria1', '2026-11-05T10:00:00Z'), lead('l3', 'a@x.co', 'joao22', '2026-11-20T10:00:00Z')];
  assert.equal(m.atribuirVendas(AFS, leads, [venda('t1', 'a@x.co', null)])[0].codigo, 'maria1');
  // lead mais recente sem marca = veio por outro caminho: não herda o afiliado antigo
  assert.equal(m.atribuirVendas(AFS, [...leads.slice(0, 2), lead('l4', 'a@x.co', null, '2026-11-08T10:00:00Z')], [venda('t1', 'a@x.co', null)])[0].codigo, null);
});

test('reembolso segue o afiliado da venda original e desconta; comissão sobre o líquido', () => {
  const eventos = [{ sessao: 's1', criado_em: '2026-11-10T10:00:00Z', utm: { utm_content: 'aff_maria1' } }, { sessao: 's1', criado_em: '2026-11-10T10:01:00Z', utm: { utm_content: 'aff_maria1' } }, { sessao: 's2', criado_em: '2026-11-10T11:00:00Z', utm: { utm_content: 'aff_maria1' } }, { sessao: 's3', criado_em: '2026-11-10T11:00:00Z', utm: {} }];
  const vendas = [venda('t1', 'a@x.co', 'maria1', 200), venda('t2', 'b@x.co', 'maria1', 100), venda('t1', 'a@x.co', null, 200, 'reembolso')];
  const r = m.resumirAfiliados(AFS, eventos, [lead('l1', 'a@x.co', 'maria1')], vendas);
  const x = r.porAfiliado.get('maria1');
  assert.equal(x.visitas, 2);          // sessões únicas
  assert.equal(x.leads, 1);
  assert.equal(x.vendas, 2);
  assert.equal(x.reembolsos, 1);
  assert.equal(x.liquido, 100);        // 300 - 200
  assert.equal(x.comissao, 30);        // 30% de 100
  assert.equal(r.porAfiliado.get('joao22').vendas, 0);
});

test('saúde do rastreio: separa o que veio do checkout, do lead, sem afiliado e de fora do quiz', () => {
  const vendas = [venda('t1', 'a@x.co', 'maria1'), venda('t2', 'b@x.co', null), venda('t3', 'c@x.co', null), venda('t4', 'd@x.co', 'xx999')];
  const r = m.resumirAfiliados(AFS, [], [lead('l1', 'b@x.co', 'joao22'), lead('l2', 'c@x.co', null)], vendas);
  assert.deepEqual(r.saude, { vendasDoQuiz: 2, viaCheckout: 1, viaLead: 1, conflitos: 0, codigoDesconhecido: 1, semAfiliado: 1, foraDoQuiz: 0, comMarcaNoCheckout: 2, totalVendas: 4 });
});

test('janela de datas: conta só o período, mas o lead de antes do período ainda credita a venda de dentro dele', () => {
  const dia = (d) => Date.parse(`${d}T00:00:00-03:00`);
  const j = { desde: dia('2026-11-10'), ate: dia('2026-11-13') };
  const leads = [lead('l1', 'a@x.co', 'maria1', '2026-10-01T10:00:00Z')];
  const vendas = [venda('t1', 'a@x.co', null, 100, 'venda', '2026-11-11'), venda('t2', 'a@x.co', null, 50, 'venda', '2026-11-01')];
  const eventos = [{ sessao: 's1', criado_em: '2026-11-11T10:00:00Z', utm: { utm_content: 'aff_maria1' } }, { sessao: 's2', criado_em: '2026-11-02T10:00:00Z', utm: { utm_content: 'aff_maria1' } }];
  const r = m.resumirAfiliados(AFS, eventos, leads, vendas, j).porAfiliado.get('maria1');
  assert.equal(r.vendas, 1);
  assert.equal(r.bruto, 100);
  assert.equal(r.visitas, 1);
  assert.equal(r.leads, 0);   // o lead é de outubro: fora do período
  assert.equal(m.vendaNaJanela({ data: '2026-11-13' }, j), false);   // o limite superior não entra
});
