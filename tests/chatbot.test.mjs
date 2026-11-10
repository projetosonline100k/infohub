import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/chatbot/chatbot.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const m = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('fala do bot troca variáveis, escapa HTML e aplica negrito', () => {
  const h = m.falaDoBot('Oi **{primeiro}** <script>{desafio}', { nome: 'Ana Souza', desafio: '<b>x</b>' });
  assert.equal(h, 'Oi <b>Ana</b> &lt;script&gt;&lt;b&gt;x&lt;/b&gt;');
});
test('validações', () => {
  assert.equal(m.validarResposta('email', 'a@b.co'), null);
  assert.ok(m.validarResposta('email', 'a@b'));
  assert.equal(m.validarResposta('whatsapp', '(11) 99999-9999'), null);
  assert.equal(m.validarResposta('whatsapp', '+55 11 99999-9999'), null);
  assert.ok(m.validarResposta('whatsapp', '9999'));
  assert.ok(m.validarResposta('texto', 'Ana', 'nome'));
  assert.equal(m.validarResposta('texto', 'Ana Souza', 'nome'), null);
  assert.equal(m.validarResposta('texto', '@ana.souza', 'instagram'), null);
  assert.ok(m.validarResposta('texto', '', 'x'));
});
test('typo de e-mail e máscara de whatsapp', () => {
  assert.equal(m.sugerirEmail('a@gmail.con'), 'a@gmail.com');
  assert.equal(m.sugerirEmail('a@gmail.com'), null);
  assert.equal(m.formatarWhatsapp('11999998888'), '(11) 99999-8888');
  assert.equal(m.formatarWhatsapp('5511999998888'), '(11) 99999-8888');
});
test('modelo do diagnóstico: pontuação e desfecho como o original', () => {
  const c = m.modeloDiagnostico();
  assert.equal(c.etapas.length, 9);
  // 20 a 50 mil (4) + R$10 a 20 mil (4) = 8 → qualificado; Menos de 1 mil (1) + Até 5 mil (1) = 2 → não
  assert.equal(m.pontuar(c, { seguidores: '20 a 50 mil', faturamento: 'R$10 a 20 mil/mês' }), 8);
  assert.equal(m.desfechoDe(c, 8), 'qualificado');
  assert.equal(m.pontuar(c, { seguidores: 'Menos de 1 mil', faturamento: 'Até R$5 mil/mês' }), 2);
  assert.equal(m.desfechoDe(c, 2), 'nao_qualificado');
  // desafio de conversão soma 1 (5 + 1 = 6 é o mínimo)
  assert.equal(m.pontuar(c, { seguidores: '1 a 5 mil', faturamento: 'R$5 a 10 mil/mês', desafio: 'Não converto em vendas' }), 5);
  assert.equal(m.desfechoDe(c, 6), 'qualificado');
});
test('utm da url', () => {
  assert.deepEqual(m.utmDaUrl('?utm_source=ig&utm_campaign=BIO&fbclid=x'), { utm_source: 'ig', utm_campaign: 'BIO' });
});
