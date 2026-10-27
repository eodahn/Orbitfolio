import test from "node:test";
import assert from "node:assert/strict";
import { databaseConfig, databaseStartupError } from "../server/database-config.js";

test("Render and production require PostgreSQL even with legacy SQLite settings", () => {
  for (const env of [{ RENDER: "true" }, { NODE_ENV: "production" }]) {
    for (const DATABASE_URL of [undefined, "", "  "]) {
      assert.throws(() => databaseConfig({ ...env, DATABASE_URL, ORBITFOLIO_DATABASE_PATH: "/var/data/old.sqlite" }), { code: "DATABASE_URL_MISSING" });
    }
  }
  assert.equal(databaseConfig({}).dialect, "sqlite");
});

test("PostgreSQL configuration trims URLs and rejects placeholders without exposing secrets", () => {
  const connectionString = "postgresql://user:private-password@localhost/db";
  assert.deepEqual(databaseConfig({ DATABASE_URL: ` ${connectionString}\n` }), { dialect: "postgres", connectionString });
  for (const DATABASE_URL of ["[Internal Database URL]", '"' + connectionString + '"', "https://host/db", "postgresql://host"]) {
    assert.throws(() => databaseConfig({ DATABASE_URL }), { code: "DATABASE_URL_INVALID" });
  }
  for (const code of ["28P01", "ENOTFOUND", "42501", "42P01", "private-password", undefined]) {
    const result = databaseStartupError({ code, message: connectionString, detail: connectionString });
    assert.ok(!result.includes("private-password"));
    assert.ok(!result.includes(connectionString));
  }
});
