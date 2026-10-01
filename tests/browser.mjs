import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const temporary = await mkdtemp(join(tmpdir(), "orbitfolio-e2e-"));
const server = spawn(
  process.env.PHP_BIN || process.execPath,
  process.env.PHP_BIN
    ? ["-S", "127.0.0.1:3091", "backend/router.php"]
    : ["server.mjs"],
  {
    env: {
      ...process.env,
      PORT: "3091",
      ORBITFOLIO_DATABASE_PATH: join(temporary, "test.sqlite"),
    },
    stdio: process.env.TEST_SERVER_LOG ? "inherit" : "ignore",
  },
);
const base = "http://127.0.0.1:3091";
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--disable-dev-shm-usage",
    ],
  });
  const a = await browser.newContext(),
    b = await browser.newContext();
  async function api(context, path, method = "GET", data) {
    const response = await context.request.fetch(base + path, { method, data });
    assert.ok(
      response.ok(),
      `${method} ${path}: ${response.status()} ${await response.text()}`,
    );
    if (response.status() === 204) return {};
    const body = await response.text();
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(`Invalid API JSON: ${body}`);
    }
  }
  const stamp = Date.now();
  const alice = (
    await api(a, "/api/auth/register", "POST", {
      name: "Alice Navegante",
      email: `alice${stamp}@test.local`,
      password: "test-password",
    })
  ).user;
  const bruno = (
    await api(b, "/api/auth/register", "POST", {
      name: "Bruno Viajante",
      email: `bruno${stamp}@test.local`,
      password: "test-password",
    })
  ).user;
  await api(a, `/api/users/${bruno.id}/follow`, "POST");
  await api(b, `/api/users/${alice.id}/follow`, "POST");
  const project = (
    await api(a, "/api/projects", "POST", {
      name: "Planeta E2E",
      demoUrl: "https://example.com/project",
      description: "Projeto criado durante a validação",
      languages: { JavaScript: 100 },
      sizeBytes: 100000000,
    })
  ).project;
  await api(a, `/api/projects/${project.id}/like`, "POST");
  await api(a, `/api/projects/${project.id}/favorite`, "POST");
  const page = await a.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(base + "/account");
  await page.getByRole("heading", { name: "Alice Navegante" }).waitFor();
  for (const label of ["Seguidores", "Seguindo", "Amigos"]) {
    await page.getByRole("link", { name: new RegExp(`^${label} \\(`) }).click();
    await page.getByRole("heading", { name: label, exact: true }).waitFor();
    await page
      .getByRole("link", { name: "Visualizar conta", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Bruno Viajante", exact: true })
      .waitFor();
    await page.getByRole("link", { name: "Conta", exact: true }).click();
    await page.getByRole("heading", { name: "Alice Navegante" }).waitFor();
  }
  for (const label of ["Curtidos", "Favoritos"]) {
    await page
      .locator(".profile-tabs")
      .getByRole("link", { name: label, exact: true })
      .click();
    await page.getByRole("heading", { name: label, exact: true }).waitFor();
    await page.getByRole("heading", { name: "Planeta E2E" }).waitFor();
  }
  await page
    .locator(".profile-tabs")
    .getByRole("link", { name: "Privacidade" })
    .click();
  await page.locator("[data-privacy]").waitFor();
  for (const key of ["followers", "following", "friends", "likes", "favorites"])
    await page.locator(`select[name=${key}]`).selectOption("private");
  await page.getByRole("button", { name: "Salvar privacidade" }).click();
  await page.getByText("Alterações salvas.", { exact: true }).waitFor();
  for (const key of ["followers", "following", "friends", "likes", "favorites"])
    assert.ok(
      Object.values(await api(a, `/api/users/${alice.id}/${key}`))[0].length,
    );
  for (const label of [
    "Seguidores",
    "Seguindo",
    "Amigos",
    "Curtidos",
    "Favoritos",
  ]) {
    await page
      .locator(".profile-tabs")
      .getByRole("link", { name: new RegExp(`^${label}( \\(|$)`) })
      .click();
    await page.getByRole("heading", { name: label, exact: true }).waitFor();
    assert.ok(await page.locator("section .project-card").count());
  }
  const visitor = await b.newPage();
  await visitor.goto(base + `/user/${alice.id}`);
  await visitor.getByRole("heading", { name: "Alice Navegante" }).waitFor();
  for (const label of [
    "Seguidores",
    "Seguindo",
    "Amigos",
    "Curtidos",
    "Favoritos",
    "Privacidade",
  ])
    assert.equal(
      await visitor
        .locator(".profile-tabs")
        .getByRole("link", { name: new RegExp(`^${label}`) })
        .count(),
      0,
      label,
    );
  await visitor.goto(base + `/user/${alice.id}?tab=favorites`);
  await visitor.getByText("Esta seção é privada.", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Abrir Lua Social" }).click();
  await page.getByRole("heading", { name: "Encontre viajantes" }).waitFor();
  await page
    .getByRole("textbox", { name: "Buscar viajantes" })
    .fill("Bruno Viajante");
  await page.waitForFunction(
    () => document.querySelectorAll("[data-users] article").length === 1,
  );
  await page
    .getByRole("heading", { name: "Bruno Viajante", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Visualizar conta", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Bruno Viajante", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Conta", exact: true }).click();
  await page.getByRole("heading", { name: "Alice Navegante" }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: "Início", exact: true }).click();
  await page.locator("canvas").waitFor();
  await page.waitForTimeout(800);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(400);
  await page.keyboard.up("KeyW");
  await page.evaluate(
    () => (window.savedCanvas = document.querySelector("canvas")),
  );
  await page.getByRole("link", { name: "Abrir Planetas em destaque" }).click();
  await page.getByRole("heading", { name: "Planetas em destaque" }).waitFor();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.locator("canvas").waitFor();
  assert.ok(
    await page.evaluate(
      () => window.savedCanvas === document.querySelector("canvas"),
    ),
  );
  await page.waitForTimeout(500);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: own account lists and profile navigation, liked/favorite projects, five private categories, visitor denial, Social search, mobile width, preserved canvas, no console errors.",
  );
} finally {
  await browser?.close();
  server.kill();
  await new Promise((resolve) => server.once("exit", resolve));
  await rm(temporary, { recursive: true, force: true });
}
