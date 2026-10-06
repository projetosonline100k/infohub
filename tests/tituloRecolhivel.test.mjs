import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import ts from 'typescript';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

// O módulo importa pacotes do Tiptap, então é transpilado pra um arquivo
// temporário dentro de tests/ (pra resolver node_modules) e apagado no fim.
const source = readFileSync(new URL('../src/lib/tiptapTituloRecolhivel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const temp = new URL('./.gerado-tituloRecolhivel.mjs', import.meta.url);
writeFileSync(temp, outputText);
const { TituloRecolhivel, intervalosOcultos } = await import(temp.href);
rmSync(temp);

const schema = getSchema([StarterKit, TituloRecolhivel]);
const h = (level, text, collapsed = false) => ({ type: 'heading', attrs: { level, collapsed }, content: [{ type: 'text', text }] });
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...content) => schema.nodeFromJSON({ type: 'doc', content });
const textosOcultos = (d) => intervalosOcultos(d).map(({ de }) => d.nodeAt(de).textContent);

test('título aberto não esconde nada', () => {
  assert.deepEqual(textosOcultos(doc(h(1, 'A'), p('a1'), p('a2'))), []);
});

test('título recolhido esconde até o próximo título de mesmo nível', () => {
  assert.deepEqual(textosOcultos(doc(h(2, 'A', true), p('a1'), p('a2'), h(2, 'B'), p('b1'))), ['a1', 'a2']);
});

test('título maior recolhido esconde os subtítulos e o conteúdo deles', () => {
  assert.deepEqual(textosOcultos(doc(h(1, 'A', true), p('a1'), h(2, 'A.1'), p('x'), h(1, 'B'), p('b1'))), ['a1', 'A.1', 'x']);
});

test('subtítulo recolhido não esconde o título seguinte de nível maior', () => {
  assert.deepEqual(textosOcultos(doc(h(1, 'A'), h(2, 'A.1', true), p('x'), h(1, 'B'), p('b1'))), ['x']);
});

test('estado recolhido é salvo no HTML (data-collapsed)', () => {
  const heading = schema.nodes.heading;
  assert.deepEqual(heading.spec.toDOM(heading.create({ level: 2, collapsed: true })), ['h2', { 'data-collapsed': 'true' }, 0]);
});

// Estado real com o plugin (inclui o appendTransaction que reabria o título).
const { pluginTituloRecolhivel, trAlternarTitulo, trEnterTituloRecolhido, trBackspaceAposRecolhido } = await (async () => {
  writeFileSync(temp, outputText);
  try { return await import(`${temp.href}?2`); } finally { rmSync(temp); }
})();
const { EditorState, TextSelection } = await import('@tiptap/pm/state');

function estadoCom(d, cursorNoTexto) {
  let pos = 1;
  d.descendants((node, p) => { if (node.isText && node.text === cursorNoTexto) pos = p + 1; });
  return EditorState.create({ doc: d, selection: TextSelection.create(d, pos), plugins: [pluginTituloRecolhivel()] });
}

test('fechar com o cursor dentro do conteúdo do título funciona (não reabre)', () => {
  const state = estadoCom(doc(h(2, 'A'), p('a1'), p('a2')), 'a2');
  const { state: depois } = state.applyTransaction(trAlternarTitulo(state, 0));
  assert.equal(depois.doc.child(0).attrs.collapsed, true);
  assert.deepEqual(textosOcultos(depois.doc), ['a1', 'a2']);
  assert.equal(depois.selection.$from.parent.type.name, 'heading');
});

test('abrir de novo volta a mostrar o conteúdo', () => {
  const state = estadoCom(doc(h(2, 'A', true), p('a1')), 'A');
  const { state: depois } = state.applyTransaction(trAlternarTitulo(state, 0));
  assert.equal(depois.doc.child(0).attrs.collapsed, false);
  assert.deepEqual(textosOcultos(depois.doc), []);
});

test('cursor indo pra conteúdo escondido NÃO abre o título (pula por cima)', () => {
  const state = estadoCom(doc(h(2, 'A', true), p('a1'), h(2, 'B')), 'A');
  let posA1 = 0;
  state.doc.descendants((node, p) => { if (node.isText && node.text === 'a1') posA1 = p + 1; });
  const { state: depois } = state.applyTransaction(state.tr.setSelection(TextSelection.create(state.doc, posA1)));
  assert.equal(depois.doc.child(0).attrs.collapsed, true);
  assert.equal(depois.selection.$from.parent.textContent, 'B');
});

test('Enter no fim do título recolhido cria título novo depois da seção e mantém fechado', () => {
  const d = doc(h(2, 'A', true), p('a1'), p('a2'), h(2, 'B'));
  const state = EditorState.create({ doc: d, selection: TextSelection.create(d, d.child(0).nodeSize - 1), plugins: [pluginTituloRecolhivel()] });
  const { state: depois } = state.applyTransaction(trEnterTituloRecolhido(state));
  assert.equal(depois.doc.child(0).attrs.collapsed, true);
  assert.deepEqual(textosOcultos(depois.doc), ['a1', 'a2']);
  assert.equal(depois.doc.child(3).type.name, 'heading');
  assert.equal(depois.doc.child(3).attrs.level, 2);
  assert.equal(depois.doc.child(3).textContent, '');
  assert.equal(depois.selection.$from.index(0), 3);
});

test('Backspace no título vazio depois da seção apaga a linha sem abrir', () => {
  const d = doc(h(2, 'A', true), p('a1'), { type: 'heading', attrs: { level: 2 } });
  const state = EditorState.create({ doc: d, selection: TextSelection.create(d, d.content.size - 1), plugins: [pluginTituloRecolhivel()] });
  const { state: depois } = state.applyTransaction(trBackspaceAposRecolhido(state));
  assert.equal(depois.doc.childCount, 2);
  assert.equal(depois.doc.child(0).attrs.collapsed, true);
  assert.equal(depois.selection.$from.parent.textContent, 'A');
});

test('Backspace no começo do título seguinte não junta o texto ao conteúdo escondido', () => {
  const d = doc(h(2, 'A', true), p('a1'), h(2, 'B'));
  const posB = d.content.size - d.child(2).nodeSize + 1;
  const state = EditorState.create({ doc: d, selection: TextSelection.create(d, posB), plugins: [pluginTituloRecolhivel()] });
  const { state: depois } = state.applyTransaction(trBackspaceAposRecolhido(state));
  assert.equal(depois.doc.childCount, 3);
  assert.equal(depois.doc.child(2).textContent, 'B');
  assert.equal(depois.doc.child(0).attrs.collapsed, true);
});
