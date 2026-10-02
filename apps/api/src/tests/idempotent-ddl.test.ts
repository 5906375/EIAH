import assert from "node:assert/strict";
import test from "node:test";
import { isConcurrentDdlRace, runIdempotentDdl } from "../services/idempotentDdl";

// Corrida de DDL `IF NOT EXISTS` entre processos num banco novo (CI W4NonRegression, réplicas da API).

const raceError = (code: string) => Object.assign(new Error(`Raw query failed. Code: \`${code}\`. Message: \`duplicate key\``), { code: "P2010" });

test("reconhece só os códigos de corrida de DDL", () => {
  assert.equal(isConcurrentDdlRace(raceError("23505")), true);
  assert.equal(isConcurrentDdlRace(raceError("42P07")), true);
  assert.equal(isConcurrentDdlRace({ meta: { code: "42710" } }), true);
  assert.equal(isConcurrentDdlRace(raceError("42P01")), false, "tabela inexistente não é corrida");
  assert.equal(isConcurrentDdlRace(new Error("connection refused")), false);
});

test("repete o DDL depois de uma corrida e propaga qualquer outro erro", async () => {
  let calls = 0;
  await runIdempotentDdl({ $executeRawUnsafe: async () => { calls += 1; if (calls === 1) throw raceError("23505"); } }, "CREATE INDEX IF NOT EXISTS x");
  assert.equal(calls, 2);

  await assert.rejects(runIdempotentDdl({ $executeRawUnsafe: async () => { throw raceError("42P01"); } }, "x"), /42P01/);

  let attempts = 0;
  await assert.rejects(
    runIdempotentDdl({ $executeRawUnsafe: async () => { attempts += 1; throw raceError("23505"); } }, "x"),
    /23505/,
  );
  assert.equal(attempts, 3, "limite de tentativas");
});
