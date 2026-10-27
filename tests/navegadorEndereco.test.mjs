import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/navegador/endereco.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { paraEndereco, nomeDoSite } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("endereços viram https", () => {
  assert.equal(paraEndereco("youtube.com"), "https://youtube.com");
  assert.equal(paraEndereco("  mail.google.com/mail/u/0 "), "https://mail.google.com/mail/u/0");
  assert.equal(paraEndereco("http://exemplo.com.br"), "http://exemplo.com.br");
  assert.equal(paraEndereco("localhost:8080"), "http://localhost:8080");
});

test("o resto vira pesquisa no Google", () => {
  assert.equal(paraEndereco("como fazer bolo"), "https://www.google.com/search?q=como%20fazer%20bolo");
  assert.equal(paraEndereco("chatgpt"), "https://www.google.com/search?q=chatgpt");
  assert.equal(paraEndereco(""), "");
});

test("nome da guia", () => {
  assert.equal(nomeDoSite("https://www.youtube.com/watch?v=1"), "youtube.com");
  assert.equal(nomeDoSite("lixo"), "Navegador");
});
