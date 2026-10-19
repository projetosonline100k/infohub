import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/whatsapp/painel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { daConversa } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const m = (id, nome, grupo, card = '') => ({ id, nome, grupo, card, disc: 'D', ultima_msg_mentorado: null, interacoes: [], satisfacao: [], upgrade: { nivel: 'alto', sinais: [] } });
const h = { mentorados: [m('mar', 'Marcela Souza', 'Royal Defense | Core Audience', 'c1'), m('bel', 'Bel Coutinho', 'Isabel · Core Audience 2.0')], avaliacoes: [], promessas: [], agenda: [] };
const cards = [
  { id: 'c1', nome: 'Marcela · Royal Defense', when: 'Privado + grupo' },
  { id: 'c2', nome: 'Flavio · Core Audience 2.0', when: 'privado +55 (11) 98765-4321' },
];

test('grupo liga pelo nome do grupo e pelo card do mentorado', () => {
  const r = daConversa({ chat_id: '1203@g.us', chat_nome: 'Royal Defense | Core Audience', eh_grupo: true }, h, cards);
  assert.deepEqual(r.mentorados.map((x) => x.id), ['mar']);
  assert.deepEqual(r.cards.map((x) => x.id), ['c1']);
});

test('pessoa liga pelo primeiro nome e pelo telefone do card', () => {
  assert.deepEqual(daConversa({ chat_id: '5511@c.us', chat_nome: 'Marcela', eh_grupo: false }, h, cards).mentorados.map((x) => x.id), ['mar']);
  assert.deepEqual(daConversa({ chat_id: '5511987654321@c.us', chat_nome: 'Fulano', eh_grupo: false }, h, cards).cards.map((x) => x.id), ['c2']);
});

test('conversa sem nada no painel', () => {
  const r = daConversa({ chat_id: 'x@g.us', chat_nome: 'Família', eh_grupo: true }, h, cards);
  assert.equal(r.mentorados.length + r.cards.length, 0);
});

test('grupo genérico repetido desempata pelo nome da pessoa', () => {
  const h2 = { ...h, mentorados: [m('k', 'Marcelo Kenji', 'Mentoria Premium', 'ck'), m('c', 'Cristiane Boneli', 'Mentoria Premium', 'cc')] };
  const cs = [{ id: 'ck', nome: 'Marcelo Kenji', when: '' }, { id: 'cc', nome: 'Cristiane Boneli', when: '' }];
  const r = daConversa({ chat_id: 'g@g.us', chat_nome: 'Marcelo Kenji x João - Mentoria Premium', eh_grupo: true }, h2, cs);
  assert.deepEqual(r.mentorados.map((x) => x.id), ['k']);
  assert.deepEqual(r.cards.map((x) => x.id), ['ck']);
});
