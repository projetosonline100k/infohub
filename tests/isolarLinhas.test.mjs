import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EditorState, TextSelection } from '@tiptap/pm/state';

const source = readFileSync(new URL('../src/lib/tiptapIsolarLinhas.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { trIsolarLinhasDaSelecao } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const schema = getSchema([StarterKit]);
const t = (text) => ({ type: 'text', text });
const br = { type: 'hardBreak' };

// Seleciona `palavra` dentro do documento e aplica a transação.
function aplicar(content, palavra) {
  const doc = schema.nodeFromJSON({ type: 'doc', content });
  let de = -1;
  doc.descendants((node, pos) => { if (de < 0 && node.isText && node.text.includes(palavra)) de = pos + node.text.indexOf(palavra); });
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, de, de + palavra.length) });
  const tr = trIsolarLinhasDaSelecao(state);
  return tr ? tr.doc.toJSON().content.map((b) => `${b.type}${b.attrs?.level ?? ''}:${(b.content || []).map((n) => n.text ?? '|').join('')}`) : null;
}

test('separa a primeira linha de um título com quebra simples', () => {
  const r = aplicar([{ type: 'heading', attrs: { level: 1 }, content: [t('Compartilhar'), br, t('1: Compartilhe esse vídeo')] }], 'Compartilhar');
  assert.deepEqual(r, ['heading1:Compartilhar', 'heading1:1: Compartilhe esse vídeo']);
});

test('separa uma linha do meio do bloco', () => {
  const r = aplicar([{ type: 'paragraph', content: [t('a'), br, t('meio'), br, t('c')] }], 'meio');
  assert.deepEqual(r, ['paragraph:a', 'paragraph:meio', 'paragraph:c']);
});

test('bloco sem quebras não é alterado', () => {
  assert.equal(aplicar([{ type: 'paragraph', content: [t('uma linha só')] }], 'linha'), null);
});
