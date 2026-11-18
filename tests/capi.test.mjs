import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
const js = ts.transpileModule(fs.readFileSync('supabase/functions/_shared/capi.ts', 'utf8'), { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText;
const c = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const h = (t) => crypto.createHash('sha256').update(t).digest('hex');

test('normaliza como a Meta pede: e-mail minúsculo, telefone com 55, nome sem acento', () => {
  assert.equal(c.normEmail('  Davi@Exemplo.COM '), 'davi@exemplo.com');
  assert.equal(c.normEmail('sem-arroba'), '');
  assert.equal(c.normTelefone('(11) 97474-3455'), '5511974743455');
  assert.equal(c.normTelefone('+55 11 97474-3455'), '5511974743455');
  assert.equal(c.normTelefone('123'), '');
  assert.equal(c.normNome('  José  da Conceição '), 'jose da conceicao');
});
test('usuário vai em hash SHA-256 (nunca em texto) e IP/navegador/cookies vão como a Meta manda', async () => {
  const u = await c.usuarioComHash({ nome: 'Davi Souza', email: 'Teste@Example.com', whatsapp: '11974743455', ip: '1.2.3.4', ua: 'UA', fbp: 'fb.1.1.2', externo: 'sess' });
  assert.deepEqual(u.em, [h('teste@example.com')]);
  assert.deepEqual(u.ph, [h('5511974743455')]);
  assert.deepEqual(u.fn, [h('davi')]); assert.deepEqual(u.ln, [h('souza')]);
  assert.equal(u.client_ip_address, '1.2.3.4'); assert.equal(u.fbp, 'fb.1.1.2');
  assert.ok(!JSON.stringify(u).includes('Example')); assert.ok(!JSON.stringify(u).includes('11974743455'));
});
test('evento montado: id para juntar com o navegador, origem e dados', async () => {
  const e = await c.montarEvento({ nome: 'Purchase', id: 'eduzz-1', quando: 1700000000, origem: 'system_generated', usuario: { email: 'a@b.co' }, dados: { value: 97, currency: 'BRL' } });
  assert.equal(e.event_name, 'Purchase'); assert.equal(e.event_id, 'eduzz-1'); assert.equal(e.action_source, 'system_generated');
  assert.equal(e.custom_data.value, 97); assert.equal(e.event_time, 1700000000); assert.equal(e.event_source_url, undefined);
});
test('token por pixel: só devolve se existir para aquele pixel', () => {
  const t = JSON.stringify({ '1747450220135546': 'EAAB' + 'x'.repeat(40) });
  assert.ok(c.tokenDoPixel(t, '1747450220135546'));
  assert.equal(c.tokenDoPixel(t, '999'), null); assert.equal(c.tokenDoPixel(undefined, '1'), null); assert.equal(c.tokenDoPixel('lixo', '1'), null);
});
