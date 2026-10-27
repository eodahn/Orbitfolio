import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
if (!process.env.TEST_DATABASE_URL)
  throw Error("Configure TEST_DATABASE_URL com PostgreSQL de teste.");
const admin = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
await admin.connect();
const schema = "browser_" + randomUUID().replaceAll("-", ""),
  base = "http://127.0.0.1:5176";
let server, vite, browser;
await admin.query(`CREATE SCHEMA "${schema}"`);
const dbUrl = new URL(process.env.TEST_DATABASE_URL);
dbUrl.searchParams.set("options", `-c search_path=${schema}`);
async function start() {
  server = spawn(process.execPath, ["server.mjs"], {
    env: {
      ...process.env,
      DATABASE_URL: dbUrl.href,
      NODE_ENV: "development",
      APP_ORIGIN: base,
      PORT: "3096",
      SEED_DEMO: "false",
      SEED_SHOWCASE: "true",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:3096/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("API não iniciou");
}
async function stop() {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((r) => server.once("exit", r));
  }
}
try {
  await start();
  vite = await createServer({
    server: {
      host: "127.0.0.1",
      port: 5176,
      strictPort: true,
      proxy: { "/api": "http://127.0.0.1:3096" },
    },
  });
  await vite.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });
  const context = await browser.newContext(),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/register");
  await page
    .getByLabel("Nome de exibição", { exact: true })
    .fill("Viajante PostgreSQL");
  await page.getByLabel("Username", { exact: true }).fill("viajante-pg");
  await page.getByLabel("E-mail", { exact: true }).fill("browser@test.local");
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  assert.equal(
    await page
      .getByLabel("Nome de exibição", { exact: true })
      .getAttribute("maxlength"),
    "50",
  );
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page
    .getByRole("heading", { name: "Viajante PostgreSQL", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "Editar perfil", exact: true }).click();
  await page
    .getByLabel("Foto de perfil", { exact: true })
    .setInputFiles(
      new URL("./fixtures/avatar-animated.gif", import.meta.url).pathname,
    );
  await page.getByRole("dialog", { name: "Enquadrar foto" }).waitFor();
  await page.getByLabel("Zoom", { exact: true }).fill("2");
  await page.getByLabel("Posição horizontal", { exact: true }).fill("20");
  await page.getByLabel("Posição vertical", { exact: true }).fill("80");
  const uploaded = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/account/avatar") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Confirmar foto", exact: true })
    .click();
  assert.equal((await uploaded).status(), 200);
  const user = (
    await (await context.request.get(base + "/api/auth/session")).json()
  ).user;
  assert.equal(user.avatarZoom, 2);
  assert.equal(user.avatarOffsetX, 20);
  assert.equal(user.avatarOffsetY, 80);
  const avatar = await context.request.get(base + user.avatarUrl);
  assert.equal(avatar.headers()["content-type"], "image/gif");
  assert.deepEqual(
    await avatar.body(),
    readFileSync(new URL("./fixtures/avatar-animated.gif", import.meta.url)),
  );
  const second = await browser.newContext();
  assert.equal(
    (
      await second.request.post(base + "/api/auth/login", {
        data: { email: "browser@test.local", password: "test-password" },
      })
    ).status(),
    200,
  );
  const secondUser = (
    await (await second.request.get(base + "/api/auth/session")).json()
  ).user;
  assert.equal(secondUser.avatarUrl, user.avatarUrl);
  const bad = await context.request.post(base + "/api/account/avatar", {
    multipart: {
      avatar: {
        name: "fake.png",
        mimeType: "image/png",
        buffer: Buffer.from("not an image"),
      },
    },
  });
  assert.equal(bad.status(), 422);
  await stop();
  await start();
  assert.equal(
    (await (await second.request.get(base + "/api/auth/session")).json()).user
      .avatarUrl,
    user.avatarUrl,
  );
  await page.goto(base + "/projects/new");
  await page
    .getByRole("button", { name: "Continuar sem integração", exact: true })
    .click();
  await page
    .getByLabel("Link do projeto", { exact: true })
    .fill("https://example.com");
  await page
    .getByRole("button", { name: "Adicionar link", exact: true })
    .click();
  await page
    .getByLabel("Nome do projeto", { exact: true })
    .fill("Formulário preservado");
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Descrição que deve permanecer.");
  await page
    .getByRole("button", { name: "+ Adicionar linguagem", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fechar seleção de linguagem", exact: true })
    .click();
  assert.equal(new URL(page.url()).pathname, "/projects/new");
  assert.equal(
    await page.getByLabel("Nome do projeto", { exact: true }).inputValue(),
    "Formulário preservado",
  );
  assert.equal(
    await page.getByLabel("Descrição", { exact: true }).inputValue(),
    "Descrição que deve permanecer.",
  );
  await page
    .getByRole("button", { name: "Criar projeto", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Formulário preservado", exact: true })
    .waitFor();
  assert.ok(
    (
      await (await second.request.get(base + "/api/projects/mine")).json()
    ).projects.some((p) => p.name === "Formulário preservado"),
  );
  await page.goto(base + "/explore");
  await page.getByRole("heading", { name: "Portfolio v4", exact: true }).click();
  assert.equal(
    await page
      .getByRole("link", { name: "Acessar projeto", exact: true })
      .getAttribute("href"),
    "https://v4.brittanychiang.com/",
  );
  assert.equal(
    await page
      .getByRole("link", { name: "Acessar GitHub", exact: true })
      .getAttribute("href"),
    "https://github.com/bchiang7/v4",
  );
  await page.getByRole("link", { name: "Brittany Chiang", exact: true }).click();
  await page
    .getByRole("heading", { name: "Brittany Chiang", exact: true })
    .waitFor();
  // Instrument only the test page: Pointer Lock cannot depend on desktop focus in CI.
  await page.evaluate(async () => {
    let locked = null;
    Object.defineProperty(document, "pointerLockElement", {
      configurable: true,
      get: () => locked,
    });
    HTMLCanvasElement.prototype.requestPointerLock = function () {
      locked = this;
      document.dispatchEvent(new Event("pointerlockchange"));
      return Promise.resolve();
    };
    document.exitPointerLock = () => {
      locked = null;
      document.dispatchEvent(new Event("pointerlockchange"));
    };
    const { Universe } = await import("/src/three/universe.js");
    const start = Universe.prototype.start;
    Universe.prototype.start = function () {
      window.world = this;
      return start.call(this);
    };
  });
  await page.getByRole("link", { name: "Início", exact: true }).click();
  await page.waitForFunction(() => window.world?.running);
  await page
    .locator("#universe-canvas")
    .click({ position: { x: 700, y: 400 } });
  await page.waitForFunction(() => window.world.controls.navigation);
  assert.equal(await page.locator(".navigation-hud").isVisible(), true);
  const beforeFlight = await page.evaluate(() =>
    window.world.ship.position.toArray(),
  );
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(200);
  await page.keyboard.up("KeyW");
  assert.notDeepEqual(
    await page.evaluate(() => window.world.ship.position.toArray()),
    beforeFlight,
  );
  const previousYaw = await page.evaluate(() => window.world.controls.yaw);
  await page.evaluate(() =>
    document.dispatchEvent(
      new MouseEvent("mousemove", { movementX: 30, movementY: 999999 }),
    ),
  );
  assert.notEqual(
    await page.evaluate(() => window.world.controls.yaw),
    previousYaw,
  );
  assert.ok(
    Math.abs(await page.evaluate(() => window.world.controls.pitch)) <
      Math.PI / 2,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !window.world.controls.navigation);
  assert.equal(await page.locator(".navigation-hud").isVisible(), false);
  const yaw = await page.evaluate(() => window.world.controls.yaw);
  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent("mousemove", { movementX: 50 })),
  );
  assert.equal(await page.evaluate(() => window.world.controls.yaw), yaw);
  await page
    .locator("#universe-canvas")
    .click({ position: { x: 700, y: 400 } });
  const target = await page.evaluate(() => {
    const u = window.world,
      p = u.planets[0];
    u.ship.userData.velocity.set(0, 0, 0);
    p.position.set(0, 0, -40);
    u.ship.position.set(0, 0, 0);
    u.controls.yaw = 0;
    u.controls.pitch = 0;
    // Freeze flight for deterministic near/distant ray assertions; use real raycasting and E handler.
    cancelAnimationFrame(u.frameId);
    u.camera.position.set(0, 0, 10);
    u.camera.lookAt(p.position);
    u.updateAim();
    return p.userData.project.name;
  });
  await page.locator(".aim-info").filter({ hasText: "[E] Explorar" }).waitFor();
  await page.keyboard.press("KeyE");
  await page.getByRole("dialog", { name: "Informações do planeta" }).waitFor();
  assert.equal(await page.evaluate(() => document.pointerLockElement), null);
  await page.getByRole("heading", { name: target, exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Fechar projeto", exact: true })
    .click();
  await page
    .locator("#universe-canvas")
    .click({ position: { x: 700, y: 400 } });
  await page.evaluate(() => {
    const u = window.world;
    cancelAnimationFrame(u.frameId);
    u.ship.position.set(0, 0, 0);
    u.camera.position.set(0, 0, 10);
    for (const p of u.planets) p.position.set(0, 0, -250);
    u.camera.lookAt(0, 0, -250);
    u.updateAim();
  });
  assert.equal(await page.locator(".aim-info").isVisible(), false);
  await page.keyboard.press("KeyE");
  assert.equal(
    await page.getByRole("dialog", { name: "Informações do planeta" }).count(),
    0,
  );
  await page.getByRole("link", { name: "Pesquisar contas e planetas" }).click();
  assert.equal(await page.evaluate(() => document.pointerLockElement), null);
  await page.getByLabel("Contas e planetas", { exact: true }).fill("WEASD");
  assert.equal(await page.evaluate(() => window.world.controls.keys.size), 0);
  assert.deepEqual(errors, []);
  await second.close();
  console.log(
    "PASS PostgreSQL browser: registration, GIF framing/upload/bytes, two separate sessions, restart, multipart rejection, language X keeps draft, Explore/demo links/profile, Pointer Lock, pitch, UI release, near E/distant rejection.",
  );
} finally {
  await browser?.close();
  await vite?.close();
  await stop();
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
}
