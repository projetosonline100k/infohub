import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/conteudo/quizEstudo.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { separarQuiz } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const html = `<p>Intro</p><h2>Ideias</h2><p>texto</p>
<h2>Teste: verdadeiro ou falso</h2><p>Responda sem olhar.</p><ol><li>Reler ganha de <em>testar</em>.</li><li>Errar ajuda.</li></ol>
<h2>Para ir mais fundo</h2><ul><li><a href="x">link</a></li></ul>
<h2>Gabarito (só depois de responder)</h2><p>.</p><ol><li><strong>Falso.</strong> Foi o contrário.</li><li><strong>Verdadeiro.</strong> Com feedback.</li></ol>`;

test('separa perguntas e gabarito e tira as duas seções do texto', () => {
  const { html: limpo, perguntas } = separarQuiz(html);
  assert.equal(perguntas.length, 2);
  assert.deepEqual(perguntas[0], { pergunta: 'Reler ganha de testar.', resposta: false, porque: 'Foi o contrário.' });
  assert.equal(perguntas[1].resposta, true);
  assert.ok(!/Gabarito|Teste:/.test(limpo));
  assert.ok(/Para ir mais fundo/.test(limpo) && /Ideias/.test(limpo));
});

test('sem gabarito (ou contagem diferente) não mexe no texto', () => {
  const sem = '<h2>Teste</h2><ol><li>a</li></ol>';
  assert.deepEqual(separarQuiz(sem), { html: sem, perguntas: [] });
  const torto = html.replace('<li><strong>Verdadeiro.</strong> Com feedback.</li>', '');
  assert.equal(separarQuiz(torto).perguntas.length, 0);
});
