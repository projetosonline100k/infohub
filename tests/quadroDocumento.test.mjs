import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/documentos/quadro.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const q = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const quadro = { colunas: [
  { id: "a", titulo: "Defesa de crença", cor: "#000", cartoes: [
    { id: "1", texto: "Paulo Porto\nO que realmente acontece com o seu cérebro quando você toma creatina?", etiquetas: ["Saúde", "#creatina"] },
    { id: "2", titulo: "Jejum", texto: "Por que o jejum muda sua mente", etiquetas: ["saúde"] },
  ] },
  { id: "b", titulo: "Mistério", cor: "#000", cartoes: [{ id: "3", texto: "Casa de Davi\nA série mais incrível de 2025", etiquetas: ["série"] }] },
] };

test("título e corpo: cartão antigo usa a 1ª linha como título", () => {
  assert.equal(q.tituloDoCartao(quadro.colunas[0].cartoes[0]), "Paulo Porto");
  assert.match(q.corpoDoCartao(quadro.colunas[0].cartoes[0]), /^O que realmente/);
  assert.equal(q.tituloDoCartao(quadro.colunas[0].cartoes[1]), "Jejum");
  assert.equal(q.corpoDoCartao(quadro.colunas[0].cartoes[1]), "Por que o jejum muda sua mente");
});

test("etiquetas normalizadas e únicas", () => {
  assert.deepEqual(q.etiquetasDoQuadro(quadro), ["creatina", "saúde", "série"]);
});

test("texto do quadro para a IA traz coluna, título, etiquetas e texto", () => {
  const t = q.textoDoQuadro(quadro);
  assert.match(t, /\[Coluna: Defesa de crença\]/);
  assert.match(t, /- Paulo Porto \(etiquetas: Saúde, #creatina\): O que realmente/);
  assert.match(t, /\[Coluna: Mistério\]\n- Casa de Davi \(etiquetas: série\)/);
});

test("lê os cartões de dentro do HTML salvo", () => {
  const attr = JSON.stringify(quadro).replace(/"/g, "&quot;");
  const refs = q.cartoesDoHtml(`<p>x</p><div data-dados="${attr}" data-quadro-kanban=""></div>`, "Estruturas");
  assert.equal(refs.length, 3);
  assert.deepEqual(refs[0], { fonte: "Estruturas", coluna: "Defesa de crença", titulo: "Paulo Porto", etiquetas: ["saúde", "creatina"], texto: refs[0].texto });
});

test("escolhe as referências que combinam com o pedido (etiqueta e coluna pesam mais)", () => {
  const attr = JSON.stringify(quadro).replace(/"/g, "&quot;");
  const refs = q.cartoesDoHtml(`<div data-dados="${attr}"></div>`, "E");
  assert.deepEqual(q.escolherReferencias(refs, "escreve um roteiro de defesa de crença sobre saúde").map((r) => r.titulo), ["Paulo Porto", "Jejum"]);
  assert.deepEqual(q.escolherReferencias(refs, "roteiro de mistério sobre série").map((r) => r.titulo), ["Casa de Davi"]);
  assert.deepEqual(q.escolherReferencias(refs, "escreve um roteiro"), []);
});
