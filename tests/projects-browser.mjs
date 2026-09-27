import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import assert from "node:assert/strict";
const temp = await mkdtemp(join(tmpdir(), "orbit-project-ui-"));
const server = spawn(process.execPath, ["server.mjs"], {
  env: {
    ...process.env,
    PORT: "3092",
    APP_ORIGIN: "http://127.0.0.1:5174",
    SEED_DEMO: "false",
    ORBITFOLIO_DATABASE_PATH: join(temp, "db.sqlite"),
  },
  stdio: "ignore",
});
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3092" },
  },
});
let browser;
try {
  await vite.listen();
  const base = "http://127.0.0.1:5174";
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
    ],
  });
  const owner = await browser.newContext(),
    other = await browser.newContext();
  async function api(context, path, method = "GET", data) {
    const r = await context.request.fetch(base + path, { method, data });
    assert.ok(r.ok(), `${method} ${path} ${r.status()} ${await r.text()}`);
    return r.status() === 204 ? {} : r.json();
  }
  await api(owner, "/api/auth/register", "POST", {
    name: "Dono do Planeta",
    email: "owner@test.local",
    password: "test-password",
  });
  await api(other, "/api/auth/register", "POST", {
    name: "Outro Viajante",
    email: "other@test.local",
    password: "test-password",
  });
  const foreign = (
    await api(other, "/api/projects", "POST", {
      name: "Projeto de outro",
      demoUrl: "https://example.com/project",
      languages: { Python: null },
    })
  ).project;
  const page = await owner.newPage(),
    errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto(base + "/projects");
  await page.getByRole("heading", { name: "Projetos", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("heading", { name: foreign.name }).count(),
    0,
  );
  await page
    .getByRole("link", { name: "Adicionar projeto", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Deseja integrar este projeto com o GitHub?",
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Integrar com GitHub", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Integração GitHub indisponível" })
    .waitFor();
  await page.getByRole("button", { name: "Continuar sem integração" }).click();
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page.getByLabel("Nome do projeto").fill("Meu planeta manual");
  await page.getByLabel("Descrição", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Criar projeto", exact: true })
    .click();
  await page
    .getByText(
      "Adicione um link do GitHub ou um link externo para criar o projeto.",
      { exact: true },
    )
    .waitFor();
  await page
    .getByLabel("Link externo do projeto")
    .fill("https://example.com/my-project");
  await page
    .getByRole("button", { name: "+ Adicionar linguagem", exact: true })
    .click();
  assert.equal(
    await page.locator(".language-options button").first().innerText(),
    "Outra",
  );
  await page.getByLabel("Pesquisar linguagem").fill("JavaS");
  assert.equal(await page.locator(".language-options button").count(), 2);
  await page.getByRole("button", { name: "JavaScript", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Adicionar linguagem", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "JavaScript · adicionada", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Outra", exact: true }).click();
  await page.getByLabel("Nome da linguagem").fill("CSS");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.evaluate(() => scrollTo(0, 0));
  if (process.env.UI_SCREENSHOT)
    await page.screenshot({ path: process.env.UI_SCREENSHOT, fullPage: true });
  await page
    .getByRole("button", { name: "Criar projeto", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Meu planeta manual", exact: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(".planet-preview")?.dataset.rendered === "true",
  );
  const id = page.url().split("/").pop(),
    saved = (await api(owner, "/api/projects/" + id)).project;
  assert.deepEqual(saved.languages, { JavaScript: null, CSS: null });
  assert.equal(
    await page
      .getByRole("link", { name: "Acessar projeto", exact: true })
      .getAttribute("href"),
    "https://example.com/my-project",
  );
  assert.equal(
    await page
      .getByRole("link", { name: "Acessar GitHub", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("link", { name: "Dono do Planeta", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Dono do Planeta", exact: true })
    .waitFor();
  await page.goBack();
  await page
    .getByRole("heading", { name: "Meu planeta manual", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "Pesquisar contas e planetas" }).click();
  await page
    .getByLabel("Contas e planetas", { exact: true })
    .fill("MEU PLANETA");
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Meu planeta manual", exact: true })
    .waitFor();
  await page
    .getByLabel("Contas e planetas", { exact: true })
    .fill("Outro Viajante");
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await page
    .getByRole("link", { name: "Visualizar conta", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Outro Viajante", exact: true })
    .waitFor();
  await page.goto(base + "/project/" + id);
  for (const [suffix, demoUrl] of [
    ["GitHub", ""],
    ["Both", "https://example.com/deploy"],
  ]) {
    const created = (
      await api(owner, "/api/projects", "POST", {
        name: "Links " + suffix,
        githubUrl: "https://github.com/owner/repo",
        demoUrl,
      })
    ).project;
    await page.goto(base + "/project/" + created.id);
    await page
      .getByRole("heading", { name: "Links " + suffix, exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "Acessar projeto", exact: true })
        .getAttribute("href"),
      demoUrl || "https://github.com/owner/repo",
    );
    assert.equal(
      await page
        .getByRole("link", { name: "Acessar GitHub", exact: true })
        .count(),
      demoUrl ? 1 : 0,
    );
    await api(owner, "/api/projects/" + created.id, "DELETE");
  }
  await page.goto(base + "/project/" + id);
  const orbit = saved.orbit;
  await page.reload();
  await page.getByRole("heading", { name: "Meu planeta manual" }).waitFor();
  assert.deepEqual(
    (await api(owner, "/api/projects/" + id)).project.orbit,
    orbit,
  );
  const forbidden = await other.request.delete(base + "/api/projects/" + id);
  assert.equal(forbidden.status(), 403);
  const otherPage = await other.newPage();
  await otherPage.goto(base + "/project/" + id);
  await otherPage
    .getByRole("heading", { name: "Meu planeta manual" })
    .waitFor();
  assert.equal(
    await otherPage
      .getByRole("button", { name: "Excluir projeto", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Excluir projeto", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.ok((await api(owner, "/api/projects/" + id)).project);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(async () => {
    const { Universe } = await import("/src/three/universe.js");
    const start = Universe.prototype.start;
    Universe.prototype.start = function () {
      window.world = this;
      return start.call(this);
    };
  });
  await page.getByRole("link", { name: "Início", exact: true }).click();
  await page.waitForFunction(() => window.world?.running);
  assert.ok(
    await page.evaluate(
      (id) => window.world.planets.some((p) => p.userData.project.id === id),
      id,
    ),
  );
  // Focus through the same callback used by a raycast click; controls must pause.
  const previous = await page.evaluate((id) => {
    const u = window.world;
    u.ship.userData.velocity.set(0, 0, 0);
    const p = u.planets.find((p) => p.userData.project.id === id);
    const saved = {
      camera: u.camera.position.toArray(),
      ship: u.ship.position.toArray(),
    };
    u.onFocus(p.userData.project);
    return saved;
  }, id);
  await page.getByRole("dialog", { name: "Informações do planeta" }).waitFor();
  await page.waitForFunction(() => window.world.focus?.elapsed === 0.8);
  assert.deepEqual(
    await page.evaluate(() => window.world.ship.position.toArray()),
    previous.ship,
  );
  const framed = await page.evaluate(() => {
    const u = window.world;
    return {
      distance: u.camera.position.distanceTo(u.focus.planet.position),
      radius: u.focus.planet.userData.radius,
      aspect: u.camera.aspect,
    };
  });
  assert.ok(framed.distance > framed.radius * 1.1);
  await page
    .getByRole("button", { name: "Fechar projeto", exact: true })
    .click();
  await page.waitForFunction(() => !window.world.focus); // Restoration occurs before normal follow resumes.
  await page.evaluate(
    (id) =>
      window.world.onFocus(
        window.world.planets.find((p) => p.userData.project.id === id).userData
          .project,
      ),
    id,
  );
  await page
    .getByRole("dialog", { name: "Informações do planeta" })
    .getByRole("button", { name: "Excluir projeto", exact: true })
    .click();
  await page
    .locator(".confirm-dialog")
    .getByRole("button", { name: "Excluir projeto", exact: true })
    .click();
  await page.waitForFunction(
    (id) => !window.world.planets.some((p) => p.userData.project.id === id),
    id,
  );
  assert.equal(
    (await owner.request.get(base + "/api/projects/" + id)).status(),
    404,
  );
  await page.getByRole("link", { name: "Projetos", exact: true }).click();
  await page.getByRole("heading", { name: "Projetos", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "Meu planeta manual" }).count(),
    0,
  );
  // Tooltip uses the same renderer as live GitHub results and is keyboard-accessible.
  await page.evaluate(async () => {
    const { commitItem } = await import("/src/components/commit-timeline.js");
    document.querySelector("main").innerHTML =
      "<ol>" +
      commitItem({
        sha: "abcdef123",
        shortSha: "abcdef1",
        message: "Teste da timeline",
        author: "Autor Teste",
        committedAt: "2026-09-25T12:00:00Z",
        url: "https://github.com/eodahn/Orbitfolio/commit/abcdef1",
        version: "v1.0.0",
      }) +
      "</ol>";
  });
  await page.getByRole("link", { name: /Teste da timeline/ }).focus();
  await page.getByRole("tooltip").waitFor();
  assert.match(
    await page.getByRole("tooltip").innerText(),
    /Autor: Autor Teste[\s\S]*Versão: v1.0.0[\s\S]*Data:/,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: guided/manual creation, optional language rows, private management list, persistence, preview, mobile layout, owner-only deletion/cancel, focused Home overlay and live removal; no console errors.",
  );
} finally {
  await browser?.close();
  await vite.close();
  server.kill();
  if (server.exitCode === null)
    await new Promise((r) => server.once("exit", r));
  await rm(temp, { recursive: true, force: true });
}
