import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/quiz/x1.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('modelo: com nome, sem nome e perfil', () => {
  assert.equal(m.preencherModelo('Oi{ nome}! Seu perfil é {perfil}.', { nome: 'ANA souza', perfil: 'O Leitor' }), 'Oi Ana! Seu perfil é O Leitor.');
  assert.equal(m.preencherModelo('Oi{ nome}! Seu perfil é {perfil}.', { nome: null, perfil: 'O Leitor' }), 'Oi! Seu perfil é O Leitor.');
  assert.equal(m.preencherModelo('Que bom ter você com a gente{, nome}!', { nome: 'Bia' }), 'Que bom ter você com a gente, Bia!');
  assert.equal(m.preencherModelo('Que bom ter você com a gente{, nome}!', { nome: '' }), 'Que bom ter você com a gente!');
  assert.equal(m.preencherModelo('{Nome}, separei algo ({perfil}).', { nome: 'carlos', perfil: null }), 'Carlos, separei algo (seu perfil).');
  assert.equal(m.preencherModelo('{Nome}, separei algo.', { nome: null }), 'Oi, separei algo.');
  for (const mod of m.MODELOS_PADRAO) assert.ok(!/\{/.test(m.preencherModelo(mod.texto, { nome: 'Ana', perfil: 'X' })), mod.nome);
});
test('telefone para o wa.me', () => {
  assert.equal(m.telefoneWa('(11) 97474-3455'), '5511974743455');
  assert.equal(m.telefoneWa('11974743455'), '5511974743455');
  assert.equal(m.telefoneWa('+5511932561244'), '5511932561244');
  assert.equal(m.telefoneWa('5519996144561'), '5519996144561');
  assert.equal(m.telefoneWa('1234'), null);
  assert.equal(m.telefoneWa(null), null);
  assert.equal(m.linkWhatsapp('11974743455', 'Oi Ana!'), 'https://wa.me/5511974743455?text=Oi%20Ana!');
  assert.equal(m.linkWhatsapp('x', 'Oi'), null);
});
test('categorias dos leads', () => {
  const AGORA = Date.parse('2026-11-12T12:00:00Z');
  const lead = (id, over) => ({ id, nome: 'N', whatsapp: '11974743455', perfil: 'P', status: 'novo', criada_em: '2026-11-11T10:00:00Z', ...over });
  const horas = (h) => ({ enviada_em: new Date(AGORA - h * 3_600_000).toISOString() });
  assert.equal(m.categoriaDoLead(lead(1), [], AGORA), 'abordar');
  assert.equal(m.categoriaDoLead(lead(2), [horas(2)], AGORA), 'conversa');
  assert.equal(m.categoriaDoLead(lead(3), [horas(30), horas(2)], AGORA), 'conversa');   // vale a última
  assert.equal(m.categoriaDoLead(lead(4), [horas(30)], AGORA), 'retomar');
  assert.equal(m.categoriaDoLead(lead(5, { status: 'convertido' }), [], AGORA), 'convertidos');
  assert.equal(m.categoriaDoLead(lead(6, { whatsapp: null }), [], AGORA), 'sem_whatsapp');
  assert.equal(m.categoriaDoLead(lead(7, { whatsapp: '12' }), [horas(1)], AGORA), 'sem_whatsapp');
  const por = m.agruparPorLead([{ id: 'a', resposta_id: '4', texto: 'x', modelo: null, enviada_em: horas(30).enviada_em }, { id: 'b', resposta_id: '2', texto: 'y', modelo: null, enviada_em: horas(2).enviada_em }]);
  const c = m.contarCategorias([lead('1'), lead('2'), lead('4'), lead('5', { status: 'convertido' })], por, AGORA);
  assert.deepEqual(c, { quentes: 0, abordar: 1, conversa: 1, retomar: 1, convertidos: 1, sem_whatsapp: 0, todos: 4 });
});
test('há quanto tempo', () => {
  const A = Date.parse('2026-11-12T12:00:00Z');
  assert.equal(m.haQuanto('2026-11-12T11:59:40Z', A), 'agora');
  assert.equal(m.haQuanto('2026-11-12T11:30:00Z', A), 'há 30 min');
  assert.equal(m.haQuanto('2026-11-12T09:00:00Z', A), 'há 3 h');
  assert.equal(m.haQuanto('2026-11-10T12:00:00Z', A), 'há 2 dias');
});

test('generalizar a mensagem em modelo', () => {
  assert.equal(m.generalizarModelo('Oi Ana! Seu perfil é O Leitor Sem Tempo.', { nome: 'Ana Souza', perfil: 'O Leitor Sem Tempo' }), 'Oi {nome}! Seu perfil é {perfil}.');
  assert.equal(m.generalizarModelo('Banana é fruta, Ana.', { nome: 'Ana' }), 'Banana é fruta, {nome}.');   // não troca dentro de outra palavra
  assert.equal(m.generalizarModelo('Oi!', { nome: null, perfil: null }), 'Oi!');
  assert.equal(m.preencherModelo(m.generalizarModelo('Oi Ana!', { nome: 'Ana' }), { nome: null }), 'Oi!');
});

test('quentes: clicou no checkout e não comprou; quem comprou vai para convertidos', () => {
  const AGORA = Date.parse('2026-11-12T12:00:00Z');
  const lead = (over) => ({ id: 'x', nome: 'N', whatsapp: '11974743455', perfil: 'P', status: 'novo', criada_em: '2026-11-11T10:00:00Z', ...over });
  const ab = [{ enviada_em: new Date(AGORA - 2 * 3_600_000).toISOString() }];
  assert.equal(m.categoriaDoLead(lead(), ab, AGORA, { clicouCheckout: true, comprou: false }), 'quentes');   // vence "em conversa"
  assert.equal(m.categoriaDoLead(lead(), [], AGORA, { clicouCheckout: true, comprou: false }), 'quentes');
  assert.equal(m.categoriaDoLead(lead(), ab, AGORA, { clicouCheckout: true, comprou: true }), 'convertidos');
  assert.equal(m.categoriaDoLead(lead({ whatsapp: null }), [], AGORA, { clicouCheckout: true, comprou: false }), 'sem_whatsapp');
  assert.equal(m.categoriaDoLead(lead(), [], AGORA, { clicouCheckout: false, comprou: false }), 'abordar');
  const c = m.contarCategorias([lead({ id: 'a' }), lead({ id: 'b' })], new Map(), AGORA, new Map([['a', { clicouCheckout: true, comprou: false }]]));
  assert.equal(c.quentes, 1); assert.equal(c.abordar, 1);
});
