import test from "node:test";
import assert from "node:assert/strict";
import { versaoDoEspelho } from "../src/lib/quiz/espelho.ts";

const c = { pergunta: "motivo", opcoes: [{ titulo: "Viajar" }, { titulo: "Carreira" }, { titulo: " " }] };
test("mostra a versão da opção marcada, inclusive a primeira", () => {
  assert.equal(versaoDoEspelho(c, { motivo: 0 }).v.titulo, "Viajar");
  assert.equal(versaoDoEspelho(c, { motivo: 1 }).i, 1);
});
test("sem resposta, sem versão ou sem configuração cai na tela comum", () => {
  assert.equal(versaoDoEspelho(c, {}), null);
  assert.equal(versaoDoEspelho(c, { motivo: 2 }), null);
  assert.equal(versaoDoEspelho(c, { motivo: 9 }), null);
  assert.equal(versaoDoEspelho(undefined, { motivo: 0 }), null);
});
