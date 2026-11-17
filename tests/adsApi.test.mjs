import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
let src = fs.readFileSync('src/lib/empresa/adsApi.ts', 'utf8').replace(/import \{ supabase \}[^\n]*\n/, 'const supabase = {};\n');
const js = ts.transpileModule(src, { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText;
const a = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('id do UTM', () => {
  assert.equal(a.idDoUtm('Black%20Friday|120210000000001'), '120210000000001');
  assert.equal(a.idDoUtm('Camp 1|120210000000001'), '120210000000001');
  assert.equal(a.idDoUtm('sem-id'), null); assert.equal(a.idDoUtm(null), null);
});
test('vendas por campanha, com reembolso', () => {
  const v = [{ utm_campaign: 'A|111111111', tipo: 'venda', valor: 100 }, { utm_campaign: 'A|111111111', tipo: 'venda', valor: 50 }, { utm_campaign: 'A|111111111', tipo: 'reembolso', valor: 50 }, { utm_campaign: 'B|222222222', tipo: 'venda', valor: 30 }, { utm_campaign: null, tipo: 'venda', valor: 99 }];
  const m = a.vendasPorId(v, 'campanha');
  assert.deepEqual(m.get('111111111'), { vendas: 1, faturamento: 100 });
  assert.equal(m.get('222222222').faturamento, 30); assert.equal(m.size, 2);
  assert.equal(a.lucro(100, 40), 60); assert.equal(a.roi(100, 40), 150); assert.equal(a.roi(10, 0), null);
});
