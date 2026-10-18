import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/conteudo/trechos.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { diferencaPalavras, mudou, lerTrechos, alinhar, paragrafos } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('diferença palavra a palavra: troca de "proteína" por "carne"', () => {
  const d = diferencaPalavras('Só que ela é proteína de primeira.', 'Só que ela é carne de primeira.');
  assert.deepEqual(d.filter((p) => p.tipo !== 'igual').map((p) => [p.tipo, p.texto]), [['saiu', 'proteína'], ['entrou', 'carne']]);
  assert.equal(d.filter((p) => p.tipo !== 'saiu').map((p) => p.texto).join(''), 'Só que ela é carne de primeira.');
});

test('mudou ignora espaços; lerTrechos só aceita {texto, nota}', () => {
  assert.ok(!mudou('a  b', 'a b'));
  assert.ok(mudou('a b', 'a c'));
  assert.deepEqual(lerTrechos([{ texto: 'x', nota: 'porque' }, { foo: 1 }, 'y']), [{ texto: 'x', nota: 'porque' }]);
  assert.deepEqual(lerTrechos(null), []);
});

test("alinhar: casa o trecho revisado com o parágrafo de onde veio, em ordem", () => {
  const orig = paragrafos("ROTEIRO\n\nHábitos 10 de 10 para matar a preguiça.\n\nEntão salva esse vídeo, porque você vai voltar nele.\n\nHábito 1: levantar quando o despertador toca.");
  assert.equal(orig.length, 3);
  assert.deepEqual(alinhar(orig, ["Hábitos 10 de 10 para matar a preguiça.", "Salva esse vídeo, porque você vai voltar nele.", "Um parágrafo totalmente novo aqui.", "Hábito 1: levantar quando o despertador tocar."]), [0, 1, null, 2]);
});
